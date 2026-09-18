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
import { validate } from '../middleware/validate.middleware.js';
import {
  applyForRiderSchema,
  processApplicationSchema,
  reviewApplicationSchema,
  deactivateSchema,
  toggleOnlineSchema,
  updateLocationSchema,
  nearbyQuerySchema,
} from '../validators/rider.validator.js';

const router = express.Router();
router.post('/apply', validate(applyForRiderSchema), applyForRider);

router.use(protect);
// Rider self-management
router.get('/profile', authorizeRoles('RIDER'), getRiderProfile);
router.patch('/availability', authorizeRoles('RIDER'), toggleAvailability);
router.patch('/toggle-online', authorizeRoles('RIDER'), validate(toggleOnlineSchema), toggleOnlineStatus);
router.patch('/location', authorizeRoles('RIDER'), validate(updateLocationSchema), updateLocation);
router.get('/stats', authorizeRoles('RIDER'), getRiderStats);

// Rider order workflow
router.post('/orders/:orderId/accept', authorizeRoles('RIDER'), acceptOrder);
router.post('/orders/:orderId/complete', authorizeRoles('RIDER'), completeOrder);
router.post('/orders/:orderId/reject', authorizeRoles('RIDER'), rejectOrder);

// Admin management actions
router.get('/nearby', authorizeRoles('ADMIN'), validate(nearbyQuerySchema), NearByRiders);
router.get('/applications', authorizeRoles('ADMIN'), getPendingApplication);
router.patch('/application/:riderId/approve', authorizeRoles('ADMIN'), validate(processApplicationSchema), processRiderApplications);
router.patch('/:id/review', authorizeRoles('ADMIN'), validate(reviewApplicationSchema), reviewApplication);
router.patch('/:id/deactivate', authorizeRoles('ADMIN'), validate(deactivateSchema), deactivateRider);
export default router;