// src/sockets/connectionHandler.js
const logger = require('../config/logger');
const { SOCKET_EVENTS, USER_STATUS } = require('../constants');
const { RedisService, UserService } = require('../services');

class ConnectionHandler {
  constructor(io, socketConnections, userSockets) {
    this.io = io;
    this.socketConnections = socketConnections;
    this.userSockets = userSockets;
  }

  /**
   * Broadcast available users list to all connected clients
   */
  async broadcastAvailableUsers() {
    try {
      // Get all available user IDs from Redis
      const availableUserIds = await RedisService.getAllAvailableUserIds();
      
      if (availableUserIds.length === 0) {
        this.io.emit(SOCKET_EVENTS.BE_NO_USERS_AVAILABLE);
        logger.debug('No users available, broadcasted empty list');
        return;
      }

      // Fetch full user details from database
      const users = await UserService.getAvailableUsersWithDetails(availableUserIds);

      // Enrich with status from Redis
      const usersWithStatus = await Promise.all(
        users.map(async (user) => {
          const status = await RedisService.getUserStatus(user.id);
          return {
            ...user,
            status: status || USER_STATUS.ONLINE,
          };
        })
      );

      // Broadcast to all connected clients
      this.io.emit(SOCKET_EVENTS.BE_AVAILABLE_USERS, {
        users: usersWithStatus,
        count: usersWithStatus.length,
      });

      logger.info(`📢 Broadcasted ${usersWithStatus.length} available users to all clients`);
    } catch (error) {
      logger.error(`Failed to broadcast available users: ${error.message}`);
    }
  }

  /**
   * Handle user marking themselves as available
   */
  async handleUserAvailable(socket, data) {
    try {
      const { userId } = data;

      if (!userId) {
        socket.emit(SOCKET_EVENTS.BE_ERROR, { message: 'User ID is required' });
        return;
      }

      // Store socket connection
      this.socketConnections.set(socket.id, userId);
      this.userSockets.set(userId, socket.id);

      // Mark user as available in Redis
      await RedisService.setUserAvailable(userId);

      // Get ICE servers for WebRTC
      const iceServers = [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
      ];

      // Send confirmation to this user
      socket.emit(SOCKET_EVENTS.BE_JOINED, {
        userId,
        socketId: socket.id,
        iceServers,
        message: 'You are now available',
      });

      logger.info(`✅ User ${userId} marked available (socket: ${socket.id})`);

      // Broadcast updated available users list to everyone
      await this.broadcastAvailableUsers();

      // Also notify everyone that a user joined
      socket.broadcast.emit(SOCKET_EVENTS.BE_USER_JOINED, {
        userId,
        message: `User ${userId} is now available`,
      });
    } catch (error) {
      logger.error(`Error in handleUserAvailable: ${error.message}`);
      socket.emit(SOCKET_EVENTS.BE_ERROR, { message: 'Failed to mark user as available' });
    }
  }

  /**
   * Handle user marking themselves as unavailable
   */
  async handleUserUnavailable(socket, data) {
    try {
      const { userId } = data;

      if (!userId) {
        return;
      }

      await this.cleanupUser(userId, socket.id);

      logger.info(`User ${userId} marked unavailable`);
    } catch (error) {
      logger.error(`Error in handleUserUnavailable: ${error.message}`);
    }
  }

  /**
   * Handle socket disconnect
   */
  async handleDisconnect(socket) {
    try {
      const userId = this.socketConnections.get(socket.id);

      if (userId) {
        await this.cleanupUser(userId, socket.id);
        logger.info(`User ${userId} disconnected (socket: ${socket.id})`);
      } else {
        logger.debug(`Socket ${socket.id} disconnected (no user associated)`);
      }
    } catch (error) {
      logger.error(`Error in handleDisconnect: ${error.message}`);
    }
  }

  /**
   * Handle get available count request
   */
  async handleGetAvailableCount(socket) {
    try {
      const count = await RedisService.getAvailableUsersCount();
      
      socket.emit(SOCKET_EVENTS.BE_AVAILABLE_USERS_COUNT, {
        count,
        message: `${count} users available`,
      });

      logger.debug(`Available users count requested: ${count}`);
    } catch (error) {
      logger.error(`Error in handleGetAvailableCount: ${error.message}`);
      socket.emit(SOCKET_EVENTS.BE_ERROR, { message: 'Failed to get available count' });
    }
  }

  /**
   * Cleanup user on disconnect
   */
  async cleanupUser(userId, socketId) {
    try {
      // Remove from Redis
      await RedisService.removeUser(userId);

      // Remove from in-memory maps
      this.socketConnections.delete(socketId);
      this.userSockets.delete(userId);

      // Broadcast updated list to everyone
      await this.broadcastAvailableUsers();

      // Notify everyone that user left
      this.io.emit(SOCKET_EVENTS.BE_USER_LEFT, {
        userId,
        message: `User ${userId} is no longer available`,
      });

      logger.info(`🧹 User ${userId} cleaned up and removed from available list`);
    } catch (error) {
      logger.error(`Failed to cleanup user ${userId}: ${error.message}`);
    }
  }
}

module.exports = ConnectionHandler;
