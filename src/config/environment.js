// src/config/environment.js
require('dotenv').config({ path: `.env.${process.env.NODE_ENV || 'local'}` });

const config = {
  env: process.env.NODE_ENV || 'local',
  port: process.env.PORT || 4000,
  host: process.env.HOST || '127.0.0.1',
  databaseUrl: process.env.DATABASE_URL,
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  
  // R2 Upload Worker
  r2WorkerUrl: process.env.R2_WORKER_URL || 'https://r2-uploader.jalwa-app.workers.dev',
  
  // Stripe Payment
  stripeSecretKey: process.env.STRIPE_SECRET_KEY,
  stripePublishableKey: process.env.STRIPE_PUBLISHABLE_KEY,
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
  
  // ICE Servers for WebRTC
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    {
      urls: 'turn:relay.metered.ca:443',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
  ],
  
  // CORS settings
  cors: {
    origin: ['https://jalwa-online-video-chat.web.app', '*'],
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true
  },
};

module.exports = config;

