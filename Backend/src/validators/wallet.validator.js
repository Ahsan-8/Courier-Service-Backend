import { z } from 'zod';

export const disburseSchema = z.object({
  merchantId: z.string().min(1, 'merchantId is required'),
  amount: z.number().positive('Payout amount must be greater than 0'),
  paymentChannel: z.enum(['BANK_TRANSFER', 'BKASH', 'NAGAD'], {
    errorMap: () => ({ message: 'paymentChannel must be BANK_TRANSFER, BKASH, or NAGAD' }),
  }),
  accountDetails: z.object({
    accountName: z.string().optional(),
    accountNumber: z.string().min(1, 'accountNumber is required'),
    bankName: z.string().optional(),
    routingNumber: z.string().optional(),
  }),
});

export const reconcileSchema = z.object({}).optional();