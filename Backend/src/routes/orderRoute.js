import express from 'express';
import { createOrder, getOrders, getOrderById, trackOrder, updateOrderStatus, assignRiderToOrder, updateStatus, rejectAssignment, reassign, markFailed } from '../controllers/orderControllers.js';
import { protect } from '../middleware/auth.js';
import { authorizeRoles } from '../middleware/role.js';

const router = express.Router();

router.get('/tracking/:trackingId', trackOrder);

router.use(protect);

router.post('/', authorizeRoles('CUSTOMER'), createOrder);
router.get('/', getOrders);
// More specific routes must come before parameterized routes to avoid conflicts
router.patch('/:id/status', authorizeRoles('ADMIN', 'RIDER'), updateStatus);
router.post('/:id/reject', authorizeRoles('RIDER'), rejectAssignment);
router.post('/:id/failed', authorizeRoles('RIDER'), markFailed);
router.post('/:id/reassign', authorizeRoles('ADMIN'), reassign);
router.patch('/:id/assign', authorizeRoles('ADMIN'), assignRiderToOrder);
router.patch('/:id', authorizeRoles('ADMIN', 'RIDER'), updateOrderStatus);
router.get('/:id', getOrderById);

export default router;