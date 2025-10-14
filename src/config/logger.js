// src/config/logger.js
const winston = require('winston');
const path = require('path');
const fs = require('fs');

const ENV = process.env.NODE_ENV || 'local';

// Create logs directory if it doesn't exist
const logDir = path.join(__dirname, '../../logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir);
}

// Define log format
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.printf(
    ({ level, message, timestamp }) => `${timestamp} [${level.toUpperCase()}] ${message}`
  )
);

// Create logger instance
const logger = winston.createLogger({
  level: ENV === 'production' ? 'info' : 'debug',
  format: logFormat,
  transports: [
    // Console transport
    new winston.transports.Console({
      level: ENV === 'production' ? 'info' : 'debug',
      format: winston.format.combine(
        winston.format.colorize(),
        logFormat
      ),
    }),
    // Error log file
    new winston.transports.File({
      filename: path.join(logDir, 'error.log'),
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
    // Combined log file
    new winston.transports.File({
      filename: path.join(logDir, 'combined.log'),
      level: 'info',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
  ],
});

// Add custom methods
logger.logRequest = (req) => {
  logger.info(`${req.method} ${req.originalUrl} - ${req.ip}`);
};

logger.logError = (error, context = '') => {
  logger.error(`${context ? `[${context}] ` : ''}${error.message}`, {
    stack: error.stack,
  });
};

module.exports = logger;

