// src/routes/users.js
const express = require('express');
const router = express.Router();
const { UserController } = require('../controllers');

// Get current user (requires Firebase token)
// This is the primary API endpoint - creates/updates user in DB
router.get('/me', UserController.getCurrentUser);

// Get all users with status (optional - for admin/debugging)
router.get('/', UserController.getAllUsers);

// Get user by ID (optional - for user profiles)
router.get('/:id', UserController.getUserById);

// Delete all users (admin only - for development)
router.delete('/all', UserController.deleteAllUsers);

// Update user profile (requires authentication)
router.put('/profile', UserController.updateProfile);

// Get user from Firebase (legacy/debugging)
router.get('/:userId', UserController.getUserFromFirebase);

module.exports = router;