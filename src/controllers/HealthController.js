// src/controllers/HealthController.js
const logger = require('../config/logger');
const RedisService = require('../services/RedisService');
const { environment } = require('../config');
const { HTTP_STATUS } = require('../constants');

class HealthController {
  /**
   * Health check endpoint
   */
  async getHealth(req, res) {
    try {
      const { socketConnections, activeRooms, userSockets, MatchingService } = req.app.locals;

      // Get available users
      const availableUsers = await RedisService.getAvailableUsers(userSockets);

      res.json({
        status: 'healthy',
        environment: environment.env,
        socketConnections: socketConnections?.size || 0,
        activeRooms: activeRooms?.size || 0,
        availableUsers: availableUsers.length,
        ongoingMatching: MatchingService?.getOngoingMatchingCount() || 0,
        uptime: process.uptime(),
        iceServersCount: environment.iceServers.length,
        firebaseConnected: true,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error(`Health check failed: ${error.message}`);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
        status: 'error',
        error: error.message,
        firebaseConnected: false,
      });
    }
  }
}

module.exports = new HealthController();

