// src/routes/user.js
const express = require('express');
const router = express.Router();
const { UserController } = require('../controllers');

// Get current user (from token) - creates/updates in DB
// This endpoint should be used for authentication flow
router.get('/me', UserController.getCurrentUser);

// Get user from Firebase (legacy/debugging)
router.get('/:userId', UserController.getUserFromFirebase);

module.exports = router;

