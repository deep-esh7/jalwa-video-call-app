// src/services/ConfigService.js
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const logger = require('../config/logger');

class ConfigService {
  /**
   * Get all configurations
   */
  static async getAllConfigs() {
    try {
      return await prisma.appConfig.findMany({
        where: { isActive: true }
      });
    } catch (error) {
      logger.error(`Failed to get configs: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get config by key
   */
  static async getConfigByKey(key) {
    try {
      return await prisma.appConfig.findUnique({
        where: { key }
      });
    } catch (error) {
      logger.error(`Failed to get config ${key}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Create or update config
   */
  static async upsertConfig(key, value, description = '') {
    try {
      return await prisma.appConfig.upsert({
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
    } catch (error) {
      logger.error(`Failed to upsert config ${key}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Delete config
   */
  static async deleteConfig(key) {
    try {
      return await prisma.appConfig.delete({
        where: { key }
      });
    } catch (error) {
      logger.error(`Failed to delete config ${key}: ${error.message}`);
      throw error;
    }
  }
}

module.exports = ConfigService;