import express from 'express';
import {
    applyForRider,
    getPendingApplication,
    processRiderApplications,
    getRiderProfile,
    toggleAvailability,
    updateLocation,
    NearByRiders,
    toggleOnlineStatus,
    reviewApplication,
    deactivateRider,
    acceptOrder,
    completeOrder,
    rejectOrder,
    getRiderStats,
} from '../controllers/RiderController.js';
import { protect } from '../middleware/auth.js';
import { authorizeRoles } from '../middleware/role.js';

const router = express.Router();
router.post('/apply', applyForRider);

router.use(protect);
// Rider self-management
router.get('/profile', authorizeRoles('RIDER'), getRiderProfile);
router.patch('/availability', authorizeRoles('RIDER'), toggleAvailability);
router.patch('/toggle-online', authorizeRoles('RIDER'), toggleOnlineStatus);
router.patch('/location', authorizeRoles('RIDER'), updateLocation);
router.get('/stats', authorizeRoles('RIDER'), getRiderStats);

// Rider order workflow
router.post('/orders/:orderId/accept', authorizeRoles('RIDER'), acceptOrder);
router.post('/orders/:orderId/complete', authorizeRoles('RIDER'), completeOrder);
router.post('/orders/:orderId/reject', authorizeRoles('RIDER'), rejectOrder);

// Admin management actions
router.get('/nearby', authorizeRoles('ADMIN'), NearByRiders);
router.get('/applications', authorizeRoles('ADMIN'), getPendingApplication);
router.patch('/application/:riderId/approve', authorizeRoles('ADMIN'), processRiderApplications);
router.patch('/:id/review', authorizeRoles('ADMIN'), reviewApplication);
router.patch('/:id/deactivate', authorizeRoles('ADMIN'), deactivateRider);
export default router;