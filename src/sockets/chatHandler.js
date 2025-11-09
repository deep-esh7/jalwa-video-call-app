// src/sockets/chatHandler.js
const { SOCKET_EVENTS } = require('../constants');
const chatService = require('../services/chatService');
const logger = require('../config/logger');

class ChatHandler {
  constructor(io, socket, userSockets) {
    this.io = io;
    this.socket = socket;
    this.userSockets = userSockets;
    this.userId = socket.user?.id;
    this.currentRoom = null;
    
    // Bind event handlers
    this.setupEventHandlers();
  }

  setupEventHandlers() {
    // Join chat room
    this.socket.on(SOCKET_EVENTS.FE_JOIN_CHAT, this.joinRoom.bind(this));
    
    // Leave room
    this.socket.on('disconnect', this.leaveRoom.bind(this));
    
    // Send message
    this.socket.on(SOCKET_EVENTS.FE_SEND_MESSAGE, this.sendMessage.bind(this));
    
    // Typing status
    this.socket.on(SOCKET_EVENTS.FE_TYPING, () => this.handleTyping(true));
    this.socket.on(SOCKET_EVENTS.FE_STOP_TYPING, () => this.handleTyping(false));
    
    // WebRTC events - just forward them
    this.socket.on(SOCKET_EVENTS.BE_OFFER, (data) => this.forwardToRoom(SOCKET_EVENTS.BE_OFFER, data));
    this.socket.on(SOCKET_EVENTS.BE_ANSWER, (data) => this.forwardToRoom(SOCKET_EVENTS.BE_ANSWER, data));
    this.socket.on(SOCKET_EVENTS.BE_ICE_CANDIDATE, (data) => this.forwardToRoom(SOCKET_EVENTS.BE_ICE_CANDIDATE, data));
  }

  async joinRoom(roomId) {
    try {
      // Leave previous room if any
      if (this.currentRoom) {
        this.leaveRoom();
      }

      // Verify user has access to the room
      const hasAccess = await chatService.verifyRoomAccess(roomId, this.userId);
      if (!hasAccess) {
        return this.socket.emit(SOCKET_EVENTS.BE_ERROR, { 
          success: false,
          message: 'Access denied to this chat room' 
        });
      }

      // Join the room
      this.socket.join(roomId);
      this.currentRoom = roomId;
      logger.info(`User ${this.userId} joined chat room ${roomId}`);
      
      // Get room info and history
      const [roomInfo, messages] = await Promise.all([
        chatService.getRoomInfo(roomId, this.userId),
        chatService.getChatHistory(roomId, this.userId, { limit: 50 })
      ]);

      // Send join confirmation with room data
      this.socket.emit(SOCKET_EVENTS.BE_JOINED_CHAT, {
        success: true,
        roomId,
        roomInfo,
        messages,
        message: 'Successfully joined chat room'
      });

      // Notify others in the room
      this.socket.to(roomId).emit(SOCKET_EVENTS.BE_USER_JOINED, {
        roomId,
        userId: this.userId
      });
    } catch (error) {
      logger.error('Error joining room:', error);
      this.socket.emit(SOCKET_EVENTS.BE_ERROR, {
        success: false,
        message: error.message || 'Failed to join chat room'
      });
    }
  }

  leaveRoom() {
    if (this.currentRoom) {
      this.socket.leave(this.currentRoom);
      this.socket.to(this.currentRoom).emit(SOCKET_EVENTS.BE_USER_LEFT, {
        roomId: this.currentRoom,
        userId: this.userId
      });
      logger.info(`User ${this.userId} left chat room ${this.currentRoom}`);
      this.currentRoom = null;
    }
  }

  async sendMessage({ content, type = 'text', metadata = {} }) {
    logger.debug('=== MESSAGE DEBUG START ===');
    logger.debug('Message received:', { 
      from: this.userId, 
      room: this.currentRoom, 
      content, 
      type, 
      metadata,
      socketId: this.socket.id
    });

    if (!this.currentRoom) {
      const errorMsg = 'Not in a room';
      logger.error(errorMsg);
      this.socket.emit(SOCKET_EVENTS.BE_ERROR, { 
        success: false, 
        message: errorMsg 
      });
      logger.debug('=== MESSAGE DEBUG END (Not in a room) ===\n');
      return;
    }

    if (!content) {
      const errorMsg = 'Message content is required';
      logger.error(errorMsg);
      this.socket.emit(SOCKET_EVENTS.BE_ERROR, { 
        success: false, 
        message: errorMsg 
      });
      logger.debug('=== MESSAGE DEBUG END (No content) ===\n');
      return;
    }

    try {
      logger.debug('Saving message to database...');
      
      // Save message to database
      const message = await chatService.sendMessage(
        this.currentRoom,
        this.userId,
        content,
        type,
        metadata
      );

      logger.debug('Message saved successfully:', { 
        messageId: message._id || message.id,
        timestamp: message.createdAt || new Date().toISOString()
      });

      // Broadcast to room
      logger.debug(`Broadcasting message to room ${this.currentRoom}...`);
      this.io.to(this.currentRoom).emit(SOCKET_EVENTS.BE_NEW_MESSAGE, message);
      logger.debug('Message broadcast complete');

      // Send confirmation to sender
      this.socket.emit(SOCKET_EVENTS.BE_MESSAGE_SENT, {
        success: true,
        roomId: this.currentRoom,
        messageId: message._id || message.id,
        timestamp: message.createdAt || new Date().toISOString()
      });
      
      logger.debug('=== MESSAGE DEBUG END (Success) ===\n');
    } catch (error) {
      const errorDetails = {
        error: error.message,
        stack: error.stack,
        userId: this.userId,
        room: this.currentRoom,
        contentLength: content?.length
      };
      
      logger.error('Error sending message:', errorDetails);
      this.socket.emit(SOCKET_EVENTS.BE_ERROR, {
        success: false,
        message: error.message || 'Failed to send message',
        code: error.code
      });
      
      logger.debug('=== MESSAGE DEBUG END (Error) ===\n');
    }
  }

  async handleTyping(isTyping) {
    if (!this.currentRoom) return;

    try {
      await chatService.updateTypingStatus(
        this.currentRoom, 
        this.userId, 
        isTyping
      );
      
      // Broadcast to room except sender
      this.socket.to(this.currentRoom).emit(
        isTyping ? SOCKET_EVENTS.BE_USER_TYPING : SOCKET_EVENTS.BE_USER_STOPPED_TYPING,
        {
          roomId: this.currentRoom,
          userId: this.userId
        }
      );
    } catch (error) {
      logger.error('Error updating typing status:', error);
    }
  }

  // Helper to forward WebRTC events to specific user in the room
  forwardToRoom(event, data) {
    if (!this.currentRoom) return;
    
    // Forward to specific target user if specified
    if (data.targetUserId) {
      const targetSocket = this.userSockets.get(data.targetUserId);
      if (targetSocket) {
        targetSocket.emit(event, {
          ...data,
          senderId: this.userId
        });
      }
      return;
    }

    // Otherwise broadcast to room except sender
    this.socket.to(this.currentRoom).emit(event, {
      ...data,
      senderId: this.userId
    });
  }
}

module.exports = ChatHandler;