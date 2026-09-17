import mongoose from 'mongoose';

// 1. Merchant Wallet Schema (Aggregated running balances)
const merchantWalletSchema = new mongoose.Schema(
  {
    merchant: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    pendingBalance: { type: Number, default: 0 },   // Cash in transit (Orders picked up / in delivery)
    availableBalance: { type: Number, default: 0 }, // Delivered cash ready for payout withdrawal
    withdrawnBalance: { type: Number, default: 0 }, // Total lifetime remitted payout cash
    currency: { type: String, default: 'BDT' },
  },
  { timestamps: true }
);

// 2. Double-Entry Ledger Transaction Schema
const ledgerEntrySchema = new mongoose.Schema(
  {
    merchant: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', index: true },
    payoutBatch: { type: mongoose.Schema.Types.ObjectId, ref: 'PayoutBatch', index: true },

    type: {
      type: String,
      enum: [
        'COD_COLLECTION',       // (+) Cash collected from buyer at doorstep
        'DELIVERY_FEE',         // (-) Freight/base fee deducted by platform
        'WEIGHT_SURCHARGE',     // (-) Volumetric/mass surcharge deducted
        'COD_FEE',              // (-) 1% cash handling fee deducted
        'RETURN_HANDLING_FEE',  // (-) 50% RTO charge deducted on failed delivery
        'PAYOUT_DISBURSEMENT',  // (-) Bank/bKash transfer paid to merchant
        'MANUAL_ADJUSTMENT',    // (+/-) Admin correction entry
      ],
      required: true,
    },

    entryType: { type: String, enum: ['CREDIT', 'DEBIT'], required: true },
    amount: { type: Number, required: true },
    balanceAfter: { type: Number, required: true }, // Snapshot of available balance after entry
    description: { type: String, required: true },
  },
  { timestamps: true }
);

// 3. Payout Settlement Batch Schema
const payoutBatchSchema = new mongoose.Schema(
  {
    merchant: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    batchId: { type: String, required: true, unique: true }, // e.g., PAY-20260917-882
    totalAmount: { type: Number, required: true },
    paymentChannel: { type: String, enum: ['BANK_TRANSFER', 'BKASH', 'NAGAD'], required: true },
    accountDetails: {
      accountName: String,
      accountNumber: String,
      bankName: String,
      routingNumber: String,
    },
    status: {
      type: String,
      enum: ['REQUESTED', 'PROCESSING', 'PAID', 'REJECTED'],
      default: 'REQUESTED',
    },
    processedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    transactionRef: { type: String }, // Bank EFT/bKash TRX ID
  },
  { timestamps: true }
);

export const MerchantWallet = mongoose.model('MerchantWallet', merchantWalletSchema);
export const LedgerEntry = mongoose.model('LedgerEntry', ledgerEntrySchema);
export const PayoutBatch = mongoose.model('PayoutBatch', payoutBatchSchema);