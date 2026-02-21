const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const chatController = require('../controllers/chatController');

// Create a new chat room
router.post('/rooms', (req, res) => chatController.createRoom(req, res));

// Get room info
router.get('/rooms/:roomId', (req, res) => chatController.getRoomInfo(req, res));


// Send a message
router.post('/rooms/:roomId/messages', (req, res) => chatController.sendMessage(req, res));

// Get chat history
router.get('/rooms/:roomId/messages', (req, res) => chatController.getChatHistory(req, res));

// Update typing status
router.post('/rooms/:roomId/typing', (req, res) => chatController.updateTypingStatus(req, res));

// Mark messages as read
router.post('/rooms/:roomId/mark-read', (req, res) => chatController.markMessagesAsRead(req, res));

module.exports = router;