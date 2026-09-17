import Rider from '../models/Rider.js';
import Order from '../models/Order.js';
import User from '../models/User.js';
import { ORDER_STATUS, USER_ROLES } from '../constants/orderconstants.js';

// 1. Toggle Rider Availability (Go ONLINE / OFFLINE)
export const toggleAvailability = async (userId, isAvailable) => {
    const rider = await Rider.findOne({ user: userId });
    if (!rider) throw new Error('Rider profile not found.');

    if (rider.approvalStatus !== 'APPROVED') {
        throw new Error('Your account is pending admin approval.');
    }

    if (rider.isDeactivated) {
        throw new Error('Your rider account has been suspended by an administrator.');
    }

    // Cannot go offline while holding an active delivery
    if (!isAvailable && rider.activeOrderCount > 0) {
        throw new Error('Cannot go offline while you have an active delivery in progress.');
    }

    rider.isAvailable = isAvailable;
    await rider.save();

    return rider;
};

// 2. Admin Review Application (APPROVE / REJECT)
export const reviewRiderApplication = async (riderId, approvalStatus, adminId) => {
    if (!['APPROVED', 'REJECTED'].includes(approvalStatus)) {
        throw new Error('Invalid approval status choice.');
    }

    const rider = await Rider.findById(riderId);
    if (!rider) throw new Error('Rider application not found.');

    rider.approvalStatus = approvalStatus;
    if (approvalStatus === 'REJECTED') {
        rider.isAvailable = false;
    }
    await rider.save();

    // Update associated User account flag
    await User.findByIdAndUpdate(rider.user, {
        isApproved: approvalStatus === 'APPROVED',
    });

    return rider;
};

// 3. Admin Deactivate / Reactivate Rider
export const setRiderDeactivationStatus = async (riderId, isDeactivated, reason) => {
    const rider = await Rider.findById(riderId);
    if (!rider) throw new Error('Rider profile not found.');

    rider.isDeactivated = isDeactivated;
    if (isDeactivated) {
        rider.isAvailable = false; // Force offline
    }
    await rider.save();

    return rider;
};

// 4. Validate Assignment Rules before dispatching
export const validateRiderForAssignment = async (riderId, isAdminOverride = false) => {
    const rider = await Rider.findById(riderId);
    if (!rider) throw new Error('Rider not found.');

    if (rider.approvalStatus !== 'APPROVED') {
        throw new Error('Cannot assign orders to an unapproved rider.');
    }

    if (rider.isDeactivated) {
        throw new Error('Cannot assign orders to a deactivated/suspended rider.');
    }

    if (rider.activeOrderCount >= 1) {
        throw new Error('Rider already has an active order in progress.');
    }

    // Standard dispatch requires online state; Admin override bypasses online check
    if (!isAdminOverride && !rider.isAvailable) {
        throw new Error('Rider is currently offline.');
    }

    return rider;
};

// 5. Rider Accepts Order
export const acceptAssignedOrder = async (orderId, userId) => {
    const rider = await Rider.findOne({ user: userId });
    if (!rider) throw new Error('Rider profile not found.');

    if (!rider.isAvailable) throw new Error('You must be ONLINE to accept orders.');
    if (rider.activeOrderCount >= 1) throw new Error('You already have an active order.');

    const order = await Order.findById(orderId);
    if (!order) throw new Error('Order not found.');

    if (order.status !== ORDER_STATUS.RIDER_ASSIGNED) {
        throw new Error(`Order is not in assignment phase (Current status: ${order.status}).`);
    }

    if (order.rider.toString() !== rider._id.toString()) {
        throw new Error('This order was not assigned to you.');
    }

    // Increment active delivery count
    rider.activeOrderCount = 1;
    await rider.save();

    order.status = ORDER_STATUS.PICKED_UP;
    order.statusHistory.push({
        status: ORDER_STATUS.PICKED_UP,
        updatedBy: userId,
        userRole: USER_ROLES.RIDER,
        reason: 'Rider accepted assignment and marked picked up.',
        timestamp: new Date(),
    });

    await order.save();
    return { order, rider };
};

// 6. Complete Order & Update Stats
export const completeOrderDelivery = async (orderId, userId) => {
    const rider = await Rider.findOne({ user: userId });
    if (!rider) throw new Error('Rider profile not found.');

    const order = await Order.findById(orderId);
    if (!order) throw new Error('Order not found.');

    if (order.status !== ORDER_STATUS.PICKED_UP &&
        order.status !== ORDER_STATUS.IN_TRANSIT &&
        order.status !== ORDER_STATUS.OUT_FOR_DELIVERY) {
        throw new Error(`Cannot complete order in current status: ${order.status}.`);
    }

    if (!order.rider || order.rider.toString() !== rider._id.toString()) {
        throw new Error('You are not the assigned rider for this order.');
    }

    order.status = ORDER_STATUS.DELIVERED;
    order.statusHistory.push({
        status: ORDER_STATUS.DELIVERED,
        updatedBy: userId,
        userRole: USER_ROLES.RIDER,
        reason: 'Order successfully delivered to customer.',
        timestamp: new Date(),
    });

    // Free rider capacity
    rider.activeOrderCount = 0;
    rider.totalCompletedDeliveries += 1;

    await rider.save();
    await order.save();

    return { order, rider };
};

// 7. Reject Assigned Order (Rider workflow)
export const rejectAssignedOrder = async (orderId, userId, rejectionReason) => {
    const rider = await Rider.findOne({ user: userId });
    if (!rider) throw new Error('Rider profile not found.');

    const order = await Order.findById(orderId);
    if (!order) throw new Error('Order not found.');

    if (order.status !== ORDER_STATUS.RIDER_ASSIGNED) {
        throw new Error('Order cannot be rejected at its current stage.');
    }

    if (!order.rider || order.rider.toString() !== rider._id.toString()) {
        throw new Error('You are not the assigned rider for this order.');
    }

    order.status = ORDER_STATUS.CONFIRMED;
    order.rider = null;

    order.statusHistory.push({
        status: ORDER_STATUS.CONFIRMED,
        updatedBy: userId,
        userRole: USER_ROLES.RIDER,
        reason: `Rider Rejected Assignment: ${rejectionReason || 'No reason provided'}`,
        timestamp: new Date(),
    });

    await order.save();
    return { order, rider };
};

// 8. Get Rider Performance Stats
export const getRiderStats = async (userId) => {
    const rider = await Rider.findOne({ user: userId });
    if (!rider) throw new Error('Rider profile not found.');

    return {
        totalCompletedDeliveries: rider.totalCompletedDeliveries,
        activeOrderCount: rider.activeOrderCount,
        approvalStatus: rider.approvalStatus,
        isAvailable: rider.isAvailable,
        isDeactivated: rider.isDeactivated,
    };
};