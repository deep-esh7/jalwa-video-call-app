const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const chatController = require('../controllers/chatController');

// Create a new chat room
router.post('/rooms', authenticate, (req, res) => chatController.createRoom(req, res));

// Get room info
router.get('/rooms/:roomId', authenticate, (req, res) => chatController.getRoomInfo(req, res));

// Send a message
router.post('/rooms/:roomId/messages', authenticate, (req, res) => chatController.sendMessage(req, res));

// Get chat history
router.get('/rooms/:roomId/messages', authenticate, (req, res) => chatController.getChatHistory(req, res));

// Update typing status
router.post('/rooms/:roomId/typing', authenticate, (req, res) => chatController.updateTypingStatus(req, res));

// Mark messages as read
router.post('/rooms/:roomId/mark-read', authenticate, (req, res) => chatController.markMessagesAsRead(req, res));

module.exports = router;