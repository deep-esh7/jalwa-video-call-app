// src/routes/bundles.js
const express = require('express');
const router = express.Router();
const BundleController = require('../controllers/BundleController');

// Public endpoints
router.get('/', BundleController.getActiveBundles);
router.get('/:id', BundleController.getBundleById);

// Admin endpoints (should add auth middleware later)
router.post('/', BundleController.createBundle);
router.get('/admin/all', BundleController.getAllBundles);
router.put('/:id', BundleController.updateBundle);
router.delete('/:id', BundleController.deleteBundle);
router.patch('/:id/deactivate', BundleController.deactivateBundle);

module.exports = router;


