import Order from '../models/Order.js';
import User from '../models/User.js';
import { ORDER_STATUS, USER_ROLES } from '../constants/orderconstants.js';
import { validateStateTransition } from '../utils/orderStateEngine.js';
import { LedgerService } from './ledgerService.js';
import { NotificationService } from './notificationService.js';

// Transition Order Status with History Logging
export const transitionOrderStatus = async ({ orderId, nextStatus, user, reason, notes }) => {
    const order = await Order.findById(orderId).populate('customer', 'name email');
    if (!order) throw new Error('Order not found.');

    const isAssignedRider = order.rider && order.rider.toString() === user._id.toString();
    const validation = validateStateTransition(order.status, nextStatus, user.role, isAssignedRider);
    if (!validation.valid) throw new Error(validation.reason);

    const previousStatus = order.status;
    order.status = nextStatus;

    order.statusHistory.push({
        status: nextStatus,
        updatedBy: user._id,
        userRole: user.role,
        reason: reason || `Status updated from ${previousStatus} to ${nextStatus}`,
        notes,
        timestamp: new Date(),
    });

    // Financial lifecycle handling
    if (nextStatus === ORDER_STATUS.DELIVERED) {
        if (order.pricing.paymentMethod === 'COD') {
            order.pricing.paymentStatus = 'PAID';
        }
    } else if (nextStatus === ORDER_STATUS.RETURNED) {
        // Merchant owes courier: ledger reflects negative balance via pre-save hook
        order.pricing.paymentStatus = 'FAILED';
        order.pricing.codAmountCollected = 0;
    } else if (nextStatus === ORDER_STATUS.CANCELLED) {
        order.pricing.paymentStatus = 'FAILED';
    }

    if ([ORDER_STATUS.DELIVERED, ORDER_STATUS.CANCELLED, ORDER_STATUS.RETURNED].includes(nextStatus)) {
        if (order.rider) {
            await User.findByIdAndUpdate(order.rider, { isAvailable: true });
        }
    }

    await order.save();

    // Settle finances onto merchant ledger exactly once per order lifecycle
    if (
      (nextStatus === ORDER_STATUS.DELIVERED || nextStatus === ORDER_STATUS.RETURNED) &&
      !order.financialsSettled
    ) {
      order.financialsSettled = true;
      await order.save();
      await LedgerService.settleOrderFinances(order._id);
    }

    // Dispatch Email + Socket Notifications (non-blocking via queue)
    await NotificationService.notifyOrderEvent({
      order,
      status: nextStatus,
      recipientUser: order.customer,
      extraData: { reason, notes },
    });

    return order;
};

// Handle Rider Rejecting assigned order
export const handleRiderRejection = async (orderId, riderId, rejectionReason) => {
    const order = await Order.findById(orderId).populate('customer', 'name email');
    if (!order) throw new Error('Order not found.');

    if (order.status !== ORDER_STATUS.RIDER_ASSIGNED) {
        throw new Error('Order cannot be rejected at its current stage.');
    }
    
    if (!order.rider || order.rider.toString() !== riderId.toString()) {
        throw new Error('You are not the assigned rider for this order.');
    }

    order.status = ORDER_STATUS.CONFIRMED;
    order.rider = null;

    order.statusHistory.push({
        status: ORDER_STATUS.CONFIRMED,
        updatedBy: riderId,
        userRole: USER_ROLES.RIDER,
        reason: `Rider Rejected Assignment: ${rejectionReason || 'No reason provided'}`,
        timestamp: new Date(),
    });

    await User.findByIdAndUpdate(riderId, { isAvailable: true });
    await order.save();

    await NotificationService.notifyOrderEvent({
      order,
      status: ORDER_STATUS.CONFIRMED,
      recipientUser: order.customer,
      extraData: { reason: rejectionReason },
    });

    return order;
};

// Reassign Order to New Rider
export const reassignOrder = async (orderId, newRiderId, adminId) => {
    const order = await Order.findById(orderId).populate('customer', 'name email');
    if (!order) throw new Error('Order not found');

    if ([ORDER_STATUS.PICKED_UP, ORDER_STATUS.DELIVERED, ORDER_STATUS.CANCELLED].includes(order.status)) {
        throw new Error(`Cannot reassign order while in status: ${order.status}`);
    }

    const newRider = await User.findById(newRiderId);
    if (!newRider || newRider.role !== USER_ROLES.RIDER) {
        throw new Error('Target user is not a valid rider.');
    }

    const oldRiderId = order.rider;
    order.rider = newRiderId;
    order.status = ORDER_STATUS.RIDER_ASSIGNED;

    order.statusHistory.push({
        status: ORDER_STATUS.RIDER_ASSIGNED,
        updatedBy: adminId,
        userRole: USER_ROLES.ADMIN,
        reason: `Reassigned from rider ${oldRiderId || 'N/A'} to rider ${newRiderId}`,
        timestamp: new Date(),
    });

    if (oldRiderId) await User.findByIdAndUpdate(oldRiderId, { isAvailable: true });
    await User.findByIdAndUpdate(newRiderId, { isAvailable: false });

    await order.save();

    await NotificationService.notifyOrderEvent({
      order,
      status: ORDER_STATUS.RIDER_ASSIGNED,
      recipientUser: order.customer,
      extraData: { reason: `Reassigned to rider ${newRiderId}` },
    });

    return order;
};

// Handle Failed Delivery Attempt
export const handleDeliveryFailure = async (orderId, riderId, failureReason) => {
    const order = await Order.findById(orderId).populate('customer', 'name email');
    if (!order) throw new Error('Order not found');

    const validation = validateStateTransition(order.status, ORDER_STATUS.FAILED, USER_ROLES.RIDER, true);
    if (!validation.valid) throw new Error(validation.reason);

    order.status = ORDER_STATUS.FAILED;
    order.failedDeliveryAttempts = (order.failedDeliveryAttempts || 0) + 1;

    order.statusHistory.push({
        status: ORDER_STATUS.FAILED,
        updatedBy: riderId,
        userRole: USER_ROLES.RIDER,
        reason: failureReason || 'Delivery attempt failed (Recipient unavailable/Wrong address)',
        timestamp: new Date(),
    });

    if (order.failedDeliveryAttempts >= 3) {
        order.status = ORDER_STATUS.RETURNED;
        order.statusHistory.push({
            status: ORDER_STATUS.RETURNED,
            updatedBy: riderId,
            userRole: USER_ROLES.RIDER,
            reason: 'Max delivery attempts (3) exceeded. Parcel marked for return to sender.',
            timestamp: new Date(),
        });
        await User.findByIdAndUpdate(riderId, { isAvailable: true });
    }

    await order.save();

    await NotificationService.notifyOrderEvent({
      order,
      status: order.status,
      recipientUser: order.customer,
      extraData: { reason: failureReason },
    });

    return order;
};