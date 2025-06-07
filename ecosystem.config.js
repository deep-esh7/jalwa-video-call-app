module.exports = {
  apps: [{
    name: 'jalwa-firebase-server',
    script: './server.js',
    instances: 1,
    exec_mode: 'fork',
        
    // Server configuration with Firebase
    env: {
      NODE_ENV: 'production',
      PORT: 4000,
      HOST: '147.93.108.247',
      FIREBASE_DATABASE_URL: 'https://jalwa-online-video-chat-default-rtdb.asia-southeast1.firebasedatabase.app/',
      GOOGLE_APPLICATION_CREDENTIALS: './firebase-service-account-key.json'
    },
        
    // Production environment
    env_production: {
      NODE_ENV: 'production',
      PORT: 4000,
      HOST: '147.93.108.247',
      FIREBASE_DATABASE_URL: 'https://jalwa-online-video-chat-default-rtdb.asia-southeast1.firebasedatabase.app/',
      GOOGLE_APPLICATION_CREDENTIALS: './firebase-service-account-key.json'
    },
        
    // Auto-restart configuration
    watch: false,
    ignore_watch: [
      'node_modules', 
      'logs', 
      '*.log',
      'firebase-service-account-key.json',
      '.env'
    ],
        
    // Auto-restart on crash
    autorestart: true,
    max_restarts: 15,
    min_uptime: '5s',
    restart_delay: 2000,
        
    // Memory limit (increased for Firebase operations)
    max_memory_restart: '2000M',
        
    // Logging
    log_file: './logs/jalwa-firebase.log',
    out_file: './logs/jalwa-firebase-out.log',
    error_file: './logs/jalwa-firebase-error.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
        
    // Health monitoring
    kill_timeout: 5000,
    listen_timeout: 3000,
        
    // Process management
    source_map_support: false,
        
    // Process title
    name: 'jalwa-firebase-server'
  }],
    
  // Deployment configuration
  deploy: {
    production: {
      user: 'root',
      host: '147.93.108.247',
      ref: 'origin/main',
      repo: 'https://github.com/deep-esh7/jalwa-video-call-app.git',
      path: '/var/www/video-calling-server',
      'pre-deploy': 'echo "🔥 Preparing Firebase deployment..."',
      'post-deploy': 'npm ci --production && pm2 reload ecosystem.config.js --env production && pm2 save',
      'post-setup': 'echo "📋 Remember to add firebase-service-account-key.json before starting!"'
    }
  }
};