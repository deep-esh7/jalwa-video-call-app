// src/services/CallService.js
const prisma = require('../config/database');
const logger = require('../config/logger');
const { CALL_STATUS } = require('../constants');
const UserService = require('./UserService');
const RedisService = require('./RedisService');

class CallService {
  /**
   * Create a new call session
   */
  async createCall(callerId, receiverId) {
    try {
      // Ensure both users exist
      await UserService.ensureUserExists(callerId);
      await UserService.ensureUserExists(receiverId);

      const call = await prisma.call.create({
        data: {
          callerId,
          receiverId,
          status: CALL_STATUS.ACTIVE,
          startTime: new Date(),
        },
      });

      // Mark both users as busy
      await RedisService.setUserBusy(callerId);
      await RedisService.setUserBusy(receiverId);

      logger.info(`Call created ${call.id} between ${callerId} and ${receiverId}`);
      return call;
    } catch (error) {
      logger.error(`Failed to create call: ${error.message}`);
      throw error;
    }
  }

  /**
   * End a call session
   */
  async endCall(callId) {
    try {
      const call = await prisma.call.update({
        where: { id: callId },
        data: {
          status: CALL_STATUS.ENDED,
          endTime: new Date(),
        },
      });

      // Mark users available only after call status is updated
      await RedisService.setUserAvailable(call.callerId);
      await RedisService.setUserAvailable(call.receiverId);

      logger.info(`Call ended ${callId}`);
      return call;
    } catch (error) {
      logger.error(`Failed to end call: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get active call by ID
   */
  async getActiveCall(callId) {
    try {
      const call = await prisma.call.findUnique({
        where: { id: callId },
      });
      return call;
    } catch (error) {
      logger.error(`Failed to get active call: ${error.message}`);
      throw error;
    }
  }

  /**
   * Find active call for user
   */
  async findActiveCallForUser(userId) {
    try {
      const call = await prisma.call.findFirst({
        where: {
          status: CALL_STATUS.ACTIVE,
          OR: [{ callerId: userId }, { receiverId: userId }],
        },
      });
      return call;
    } catch (error) {
      logger.error(`Failed to find active call for user: ${error.message}`);
      throw error;
    }
  }

  /**
   * Check if users are in active call
   */
  async areUsersInActiveCall(userIds) {
    try {
      const call = await prisma.call.findFirst({
        where: {
          status: CALL_STATUS.ACTIVE,
          OR: userIds.map(userId => [
            { callerId: userId },
            { receiverId: userId },
          ]).flat(),
        },
      });
      return !!call;
    } catch (error) {
      logger.error(`Failed to check if users in active call: ${error.message}`);
      return false;
    }
  }

  /**
   * Get all active calls
   */
  async getActiveCalls() {
    try {
      const calls = await prisma.call.findMany({
        where: { status: CALL_STATUS.ACTIVE },
        select: {
          id: true,
          callerId: true,
          receiverId: true,
          startTime: true,
        },
      });
      return calls;
    } catch (error) {
      logger.error(`Failed to get active calls: ${error.message}`);
      throw error;
    }
  }

  /**
   * Cleanup stale calls (where both users disconnected)
   */
  async cleanupStaleCalls(userSockets) {
    try {
      const activeCalls = await this.getActiveCalls();
      let cleaned = 0;

      for (const call of activeCalls) {
        const callerConnected = userSockets.has(call.callerId);
        const receiverConnected = userSockets.has(call.receiverId);

        if (!callerConnected && !receiverConnected) {
          await prisma.call.update({
            where: { id: call.id },
            data: { status: CALL_STATUS.ENDED, endTime: new Date() },
          });
          cleaned++;
        }
      }

      if (cleaned > 0) {
        logger.warn(`🧹 Cleaned up ${cleaned} stale active calls`);
      }

      return cleaned;
    } catch (error) {
      logger.error(`Failed to cleanup stale calls: ${error.message}`);
      throw error;
    }
  }

  /**
   * End all active calls for a user
   */
  async endUserActiveCalls(userId) {
    try {
      const activeCalls = await prisma.call.findMany({
        where: {
          status: CALL_STATUS.ACTIVE,
          OR: [{ callerId: userId }, { receiverId: userId }],
        },
      });

      for (const call of activeCalls) {
        await this.endCall(call.id);
      }

      logger.info(`Ended ${activeCalls.length} active calls for user ${userId}`);
      return activeCalls.length;
    } catch (error) {
      logger.error(`Failed to end user active calls: ${error.message}`);
      throw error;
    }
  }
}

module.exports = new CallService();

