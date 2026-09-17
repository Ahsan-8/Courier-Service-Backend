import express from 'express';
import { createOrder, getOrders, getOrderById, trackOrder, updateOrderStatus, assignRiderToOrder, updateStatus, rejectAssignment, reassign, markFailed } from '../controllers/orderControllers.js';
import { protect } from '../middleware/auth.js';
import { authorizeRoles } from '../middleware/role.js';

const router = express.Router();

router.get('/tracking/:trackingId', trackOrder);

router.use(protect);

router.post('/', authorizeRoles('CUSTOMER'), createOrder);
router.get('/', getOrders);
router.get('/:id', getOrderById);
router.patch('/:id/assign', authorizeRoles('ADMIN'), assignRiderToOrder);
router.patch('/:id', authorizeRoles('ADMIN', 'RIDER'), updateOrderStatus);

router.patch('/:id/status', updateStatus);

router.post('/:id/reject', authorizeRoles('RIDER'), rejectAssignment);
router.post('/:id/failed', authorizeRoles('RIDER'), markFailed);

router.post('/:id/reassign', authorizeRoles('ADMIN'), reassign);
export default router;