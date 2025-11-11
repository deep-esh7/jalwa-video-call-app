// src/sockets/chatHandler.js
const { SOCKET_EVENTS } = require('../constants');
const chatService = require('../services/chatService');
const logger = require('../config/logger');
const redis = require('../config/redis');

// Helper function to generate a unique message ID
const generateMessageId = (message) => {
  return `msg:${message.chatId || 'global'}:${message.senderId || 'anon'}:${message.timestamp || Date.now()}`;
};

class ChatHandler {
  constructor(io, socket, userSockets) {
    this.io = io;
    this.socket = socket;
    this.userSockets = userSockets;
    
    // Handle anonymous users
    if (!socket.user) {
      socket.user = {
        id: `anon-${Math.random().toString(36).substr(2, 9)}`,
        name: 'Anonymous User',
        isAnonymous: true
      };
    }
    
    this.userId = socket.user.id;
    this.currentRoom = null;
    
    console.log('🔌 New ChatHandler created', { 
      socketId: socket.id,
      userId: this.userId,
      isAnonymous: socket.user.isAnonymous || false,
      connected: socket.connected 
    });
    
    // Bind event handlers
    this.setupEventHandlers();
    
    // Log all incoming events for debugging
    const originalEmit = socket.emit;
    socket.emit = (event, ...args) => {
      console.log(`📤 [${socket.id}] Emitting event: ${event}`, args[0] || {});
      return originalEmit.apply(socket, [event, ...args]);
    };
  }

  setupEventHandlers() {
    console.log('🔔 Setting up event handlers for socket:', this.socket.id);
    
    this.socket.on(SOCKET_EVENTS.FE_JOIN_CHAT, (roomId) => {
      console.log(`🚪 User ${this.userId} joining room:`, roomId);
      this.joinRoom(roomId);
    });
    
    // Leave room
    this.socket.on('disconnect', this.leaveRoom.bind(this));
    
    // Send message
    this.socket.on(SOCKET_EVENTS.FE_SEND_MESSAGE, (data) => {
      console.log('📩 Received FE_SEND_MESSAGE event:', data);
      this.sendMessage(data);
    });
    
    // Typing status
    this.socket.on(SOCKET_EVENTS.FE_TYPING, () => this.handleTyping(true));
    this.socket.on(SOCKET_EVENTS.FE_STOP_TYPING, () => this.handleTyping(false));
    
    // WebRTC events - just forward them
    this.socket.on(SOCKET_EVENTS.BE_OFFER, (data) => this.forwardToRoom(SOCKET_EVENTS.BE_OFFER, data));
    this.socket.on(SOCKET_EVENTS.BE_ANSWER, (data) => this.forwardToRoom(SOCKET_EVENTS.BE_ANSWER, data));
    this.socket.on(SOCKET_EVENTS.BE_ICE_CANDIDATE, (data) => this.forwardToRoom(SOCKET_EVENTS.BE_ICE_CANDIDATE, data));
  }

  async joinRoom(roomId) {
    if (!roomId) {
      logger.warn('Attempted to join room with undefined ID');
      return this.socket.emit(SOCKET_EVENTS.BE_ERROR, {
        success: false,
        message: 'Room ID is required',
        code: 'MISSING_ROOM_ID'
      });
    }
    
    // Ensure roomId is a string
    roomId = String(roomId).trim();
    if (!roomId) {
      return this.socket.emit(SOCKET_EVENTS.BE_ERROR, {
        success: false,
        message: 'Invalid room ID',
        code: 'INVALID_ROOM_ID'
      });
    }

    console.log('🔍 joinRoom called with:', { roomId, userId: this.userId });
    
    // Don't rejoin the same room
    if (this.currentRoom === roomId) {
      logger.debug(`User ${this.userId} is already in room ${roomId}`);
      return;
    }

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
        chatService.getRoomInfo(roomId, this.userId).catch(error => {
          logger.error('Error getting room info:', error);
          return null;
        }),
        chatService.getChatHistory(roomId, this.userId, { limit: 50 }).catch(error => {
          logger.error('Error getting chat history:', error);
          return [];
        })
      ]);

      if (!roomInfo) {
        throw new Error('Failed to get room information');
      }

      // Send join confirmation with room data
      this.socket.emit(SOCKET_EVENTS.BE_JOINED_CHAT, {
        success: true,
        roomId,
        roomInfo,
        messages: messages || [],
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
        message: error.message || 'Failed to join chat room',
        ...(process.env.NODE_ENV === 'development' && { error: error.toString() })
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

  async sendMessage(incomingMessage) {
    // Generate a unique ID for this message
    const messageId = generateMessageId(incomingMessage);
    const messageKey = `message:${messageId}`;
    
    try {
      // Check if we've already processed this message using Redis
      const isDuplicate = await redis.get(messageKey);
      if (isDuplicate) {
        logger.debug('Skipping duplicate message (Redis):', messageId);
        return;
      }
      
      // Mark this message as processed with a 5-minute TTL
      await redis.setex(messageKey, 300, '1');
      
      // Also track in-memory for fast lookups during the same connection
      if (!this.processedMessages) this.processedMessages = new Set();
      if (this.processedMessages.has(messageId)) {
        logger.debug('Skipping duplicate message (in-memory):', messageId);
        return;
      }
      this.processedMessages.add(messageId);

      logger.debug('=== MESSAGE DEBUG START ===');
      logger.debug('Current room:', this.currentRoom);
      logger.debug('Message data:', incomingMessage);
      
      // Log the raw incoming message
      console.log('📥 Raw message received:', JSON.stringify(incomingMessage, null, 2));
      
      // Ensure incomingMessage is an object
      if (typeof incomingMessage !== 'object' || incomingMessage === null) {
        throw new Error('Invalid message format. Expected an object.');
      }

      // Extract data with support for both frontend and backend formats
      const { 
        content, 
        type = 'text', 
        metadata = {},
        chatId,        // Frontend format
        senderId = this.userId, // Default to current user if not provided
        timestamp,     // Frontend format
        status         // Frontend status
      } = incomingMessage;
      
      // Log the sender ID and current user ID for debugging
      logger.debug(`Message from sender: ${senderId}, Current user: ${this.userId}`);
      
      // For anonymous users, always use their assigned anonymous ID
      if (this.socket.user?.isAnonymous) {
        logger.debug(`Anonymous user ${this.userId} sending message`);
        // Override any provided senderId with the actual anonymous ID
        incomingMessage.senderId = this.userId;
      } 
      // For authenticated users, verify the sender ID matches the current user
      else if (senderId !== this.userId) {
        logger.warn(`User ${this.userId} attempted to send message as ${senderId}`);
        throw new Error('Invalid sender ID');
      }

      // Determine the room ID (support both frontend's chatId and backend's currentRoom)
      const roomId = chatId || this.currentRoom;
      
      if (!roomId) {
        throw new Error('No room/chat ID provided');
      }

      console.log('💬 Processing message:', { 
        roomId,
        content: typeof content === 'string' ? content.substring(0, 50) + (content.length > 50 ? '...' : '') : content,
        type,
        senderId: senderId || this.userId,
        timestamp: timestamp || new Date().toISOString()
      });

      // If not in a room but have chatId, join the room first
      if (!this.currentRoom && chatId) {
        console.log(`🔄 Auto-joining room: ${chatId}`);
        try {
          await this.joinRoom(chatId);
          // If we just joined the room, wait a small amount of time for the join to complete
          await new Promise(resolve => setTimeout(resolve, 50));
        } catch (error) {
          logger.error('Error auto-joining room:', error);
          throw new Error(`Failed to join room: ${error.message}`);
        }
      }
      // Ensure we're in a room
      if (!this.currentRoom) {
        throw new Error('Not in a room and could not join automatically');
      }

    if (!content) {
      const errorMsg = 'Message content is required';
      logger.error(errorMsg);
      this.socket.emit(SOCKET_EVENTS.BE_ERROR, { 
        success: false, 
        message: errorMsg 
      });
      return;
    }

      // Prepare message data for database
      const messageData = {
        roomId: this.currentRoom,
        userId: senderId || this.userId,
        content,
        type,
        metadata: {
          ...metadata,
          frontendStatus: status, // Preserve frontend status if any
          timestamp: timestamp || new Date().toISOString()
        }
      };

      console.log('💾 Saving message to database:', messageData);
      
      // Save message to database
      const message = await chatService.sendMessage(
        messageData.roomId,
        messageData.userId,
        messageData.content,
        messageData.type,
        messageData.metadata
      );

      console.log('✅ Message saved to database:', message);

      // Log server-side message handling
      logger.info(`Message delivered to room ${this.currentRoom} from user ${this.userId}`);

      // Prepare response with frontend-compatible format
      const response = {
        success: true,
        chatId: this.currentRoom,
        messageId: message._id?.toString() || message.id,
        content: message.content,
        senderId: message.userId?.toString() || this.userId,
        timestamp: message.createdAt?.toISOString() || new Date().toISOString(),
        status: 'delivered',
        type: message.type || 'text',
        metadata: message.metadata || {}
      };

      console.log('📤 Sending confirmation:', response);
      
      // Ensure we have valid event names
      const newMessageEvent = SOCKET_EVENTS.BE_NEW_MESSAGE || 'be:new-message';
      const messageSentEvent = SOCKET_EVENTS.BE_MESSAGE_SENT || 'be:message-sent';
      
      // Log before sending
      logger.debug(`📡 Broadcasting message to room ${this.currentRoom}...`);
      
      // 1. Send confirmation to sender that their message was sent successfully
      this.socket.emit(messageSentEvent, response);
      
      // 2. Broadcast to all other participants in the room (except sender)
      this.socket.to(this.currentRoom).emit(newMessageEvent, response);
      
      // 3. Log after broadcasting
      logger.debug(`✅ Message broadcast to room ${this.currentRoom} complete`);
      
      // Debug: Log all rooms and sockets
      const roomSockets = await this.io.in(this.currentRoom).fetchSockets();
      logger.debug(`📊 Room ${this.currentRoom} has ${roomSockets.length} connected sockets`);
      
      logger.debug('=== MESSAGE DEBUG END (Success) ===\n');
    } catch (error) {
      const errorDetails = {
        error: error.message,
        stack: error.stack,
        userId: this.userId,
        room: this.currentRoom,
        incomingMessage: incomingMessage ? {
          type: incomingMessage.type,
          hasContent: !!incomingMessage.content,
          contentLength: incomingMessage.content ? incomingMessage.content.length : 0
        } : 'No incoming message'
      };
      
      logger.error('Error sending message:', errorDetails);
      
      this.socket.emit(SOCKET_EVENTS.BE_ERROR, {
        success: false,
        message: error.message || 'Failed to send message',
        code: error.code,
        details: process.env.NODE_ENV === 'development' ? errorDetails : undefined
      });
      
      logger.debug('=== MESSAGE DEBUG END (Error) ===\n');
    }
  }

  async handleTyping(isTyping) {
    if (!this.currentRoom) return;
    
    try {
      await chatService.updateTypingStatus(this.currentRoom, this.userId, isTyping);
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
      const targetSocket = this.userSockets[data.targetUserId] || this.userSockets.get(data.targetUserId);
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