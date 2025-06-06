module.exports = {
  apps: [{
    name: 'jalwa-auto-connect-server',
    script: './server.js',
    instances: 1,
    exec_mode: 'fork',
    
    // Server configuration
    env: {
      NODE_ENV: 'production',
      PORT: 4000,
      HOST: '147.93.108.247'
    },
    
    // Production environment
    env_production: {
      NODE_ENV: 'production',
      PORT: 4000,
      HOST: '147.93.108.247'
    },
    
    // Auto-restart configuration
    watch: false,
    ignore_watch: ['node_modules', 'logs', '*.log'],
    
    // Auto-restart on crash
    autorestart: true,
    max_restarts: 15,
    min_uptime: '5s',
    restart_delay: 2000,
    
    // FIXED: Memory limit format (was causing PM2 warning)
    max_memory_restart: '1500M',
    
    // Logging
    log_file: './logs/jalwa-auto-connect.log',
    out_file: './logs/jalwa-out.log',
    error_file: './logs/jalwa-error.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    
    // Health monitoring
    kill_timeout: 5000,
    listen_timeout: 3000,
    
    // Process management
    source_map_support: false,
    
    // Process title
    name: 'jalwa-auto-connect-server'
  }],
  
  // Deployment configuration
  deploy: {
    production: {
      user: 'root',
      host: '147.93.108.247',
      ref: 'origin/main',
      repo: 'https://github.com/deep-esh7/jalwa-video-call-app.git',
      path: '/var/www/video-calling-server',
      'post-deploy': 'npm ci --production && pm2 reload ecosystem.config.js --env production && pm2 save'
    }
  }
};