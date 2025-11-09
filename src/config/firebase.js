// src/config/firebase.js
const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');
const logger = require('./logger');

let firebaseInitialized = false;

// Initialize Firebase Admin if service account exists
try {
  const serviceAccountPath = path.join(__dirname, '../../firebase-service-account-key.json');
  
  if (fs.existsSync(serviceAccountPath)) {
    const serviceAccount = require(serviceAccountPath);
    
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
      firebaseInitialized = true;
      logger.info('✅ Firebase Admin initialized successfully');
    }
  } else {
    logger.warn('⚠️  Firebase service account key not found. Firebase features will be disabled.');
  }
} catch (error) {
  logger.error(`❌ Firebase initialization error: ${error.message}`);
  logger.warn('⚠️  Firebase features will be disabled due to initialization error');
}

// Export a wrapper that handles cases where Firebase isn't initialized
const firebaseWrapper = {
  isInitialized: () => firebaseInitialized,
  
  // Safe wrapper for Firebase Auth
  auth: {
    verifyIdToken: async (token) => {
      if (!firebaseInitialized) {
        logger.warn('Firebase Auth called but Firebase is not initialized');
        return null; // or throw an error if you prefer
      }
      try {
        return await admin.auth().verifyIdToken(token);
      } catch (error) {
        logger.error('Firebase token verification failed:', error.message);
        return null;
      }
    }
  },
  
  // Export the admin instance if needed elsewhere
  getAdmin: () => firebaseInitialized ? admin : null
};

module.exports = firebaseWrapper;

