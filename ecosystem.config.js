module.exports = {
  apps: [{
    name: 'webrtc-server',
    script: './server.js',
    instances: 1, // Single instance for socket.io clustering
    exec_mode: 'fork',
    
    // Server configuration
    env: {
      NODE_ENV: 'production',
      PORT: 4000,
      HOST: '147.93.108.247'
    },
    
    // Auto-restart configuration
    watch: false, // Set to true for development
    ignore_watch: ['node_modules', 'logs'],
    watch_options: {
      followSymlinks: false
    },
    
    // Auto-restart on crash
    autorestart: true,
    max_restarts: 10,
    min_uptime: '10s',
    
    // Memory and CPU limits
    max_memory_restart: '1G',
    
    // Logging
    log_file: './logs/combined.log',
    out_file: './logs/out.log',
    error_file: './logs/error.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    
    // Restart strategies
    restart_delay: 4000,
    
    // Health monitoring
    health_check_grace_period: 3000,
    
    // Environment variables for production
    env_production: {
      NODE_ENV: 'production',
      PORT: 4000,
      HOST: '147.93.108.247'
    }
  }],
  
  // Deployment configuration
  deploy: {
    production: {
      user: 'root',
      host: '147.93.108.247',
      ref: 'origin/main',
      repo: 'https://github.com/deep-esh7/jalwa-video-call-app.git',
      path: '/var/www/video-calling-server',
      'post-deploy': 'npm install && pm2 reload ecosystem.config.js --env production'
    }
  }
};