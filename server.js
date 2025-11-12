// server.js
const http = require('http');
const socketIo = require('socket.io');
// const mongoose = require('mongoose'); // COMMENTED: MongoDB not configured yet
const createApp = require('./src/app');
const { environment, logger } = require('./src/config');
const { initializeSocketHandlers } = require('./src/sockets');
const { MatchingService } = require('./src/services');
// const { connectDB } = require('./src/config/db'); // COMMENTED: MongoDB not configured yet

// Create Express app
const app = createApp();

// Create HTTP server
const server = http.createServer(app);

// Initialize Socket.io
const io = socketIo(server, {
  cors: environment.cors,
  allowRequest: (req, callback) => {
    // Allow all connections, but we'll handle auth in the middleware
    callback(null, true);
  }
});

// Socket.io authentication middleware
const socketAuth = require('./src/middleware/socketAuth');

// Apply authentication middleware to all connections
io.use(socketAuth);

// Initialize socket handlers and get state
const socketState = initializeSocketHandlers(io);

// Store state in app.locals for health checks
app.locals.socketConnections = socketState.socketConnections;
app.locals.activeRooms = socketState.activeRooms;
app.locals.userSockets = socketState.userSockets;
app.locals.MatchingService = MatchingService;

// Auto-matching disabled - Using manual user selection instead
// setInterval(() => {
//   MatchingService.performAutoMatching(
//     socketState.userSockets,
//     io,
//     socketState.activeRooms
//   );
// }, 5000);

// Start server
const startServer = async () => {
  try {
    // Connect to MongoDB
    // COMMENTED: MongoDB not configured yet
    // await connectDB();
    
    server.listen(environment.port, environment.host, () => {
      logger.info(`🚀 Jalwa Server running on http://${environment.host}:${environment.port} [${environment.env}]`);
      logger.info(`DB: ${environment.databaseUrl}`);
      logger.info(`Redis: ${environment.redisUrl}`);
      logger.warn('⚠️  MongoDB is not connected - Chat features may not work');
    });

    // Graceful shutdown
    const shutdown = async () => {
      logger.info('Shutdown signal received: closing HTTP server');
      
      // Close the HTTP server
      server.close(() => {
        logger.info('HTTP server closed');
        
        // Close MongoDB connection
        // COMMENTED: MongoDB not configured yet
        // mongoose.connection.close(false, () => {
        //   logger.info('MongoDB connection closed');
        //   process.exit(0);
        // });
        
        // Exit immediately since MongoDB is not connected
        process.exit(0);
      });
    };

    // Handle shutdown signals
    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
    
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

// Start the server
startServer().catch(error => {
  logger.error('Fatal error during server startup:', error);
  process.exit(1);
});

module.exports = { app, server, io };

