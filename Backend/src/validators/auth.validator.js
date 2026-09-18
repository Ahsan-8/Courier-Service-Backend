import { z } from 'zod';

const emailSchema = z.string().email('Invalid email format');
const passwordSchema = z.string().min(6, 'Password must be at least 6 characters');
const nameSchema = z.string().min(1, 'Name is required').max(100, 'Name too long');
// Bangladeshi mobile numbers: start with 0, then 9-10 more digits (total 10-11 digits)
// Examples: 01712345678, 0131234567, 01912345678
const phoneSchema = z.string().regex(/^0[1-9]\d{8,9}$/, 'Phone must be a valid Bangladeshi number (e.g., 017xxxxxxxx)').optional().or(z.literal(''));
const roleSchema = z.enum(['CUSTOMER', 'RIDER', 'ADMIN']).optional();
const otpSchema = z.string().regex(/^\d{6}$/, 'OTP must be a 6-digit code');

export const registerSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  phone: phoneSchema,
  password: passwordSchema,
  role: roleSchema,
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required'),
});

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});

export const resetPasswordSchema = z.object({
  email: emailSchema,
  otp: otpSchema,
  newPassword: z.string().min(8, 'Password must be at least 8 characters'),
});

export const sendOtpSchema = z.object({
  email: emailSchema,
});

export const verifyOtpSchema = z.object({
  email: emailSchema,
  otp: otpSchema,
});