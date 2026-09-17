import express from 'express';
import { protect } from '../middleware/auth.js';
import { authorizeRoles } from '../middleware/role.js';
import { validatePayoutDisbursement } from '../middleware/walletValidation.js';
import { getMyWallet, getLedgerEntries, reconcileWallet, disburseMerchantPayout, getPayoutBatches } from '../controllers/walletController.js';

const router = express.Router();

// Apply base authentication to all routes below
router.use(protect);

// ==========================================
// Merchant Routes (Accessible by any authenticated user)
// ==========================================

// @route   GET /api/wallet/me
// @desc    Get logged-in merchant's balance and recent transactions
router.get('/me', getMyWallet);

// @route   GET /api/wallet/ledger
// @desc    Get paginated ledger audit entries for logged-in merchant
router.get('/ledger', getLedgerEntries);

// @route   POST /api/wallet/reconcile
// @desc    Reconcile wallet balance against ledger entries
router.post('/reconcile', reconcileWallet);

// ==========================================
// Admin / Finance Routes (Protected by RBAC)
// ==========================================

// @route   POST /api/wallet/disburse
// @desc    Admin manually processes or triggers payout to merchant
router.post(
  '/disburse',
  authorizeRoles('ADMIN'),
  validatePayoutDisbursement,
  disburseMerchantPayout
);

// @route   GET /api/wallet/payout-batches
// @desc    Get all historical payout disbursement batches across platform
router.get('/payout-batches', authorizeRoles('ADMIN'), getPayoutBatches);

export default router;