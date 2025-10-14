// src/services/RedisService.js
const redis = require('../config/redis');
const logger = require('../config/logger');
const { REDIS_KEYS, USER_STATUS } = require('../constants');

class RedisService {
  /**
   * Mark user as online
   */
  async setUserOnline(userId) {
    try {
      await redis.sadd(REDIS_KEYS.AVAILABLE_USERS, userId);
      await redis.set(REDIS_KEYS.USER_STATUS(userId), USER_STATUS.ONLINE);
      logger.info(`✅ User ${userId} marked online`);
    } catch (error) {
      logger.error(`Failed to set user online: ${error.message}`);
      throw error;
    }
  }

  /**
   * Mark user as available for matching
   */
  async setUserAvailable(userId) {
    try {
      const isMember = await redis.sismember(REDIS_KEYS.AVAILABLE_USERS, userId);

      if (isMember) {
        const currentStatus = await redis.get(REDIS_KEYS.USER_STATUS(userId));
        if (currentStatus !== USER_STATUS.ONLINE) {
          await redis.set(REDIS_KEYS.USER_STATUS(userId), USER_STATUS.ONLINE);
          logger.info(`User ${userId} status corrected to online`);
        } else {
          logger.debug(`User ${userId} already available, skipping duplicate entry`);
        }
        return;
      }

      await redis.sadd(REDIS_KEYS.AVAILABLE_USERS, userId);
      await redis.set(REDIS_KEYS.USER_STATUS(userId), USER_STATUS.ONLINE);
      logger.info(`✅ User ${userId} marked available`);
    } catch (error) {
      logger.error(`Failed to set user available: ${error.message}`);
      throw error;
    }
  }

  /**
   * Mark user as busy (in call)
   */
  async setUserBusy(userId) {
    try {
      const isMember = await redis.sismember(REDIS_KEYS.AVAILABLE_USERS, userId);

      if (!isMember) {
        logger.debug(`User ${userId} already busy, skipping removal`);
      } else {
        await redis.srem(REDIS_KEYS.AVAILABLE_USERS, userId);
        logger.info(`User ${userId} removed from available list`);
      }

      await redis.set(REDIS_KEYS.USER_STATUS(userId), USER_STATUS.BUSY);
      logger.info(`User ${userId} marked busy`);
    } catch (error) {
      logger.error(`Failed to set user busy: ${error.message}`);
      throw error;
    }
  }

  /**
   * Mark user as offline
   */
  async setUserOffline(userId) {
    try {
      await redis.srem(REDIS_KEYS.AVAILABLE_USERS, userId);
      await redis.set(REDIS_KEYS.USER_STATUS(userId), USER_STATUS.OFFLINE);
      logger.info(`User ${userId} marked offline`);
    } catch (error) {
      logger.error(`Failed to set user offline: ${error.message}`);
      throw error;
    }
  }

  /**
   * Check if auto-matching is enabled for user
   */
  async isAutoMatchingEnabled(userId) {
    try {
      const value = await redis.get(REDIS_KEYS.AUTO_MATCHING(userId));
      // Default is enabled unless explicitly 'false'
      return value !== 'false';
    } catch (error) {
      logger.warn(`Failed to read auto-matching flag for ${userId}: ${error.message}`);
      return true;
    }
  }

  /**
   * Set auto-matching preference for user
   */
  async setAutoMatching(userId, enabled) {
    try {
      await redis.set(REDIS_KEYS.AUTO_MATCHING(userId), enabled ? 'true' : 'false');
      logger.info(`User ${userId} auto-matching set to ${enabled}`);
    } catch (error) {
      logger.error(`Failed to set auto-matching: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get all available users (with auto-matching enabled)
   */
  async getAvailableUsers(userSockets) {
    try {
      const users = await redis.smembers(REDIS_KEYS.AVAILABLE_USERS);
      const alive = [];
      const stale = [];

      for (const id of users) {
        if (!userSockets.has(id)) {
          stale.push(id);
          continue;
        }

        const enabled = await this.isAutoMatchingEnabled(id);
        if (!enabled) {
          logger.debug(`User ${id} is available but auto-matching is disabled; filtering out.`);
          continue;
        }
        alive.push(id);
      }

      if (stale.length > 0) {
        await redis.srem(REDIS_KEYS.AVAILABLE_USERS, ...stale);
        stale.forEach((id) => logger.warn(`Removed stale user from Redis: ${id}`));
      }

      return alive;
    } catch (error) {
      logger.error(`Failed to get available users: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get user status
   */
  async getUserStatus(userId) {
    try {
      return await redis.get(REDIS_KEYS.USER_STATUS(userId));
    } catch (error) {
      logger.error(`Failed to get user status: ${error.message}`);
      return null;
    }
  }

  /**
   * Remove user from all Redis keys
   */
  async cleanupUser(userId) {
    try {
      await redis.srem(REDIS_KEYS.AVAILABLE_USERS, userId);
      await redis.del(REDIS_KEYS.USER_STATUS(userId));
      await redis.del(REDIS_KEYS.AUTO_MATCHING(userId));
      logger.info(`Cleaned up Redis keys for user ${userId}`);
    } catch (error) {
      logger.error(`Failed to cleanup user: ${error.message}`);
    }
  }
}

module.exports = new RedisService();
