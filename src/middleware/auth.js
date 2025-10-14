// src/middleware/auth.js
const admin = require('../config/firebase');
const logger = require('../config/logger');
const UserService = require('../services/UserService');
const { HTTP_STATUS } = require('../constants');

/**
 * Verify Firebase ID token
 */
const verifyAndDecodeToken = async (idToken) => {
  try {
    return await admin.auth().verifyIdToken(idToken);
  } catch (error) {
    logger.error('Error verifying token:', error);
    throw new Error('Invalid or expired token');
  }
};

/**
 * Middleware to verify Firebase token and attach user to request
 */
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(HTTP_STATUS.UNAUTHORIZED).json({
        success: false,
        message: 'No token provided',
      });
    }

    const idToken = authHeader.split('Bearer ')[1];
    const decodedToken = await verifyAndDecodeToken(idToken);

    // Attach decoded token to request
    req.user = decodedToken;
    next();
  } catch (error) {
    return res.status(HTTP_STATUS.UNAUTHORIZED).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * Get or create user from Firebase token
 */
const getUserFromToken = async (idToken) => {
  try {
    const decodedToken = await verifyAndDecodeToken(idToken);
    const user = await UserService.upsertUserFromToken(decodedToken);
    return user;
  } catch (error) {
    logger.error('Failed to get user from token:', error);
    throw error;
  }
};

module.exports = {
  authenticate,
  verifyAndDecodeToken,
  getUserFromToken,
};

