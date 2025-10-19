// src/controllers/UserController.js
const admin = require('../config/firebase');
const logger = require('../config/logger');
const UserService = require('../services/UserService');
const RedisService = require('../services/RedisService');
const { getUserFromToken } = require('../middleware/auth');
const { HTTP_STATUS } = require('../constants');

class UserController {
  /**
   * Get current user profile (from Firebase token)
   */
  async getCurrentUser(req, res, next) {
    try {
      logger.info('Received request to /api/user/me');

      const authHeader = req.headers.authorization;
      logger.debug('Auth header:', authHeader ? 'Present' : 'Missing');

      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        logger.warn('No Bearer token provided');
        return res.status(HTTP_STATUS.UNAUTHORIZED).json({
          success: false,
          message: 'No token provided',
        });
      }

      const idToken = authHeader.split('Bearer ')[1];
      logger.debug('Extracted token');

      // Get or create user from token
      const user = await getUserFromToken(idToken);

      if (!user) {
        throw new Error('Failed to get or create user');
      }

      // NOTE: User is NOT marked online here
      // User will be marked online when they connect via socket (fe-user-available event)
      logger.info(`✅ Fetched/created user: ${user.id}`);

      return res.json({
        success: true,
        data: {
          id: user.id,
          name: user.name,
          email: user.email,
          photoURL: user.photoURL,
          phoneNumber: user.phone,
          gender: user.gender,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
        },
      });
    } catch (error) {
      logger.error('Auth error in /api/user/me:', {
        error: error.message,
        stack: error.stack,
      });

      const statusCode = error.statusCode || HTTP_STATUS.UNAUTHORIZED;
      res.status(statusCode).json({
        success: false,
        message: 'Authentication failed',
        error: process.env.NODE_ENV === 'production' ? 'Authentication error' : error.message,
      });
    }
  }

  /**
   * Get all users with their online/offline status
   */
  async getAllUsers(req, res, next) {
    try {
      logger.info('Fetching all users with status');

      // Get all users from database
      const users = await UserService.getAllUsers();

      // Enrich with online/offline status from Redis
      const usersWithStatus = await Promise.all(
        users.map(async (user) => {
          const status = await RedisService.getUserStatus(user.id);
          return {
            ...user,
            status: status || 'offline',
          };
        })
      );

      logger.info(`Returning ${usersWithStatus.length} users`);

      return res.json({
        success: true,
        data: usersWithStatus,
        count: usersWithStatus.length,
      });
    } catch (error) {
      logger.error(`Failed to fetch all users: ${error.message}`);
      next(error);
    }
  }

  /**
   * Get user by ID
   */
  async getUserById(req, res, next) {
    try {
      const { id } = req.params;

      const user = await UserService.getUserById(id);

      if (!user) {
        return res.status(HTTP_STATUS.NOT_FOUND).json({
          success: false,
          message: 'User not found',
        });
      }

      // Get current status from Redis
      const status = await RedisService.getUserStatus(id);

      return res.json({
        success: true,
        data: {
          ...user,
          status: status || 'offline',
        },
      });
    } catch (error) {
      logger.error(`Failed to fetch user profile: ${error.message}`);
      next(error);
    }
  }

  /**
   * Get user from Firebase by userId
   */
  async getUserFromFirebase(req, res, next) {
    try {
      const authHeader = req.headers.authorization;
      logger.info('Fetch user profile via token');

      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        logger.warn('No Bearer token provided for getUserFromFirebase');
        return res.status(HTTP_STATUS.UNAUTHORIZED).json({
          success: false,
          message: 'No token provided',
        });
      }

      const idToken = authHeader.split('Bearer ')[1];
      const decoded = await admin.auth().verifyIdToken(idToken);
      const uid = decoded.uid;

      // Fetch user by UID derived from verified token
      const userRecord = await admin.auth().getUser(uid);

      res.json({
        success: true,
        data: {
          uid: userRecord.uid,
          displayName: userRecord.displayName,
          photoURL: userRecord.photoURL,
          email: userRecord.email,
        },
      });
    } catch (error) {
      logger.error('Error fetching user data via token:', error);
      const statusCode = error.code === 'auth/argument-error' || error.code === 'auth/id-token-expired'
        ? HTTP_STATUS.UNAUTHORIZED
        : HTTP_STATUS.BAD_REQUEST;
      res.status(statusCode).json({
        success: false,
        message: 'Error fetching user data',
        error: error.message,
      });
    }
  }

  // Note: markUserOffline removed - users are automatically removed
  // from available list when they disconnect via socket

  /**
   * Delete all users (admin only - for development)
   */
  async deleteAllUsers(req, res, next) {
    try {
      const result = await UserService.deleteAllUsers();
      logger.warn('⚠️ All users and calls deleted from database');

      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: result.message,
      });
    } catch (error) {
      logger.error(`Failed to delete users: ${error.message}`);
      next(error);
    }
  }
}

module.exports = new UserController();
