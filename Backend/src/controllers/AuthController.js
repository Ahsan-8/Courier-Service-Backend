import User from "../models/User.js";
import Rider from "../models/Rider.js";
import RefreshToken from "../models/RefreshToken.js";
import jwt from "jsonwebtoken";

import { generateSecureOTP } from '../utils/otp.js';
import { sendOTPEmail } from '../services/emailService.js';
import bcrypt from "bcryptjs";
import OTP from "../models/OTP.js";
import { generateAccessToken, generateRefreshToken, sendRefreshTokenCookie } from "../utils/token.js";

const MAX_ATTEMPTS = 5;
const OTP_EXPIRY_MINUTES = 5;
const RESEND_COOLDOWN_SECONDS = 60;

export const generateToken = (user) => {
    return jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: "7d", });
}

export const register = async (req, res) => {
    try {
        const { name, email, phone, password, role } = req.body;
        const userExists = await User.findOne({ $or: [{ email }, { phone }] });
        if (userExists) {
            return res.status(400).json({ message: "User with this email or phone number already exists" });
        }
        const user = await User.create({ name, email, phone, password, role: role || "CUSTOMER" });

        const token = generateToken(user);
        res.status(201).json({
            success: true,
            data: {
                _id: user._id,
                name: user.name,
                email: user.email,
                phone: user.phone,
                role: user.role,
                token,
            },
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

export const login = async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email }).select("+password");
        if (!user) {
            return res.status(401).json({ message: "User not found!" });
        }
        const isMatch = await user.comparePassword(password);
        if (!isMatch) {
            return res.status(401).json({ message: "Password not matched" })
        }
        if (user.role === 'RIDER' && !user.isApproved) {
            const rider = await Rider.findOne({ user: user._id });
            if (rider && rider.approvalStatus === 'REJECTED') {
                return res.status(403).json({ message: `Application Rejected: ${rider.rejectionReason || 'Contact support.'}`, })
            }
            return res.status(403).json({ message: `Your rider account is pending admin approval. Please wait for verification.` })
        }

        if (user.role === 'RIDER') {
            const rider = await Rider.findOne({ user: user._id });
            if (rider && rider.isDeactivated) {
                return res.status(403).json({ message: `Your rider account has been suspended by an administrator.` })
            }
        }


        const token = generateToken(user);

        res.status(200).json({
            success: true,
            data: {
                _id: user._id,
                name: user.name,
                email: user.email,
                phone: user.phone,
                role: user.role,
                token,
            },
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}

export const forgotPassword = async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) {
            return res.status(403).json({ message: 'Email is required!' });
        }

        const user = await User.findOne({ email });
        if (!user) {
            return res.status(403).json({ message: 'No user exist with this email address!' });
        }
        const existingOTP = await OTP.findOne({ identifier: email, isUsed: false }).sort({ createdAt: -1 });
        if (existingOTP) {
            const timeSinceLastSend = (Date.now() - new Date(existingOTP.createdAt).getTime()) / 1000;
            if (timeSinceLastSend < RESEND_COOLDOWN_SECONDS) {
                const waitTime = Math.ceil(RESEND_COOLDOWN_SECONDS - timeSinceLastSend);
                return res.status(429).json({ message: `Please wait ${waitTime} seconds before you request for a new otp.` });
            }
        }

        const rawOtp = generateSecureOTP();
        const salt = await bcrypt.genSalt(10);
        const otpHash = await bcrypt.hash(rawOtp, salt);
        const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

        await OTP.deleteMany({ identifier: email });
        await OTP.create({
            identifier: email,
            otpHash,
            expiresAt,
        });

        await sendOTPEmail(email, rawOtp);

        res.status(200).json({
            success: true,
            message: `Password resend OTP sent to ${email}.`,
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}

export const resetPassword = async (req, res) => {
    try {
        const { email, otp, newPassword } = req.body;

        if (!email || !otp || !newPassword) {
            return res.status(400).json({ message: 'Email, OTP and New Password all are requred.' });
        }

        if (newPassword.length < 8) {
            return res.status(400).json({ message: 'New password need to be at least 8 character long.' });
        }

        const optRecord = await OTP.findOne({ identifier: email, isUsed: false }).sort({ createdAt: -1 });
        if (!optRecord) {
            return res.status(400).json({ message: 'No active OTP found. Request for a new code.' });
        }

        if (new Date() > optRecord.expiresAt) {
            await OTP.deleteOne({ _id: optRecord._id });
            return res.status(400).json({ message: 'OTP has been expired. Please request for a new OTP.' });
        }
        if (optRecord.attempts >= MAX_ATTEMPTS) {
            await OTP.deleteOne({ _id: optRecord._id });
            return res.status(400).json({ message: 'Maximum OTP verification attempt exceeded. Request for a new OTP.' });
        }

        const isMatch = await bcrypt.compare(otp, optRecord.otpHash);
        if (!isMatch) {
            optRecord.attempts += 1;
            await optRecord.save();

            const remainingAttempts = MAX_ATTEMPTS - optRecord.attempts;
            return res.status(400).json({ message: `Invalid OTP! ${remainingAttempts} attempt(s) remain.` });
        }

        const user = await User.findOne({ email });
        if (!user) {
            return res.status(404).json({ message: 'User not found.' });
        }
        user.password = newPassword;
        await user.save();

        res.status(200).json({
            success: true,
            message: 'Password reset successful. You can now login with your new password.'
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}

export const refreshAccessToken = async (req, res) => {
    try {
        const incomingRefreshToken = req.cookies?.refreshToken || req.body?.refreshToken;
        if (!incomingRefreshToken) {
            return res.status(401).json({ message: 'Refresh token missing.' });
        }

        // 1. Retrieve all active tokens for hash matching
        const activeTokens = await RefreshToken.find({ isRevoked: false });
        let matchedTokenDoc = null;

        for (const doc of activeTokens) {
            const isMatch = await bcrypt.compare(incomingRefreshToken, doc.tokenHash);
            if (isMatch) {
                matchedTokenDoc = doc;
                break;
            }
        }

        // 2. Security Feature: Reuse Detection
        // If no active token matched, check if an ALREADY REVOKED token is being reused
        if (!matchedTokenDoc) {
            const revokedTokens = await RefreshToken.find({ isRevoked: true });
            for (const doc of revokedTokens) {
                const isMatch = await bcrypt.compare(incomingRefreshToken, doc.tokenHash);
                if (isMatch) {
                    // Revoke all active tokens for this compromised user
                    await RefreshToken.updateMany({ user: doc.user }, { isRevoked: true });
                    res.clearCookie('refreshToken');
                    return res.status(403).json({
                        message: 'Compromised refresh token detected. All active sessions invalidated.',
                    });
                }
            }
            res.clearCookie('refreshToken');
            return res.status(401).json({ message: 'Invalid or expired refresh token.' });
        }

        // 3. Expiration Check
        if (new Date() > matchedTokenDoc.expiresAt) {
            matchedTokenDoc.isRevoked = true;
            await matchedTokenDoc.save();
            res.clearCookie('refreshToken');
            return res.status(401).json({ message: 'Refresh token expired.' });
        }

        // 4. Token Rotation: Revoke current token
        matchedTokenDoc.isRevoked = true;
        await matchedTokenDoc.save();

        // 5. Issue new tokens
        const user = await User.findById(matchedTokenDoc.user);
        if (!user) {
            return res.status(404).json({ message: 'User not found.' });
        }

        const newAccessToken = generateAccessToken(user._id, user.role);
        const { rawRefreshToken: newRefreshToken } = await generateRefreshToken(user._id);
        
        sendRefreshTokenCookie(res, newRefreshToken);

        return res.json({
            success: true,
            accessToken: newAccessToken,
        });

    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

export const logout = async (req, res) => {
    try {
        const incomingRefreshToken = req.cookies?.refreshToken || req.body?.refreshToken;
        
        if (incomingRefreshToken) {
            const activeTokens = await RefreshToken.find({ isRevoked: false });
            for (const doc of activeTokens) {
                const isMatch = await bcrypt.compare(incomingRefreshToken, doc.tokenHash);
                if (isMatch) {
                    doc.isRevoked = true;
                    await doc.save();
                    break;
                }
            }
        }

        res.clearCookie('refreshToken', {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
        });

        return res.json({ message: 'Logged out successfully.' });
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};