import { z } from 'zod';

const addressSchema = z.object({
  district: z.string().max(100).optional(),
  area: z.string().max(100).optional(),
}).optional().default({});

const pickupDeliveryDetailsSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  phone: z.string().regex(/^01[3-9]\d{8}$/, 'Invalid Bangladeshi phone number'),
  address: z.string().min(1, 'Address is required').max(500),
});

const packageDetailsSchema = z.object({
  weightKG: z.number().positive('Weight must be greater than 0').max(100, 'Weight cannot exceed 100 KG'),
  description: z.string().min(1, 'Description is required').max(500),
  category: z.enum(['DOCUMENTS', 'FRAGILE', 'ELECTRONICS', 'CLOTHING', 'HEAVY', 'PARCEL']).optional().default('PARCEL'),
});

export const createOrderSchema = z.object({
  pickupDetails: pickupDeliveryDetailsSchema,
  deliveryDetails: pickupDeliveryDetailsSchema,
  packageDetails: packageDetailsSchema,
  pickupAddress: addressSchema,
  deliveryAddress: addressSchema,
  codAmount: z.number().nonnegative('COD amount cannot be negative').optional().default(0),
  paymentMethod: z.enum(['COD', 'PREPAID', 'CARD']).optional().default('COD'),
});

export const assignRiderSchema = z.object({
  riderId: z.string().min(1, 'Rider ID is required'),
});

export const updateStatusSchema = z.object({
  status: z.string().min(1, 'Status is required'),
  reason: z.string().max(500).optional(),
  notes: z.string().max(500).optional(),
});

export const rejectSchema = z.object({
  reason: z.string().max(500).optional(),
});

export const reassignSchema = z.object({
  riderId: z.string().min(1, 'Rider ID is required'),
});

export const markFailedSchema = z.object({
  reason: z.string().min(1, 'Reason is required').max(500),
});