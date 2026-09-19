import { z } from 'zod';

const vehicleTypeSchema = z.enum(['BIKE', 'CAR', 'VAN', 'FOOT'], {
  errorMap: () => ({ message: 'Vehicle type must be one of: BIKE, CAR, VAN, FOOT' }),
});

export const applyForRiderSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  email: z.string().email('Invalid email format'),
  phone: z.string().regex(/^0[1-9]\d{7,9}$/, 'Invalid Bangladeshi phone number').optional().or(z.literal('')),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  vehicleType: vehicleTypeSchema,
  licenseNumber: z.string().min(1, 'License number is required').max(50),
});

export const processApplicationSchema = z.object({
  action: z.enum(['APPROVE', 'REJECT'], {
    errorMap: () => ({ message: 'Action must be APPROVE or REJECT' }),
  }),
  rejectionReason: z.string().max(500).optional(),
});

export const reviewApplicationSchema = z.object({
  approvalStatus: z.enum(['APPROVED', 'REJECTED'], {
    errorMap: () => ({ message: 'approvalStatus must be APPROVED or REJECTED' }),
  }),
});

export const deactivateSchema = z.object({
  isDeactivated: z.boolean('isDeactivated must be a boolean'),
  reason: z.string().max(500).optional(),
});

export const toggleOnlineSchema = z.object({
  isAvailable: z.boolean('isAvailable must be a boolean').optional(),
}).optional();

export const updateLocationSchema = z.object({
  longitude: z.number().min(-180, 'Longitude must be between -180 and 180').max(180, 'Longitude must be between -180 and 180'),
  latitude: z.number().min(-90, 'Latitude must be between -90 and 90').max(90, 'Latitude must be between -90 and 90'),
});

export const nearbyQuerySchema = z.object({
  lng: z.string().transform(Number).refine(n => !isNaN(n) && n >= -180 && n <= 180, 'Invalid longitude'),
  lat: z.string().transform(Number).refine(n => !isNaN(n) && n >= -90 && n <= 90, 'Invalid latitude'),
  maxDistance: z.string().transform(Number).refine(n => !isNaN(n) && n > 0, 'maxDistance must be positive').optional().default('5000'),
});