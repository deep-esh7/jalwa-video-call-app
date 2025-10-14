// src/routes/user.js
const express = require('express');
const router = express.Router();
const { UserController } = require('../controllers');

// Get user from Firebase
router.get('/:userId', UserController.getUserFromFirebase);

module.exports = router;

