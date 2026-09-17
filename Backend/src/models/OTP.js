import mongoose from 'mongoose';

const otpSchema = new mongoose.Schema({
    identifier: {
        type: String,
        required: true,
        index: true,
    },
    otpHash: {
        type: String,
        required: true,
    },
    attempts: {
        type: Number,
        default: 0,
    },
    isUsed: {
        type: Boolean,
        default: false,
    },
    expiresAt: {
        type: Date,
        required: true,
        index: { expires: 0 },
    },
}, { timestamps: true });
export default mongoose.model('OTP', otpSchema);
