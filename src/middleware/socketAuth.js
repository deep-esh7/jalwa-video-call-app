// src/middleware/socketAuth.js
const { verifyAndDecodeToken } = require('./auth');
const logger = require('../config/logger');

const socketAuth = async (socket, next) => {
  try {
    const token = socket.handshake.auth.token || socket.handshake.query.token;
    
    if (token) {
      // If token is provided, verify it
      const decodedToken = await verifyAndDecodeToken(token.replace('Bearer ', ''));
      
      // Attach user info to the socket
      socket.user = {
        id: decodedToken.uid || 'anonymous',
        email: decodedToken.email || 'anonymous@example.com',
        name: decodedToken.name || 'Anonymous User'
      };
      
      logger.info(`✅ Authenticated socket connection for user: ${socket.user.id}`);
    } else {
      // For testing without token, create an anonymous user
      socket.user = {
        id: `anon-${Math.random().toString(36).substr(2, 9)}`,
        email: 'anonymous@example.com',
        name: 'Anonymous User',
        isAnonymous: true
      };
      logger.warn('⚠️  No token provided, using anonymous connection');
    }
    
    next();
  } catch (error) {
    logger.error('Socket authentication error:', error.message);
    // For testing, we'll allow the connection even if token is invalid
    socket.user = {
      id: `anon-${Math.random().toString(36).substr(2, 9)}`,
      email: 'anonymous@example.com',
      name: 'Anonymous User',
      isAnonymous: true
    };
    logger.warn('⚠️  Invalid token, using anonymous connection');
    next();
  }
};

module.exports = socketAuth;
