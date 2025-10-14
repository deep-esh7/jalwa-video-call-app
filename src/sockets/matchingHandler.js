// src/sockets/matchingHandler.js
const logger = require('../config/logger');
const { RedisService, CallService, MatchingService, UserService } = require('../services');
const { SOCKET_EVENTS } = require('../constants');

class MatchingHandler {
  constructor(io, socketConnections, userSockets, activeRooms) {
    this.io = io;
    this.socketConnections = socketConnections;
    this.userSockets = userSockets;
    this.activeRooms = activeRooms;
  }

  /**
   * Toggle auto-matching preference
   */
  async handleToggleMatching(socket, { userId, enabled }) {
    try {
      logger.info(`Request to toggle matching for user ${userId}: ${enabled}`);
      
      if (!userId) {
        socket.emit(SOCKET_EVENTS.ERROR, { message: 'User ID required for toggle-matching' });
        return;
      }

      await RedisService.setAutoMatching(userId, enabled);
      logger.info(`User ${userId} auto-matching set to ${enabled}`);
      
      socket.emit(SOCKET_EVENTS.TOGGLE_MATCHING_ACK, { userId, enabled });
    } catch (error) {
      logger.error(`toggle-matching failed for ${userId}: ${error.message}`);
    }
  }

  /**
   * Handle manual match request
   */
  async handleMatchRequest(socket, { userId }) {
    try {
      if (!userId) {
        socket.emit(SOCKET_EVENTS.ERROR, { message: 'User ID required for match-request' });
        return;
      }

      logger.info(`User ${userId} requested manual match`);

      // Ensure requester is available
      await RedisService.setUserAvailable(userId);
      MatchingService.removeFromOngoingMatching(userId);

      const partnerId = await MatchingService.findPartnerForUser(userId, this.userSockets);
      
      if (!partnerId) {
        socket.emit(SOCKET_EVENTS.NO_USERS_AVAILABLE, {
          message: 'No users available right now',
        });
        logger.debug(`No partner found for manual request by ${userId}`);
        return;
      }

      // Mark both as matching
      MatchingService.addToOngoingMatching(userId);
      MatchingService.addToOngoingMatching(partnerId);

      // Double-check sockets
      const partnerSocketId = this.userSockets.get(partnerId);
      const requesterSocketId = this.userSockets.get(userId);
      
      if (!partnerSocketId || !requesterSocketId) {
        MatchingService.removeFromOngoingMatching(userId);
        MatchingService.removeFromOngoingMatching(partnerId);
        socket.emit(SOCKET_EVENTS.NO_USERS_AVAILABLE, { message: 'Partner disconnected' });
        return;
      }

      // Ensure neither is in an active call
      const hasActiveCall = await CallService.areUsersInActiveCall([userId, partnerId]);
      
      if (hasActiveCall) {
        MatchingService.removeFromOngoingMatching(userId);
        MatchingService.removeFromOngoingMatching(partnerId);
        socket.emit(SOCKET_EVENTS.NO_USERS_AVAILABLE, { message: 'Partner busy' });
        return;
      }

      // Create DB call and emit call-ready to both
      const call = await CallService.createCall(userId, partnerId);
      const roomId = `room_${call.id}`;
      const requesterSocket = this.io.sockets.sockets.get(requesterSocketId);
      const partnerSocket = this.io.sockets.sockets.get(partnerSocketId);

      if (requesterSocket && partnerSocket) {
        requesterSocket.join(roomId);
        partnerSocket.join(roomId);
        
        this.activeRooms.set(roomId, {
          participants: [userId, partnerId],
          callId: call.id,
          startTime: new Date(),
        });

        this.io.to(roomId).emit(SOCKET_EVENTS.CALL_READY, {
          roomId,
          callId: call.id,
          isInitiator: userId === call.callerId,
          participants: [
            { userId, socketId: requesterSocketId },
            { userId: partnerId, socketId: partnerSocketId },
          ],
        });

        logger.info(`Manual-match success: ${userId} <-> ${partnerId}`);
      } else {
        logger.warn(`Manual-match sockets missing, cleaning up call ${call.id}`);
        await CallService.endCall(call.id);
      }

      MatchingService.removeFromOngoingMatching(userId);
      MatchingService.removeFromOngoingMatching(partnerId);
    } catch (error) {
      logger.error(`match-request failed: ${error.message}`);
      socket.emit(SOCKET_EVENTS.NO_USERS_AVAILABLE, {
        message: 'Server error during matching',
      });
    }
  }

  /**
   * Handle match accepted
   */
  async handleMatchAccepted(socket, { roomId, callId, fromUserId, toUserId }) {
    try {
      logger.info(`match-accepted from ${fromUserId} for call ${callId}`);
      
      if (roomId) {
        socket.to(roomId).emit(SOCKET_EVENTS.MATCH_ACCEPTED, {
          roomId,
          callId,
          fromUserId,
          toUserId,
        });
      } else if (callId) {
        // Find roomId by activeRooms mapping
        for (const [rId, room] of this.activeRooms) {
          if (room.callId === callId) {
            this.io.to(rId).emit(SOCKET_EVENTS.MATCH_ACCEPTED, {
              roomId: rId,
              callId,
              fromUserId,
              toUserId,
            });
            break;
          }
        }
      }
    } catch (error) {
      logger.error(`match-accepted handler error: ${error.message}`);
    }
  }

  /**
   * Handle match declined
   */
  async handleMatchDeclined(socket, { roomId, callId, fromUserId }) {
    try {
      logger.info(`match-declined from ${fromUserId} for call ${callId || roomId}`);
      
      if (callId) {
        const call = await CallService.getActiveCall(callId);
        if (call) {
          await CallService.endCall(callId);
          logger.info(`Call ${callId} ended due to decline by ${fromUserId}`);
        }
      }

      if (roomId && this.activeRooms.has(roomId)) {
        const room = this.activeRooms.get(roomId);
        
        // Notify others in room
        this.io.to(roomId).emit(SOCKET_EVENTS.CALL_ENDED, {
          roomId,
          callId,
          reason: 'Match declined',
        });

        // Clean up room
        for (const socketId of this.io.sockets.adapter.rooms.get(roomId) || []) {
          const s = this.io.sockets.sockets.get(socketId);
          if (s) s.leave(roomId);
        }
        this.activeRooms.delete(roomId);
      }
    } catch (error) {
      logger.error(`match-declined handler failed: ${error.message}`);
    }
  }

  /**
   * Get available users count
   */
  async handleGetAvailableCount(socket) {
    try {
      logger.info(`[get-available-count] Request from socket ${socket.id}`);

      const availableUsers = await RedisService.getAvailableUsers(this.userSockets);
      const count = availableUsers.length;

      let users = [];
      if (count > 0) {
        users = await UserService.getUsersByIds(availableUsers);
      }

      socket.emit(SOCKET_EVENTS.AVAILABLE_USERS, { count, users });
      logger.debug(`[get-available-count] Returned ${count} users`);
    } catch (error) {
      logger.error(`❌ get-available-count failed: ${error.message}`);
      socket.emit(SOCKET_EVENTS.ERROR, { message: 'Failed to fetch available users' });
    }
  }

  /**
   * Request next user (for skip functionality)
   */
  async handleRequestNextUser(socket, { userId }) {
    try {
      logger.info(`User ${userId} requested next match`);
      MatchingService.removeFromOngoingMatching(userId);
      await RedisService.setUserAvailable(userId);
      
      // Trigger auto-matching after a delay
      setTimeout(() => {
        MatchingService.performAutoMatching(
          this.userSockets,
          this.io,
          this.activeRooms
        );
      }, 500);
    } catch (error) {
      logger.error(`request-next-user failed: ${error.message}`);
    }
  }
}

module.exports = MatchingHandler;

