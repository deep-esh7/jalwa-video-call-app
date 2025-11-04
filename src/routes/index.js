// src/routes/index.js
const express = require('express');
const router = express.Router();

// Import route modules
const healthRoutes = require('./health');
const usersRoutes = require('./users')
const configRoutes = require('./config');
const giftsRoutes = require('./gifts');

// Mount routes
router.use('/health', healthRoutes);
router.use('/api/users', usersRoutes);
router.use('/api/config', configRoutes);
router.use('/api/gifts', giftsRoutes);

module.exports = router;

