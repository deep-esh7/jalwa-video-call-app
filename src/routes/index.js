// src/routes/index.js
const express = require('express');
const router = express.Router();

// Import route modules
const healthRoutes = require('./health');
const usersRoutes = require('./users')
const configRoutes = require('./config');

// Mount routes
router.use('/health', healthRoutes);
router.use('/api/users', usersRoutes);
router.use('/api/config', configRoutes);
router.use('/api/config', configRoutes);

module.exports = router;

