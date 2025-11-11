const mongoose = require('mongoose');
const logger = require('./logger');

// Use MONGODB_URI from environment or default to local MongoDB
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/jalwa-chat';

// Log the MongoDB URI being used (without credentials for security)
const dbName = MONGODB_URI.split('/').pop().split('?')[0];
console.log(`🔌 Connecting to MongoDB: mongodb://[HIDDEN]@${MONGODB_URI.split('@').pop() || 'localhost:27017/' + dbName}`);

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 5000, // Timeout after 5s instead of 30s
      socketTimeoutMS: 45000, // Close sockets after 45 seconds of inactivity
    });
    
    logger.info(`✅ MongoDB Connected: ${conn.connection.host}`);
    logger.info(`📊 MongoDB Database: ${conn.connection.name}`);
    
    return conn.connection;
  } catch (error) {
    logger.error(`❌ MongoDB connection error: ${error.message}`);
    logger.error('Please make sure MongoDB is running and accessible');
    process.exit(1);
  }
};

// Enable Mongoose debug mode in development
if (process.env.NODE_ENV === 'development') {
  mongoose.set('debug', true);
}

// Handle connection events
mongoose.connection.on('error', (err) => {
  logger.error(`MongoDB connection error: ${err}`);
});

mongoose.connection.on('disconnected', () => {
  logger.warn('MongoDB disconnected');
});

process.on('SIGINT', async () => {
  await mongoose.connection.close();
  logger.info('MongoDB connection closed through app termination');
  process.exit(0);
});

module.exports = { connectDB };
