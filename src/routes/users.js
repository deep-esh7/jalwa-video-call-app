// src/routes/users.js
const express = require('express');
const router = express.Router();
const { UserController } = require('../controllers');

// Get current user (requires Firebase token)
router.get('/me', UserController.getCurrentUser);

// Get all users with status
router.get('/', UserController.getAllUsers);

// Get user by ID
router.get('/:id', UserController.getUserById);

// Mark user as offline
router.post('/:userId/offline', UserController.markUserOffline);

// Delete all users (admin only - for development)
router.delete('/all', UserController.deleteAllUsers);

module.exports = router;

