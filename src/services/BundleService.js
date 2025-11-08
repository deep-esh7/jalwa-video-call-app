// src/services/BundleService.js
const { PrismaClient } = require('@prisma/client');
const logger = require('../config/logger');

const prisma = new PrismaClient();

class BundleService {
  /**
   * Create a new coin bundle
   * @param {Object} data - Bundle data
   * @returns {Promise<Object>} - Created bundle
   */
  async createBundle(data) {
    try {
      const { name, coins, price, description, isActive = true, sortOrder = 0 } = data;

      const bundle = await prisma.coinBundle.create({
        data: {
          name,
          coins,
          price,
          description,
          isActive,
          sortOrder,
        },
      });

      logger.info(`✅ Created coin bundle: ${bundle.name} (${bundle.coins} coins for $${bundle.price})`);
      return bundle;
    } catch (error) {
      logger.error('Error creating bundle:', error);
      throw error;
    }
  }

  /**
   * Get all active bundles (sorted by sortOrder)
   * @returns {Promise<Array>} - List of active bundles
   */
  async getActiveBundles() {
    try {
      const bundles = await prisma.coinBundle.findMany({
        where: { isActive: true },
        orderBy: { sortOrder: 'asc' },
      });
      return bundles;
    } catch (error) {
      logger.error('Error getting active bundles:', error);
      throw error;
    }
  }

  /**
   * Get all bundles (including inactive)
   * @returns {Promise<Array>} - List of all bundles
   */
  async getAllBundles() {
    try {
      const bundles = await prisma.coinBundle.findMany({
        orderBy: { sortOrder: 'asc' },
      });
      return bundles;
    } catch (error) {
      logger.error('Error getting all bundles:', error);
      throw error;
    }
  }

  /**
   * Get bundle by ID
   * @param {string} id - Bundle ID
   * @returns {Promise<Object>} - Bundle object
   */
  async getBundleById(id) {
    try {
      const bundle = await prisma.coinBundle.findUnique({
        where: { id },
      });
      return bundle;
    } catch (error) {
      logger.error(`Error getting bundle ${id}:`, error);
      throw error;
    }
  }

  /**
   * Update bundle
   * @param {string} id - Bundle ID
   * @param {Object} data - Update data
   * @returns {Promise<Object>} - Updated bundle
   */
  async updateBundle(id, data) {
    try {
      const bundle = await prisma.coinBundle.update({
        where: { id },
        data,
      });
      logger.info(`✅ Updated bundle: ${id}`);
      return bundle;
    } catch (error) {
      logger.error(`Error updating bundle ${id}:`, error);
      throw error;
    }
  }

  /**
   * Delete bundle
   * @param {string} id - Bundle ID
   * @returns {Promise<Object>} - Deleted bundle
   */
  async deleteBundle(id) {
    try {
      const bundle = await prisma.coinBundle.delete({
        where: { id },
      });
      logger.info(`✅ Deleted bundle: ${id}`);
      return bundle;
    } catch (error) {
      logger.error(`Error deleting bundle ${id}:`, error);
      throw error;
    }
  }

  /**
   * Soft delete (deactivate) bundle
   * @param {string} id - Bundle ID
   * @returns {Promise<Object>} - Deactivated bundle
   */
  async deactivateBundle(id) {
    try {
      const bundle = await prisma.coinBundle.update({
        where: { id },
        data: { isActive: false },
      });
      logger.info(`✅ Deactivated bundle: ${id}`);
      return bundle;
    } catch (error) {
      logger.error(`Error deactivating bundle ${id}:`, error);
      throw error;
    }
  }
}

module.exports = new BundleService();


