import { MerchantWallet, LedgerEntry, PayoutBatch } from '../models/Wallet.js';
import { LedgerService } from '../services/ledgerService.js';

// @desc    Get merchant wallet balance & recent transactions
// @route   GET /api/wallet/me
export const getMyWallet = async (req, res) => {
  try {
    const wallet = await MerchantWallet.findOne({ merchant: req.user._id });
    const transactions = await LedgerEntry.find({ merchant: req.user._id })
      .sort({ createdAt: -1 })
      .limit(20);

    res.json({
      success: true,
      data: {
        wallet: wallet || { availableBalance: 0, pendingBalance: 0, withdrawnBalance: 0 },
        recentLedger: transactions,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Admin triggers merchant payout disbursement
// @route   POST /api/wallet/disburse
export const disburseMerchantPayout = async (req, res) => {
  try {
    const { merchantId, amount, paymentChannel, accountDetails } = req.body;

    const payout = await LedgerService.processPayoutDisbursement({
      merchantId,
      amount: Number(amount),
      paymentChannel,
      accountDetails,
      adminUserId: req.user._id,
    });

    res.json({ success: true, message: 'Payout disbursed successfully', data: payout });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// @desc    Get paginated ledger audit entries for logged-in merchant
// @route   GET /api/wallet/ledger
export const getLedgerEntries = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 20);
    const skip = (page - 1) * limit;

    const entries = await LedgerEntry.find({ merchant: req.user._id })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await LedgerEntry.countDocuments({ merchant: req.user._id });

    res.json({
      success: true,
      data: entries,
      pagination: { total, page, pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Reconcile wallet balance against ledger entries
// @route   POST /api/wallet/reconcile
export const reconcileWallet = async (req, res) => {
  try {
    const result = await LedgerService.reconcileWallet(req.user._id);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// @desc    Get all historical payout disbursement batches across platform
// @route   GET /api/wallet/payout-batches
export const getPayoutBatches = async (req, res) => {
  try {
    const batches = await PayoutBatch.find()
      .populate('merchant', 'name email phone')
      .populate('processedBy', 'name email')
      .sort({ createdAt: -1 });

    res.json({ success: true, count: batches.length, data: batches });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};