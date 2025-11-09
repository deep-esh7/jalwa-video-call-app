const chatService = require('../services/chatService');
const logger = require('../config/logger');
const { validationResult } = require('express-validator');

class ChatController {
  // Create a new chat room
  async createRoom(req, res) {
    try {
      const { name, isGroup = false, participantIds = [] } = req.body;
      const room = await chatService.createRoom(
        { name, isGroup },
        participantIds,
        req.user.id // From auth middleware
      );
      res.status(201).json({ success: true, data: room });
    } catch (error) {
      logger.error('Error creating chat room:', error);
      res.status(500).json({ success: false, message: error.message || 'Failed to create chat room' });
    }
  }

  // Send a message
  async sendMessage(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

      const { roomId } = req.params;
      const { content, type = 'text', metadata } = req.body;

      const message = await chatService.sendMessage(roomId, req.user.id, content, type, metadata);

      res.status(201).json({ success: true, data: message });
    } catch (error) {
      logger.error('Error sending message:', error);
      res.status(500).json({ success: false, message: error.message || 'Failed to send message' });
    }
  }

  // Get room info
  async getRoomInfo(req, res) {
    try {
      const { roomId } = req.params;
      const room = await chatService.getRoomInfo(roomId, req.user.id);

      res.json({ success: true, data: room });
    } catch (error) {
      logger.error('Error getting room info:', error);
      res.status(500).json({ success: false, message: error.message || 'Failed to get room info' });
    }
  }

  // Get chat history
  async getChatHistory(req, res) {
    try {
      const { roomId } = req.params;
      const { skip = 0, limit = 50 } = req.query;

      const messages = await chatService.getChatHistory(roomId, req.user.id, {
        skip: parseInt(skip),
        limit: parseInt(limit),
      });

      res.json({ success: true, data: messages });
    } catch (error) {
      logger.error('Error getting chat history:', error);
      res.status(500).json({ success: false, message: error.message || 'Failed to get chat history' });
    }
  }

  // Update typing status
  async updateTypingStatus(req, res) {
    try {
      const { roomId } = req.params;
      const { isTyping } = req.body;

      await chatService.updateTypingStatus(roomId, req.user.id, isTyping);

      res.json({ success: true, message: 'Typing status updated' });
    } catch (error) {
      logger.error('Error updating typing status:', error);
      res.status(500).json({ success: false, message: 'Failed to update typing status' });
    }
  }

  // Mark messages as read
  async markMessagesAsRead(req, res) {
    try {
      const { roomId } = req.params;
      const { messageIds } = req.body;

      await chatService.markMessagesAsRead(roomId, req.user.id, messageIds);

      res.json({ success: true, message: 'Messages marked as read' });
    } catch (error) {
      logger.error('Error marking messages as read:', error);
      res.status(500).json({ success: false, message: 'Failed to mark messages as read' });
    }
  }
}

// Export an instance of the controller
module.exports = new ChatController();
