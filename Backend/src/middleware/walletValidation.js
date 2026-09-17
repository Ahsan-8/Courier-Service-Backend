export const validatePayoutDisbursement = (req, res, next) => {
  const { merchantId, amount, paymentChannel, accountDetails } = req.body;

  if (!merchantId) {
    return res.status(400).json({ success: false, message: 'merchantId is required' });
  }

  if (!amount || isNaN(amount) || Number(amount) <= 0) {
    return res.status(400).json({ success: false, message: 'Payout amount must be a number greater than 0' });
  }

  const validChannels = ['BANK_TRANSFER', 'BKASH', 'NAGAD'];
  if (!paymentChannel || !validChannels.includes(paymentChannel)) {
    return res.status(400).json({
      success: false,
      message: `Invalid paymentChannel. Allowed: ${validChannels.join(', ')}`,
    });
  }

  if (!accountDetails || !accountDetails.accountNumber) {
    return res.status(400).json({ success: false, message: 'Account details with valid accountNumber are required' });
  }

  next();
};