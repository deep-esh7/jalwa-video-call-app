// src/routes/promoCodes.js
const express = require('express');
const router = express.Router();
const PromoCodeController = require('../controllers/PromoCodeController');

// Public/User endpoints
router.post('/validate', PromoCodeController.validatePromoCode); // Validate promo code
router.get('/my-usage', PromoCodeController.getUserPromoUsage); // Get user's usage history

// Admin endpoints
router.post('/', PromoCodeController.createPromoCode); // Create promo code
router.get('/', PromoCodeController.getPromoCodes); // Get all promo codes
router.get('/:id', PromoCodeController.getPromoCodeById); // Get promo code by ID
router.patch('/:id', PromoCodeController.updatePromoCode); // Update promo code
router.post('/:id/deactivate', PromoCodeController.deactivatePromoCode); // Deactivate promo code
router.delete('/:id', PromoCodeController.deletePromoCode); // Delete promo code
router.get('/:id/stats', PromoCodeController.getPromoCodeStats); // Get stats

module.exports = router;

