import Order from '../models/Order.js';
import User from '../models/User.js';
import Rider from '../models/Rider.js';
import { getIO } from '../utils/socket.js';
import { calculateDeliveryFee } from '../utils/calculateFee.js';
import * as orderService from '../services/orderService.js';
import { LedgerService } from '../services/ledgerService.js';

function isMongooseValidationError(error) {
    return error.name === 'ValidationError' && error.errors && typeof error.errors === 'object';
}

function extractValidationErrors(error) {
    const messages = [];
    for (const key of Object.keys(error.errors || {})) {
        messages.push(error.errors[key].message || `${key} is required`);
    }
    return messages.join('. ');
}

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
        if (isMongooseValidationError(error)) {
            return res.status(400).json({ message: extractValidationErrors(error) });
        }
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

        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, parseInt(req.query.limit) || 20);
        const skip = (page - 1) * limit;

        const [orders, total] = await Promise.all([
            Order.find(query)
                .populate('customer', 'email name phone')
                .populate('rider', 'email name phone')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit),
            Order.countDocuments(query),
        ]);

        res.status(200).json({
            success: true,
            count: orders.length,
            data: orders,
            pagination: { total, page, pages: Math.ceil(total / limit) },
        });
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
        if (error.name === 'CastError') {
            return res.status(404).json({ message: "Order not found" });
        }
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
        if (!riderId) {
            return res.status(400).json({ message: "riderId is required" });
        }
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

        if (order.status !== 'PENDING' && order.status !== 'CONFIRMED') {
            return res.status(400).json({ message: `Cannot assign rider while order is in status: ${order.status}` });
        }

        // Release previously assigned rider (if any) to free capacity
        const previousRiderId = order.rider;
        if (previousRiderId && previousRiderId.toString() !== riderId.toString()) {
            await Rider.findOneAndUpdate(
                { user: previousRiderId },
                { $set: { isAvailable: true, activeOrderCount: 0 } }
            );
        }

        // Reserve new rider capacity
        const riderProfile = await Rider.findOne({ user: riderId });
        if (!riderProfile) {
            return res.status(400).json({ message: "Rider profile not found" });
        }
        if (riderProfile.isDeactivated) {
            return res.status(400).json({ message: "Cannot assign orders to a deactivated/suspended rider" });
        }
        if (riderProfile.activeOrderCount >= 1) {
            return res.status(400).json({ message: "Rider already has an active order in progress" });
        }
        if (!riderProfile.isAvailable) {
            return res.status(400).json({ message: "Rider is currently offline" });
        }

        // Reserve new rider capacity — assignment reserves the rider, but the
        // activeOrderCount is only consumed when the rider actually accepts the order.
        // We set isAvailable=false to prevent dispatching other orders to this rider.
        await Rider.findOneAndUpdate(
            { user: riderId },
            { $set: { isAvailable: false } }
        );

        order.rider = riderId;
        order.status = 'RIDER_ASSIGNED';
        order.statusHistory.push({
            status: 'RIDER_ASSIGNED',
            updatedAt: new Date(),
            updatedBy: req.user._id,
            userRole: req.user.role,
        });

        await order.save();
        res.status(200).json({ success: true, data: order });
    } catch (error) {
        if (error.name === 'ValidationError' && error.errors) {
            const messages = Object.values(error.errors).map(e => e.message).join('. ');
            return res.status(400).json({ message: messages });
        }
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
            updatedAt: new Date(),
            updatedBy: req.user._id,
            userRole: req.user.role,
        });

        if (status === 'DELIVERED' && order.pricing.paymentMethod === 'COD') {
            order.pricing.paymentStatus = 'PAID';
        } else if (status === 'RETURNED' || status === 'CANCELLED') {
            order.pricing.paymentStatus = 'FAILED';
            order.pricing.codAmountCollected = 0;
        }
        await order.save();

        // Settle finances onto merchant ledger exactly once per order lifecycle.
        // IMPORTANT: Run ledger settlement FIRST, then mark settled. If settlement
        // throws, the order remains unmarked so a retry can re-attempt safely.
        if (
          (status === 'DELIVERED' || status === 'RETURNED') &&
          !order.financialsSettled
        ) {
          await LedgerService.settleOrderFinances(order._id);
          order.financialsSettled = true;
          await order.save();
        }

        const io = getIO();
        if (io) {
          io.to(`order_${order._id}`).emit(`order_status_updated`, {
              orderId: order._id,
              status: order.status,
              updated: new Date(),
          });
        }

        res.status(200).json({ success: true, data: order });
    } catch (error) {
        if (error.name === 'ValidationError' && error.errors) {
            const messages = Object.values(error.errors).map(e => e.message).join('. ');
            return res.status(400).json({ message: messages });
        }
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