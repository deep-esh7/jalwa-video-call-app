const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');

// Helper function to load env file
function loadEnvFile(envFile) {
  const envPath = path.resolve(__dirname, envFile);
  if (fs.existsSync(envPath)) {
    return dotenv.parse(fs.readFileSync(envPath));
  }
  return {};
}

// Load environment-specific configurations
const envLocal = { NODE_ENV: 'local', ...loadEnvFile('.env.local') };
const envDev = { NODE_ENV: 'dev', ...loadEnvFile('.env.dev') };
const envProd = { NODE_ENV: 'prod', ...loadEnvFile('.env.prod') };

module.exports = {
  apps: [{
    name: 'jalwa-server',
    script: './server.js',
    instances: 1,
    exec_mode: 'fork',

    // Environment-specific configurations with all variables loaded
    env_local: envLocal,
    env_development: envDev,
    env_production: envProd,

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
