import { ORDER_STATUS, USER_ROLES, ALLOWED_TRANSITIONS } from '../constants/orderConstants.js';

export const validateStateTransition = (currentStatus, targetStatus, userRole, isAssignedRider = false) => {
    if (userRole == USER_ROLES.ADMIN) {
        return { valid: true };
    }
    const terminalStates = [ORDER_STATUS.DELIVERED, ORDER_STATUS.CANCELLED, ORDER_STATUS.RETURNED];
    if (terminalStates.includes(currentStatus)) {
        return {
            valid: false,
            reason: `Cannot modify an order that is already in a terminal state (${currentStatus}).`,
        };
    }

    const validNextStage = ALLOWED_TRANSITIONS[currentStatus] || [];
    if (!validNextStage.includes(targetStatus)) {
        return {
            valid: false,
            reason: `Invalid status transition from '${currentStatus}' to '${targetStatus}'.`,
        };
    }

    if (userRole === USER_ROLES.CUSTOMER) {
        if (targetStatus === ORDER_STATUS.CANCELLED) {
            const cancellableStates = [ORDER_STATUS.PENDING, ORDER_STATUS.CONFIRMED, ORDER_STATUS.RIDER_ASSIGNED];
            if (!cancellableStates.includes(currentStatus)) {
                return {
                    valid: false,
                    reason: 'Customers cannot cancel an order once the package has been picked up.',
                };
            }
            return { valid: true };
        }
        return { valid: false, reason: 'Customers are not authorized to trigger this status update.' };
    }

    if (userRole === USER_ROLES.RIDER) {
        if (!isAssignedRider) {
            return { valid: false, reason: 'Only the rider assigned to this order can update its status.' };
        }
        const riderAllowedStates = [
            ORDER_STATUS.PICKED_UP,
            ORDER_STATUS.IN_TRANSIT,
            ORDER_STATUS.OUT_FOR_DELIVERY,
            ORDER_STATUS.DELIVERED,
            ORDER_STATUS.FAILED,
            ORDER_STATUS.PARTIAL_DELIVERY,
        ];
        if (!riderAllowedStates.includes(targetStatus)) {
            return { valid: false, reason: `Riders are not authorized to set status to '${targetStatus}'.` };
        }
        return { valid: true };
    }
    return { valid: false, reason: 'Unauthorized access role.' };
};