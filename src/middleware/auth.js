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
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    logger.debug('Token verified successfully:', {
      uid: decodedToken.uid,
      email: decodedToken.email,
      name: decodedToken.name,
    });
    return decodedToken;
  } catch (error) {
    logger.error('❌ Error verifying Firebase token:', {
      errorCode: error.code,
      errorMessage: error.message,
      stack: error.stack,
    });
    
    // Provide more specific error messages
    if (error.code === 'auth/id-token-expired') {
      throw new Error('Token has expired. Please sign in again.');
    } else if (error.code === 'auth/argument-error') {
      throw new Error('Invalid token format. Please provide a valid Firebase ID token.');
    } else if (error.code === 'auth/user-not-found') {
      throw new Error('User not found in Firebase. Please sign up first.');
    }
    
    throw new Error(`Token verification failed: ${error.message}`);
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
    logger.info('🔐 Verifying Firebase token...');
    const decodedToken = await verifyAndDecodeToken(idToken);
    
    logger.info('✅ Token verified, upserting user to database...');
    const user = await UserService.upsertUserFromToken(decodedToken);
    
    logger.info('✅ User retrieved/created successfully');
    return user;
  } catch (error) {
    logger.error('❌ Failed to get user from token:', {
      message: error.message,
      stack: error.stack,
    });
    throw error;
  }
};

module.exports = {
  authenticate,
  verifyAndDecodeToken,
  getUserFromToken,
};

