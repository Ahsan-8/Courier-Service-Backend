import OTP from "../models/OTP.js";
import { generateSecureOTP } from '../utils/otp.js';
import { sendOTPEmail } from '../services/emailService.js';
import bcrypt from "bcryptjs";

const MAX_ATTEMPTS = 5;
const OTP_EXPIRY_MINUTES = 5;
const RESEND_COOLDOWN_SECONDS = 60;

export const sendOTP = async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) {
            return res.status(403).json({ message: 'Email is required!' });
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
};

export const verifyOTP = async (req, res) => {
    try {
        const { email, otp } = req.body;

        if (!email || !otp) {
            return res.status(400).json({ message: 'Email and OTP are required.' });
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

        optRecord.isUsed = true;
        await optRecord.save();

        res.status(200).json({
            success: true,
            message: 'OTP verified successfully.',
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};