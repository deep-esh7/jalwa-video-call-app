// src/sockets/connectionHandler.js
const logger = require('../config/logger');
const { RedisService, CallService } = require('../services');
const { SOCKET_EVENTS } = require('../constants');
const { environment } = require('../config');

class ConnectionHandler {
  constructor(io, socketConnections, userSockets) {
    this.io = io;
    this.socketConnections = socketConnections;
    this.userSockets = userSockets;
  }

  /**
   * Handle user availability (join matching pool)
   */
  async handleUserAvailable(socket, { userId }) {
    try {
      if (!userId) {
        socket.emit(SOCKET_EVENTS.ERROR, { message: 'User ID required' });
        return;
      }

      this.socketConnections.set(socket.id, { userId, socketRef: socket });
      this.userSockets.set(userId, socket.id);
      await RedisService.setUserAvailable(userId);

      socket.emit(SOCKET_EVENTS.JOINED, {
        userId,
        socketId: socket.id,
        iceServers: environment.iceServers,
      });

      logger.info(`User ${userId} joined with socket ${socket.id}`);

      // Cleanup stale calls
      await CallService.cleanupStaleCalls(this.userSockets);
    } catch (error) {
      logger.error(`Join failed: ${error.message}`);
      socket.emit(SOCKET_EVENTS.ERROR, { message: 'Failed to join' });
    }
  }

  /**
   * Handle user unavailability
   */
  async handleUserUnavailable(socket, { userId }) {
    try {
      if (!userId) {
        socket.emit(SOCKET_EVENTS.ERROR, { message: 'User ID required' });
        return;
      }

      await RedisService.setUserOffline(userId);
      logger.info(`🚫 User ${userId} marked unavailable via client`);
      
      socket.emit(SOCKET_EVENTS.USER_UNAVAILABLE_ACK, {
        userId,
        status: 'offline',
      });
    } catch (error) {
      logger.error(`user-unavailable failed for ${userId}: ${error.message}`);
    }
  }

  /**
   * Handle disconnect
   */
  async handleDisconnect(socket, activeRooms, MatchingService) {
    try {
      const conn = this.socketConnections.get(socket.id);
      if (!conn) return;

      const { userId } = conn;

      // Clean up in-memory maps
      this.socketConnections.delete(socket.id);
      this.userSockets.delete(userId);
      MatchingService.removeFromOngoingMatching(userId);

      // Mark user offline in Redis
      await RedisService.setUserOffline(userId);
      logger.info(`User ${userId} disconnected and marked offline`);

      // End active calls if user was in one
      for (const [roomId, room] of activeRooms) {
        if (room.participants.includes(userId)) {
          await CallService.endCall(room.callId);
          
          // Notify other participants
          this.io.to(roomId).emit(SOCKET_EVENTS.CALL_ENDED, {
            roomId,
            callId: room.callId,
            reason: 'User disconnected',
          });

          // Clean up room
          for (const socketId of this.io.sockets.adapter.rooms.get(roomId) || []) {
            const s = this.io.sockets.sockets.get(socketId);
            if (s) s.leave(roomId);
          }
          activeRooms.delete(roomId);
        }
      }
    } catch (error) {
      logger.error(`Disconnect handler failed: ${error.message}`);
    }
  }
}

module.exports = ConnectionHandler;

