import express from 'express';
import {
    applyForRider,
    getPendingApplication,
    processRiderApplications,
    getRiderProfile,
    toggleAvailability,
    updateLocation,
    NearByRiders,
} from '../controllers/RiderController.js';
import { protect } from '../middleware/auth.js';
import { authorizeRoles } from '../middleware/role.js';

const router = express.Router();
router.post('/apply', applyForRider);

router.use(protect);
// Rider operational routes
router.get('/profile', authorizeRoles('RIDER'), getRiderProfile);
router.patch('/availability', authorizeRoles('RIDER'), toggleAvailability);
router.patch('/location', authorizeRoles('RIDER'), updateLocation);

// Admin review routes
router.get('/nearby', authorizeRoles('ADMIN'), NearByRiders);
router.get('/applications', authorizeRoles('ADMIN'), getPendingApplication);
router.patch('/application/:riderId/approve', authorizeRoles('ADMIN'), processRiderApplications);
export default router;