// src/app.js
const express = require('express');
const cors = require('cors');
const { environment, logger } = require('./config');
const routes = require('./routes');
const chatRoutes = require('./routes/chatRoutes');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');

/**
 * Create and configure Express application
 */
function createApp() {
  const app = express();

  // Middleware
  app.use(cors(environment.cors));
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use('/api', chatRoutes);

  // Request logging middleware
  app.use((req, res, next) => {
    logger.logRequest(req);
    next();
  });

  // Mount routes
  app.use('/', routes);

  // 404 handler
  app.use(notFoundHandler);

  // Global error handler
  app.use(errorHandler);

  logger.info('✅ Express app configured');
  
  return app;
}

module.exports = createApp;

