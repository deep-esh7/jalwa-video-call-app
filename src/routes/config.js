// src/routes/config.js
const express = require('express');
const router = express.Router();
const ConfigController = require('../controllers/ConfigController');

// Public endpoints
router.get('/', ConfigController.getAllConfigs);
router.get('/:key', ConfigController.getConfigByKey);
router.post('/', ConfigController.upsertConfig);
router.delete('/:key', ConfigController.deleteConfig);

module.exports = router;

/* All The CURLs

# Get all configs
curl http://localhost:4000/api/config

# Add a new config
curl -X POST -H "Content-Type: application/json" -d '{
  "key": "feature_flags",
  "value": {"darkMode": true, "notifications": false},
  "description": "Feature flags configuration"
}' http://localhost:4000/api/config

# Get a specific config
curl http://localhost:4000/api/config/feature_flags

# Delete a config
curl -X DELETE http://localhost:4000/api/config/feature_flags


*/