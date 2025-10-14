// src/routes/health.js
const express = require('express');
const router = express.Router();
const { HealthController } = require('../controllers');

// Health check endpoint
router.get('/', HealthController.getHealth);

module.exports = router;

