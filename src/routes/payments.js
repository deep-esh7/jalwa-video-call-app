// src/routes/payments.js
const express = require('express');
const router = express.Router();
const PaymentController = require('../controllers/PaymentController');

// Public endpoints
router.get('/info', PaymentController.getPaymentInfo);

// Authenticated endpoints
router.get('/wallet', PaymentController.getWallet);
router.get('/transactions', PaymentController.getTransactionHistory);
router.get('/bundles/purchased', PaymentController.getPurchasedBundles); // Get purchased bundle history
router.post('/purchase', PaymentController.purchaseBundles); // Purchase multiple bundles

// Stripe endpoints (commented out for now)
// router.post('/checkout', PaymentController.createCheckoutSession);
// router.get('/history', PaymentController.getPaymentHistory);
// router.post('/webhook', express.raw({ type: 'application/json' }), PaymentController.handleWebhook);

module.exports = router;

