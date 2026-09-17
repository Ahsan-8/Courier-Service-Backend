import mongoose from 'mongoose';
import { MerchantWallet, LedgerEntry, PayoutBatch } from '../models/Wallet.js';
import Order from '../models/Order.js';

export class LedgerService {
  /**
   * Settles order billing onto merchant ledger upon final status change.
   * Uses MongoDB ACID transactions so wallet balances and audit entries
   * are never written independently of each other.
   */
  static async settleOrderFinances(orderId) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const order = await Order.findById(orderId).session(session);
      if (!order) throw new Error('Order not found');

      let wallet = await MerchantWallet.findOne({ merchant: order.customer }).session(session);
      if (!wallet) {
        const created = await MerchantWallet.create([{ merchant: order.customer }], { session });
        wallet = created[0];
      }

      const { zone, baseFee, weightSurcharge, codFee, returnHandlingFee, deliveryFee, netPayableToMerchant } = order.pricing;
      const codAmount = order.pricing.codAmount || 0;

      if (order.status === 'DELIVERED') {
        // 1. Credit Cash Collected
        if (codAmount > 0) {
          wallet.availableBalance += codAmount;
          await LedgerEntry.create([{
            merchant: order.customer,
            order: order._id,
            type: 'COD_COLLECTION',
            entryType: 'CREDIT',
            amount: codAmount,
            balanceAfter: wallet.availableBalance,
            description: `COD Cash collected for order ${order.trackingId}`,
          }], { session });
        }

        // 2. Debit Total Delivery Fee
        wallet.availableBalance -= deliveryFee;
        await LedgerEntry.create([{
          merchant: order.customer,
          order: order._id,
          type: 'DELIVERY_FEE',
          entryType: 'DEBIT',
          amount: deliveryFee,
          balanceAfter: wallet.availableBalance,
          description: `Delivery charges deducted (${zone}) for order ${order.trackingId}`,
        }], { session });

      } else if (order.status === 'RETURNED') {
        // Debit Return Handling Penalty (Allows negative balance for merchant debt tracking)
        wallet.availableBalance -= returnHandlingFee;
        await LedgerEntry.create([{
          merchant: order.customer,
          order: order._id,
          type: 'RETURN_HANDLING_FEE',
          entryType: 'DEBIT',
          amount: returnHandlingFee,
          balanceAfter: wallet.availableBalance,
          description: `Return shipping charge (RTO 50%) for order ${order.trackingId}`,
        }], { session });
      }

      await wallet.save({ session });
      await session.commitTransaction();
      session.endSession();

      return wallet;
    } catch (error) {
      await session.abortTransaction();
      session.endSession();
      throw error;
    }
  }

  /**
   * Processes a merchant payout disbursement (Bank / Mobile Financial Service)
   */
  static async processPayoutDisbursement({ merchantId, amount, paymentChannel, accountDetails, adminUserId }) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const wallet = await MerchantWallet.findOne({ merchant: merchantId }).session(session);
      if (!wallet) throw new Error('Merchant wallet not found');

      if (wallet.availableBalance < amount) {
        throw new Error(`Insufficient funds. Available balance: ৳${wallet.availableBalance}`);
      }

      // Create Payout Request Record
      const batchId = `PAY-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      const payoutBatch = await PayoutBatch.create([{
        merchant: merchantId,
        batchId,
        totalAmount: amount,
        paymentChannel,
        accountDetails,
        status: 'PAID',
        processedBy: adminUserId,
      }], { session });

      // Deduct from Available & Move to Lifetime Withdrawn Balance
      wallet.availableBalance -= amount;
      wallet.withdrawnBalance += amount;
      await wallet.save({ session });

      // Post Audit Entry
      await LedgerEntry.create([{
        merchant: merchantId,
        payoutBatch: payoutBatch[0]._id,
        type: 'PAYOUT_DISBURSEMENT',
        entryType: 'DEBIT',
        amount: amount,
        balanceAfter: wallet.availableBalance,
        description: `Disbursed ৳${amount} via ${paymentChannel} [Ref: ${batchId}]`,
      }], { session });

      await session.commitTransaction();
      session.endSession();

      return payoutBatch[0];
    } catch (error) {
      await session.abortTransaction();
      session.endSession();
      throw error;
    }
  }

  /**
   * Reconciles all ledger entries against the wallet's running balance.
   * Useful for detecting drift between the ledger and the aggregated wallet.
   */
  static async reconcileWallet(merchantId) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const wallet = await MerchantWallet.findOne({ merchant: merchantId }).session(session);
      if (!wallet) throw new Error('Merchant wallet not found');

      const entries = await LedgerEntry.find({ merchant: merchantId })
        .sort({ createdAt: 1 })
        .session(session);

      let computed = 0;
      for (const entry of entries) {
        const delta = entry.entryType === 'CREDIT' ? entry.amount : -entry.amount;
        computed += delta;
      }

      const drift = computed - wallet.availableBalance;
      if (Math.abs(drift) > 0.01) {
        await MerchantWallet.updateOne(
          { _id: wallet._id },
          { availableBalance: computed },
          { session }
        );
      }

      await session.commitTransaction();
      session.endSession();

      return { computedBalance: computed, drift, reconciled: Math.abs(drift) <= 0.01 };
    } catch (error) {
      await session.abortTransaction();
      session.endSession();
      throw error;
    }
  }
}