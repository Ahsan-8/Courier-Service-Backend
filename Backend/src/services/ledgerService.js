import mongoose from 'mongoose';
import { MerchantWallet, LedgerEntry, PayoutBatch } from '../models/Wallet.js';
import Order from '../models/Order.js';

let transactionsSupported = null;

async function checkTransactionsSupported() {
  if (transactionsSupported !== null) return transactionsSupported;
  try {
    const admin = mongoose.connection.admin();
    const info = await admin.serverStatus();
    transactionsSupported = info.repl && Array.isArray(info.repl.set) && info.repl.set.length > 0;
  } catch {
    transactionsSupported = false;
  }
  return transactionsSupported;
}

async function withSession(operation) {
  if (await checkTransactionsSupported()) {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const result = await operation(session);
      await session.commitTransaction();
      session.endSession();
      return result;
    } catch (error) {
      try { await session.abortTransaction(); } catch {}
      session.endSession();
      throw error;
    }
  }
  return await operation(null);
}

export class LedgerService {
  static async settleOrderFinances(orderId) {
    return withSession(async (session) => {
      const order = session
        ? await Order.findById(orderId).session(session)
        : await Order.findById(orderId);
      if (!order) throw new Error('Order not found');

      let wallet = session
        ? await MerchantWallet.findOne({ merchant: order.customer }).session(session)
        : await MerchantWallet.findOne({ merchant: order.customer });
      if (!wallet) {
        wallet = session
          ? (await MerchantWallet.create([{ merchant: order.customer }], { session }))[0]
          : (await MerchantWallet.create([{ merchant: order.customer }]))[0];
      }

      const { zone, baseFee, weightSurcharge, codFee, returnHandlingFee, deliveryFee, netPayableToMerchant } = order.pricing;
      const codAmount = order.pricing.codAmount || 0;

      if (order.status === 'DELIVERED') {
        if (codAmount > 0) {
          wallet.availableBalance += codAmount;
          await session
            ? LedgerEntry.create([{
                merchant: order.customer,
                order: order._id,
                type: 'COD_COLLECTION',
                entryType: 'CREDIT',
                amount: codAmount,
                balanceAfter: wallet.availableBalance,
                description: `COD Cash collected for order ${order.trackingId}`,
              }], { session })
            : LedgerEntry.create([{
                merchant: order.customer,
                order: order._id,
                type: 'COD_COLLECTION',
                entryType: 'CREDIT',
                amount: codAmount,
                balanceAfter: wallet.availableBalance,
                description: `COD Cash collected for order ${order.trackingId}`,
              }]);
        }
        wallet.availableBalance -= deliveryFee;
        await session
          ? LedgerEntry.create([{
              merchant: order.customer,
              order: order._id,
              type: 'DELIVERY_FEE',
              entryType: 'DEBIT',
              amount: deliveryFee,
              balanceAfter: wallet.availableBalance,
              description: `Delivery charges deducted (${zone}) for order ${order.trackingId}`,
            }], { session })
          : LedgerEntry.create([{
              merchant: order.customer,
              order: order._id,
              type: 'DELIVERY_FEE',
              entryType: 'DEBIT',
              amount: deliveryFee,
              balanceAfter: wallet.availableBalance,
              description: `Delivery charges deducted (${zone}) for order ${order.trackingId}`,
            }]);
      } else if (order.status === 'RETURNED') {
        wallet.availableBalance -= returnHandlingFee;
        await session
          ? LedgerEntry.create([{
              merchant: order.customer,
              order: order._id,
              type: 'RETURN_HANDLING_FEE',
              entryType: 'DEBIT',
              amount: returnHandlingFee,
              balanceAfter: wallet.availableBalance,
              description: `Return shipping charge (RTO 50%) for order ${order.trackingId}`,
            }], { session })
          : LedgerEntry.create([{
              merchant: order.customer,
              order: order._id,
              type: 'RETURN_HANDLING_FEE',
              entryType: 'DEBIT',
              amount: returnHandlingFee,
              balanceAfter: wallet.availableBalance,
              description: `Return shipping charge (RTO 50%) for order ${order.trackingId}`,
            }]);
      }

      if (session) {
        await wallet.save({ session });
      } else {
        await wallet.save();
      }
      return wallet;
    });
  }

  static async processPayoutDisbursement({ merchantId, amount, paymentChannel, accountDetails, adminUserId }) {
    return withSession(async (session) => {
      const wallet = session
        ? await MerchantWallet.findOne({ merchant: merchantId }).session(session)
        : await MerchantWallet.findOne({ merchant: merchantId });
      if (!wallet) throw new Error('Merchant wallet not found');

      if (wallet.availableBalance < amount) {
        throw new Error(`Insufficient funds. Available balance: ৳${wallet.availableBalance}`);
      }

      const batchId = `PAY-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      const payoutData = {
        merchant: merchantId,
        batchId,
        totalAmount: amount,
        paymentChannel,
        accountDetails,
        status: 'PAID',
        processedBy: adminUserId,
      };
      const payoutBatch = session
        ? (await PayoutBatch.create([payoutData], { session }))[0]
        : (await PayoutBatch.create([payoutData]))[0];

      wallet.availableBalance -= amount;
      wallet.withdrawnBalance += amount;
      await session ? wallet.save({ session }) : wallet.save();

      const ledgerData = {
        merchant: merchantId,
        payoutBatch: payoutBatch._id,
        type: 'PAYOUT_DISBURSEMENT',
        entryType: 'DEBIT',
        amount,
        balanceAfter: wallet.availableBalance,
        description: `Disbursed ৳${amount} via ${paymentChannel} [Ref: ${batchId}]`,
      };
      await session
        ? LedgerEntry.create([ledgerData], { session })
        : LedgerEntry.create([ledgerData]);
      return payoutBatch;
    });
  }

  static async reconcileWallet(merchantId) {
    return withSession(async (session) => {
      const wallet = session
        ? await MerchantWallet.findOne({ merchant: merchantId }).session(session)
        : await MerchantWallet.findOne({ merchant: merchantId });
      if (!wallet) throw new Error('Merchant wallet not found');

      const entriesQuery = LedgerEntry.find({ merchant: merchantId }).sort({ createdAt: 1 });
      const entries = session ? await entriesQuery.session(session) : await entriesQuery;

      let computed = 0;
      for (const entry of entries) {
        const delta = entry.entryType === 'CREDIT' ? entry.amount : -entry.amount;
        computed += delta;
      }

      const drift = computed - wallet.availableBalance;
      if (Math.abs(drift) > 0.01) {
        await session
          ? MerchantWallet.updateOne({ _id: wallet._id }, { availableBalance: computed }, { session })
          : MerchantWallet.updateOne({ _id: wallet._id }, { availableBalance: computed });
      }
      return { computedBalance: computed, drift, reconciled: Math.abs(drift) <= 0.01 };
    });
  }
}
