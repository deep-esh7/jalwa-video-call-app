// src/routes/index.js
const express = require('express');
const router = express.Router();

// Import route modules
const healthRoutes = require('./health');
const usersRoutes = require('./users')

// Mount routes
router.use('/health', healthRoutes);
router.use('/api/users', usersRoutes);

module.exports = router;

