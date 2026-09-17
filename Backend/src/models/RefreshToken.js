import mongoose from 'mongoose';

const refreshTokenSchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true,
        },
        tokenHash: {
            type: String,
            required: true,
        },
        isRevoked: {
            type: Boolean,
            default: false,
        },
        expiresAt: {
            type: Date,
            required: true,
            index: { expiresAt: 0 },
        },
    }, { timestamps: true },
);
export default mongoose.model('RefreshToken', refreshTokenSchema);