// src/routes/payments.js
const express = require('express');
const router = express.Router();
const PaymentController = require('../controllers/PaymentController');

// Public endpoints
router.get('/info', PaymentController.getPaymentInfo);

// Authenticated endpoints
router.post('/purchase', PaymentController.purchaseBundle); // Purchase a coin bundle
router.get('/wallet', PaymentController.getWallet);
router.get('/transactions', PaymentController.getTransactionHistory);

// Stripe endpoints (commented out for now)
// router.post('/checkout', PaymentController.createCheckoutSession);
// router.get('/history', PaymentController.getPaymentHistory);
// router.post('/webhook', express.raw({ type: 'application/json' }), PaymentController.handleWebhook);

module.exports = router;

