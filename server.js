// server.js
const http = require('http');
const socketIo = require('socket.io');
const createApp = require('./src/app');
const { environment, logger } = require('./src/config');
const { initializeSocketHandlers } = require('./src/sockets');
const { MatchingService } = require('./src/services');

// Create Express app
const app = createApp();

// Create HTTP server
const server = http.createServer(app);

// Initialize Socket.io
const io = socketIo(server, {
  cors: environment.cors,
});

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
server.listen(environment.port, environment.host, () => {
  logger.info(`🚀 Jalwa Server running on http://${environment.host}:${environment.port} [${environment.env}]`);
  logger.info(`DB: ${environment.databaseUrl}`);
  logger.info(`Redis: ${environment.redisUrl}`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });
});

process.on('SIGINT', async () => {
  logger.info('SIGINT signal received: closing HTTP server');
  server.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });
});

module.exports = { app, server, io };

