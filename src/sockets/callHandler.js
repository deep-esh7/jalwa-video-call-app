// src/sockets/callHandler.js
const logger = require('../config/logger');
const { RedisService, CallService, UserService } = require('../services');
const { SOCKET_EVENTS, USER_STATUS } = require('../constants');

class CallHandler {
  constructor(io, activeRooms) {
    this.io = io;
    this.activeRooms = activeRooms;
  }

  /**
   * Broadcast available users list to all connected clients
   */
  async broadcastAvailableUsers() {
    try {
      const availableUserIds = await RedisService.getAllAvailableUserIds();
      
      if (availableUserIds.length === 0) {
        this.io.emit(SOCKET_EVENTS.BE_NO_USERS_AVAILABLE);
        return;
      }

      const users = await UserService.getAvailableUsersWithDetails(availableUserIds);
      const usersWithStatus = await Promise.all(
        users.map(async (user) => {
          const status = await RedisService.getUserStatus(user.id);
          return { ...user, status: status || USER_STATUS.ONLINE };
        })
      );

      this.io.emit(SOCKET_EVENTS.BE_AVAILABLE_USERS, {
        users: usersWithStatus,
        count: usersWithStatus.length,
      });
    } catch (error) {
      logger.error(`Failed to broadcast available users: ${error.message}`);
    }
  }

  /**
   * Handle call end (updated to use new event names)
   */
  async handleEndCall(socket, { roomId, callId, userId }) {
    try {
      logger.info(`📞 fe-end-call received: roomId=${roomId}, callId=${callId}, userId=${userId}`);

      // End DB call
      if (callId) {
        const existingCall = await CallService.getActiveCall(callId);
        if (existingCall) {
          await CallService.endCall(callId);
          logger.info(`✅ Call ${callId} marked ended by ${userId}`);
        }
      }

      // Clean up active room if exists
      if (roomId && this.activeRooms.has(roomId)) {
        const room = this.activeRooms.get(roomId);
        const participants = room.participants || [];

        // Mark both participants as available again
        for (const participantId of participants) {
          await RedisService.setUserAvailable(participantId);
          logger.info(`✅ User ${participantId} marked available`);
        }

        // Notify both users that the call ended
        this.io.to(roomId).emit(SOCKET_EVENTS.BE_CALL_ENDED, {
          roomId,
          callId,
          endedBy: userId,
        });

        // Remove users from the room
        for (const socketId of this.io.sockets.adapter.rooms.get(roomId) || []) {
          const s = this.io.sockets.sockets.get(socketId);
          if (s) s.leave(roomId);
        }
        
        this.activeRooms.delete(roomId);
        logger.info(`🧹 Room ${roomId} closed, participants freed`);

        // Broadcast updated available users list
        await this.broadcastAvailableUsers();
      } else if (userId) {
        // Fallback: free user directly if room info missing
        await RedisService.setUserAvailable(userId);
        logger.info(`Freed user ${userId} (no active room found)`);
        await this.broadcastAvailableUsers();
      }

      // Send acknowledgment
      socket.emit(SOCKET_EVENTS.BE_END_CALL_ACK, {
        callId,
        roomId,
        success: true,
      });
    } catch (error) {
      logger.error(`❌ end-call handler failed: ${error.message}`);
      socket.emit(SOCKET_EVENTS.BE_END_CALL_ACK, {
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * Force user to available state (cleanup stuck state)
   */
  async handleForceAvailable(socket, { userId }, userSockets, MatchingService) {
    try {
      if (!userId) {
        socket.emit(SOCKET_EVENTS.ERROR, { message: 'User ID required for force-available' });
        return;
      }

      // Remove from ongoing matching
      MatchingService.removeFromOngoingMatching(userId);

      // End any active calls involving this user
      await CallService.endUserActiveCalls(userId);

      // Clean from all rooms
      for (const [roomId, room] of this.activeRooms) {
        if (room.participants.includes(userId)) {
          // Notify others in room
          this.io.to(roomId).emit(SOCKET_EVENTS.CALL_ENDED, {
            roomId,
            callId: room.callId,
            reason: 'Force reset',
          });

          // Clean up room
          for (const socketId of this.io.sockets.adapter.rooms.get(roomId) || []) {
            const s = this.io.sockets.sockets.get(socketId);
            if (s) s.leave(roomId);
          }
          this.activeRooms.delete(roomId);
        }
      }

      // Reset Redis state to "available" and enable auto-matching
      await RedisService.setUserAvailable(userId);
      await RedisService.setAutoMatching(userId, true);

      // Ensure socket is registered
      const socketId = userSockets.get(userId);
      if (socketId) {
        const userSocket = this.io.sockets.sockets.get(socketId);
        if (userSocket) {
          userSocket.emit(SOCKET_EVENTS.FREED, { userId });
          logger.info(`✅ User ${userId} forcibly freed and marked available`);
        }
      }

      // Trigger rematching
      setTimeout(() => {
        MatchingService.performAutoMatching(userSockets, this.io, this.activeRooms);
      }, 500);
    } catch (error) {
      logger.error(`Force-free failed for ${userId}: ${error.message}`);
    }
  }
}

module.exports = CallHandler;

