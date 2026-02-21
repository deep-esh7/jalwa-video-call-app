// src/middleware/auth.js
const firebaseAdmin = require('../config/firebase');
const logger = require('../config/logger');
const UserService = require('../services/UserService');
const { HTTP_STATUS } = require('../constants');

/**
 * Verify Firebase ID token
 */
const verifyAndDecodeToken = async (idToken) => {
  try {
    if (!firebaseAdmin.isInitialized()) {
      throw new Error('Firebase is not initialized. Please check your firebase-service-account-key.json file.');
    }
    const decodedToken = await firebaseAdmin.auth.verifyIdToken(idToken);
    if (!decodedToken) {
      throw new Error('Invalid token');
    }
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
async function getUserFromToken(idToken) {
  try {
    if (!firebaseAdmin.isInitialized()) {
      throw new Error('Firebase is not initialized. Please check your firebase-service-account-key.json file.');
    }
    
    // 1. Verify the Firebase ID token
    const decodedToken = await firebaseAdmin.auth.verifyIdToken(idToken);
    if (!decodedToken) {
      throw new Error('Invalid token');
    }
    const firebaseUid = decodedToken.uid;
    
    // 2. First, try to get the user from the database
    let user = await UserService.getUserById(firebaseUid);
    
    // 3. If user exists in database, return it
    if (user) {
      logger.debug(`User found in database: ${firebaseUid}`);
      return user;
    }
    
    // 4. If not in database, we can't fetch from Firebase directly with the wrapper
    // So we'll create a basic user object from the decoded token
    logger.debug(`Creating new user from token for: ${firebaseUid}`);
    const firebaseUser = {
      uid: firebaseUid,
      displayName: decodedToken.name,
      email: decodedToken.email,
      photoURL: decodedToken.picture,
      phoneNumber: decodedToken.phone_number
    };
    
    // 5. Create a new user in the database
    const newUser = {
      id: firebaseUser.uid,
      name: firebaseUser.displayName || 'Anonymous',
      email: firebaseUser.email || null,
      photoURL: firebaseUser.photoURL || null,
      phone: firebaseUser.phoneNumber || null,
      // Add any other default fields you need
      gender: 'MALE', // Default gender
      role: 'USER',   // Default role
      age: null,
      bio: null,
    };
    
    // 6. Save to database
    user = await UserService.createUser(newUser);
    logger.info(`Created new user in database: ${firebaseUid}`);
    
    return user;
  } catch (error) {
    logger.error('Error in getUserFromToken:', error.message);
    throw error;
  }
}


module.exports = {
  authenticate,
  verifyAndDecodeToken,
  getUserFromToken,
};

