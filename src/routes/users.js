// src/routes/users.js
const express = require('express');
const router = express.Router();
const { UserController } = require('../controllers');

// Get current user (requires Firebase token)
router.get('/me', UserController.getCurrentUser);

// Get user by ID
router.get('/:id', UserController.getUserById);

// Delete all users (admin only - for development)
router.delete('/', UserController.deleteAllUsers);

module.exports = router;

