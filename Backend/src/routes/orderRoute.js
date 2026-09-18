import express from 'express';
import { createOrder, getOrders, getOrderById, trackOrder, assignRiderToOrder, updateStatus, rejectAssignment, reassign, markFailed, updateOrderStatus } from '../controllers/orderControllers.js';
import { protect } from '../middleware/auth.js';
import { authorizeRoles } from '../middleware/role.js';
import { validate } from '../middleware/validate.middleware.js';
import {
    createOrderSchema,
    assignRiderSchema,
    updateStatusSchema,
    rejectSchema,
    reassignSchema,
    markFailedSchema,
} from '../validators/order.validator.js';

const router = express.Router();

router.get('/tracking/:trackingId', trackOrder);

router.use(protect);

router.post('/', authorizeRoles('CUSTOMER'), validate(createOrderSchema), createOrder);
router.get('/', getOrders);
// More specific routes must come before parameterized routes to avoid conflicts
router.patch('/:id/status', authorizeRoles('ADMIN', 'RIDER'), validate(updateStatusSchema), updateStatus);
router.post('/:id/reject', authorizeRoles('RIDER'), validate(rejectSchema), rejectAssignment);
router.post('/:id/failed', authorizeRoles('RIDER'), validate(markFailedSchema), markFailed);
router.post('/:id/reassign', authorizeRoles('ADMIN'), validate(reassignSchema), reassign);
router.patch('/:id/assign', authorizeRoles('ADMIN'), validate(assignRiderSchema), assignRiderToOrder);
router.patch('/:id', authorizeRoles('ADMIN', 'RIDER'), updateOrderStatus);
router.get('/:id', getOrderById);

export default router;