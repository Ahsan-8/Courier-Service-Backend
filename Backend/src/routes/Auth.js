import express from 'express';
import { register, login, refreshAccessToken, logout, forgotPassword, resetPassword } from "../controllers/AuthController.js";
import { validate } from '../middleware/validate.middleware.js';
import {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from '../validators/auth.validator.js';

const router = express.Router();
router.post("/register", validate(registerSchema), register);
router.post("/login", validate(loginSchema), login);
router.post('/refresh-token', refreshAccessToken);
router.post('/logout', logout);
router.post("/forget-password", validate(forgotPasswordSchema), forgotPassword);
router.post("/reset-password", validate(resetPasswordSchema), resetPassword);
export default router;
