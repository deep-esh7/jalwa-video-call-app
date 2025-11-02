// src/controllers/ConfigController.js
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { HTTP_STATUS } = require('../constants');
const logger = require('../config/logger');

class ConfigController {
  /**
   * Get all configurations
   */
  static async getAllConfigs(req, res) {
    try {
      const configs = await prisma.appConfig.findMany({
        where: { isActive: true }
      });
      res.json({
        success: true,
        data: configs
      });
    } catch (error) {
      logger.error(`Get all configs error: ${error.message}`);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: 'Failed to get configurations'
      });
    }
  }

  /**
   * Get config by key
   */
  static async getConfigByKey(req, res) {
    try {
      const { key } = req.params;
      const config = await prisma.appConfig.findUnique({
        where: { key }
      });
      
      if (!config) {
        return res.status(HTTP_STATUS.NOT_FOUND).json({
          success: false,
          message: 'Configuration not found'
        });
      }

      res.json({
        success: true,
        data: config
      });
    } catch (error) {
      logger.error(`Get config error: ${error.message}`);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: 'Failed to get configuration'
      });
    }
  }

  /**
   * Create or update config
   */
  static async upsertConfig(req, res) {
    try {
      const { key, value, description } = req.body;
      
      if (!key || value === undefined) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
          success: false,
          message: 'Key and value are required'
        });
      }

      const config = await prisma.appConfig.upsert({
        where: { key },
        update: { 
          value,
          description,
          isActive: true 
        },
        create: { 
          key,
          value,
          description,
          isActive: true
        }
      });
      
      res.status(HTTP_STATUS.CREATED).json({
        success: true,
        data: config,
        message: 'Configuration saved successfully'
      });
    } catch (error) {
      logger.error(`Upsert config error: ${error.message}`);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: 'Failed to save configuration'
      });
    }
  }

  /**
   * Delete config
   */
  static async deleteConfig(req, res) {
    try {
      const { key } = req.params;
      await prisma.appConfig.delete({
        where: { key }
      });
      
      res.json({
        success: true,
        message: 'Configuration deleted successfully'
      });
    } catch (error) {
      logger.error(`Delete config error: ${error.message}`);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: 'Failed to delete configuration'
      });
    }
  }
}

module.exports = ConfigController;