import express from 'express';
import {getDeshboardStats} from '../controllers/adminController.js';
import {protect} from '../middleware/auth.js';
import { authorizeRoles } from '../middleware/role.js';

const router = express.Router();

router.use(protect);
router.get('/analyze',authorizeRoles,getDeshboardStats);

export default router;