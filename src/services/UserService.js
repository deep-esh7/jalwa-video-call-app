// src/services/UserService.js
const prisma = require('../config/database');
const logger = require('../config/logger');
const { USER_ROLES, GENDER } = require('../constants');

class UserService {
  /**
   * Ensure user exists in database, create if not
   */
  async ensureUserExists(userId, userData = {}) {
    try {
      let user = await prisma.user.findUnique({ where: { id: userId } });

      if (!user) {
        user = await prisma.user.create({
          data: {
            id: userId,
            name: userData.name || `User ${userId}`,
            email: userData.email || null,
            photoURL: userData.photoURL || null,
            phone: userData.phone || null,
            gender: userData.gender || GENDER.MALE,
            role: userData.role || USER_ROLES.USER,
          },
        });
        logger.info(`Created new user: ${userId}`);
      }

      return user;
    } catch (error) {
      logger.error(`Failed to ensure user exists: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get user by ID
   */
  async getUserById(userId) {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          name: true,
          email: true,
          photoURL: true,
          gender: true,
          role: true,
          phone: true,
          createdAt: true,
          updatedAt: true,
          age: true,
          bio: true,
        },
      });

      return user;
    } catch (error) {
      logger.error(`Failed to get user by ID: ${error.message}`);
      throw error;
    }
  }
  

   async createUser(userData) {
    try {
      return await prisma.user.create({
        data: {
          id: userData.id,
          name: userData.name,
          email: userData.email,
          photoURL: userData.photoURL,
          phone: userData.phone,
          gender: userData.gender,
          role: userData.role || 'USER',
          age: userData.age || null,
          bio: userData.bio || null,
        },
      });
    } catch (error) {
      logger.error(`Failed to create user: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get all users
   */
  async getAllUsers() {
    try {
      const users = await prisma.user.findMany({
        select: {
          id: true,
          name: true,
          email: true,
          photoURL: true,
          gender: true,
          role: true,
          createdAt: true,
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

      return users;
    } catch (error) {
      logger.error(`Failed to get all users: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get multiple users by IDs
   */
  async getUsersByIds(userIds) {
    try {
      const users = await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: {
          id: true,
          name: true,
          gender: true,
          role: true,
          photoURL: true,
          createdAt: true,
        },
      });

      return users;
    } catch (error) {
      logger.error(`Failed to get users by IDs: ${error.message}`);
      throw error;
    }
  }

  /**
   * Update user profile
   */
  async updateUser(userId, updates) {
    try {
      const user = await prisma.user.update({
        where: { id: userId },
        data: {
          ...updates,
          updatedAt: new Date(),
        },
      });

      logger.info(`Updated user profile: ${userId}`);
      return user;
    } catch (error) {
      logger.error(`Failed to update user: ${error.message}`);
      throw error;
    }
  }

  /**
   * Delete all users (admin only - for development)
   */
  async deleteAllUsers() {
    try {
      await prisma.call.deleteMany({});
      await prisma.user.deleteMany({});
      logger.warn('⚠️ All users and calls deleted from database');
      return { message: 'All users deleted successfully' };
    } catch (error) {
      logger.error(`Failed to delete users: ${error.message}`);
      throw error;
    }
  }

  /**
   * Create or update user from Firebase token
   * Note: This only creates/updates the user in DB, NOT marking them online
   * User will be marked online when they connect via socket
   */
  async upsertUserFromToken(decodedToken) {
    try {
      // Firebase token fields mapping:
      // uid/sub/user_id: user identifier
      // name: display name (from Google auth)
      // picture: profile photo URL
      // email: user email
      // phone_number: phone number
      const userId = decodedToken.uid || decodedToken.sub || decodedToken.user_id;
      const userName = decodedToken.name || decodedToken.displayName || 'Anonymous';
      const userEmail = decodedToken.email || null;
      const userPhoto = decodedToken.picture || decodedToken.photoURL || null;
      const userPhone = decodedToken.phone_number || null;

      logger.info(`Upserting user with ID: ${userId}, name: ${userName}, email: ${userEmail}`);

      const user = await prisma.user.upsert({
        where: { id: userId },
        update: {
          name: userName,
          email: userEmail,
          photoURL: userPhoto,
          phone: userPhone,
          updatedAt: new Date(),
        },
        create: {
          id: userId,
          name: userName,
          email: userEmail,
          photoURL: userPhoto,
          phone: userPhone,
          gender: 'MALE',
          role: USER_ROLES.USER,
        },
      });

      logger.info(`✅ User ${user.id} upserted successfully via Firebase token`);
      return user;
    } catch (error) {
      logger.error(`❌ Failed to upsert user from token: ${error.message}`, {
        stack: error.stack,
        tokenFields: Object.keys(decodedToken),
      });
      throw error;
    }
  }

  /**
   * Get available users with their full details
   * This fetches user data from DB for the given user IDs
   */
  async getAvailableUsersWithDetails(userIds) {
    try {
      if (!userIds || userIds.length === 0) {
        return [];
      }

      const users = await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: {
          id: true,
          name: true,
          photoURL: true,
          gender: true,
          role: true,
        },
      });

      return users;
    } catch (error) {
      logger.error(`Failed to get available users with details: ${error.message}`);
      throw error;
    }
  }
}

module.exports = new UserService();
