module.exports = {
  apps: [{
    name: 'jalwa-auto-connect-server',
    script: './server.js',
    instances: 1, // Single instance for socket.io clustering
    exec_mode: 'fork',
    
    // Server configuration
    env: {
      NODE_ENV: 'production',
      PORT: 4000,
      HOST: '147.93.108.247',
      // Auto-connect specific settings
      AUTO_MATCH_INTERVAL: 5000, // 5 seconds
      MAX_WAITING_TIME: 30000, // 30 seconds before retry
      CONNECTION_TIMEOUT: 10000, // 10 seconds
      DEBUG_LEVEL: 'info'
    },
    
    // Development environment
    env_development: {
      NODE_ENV: 'development',
      PORT: 4000,
      HOST: 'localhost',
      AUTO_MATCH_INTERVAL: 3000, // Faster matching in dev
      DEBUG_LEVEL: 'debug'
    },
    
    // Production environment with optimizations
    env_production: {
      NODE_ENV: 'production',
      PORT: 4000,
      HOST: '147.93.108.247',
      AUTO_MATCH_INTERVAL: 5000,
      MAX_WAITING_TIME: 30000,
      CONNECTION_TIMEOUT: 10000,
      DEBUG_LEVEL: 'info',
      // Performance optimizations
      UV_THREADPOOL_SIZE: 128,
      NODE_OPTIONS: '--max-old-space-size=2048'
    },
    
    // Auto-restart configuration (enhanced for auto-connect)
    watch: false, // Set to true for development
    ignore_watch: ['node_modules', 'logs', '*.log'],
    watch_options: {
      followSymlinks: false,
      usePolling: false
    },
    
    // Auto-restart on crash (more aggressive for real-time chat)
    autorestart: true,
    max_restarts: 15, // Increased for high availability
    min_uptime: '5s', // Faster restart for auto-connect
    restart_delay: 2000, // Reduced delay for quicker recovery
    
    // Memory and CPU limits (optimized for WebRTC + auto-matching)
    max_memory_restart: '1.5G', // Increased for auto-matching algorithms
    
    // Enhanced logging for auto-connect debugging
    log_file: './logs/jalwa-auto-connect.log',
    out_file: './logs/jalwa-out.log',
    error_file: './logs/jalwa-error.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    log_type: 'json', // Structured logging for better analysis
    
    // Health monitoring (enhanced)
    health_check_grace_period: 2000, // Faster health checks
    
    // Process management
    kill_timeout: 5000,
    listen_timeout: 3000,
    
    // Auto-connect specific monitoring
    instance_var: 'INSTANCE_ID',
    
    // Advanced PM2 features
    source_map_support: true,
    disable_source_map_support: false,
    
    // Crash analytics
    pmx: true,
    
    // Process title for easier identification
    name: 'jalwa-auto-connect-server'
  }],
  
  // Deployment configuration (updated for auto-connect)
  deploy: {
    production: {
      user: 'root',
      host: '147.93.108.247',
      ref: 'origin/main',
      repo: 'https://github.com/deep-esh7/jalwa-video-call-app.git',
      path: '/var/www/video-calling-server',
      
      // Enhanced deployment scripts
      'pre-deploy-local': 'echo "🚀 Starting Jalwa Auto-Connect deployment..."',
      'post-deploy': [
        'npm ci --production',
        'echo "📦 Dependencies installed"',
        'mkdir -p logs',
        'echo "📁 Log directory created"',
        'pm2 reload ecosystem.config.js --env production',
        'echo "🔄 Auto-connect server reloaded"',
        'sleep 3',
        'curl -f http://147.93.108.247:4000/health || echo "⚠️ Health check failed"',
        'curl -s http://147.93.108.247:4000/stats | head -5 || echo "📊 Stats check"',
        'echo "✅ Jalwa Auto-Connect deployment completed!"'
      ].join(' && '),
      
      // Pre-setup commands
      'pre-setup': 'apt-get update && apt-get install -y git curl',
      
      // Post-setup commands  
      'post-setup': [
        'ls -la',
        'npm install',
        'echo "🎯 Initial auto-connect setup completed"'
      ].join(' && ')
    },
    
    // Development deployment (optional)
    development: {
      user: 'developer',
      host: 'dev.example.com',
      ref: 'origin/develop',
      repo: 'https://github.com/deep-esh7/jalwa-video-call-app.git',
      path: '/var/www/jalwa-dev',
      'post-deploy': 'npm install && pm2 reload ecosystem.config.js --env development'
    }
  },
  
  // Additional PM2+ monitoring configuration
  monitoring: {
    // Auto-connect specific metrics
    custom_metrics: {
      'connected_users': {
        unit: 'users',
        type: 'counter'
      },
      'waiting_users': {
        unit: 'users', 
        type: 'gauge'
      },
      'active_matches': {
        unit: 'calls',
        type: 'gauge'
      },
      'match_success_rate': {
        unit: '%',
        type: 'percentage'
      }
    }
  }
};