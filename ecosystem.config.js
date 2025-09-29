module.exports = {
  apps: [{
    name: 'jalwa-server',
    script: './server.js',
    instances: 1,
    exec_mode: 'fork',

    env_local: {
      NODE_ENV: 'local'
    },
    env_development: {
      NODE_ENV: 'development'
    },
    env_production: {
      NODE_ENV: 'production'
    },

    autorestart: true,
    watch: false,
    max_memory_restart: '2000M',
    log_file: './logs/jalwa.log',
    out_file: './logs/jalwa-out.log',
    error_file: './logs/jalwa-error.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true
  }]
};
