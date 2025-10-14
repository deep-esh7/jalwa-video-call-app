// src/config/firebase.js
const admin = require('firebase-admin');
const path = require('path');
const logger = require('./logger');

// Initialize Firebase Admin
try {
  const serviceAccountPath = path.join(__dirname, '../../firebase-service-account-key.json');
  const serviceAccount = require(serviceAccountPath);

  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    logger.info('✅ Firebase Admin initialized successfully');
  }
} catch (error) {
  logger.error(`❌ Firebase initialization failed: ${error.message}`);
  throw error;
}

module.exports = admin;

