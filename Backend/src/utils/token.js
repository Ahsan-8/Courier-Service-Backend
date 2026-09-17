import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import RefreshToken from '../models/RefreshToken.js';

const ACCESS_SECRET = process.env.JWT_SECRET || 'access_secret_123';
const REFRESH_SECRET = process.env.REFRESH_SECRET || 'refresh_secret_123';

export const generateAccessToken = (userId, role) => {
    return jwt.sign(
        { id: userId, role },
        ACCESS_SECRET,
        { expiresIn: process.env.ACCESS_TOKEN_EXPIRY || '7d' }
    );
};

export const generateRefreshToken = async (userId) => {
    const rawRefreshToken = crypto.randomBytes(40).toString('hex');
    const salt = await bcrypt.genSalt(10);
    const tokenHash = await bcrypt.hash(rawRefreshToken, salt);

    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await RefreshToken.create({
        user: userId,
        tokenHash,
        expiresAt,
    });
    return { rawRefreshToken, expiresAt };
};
export const sendRefreshTokenCookie = async (res, token) => {
    res.cookie('refreshToken', token, {
        // Prevents XSS attacks (JS cannot read cookie)
        httpOnly: true,
        // SameSite HTTPS in production
        secure: process.env.NODE_ENV === 'production',
        // Protects against CSRF
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000,
    });
}