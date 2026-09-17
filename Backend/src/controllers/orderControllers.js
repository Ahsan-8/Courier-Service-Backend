import Order from '../models/Order.js';
import User from '../models/User.js';
import { getIO } from '../utils/socket.js';
import { calculateDeliveryFee } from '../utils/calculateFee.js';
import * as orderService from '../services/orderService.js'; 
import { LedgerService } from '../services/ledgerService.js';

export const createOrder = async (req, res) => {
    try {
        const { pickupDetails, deliveryDetails, packageDetails, pickupAddress, deliveryAddress, parcel, codAmount, paymentMethod } = req.body;

        if (!pickupDetails?.name || !pickupDetails?.phone || !pickupDetails?.address) {
            return res.status(400).json({ message: 'pickupDetails (name, phone, address) is required' });
        }
        if (!deliveryDetails?.name || !deliveryDetails?.phone || !deliveryDetails?.address) {
            return res.status(400).json({ message: 'deliveryDetails (name, phone, address) is required' });
        }
        if (!packageDetails?.weightKG || !packageDetails?.description) {
            return res.status(400).json({ message: 'packageDetails (weightKG, description) is required' });
        }

        const trackingId = 'TRk' + Date.now() + Math.floor(Math.random() * 1000);

        const order = await Order.create({
            trackingId: trackingId,
            customer: req.user._id,
            pickupDetails,
            deliveryDetails,
            pickupAddress: pickupAddress || {},
            deliveryAddress: deliveryAddress || {},
            parcel: parcel || {
                actualWeight: packageDetails?.weightKG || 0,
                category: packageDetails?.category || 'PARCEL',
                description: packageDetails?.description || '',
                dimensions: { length: 0, width: 0, height: 0 },
            },
            packageDetails,
            pricing: {
                codAmount: codAmount || 0,
                paymentMethod: paymentMethod || 'COD',
            },
            status: 'PENDING',
            statusHistory: [
                {
                    status: 'PENDING',
                    updatedAt: new Date(),
                    updatedBy: req.user._id,
                },
            ],
        });
        res.status(201).json({ success: true, data: order });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

export const getOrders = async (req, res) => {
    try {
        let query = {};
        if (req.user.role === 'CUSTOMER') {
            query.customer = req.user._id;
        } else if (req.user.role === 'RIDER') {
            query.rider = req.user._id;
        }

        const orders = await Order.find(query)
            .populate('customer', 'email name phone')
            .populate('rider', 'email name phone')
            .sort({ createdAt: -1 });

        res.status(200).json({ success: true, count: orders.length, data: orders });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}

export const getOrderById = async (req, res) => {
    try {
        const order = await Order.findById(req.params.id)
            .populate('customer', 'email name phone')
            .populate('rider', 'email name phone');

        if (!order) {
            return res.status(404).json({ message: "Order not found" });
        }

        if (req.user.role === 'CUSTOMER' && order.customer._id.toString() !== req.user._id.toString()) {
            return res.status(403).json({ message: "Forbidden: Access denied" });
        }
        if (
            req.user.role === 'RIDER' &&
            (!order.rider || order.rider._id.toString() !== req.user._id.toString())
        ) {
            return res.status(403).json({ message: "Forbidden: Access denied" });
        }
        res.status(200).json({ success: true, data: order });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}

export const trackOrder = async (req, res) => {
    try {
        const order = await Order.findOne({ trackingId: req.params.trackingId })
            .select('trackingId status statusHistory pickupDetails.address deliveryDetails.address createdAt');

        if (!order) {
            return res.status(404).json({ message: "Tracking ID not found" });
        }
        res.status(200).json({ success: true, data: order });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}

export const assignRiderToOrder = async (req, res) => {
    try {
        const { riderId } = req.body;
        const rider = await User.findById(riderId);
        if (!rider || rider.role !== 'RIDER') {
            return res.status(400).json({ message: "Invalid rider ID or user is not a rider" });
        }
        if (!rider.isApproved) {
            return res.status(400).json({ message: "Cannot assign orders to a rider pending approval" });
        }

        const order = await Order.findById(req.params.id);
        if (!order) {
            return res.status(404).json({ message: "order not found" });
        }

        order.rider = riderId;
        order.status = 'RIDER_ASSIGNED';
        order.statusHistory.push({
            status: 'RIDER_ASSIGNED',
            updatedAt: new Date(),
            updatedBy: req.user._id,
        });

        await order.save();
        res.status(200).json({ success: true, data: order });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}

export const updateOrderStatus = async (req, res) => {
    try {
        const { status } = req.body;
        const order = await Order.findById(req.params.id);
        if (!order) {
            return res.status(404).json({ message: "Order not found" });
        }

        order.status = status;
        order.statusHistory.push({
            status,
            updatedBy: req.user._id,
        });

        if (status === 'DELIVERED' && order.pricing.paymentMethod === 'COD') {
            order.pricing.paymentStatus = 'PAID';
        } else if (status === 'RETURNED' || status === 'CANCELLED') {
            order.pricing.paymentStatus = 'FAILED';
            order.pricing.codAmountCollected = 0;
        }
        await order.save();

        // Settle finances onto merchant ledger exactly once per order lifecycle
        if (
          (status === 'DELIVERED' || status === 'RETURNED') &&
          !order.financialsSettled
        ) {
          order.financialsSettled = true;
          await order.save();
          await LedgerService.settleOrderFinances(order._id);
        }

        const io = getIO();
        io.to(`order_${order._id}`).emit(`order_status_updated`, {
            orderId: order._id,
            status: order.status,
            updated: new Date(),
        });

        res.status(200).json({ success: true, data: order });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}




// @desc    Update Order Status
// @route   PATCH /api/orders/:id/status
export const updateStatus = async (req, res) => {
  try {
    const { status, reason, notes } = req.body;
    const updatedOrder = await orderService.transitionOrderStatus({
      orderId: req.params.id,
      nextStatus: status,
      user: req.user,
      reason,
      notes,
    });

    res.json({ success: true, data: updatedOrder });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// @desc    Rider rejects assigned order
// @route   POST /api/orders/:id/reject
export const rejectAssignment = async (req, res) => {
  try {
    const { reason } = req.body;
    const order = await orderService.handleRiderRejection(req.params.id, req.user._id, reason);
    res.json({ success: true, message: 'Assignment rejected. Order moved to pool for reassignment.', data: order });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// @desc    Admin reassigns order
// @route   POST /api/orders/:id/reassign
export const reassign = async (req, res) => {
  try {
    const { riderId } = req.body;
    const order = await orderService.reassignOrder(req.params.id, riderId, req.user._id);
    res.json({ success: true, message: 'Order reassigned successfully.', data: order });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// @desc    Rider marks delivery failed
// @route   POST /api/orders/:id/failed
export const markFailed = async (req, res) => {
  try {
    const { reason } = req.body;
    const order = await orderService.handleDeliveryFailure(req.params.id, req.user._id, reason);
    res.json({ success: true, data: order });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};