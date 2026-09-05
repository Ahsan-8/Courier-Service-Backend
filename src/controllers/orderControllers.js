import Order from '../models/Order.js';
import User from '../models/User.js';
import { io } from '../../index.js';
import { calculateDeliveryFee } from '../utils/calculateFee.js';

export const createOrder = async (req, res) => {
    try {
        const { pickupDetails, deliveryDetails, packageDetails } = req.body;

        const trackingId = 'TRk' + Date.now() + Math.floor(Math.random() * 1000);
        const deliveryFee = calculateDeliveryFee(packageDetails.weightKG, packageDetails.category);

        const order = await Order.create({
            trackingId: trackingId,
            customer: req.user._id,
            pickupDetails,
            deliveryDetails,
            packageDetails,
            pricing: {
                deliveryFee,
                codAmount: req.body.codAmount || 0,
                paymentMethod: req.body.paymentMethod || 'COD',
                status: 'PENDING',
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
            order.pricing.paymentMethod = 'PAID';
        }
        await order.save();

        io.on(`order_${order._id}`).emit(`order_status_updated`, {
            orderId: order._id,
            status: order.status,
            updated: new Date(),
        });

        res.status(200).json({ success: true, data: order });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}

