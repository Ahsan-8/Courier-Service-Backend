import express from 'express';
import { register, login, refreshAccessToken, logout, forgotPassword, resetPassword } from "../controllers/AuthController.js";

const router = express.Router();
router.post("/register", register);
router.post("/login", login);
router.post('/refresh-token', refreshAccessToken);
router.post('/logout', logout);

router.post("/forget-password", forgotPassword);
router.post("/reset-password", resetPassword);
export default router;