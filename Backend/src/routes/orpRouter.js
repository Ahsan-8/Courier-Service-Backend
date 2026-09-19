import express from 'express';
import { sendOTP, verifyOTP } from '../controllers/otpController.js';
import { validate } from '../middleware/validate.middleware.js';
import { sendOtpSchema, verifyOtpSchema } from '../validators/auth.validator.js';

const router = express.Router();
router.post('/send-otp', validate(sendOtpSchema), sendOTP);
router.post('/verify-otp', validate(verifyOtpSchema), verifyOTP);
export default router;