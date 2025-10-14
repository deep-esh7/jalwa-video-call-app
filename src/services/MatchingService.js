// src/services/MatchingService.js
const logger = require('../config/logger');
const RedisService = require('./RedisService');
const CallService = require('./CallService');
const { CALL_STATUS } = require('../constants');

class MatchingService {
  constructor() {
    this.ongoingMatching = new Set();
  }

  /**
   * Find a partner for manual match request
   */
  async findPartnerForUser(requesterId, userSockets) {
    try {
      const available = await RedisService.getAvailableUsers(userSockets);
      const candidates = available.filter(
        (id) => id !== requesterId && 
        userSockets.has(id) && 
        !this.ongoingMatching.has(id)
      );

      if (candidates.length === 0) return null;

      // Return first available candidate
      return candidates[0];
    } catch (error) {
      logger.error(`Failed to find partner: ${error.message}`);
      return null;
    }
  }

  /**
   * Perform auto-matching for available users
   */
  async performAutoMatching(userSockets, io, activeRooms) {
    try {
      logger.debug('Running auto-matching...');

      const availableUsers = await RedisService.getAvailableUsers(userSockets);
      if (!availableUsers || availableUsers.length < 1) {
        logger.debug('Not enough available users for matching');
        return;
      }

      // Get active calls
      const activeCalls = await CallService.getActiveCalls();

      // Build busy set
      const busySet = new Set();
      for (const call of activeCalls) {
        const callerOnline = userSockets.has(call.callerId);
        const receiverOnline = userSockets.has(call.receiverId);

        if (callerOnline || receiverOnline) {
          if (call.callerId) busySet.add(call.callerId);
          if (call.receiverId) busySet.add(call.receiverId);
        } else {
          // Clean up stale call
          await CallService.endCall(call.id);
          logger.warn(`🧹 Auto-cleaned stale call ${call.id}`);
        }
      }

      logger.debug(`Available users: ${availableUsers.length}`);
      logger.debug(`Busy users: ${busySet.size}`);
      logger.debug(`Ongoing matching users: ${this.ongoingMatching.size}`);

      // Filter ready users
      const readyUsers = availableUsers.filter(
        (id) => userSockets.has(id) && 
        !this.ongoingMatching.has(id) && 
        !busySet.has(id)
      );

      if (readyUsers.length < 2) {
        logger.debug('No ready users after filtering busy/ongoing ones');
        return;
      }

      // Pair users
      while (readyUsers.length >= 2) {
        const user1Id = readyUsers.shift();
        const user2Id = readyUsers.shift();

        if (!user1Id || !user2Id) break;
        if (this.ongoingMatching.has(user1Id) || this.ongoingMatching.has(user2Id)) continue;

        this.ongoingMatching.add(user1Id);
        this.ongoingMatching.add(user2Id);

        const user1SocketId = userSockets.get(user1Id);
        const user2SocketId = userSockets.get(user2Id);

        if (!user1SocketId || !user2SocketId) {
          this.ongoingMatching.delete(user1Id);
          this.ongoingMatching.delete(user2Id);
          continue;
        }

        // Double-check no active calls
        const hasActiveCall = await CallService.areUsersInActiveCall([user1Id, user2Id]);
        if (hasActiveCall) {
          logger.warn(`Race condition: one of the users already in active call, skipping (${user1Id}, ${user2Id})`);
          this.ongoingMatching.delete(user1Id);
          this.ongoingMatching.delete(user2Id);
          continue;
        }

        // Create call and setup room
        const call = await CallService.createCall(user1Id, user2Id);
        const roomId = `room_${call.id}`;
        const user1Socket = io.sockets.sockets.get(user1SocketId);
        const user2Socket = io.sockets.sockets.get(user2SocketId);

        if (user1Socket && user2Socket) {
          user1Socket.join(roomId);
          user2Socket.join(roomId);
          
          activeRooms.set(roomId, {
            participants: [user1Id, user2Id],
            callId: call.id,
            startTime: new Date(),
          });

          io.to(roomId).emit('call-ready', {
            roomId,
            callId: call.id,
            isInitiator: user1Id === call.callerId,
            participants: [
              { userId: user1Id, socketId: user1SocketId },
              { userId: user2Id, socketId: user2SocketId },
            ],
          });

          logger.info(`Auto-match success: ${user1Id} <-> ${user2Id}`);
        } else {
          logger.warn(`Sockets not found for matched users, cleaning up call ${call.id}`);
          await CallService.endCall(call.id);
        }

        this.ongoingMatching.delete(user1Id);
        this.ongoingMatching.delete(user2Id);
      }
    } catch (error) {
      logger.error(`Auto-matching failed: ${error.message}`);
    }
  }

  /**
   * Add user to ongoing matching
   */
  addToOngoingMatching(userId) {
    this.ongoingMatching.add(userId);
  }

  /**
   * Remove user from ongoing matching
   */
  removeFromOngoingMatching(userId) {
    this.ongoingMatching.delete(userId);
  }

  /**
   * Check if user is in ongoing matching
   */
  isInOngoingMatching(userId) {
    return this.ongoingMatching.has(userId);
  }

  /**
   * Get ongoing matching count
   */
  getOngoingMatchingCount() {
    return this.ongoingMatching.size;
  }
}

module.exports = new MatchingService();

