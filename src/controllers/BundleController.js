// src/controllers/BundleController.js
const logger = require('../config/logger');
const BundleService = require('../services/BundleService');
const { HTTP_STATUS } = require('../constants');

class BundleController {
  /**
   * Get all active bundles (public)
   * GET /api/bundles
   */
  async getActiveBundles(req, res, next) {
    try {
      const bundles = await BundleService.getActiveBundles();

      return res.json({
        success: true,
        data: bundles,
        count: bundles.length,
      });
    } catch (error) {
      logger.error('Error getting active bundles:', error);
      next(error);
    }
  }

  /**
   * Get all bundles including inactive (admin)
   * GET /api/bundles/all
   */
  async getAllBundles(req, res, next) {
    try {
      const bundles = await BundleService.getAllBundles();

      return res.json({
        success: true,
        data: bundles,
        count: bundles.length,
      });
    } catch (error) {
      logger.error('Error getting all bundles:', error);
      next(error);
    }
  }

  /**
   * Get bundle by ID
   * GET /api/bundles/:id
   */
  async getBundleById(req, res, next) {
    try {
      const { id } = req.params;

      const bundle = await BundleService.getBundleById(id);

      if (!bundle) {
        return res.status(HTTP_STATUS.NOT_FOUND).json({
          success: false,
          message: 'Bundle not found',
        });
      }

      return res.json({
        success: true,
        data: bundle,
      });
    } catch (error) {
      logger.error('Error getting bundle:', error);
      next(error);
    }
  }

  /**
   * Create a new bundle (admin)
   * POST /api/bundles
   * Body: { name, coins, price, description?, isActive?, sortOrder? }
   */
  async createBundle(req, res, next) {
    try {
      const { name, coins, price, description, isActive, sortOrder } = req.body;

      // Validate required fields
      if (!name || !coins || !price) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
          success: false,
          message: 'Name, coins, and price are required',
        });
      }

      // Validate coins
      const coinsNumber = parseInt(coins, 10);
      if (isNaN(coinsNumber) || coinsNumber <= 0) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
          success: false,
          message: 'Coins must be a positive number',
        });
      }

      // Validate price
      const priceNumber = parseFloat(price);
      if (isNaN(priceNumber) || priceNumber <= 0) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
          success: false,
          message: 'Price must be a positive number',
        });
      }

      const bundle = await BundleService.createBundle({
        name,
        coins: coinsNumber,
        price: priceNumber,
        description,
        isActive,
        sortOrder: sortOrder !== undefined ? parseInt(sortOrder, 10) : 0,
      });

      logger.info(`✅ Bundle created: ${bundle.id}`);

      return res.status(HTTP_STATUS.CREATED).json({
        success: true,
        message: 'Bundle created successfully',
        data: bundle,
      });
    } catch (error) {
      logger.error('Error creating bundle:', error);
      next(error);
    }
  }

  /**
   * Update bundle (admin)
   * PUT /api/bundles/:id
   * Body: { name?, coins?, price?, description?, isActive?, sortOrder? }
   */
  async updateBundle(req, res, next) {
    try {
      const { id } = req.params;
      const { name, coins, price, description, isActive, sortOrder } = req.body;

      // Check if bundle exists
      const existingBundle = await BundleService.getBundleById(id);
      if (!existingBundle) {
        return res.status(HTTP_STATUS.NOT_FOUND).json({
          success: false,
          message: 'Bundle not found',
        });
      }

      // Build update object
      const updates = {};
      if (name !== undefined) updates.name = name;
      if (description !== undefined) updates.description = description;
      if (isActive !== undefined) updates.isActive = isActive;
      
      if (coins !== undefined) {
        const coinsNumber = parseInt(coins, 10);
        if (isNaN(coinsNumber) || coinsNumber <= 0) {
          return res.status(HTTP_STATUS.BAD_REQUEST).json({
            success: false,
            message: 'Coins must be a positive number',
          });
        }
        updates.coins = coinsNumber;
      }

      if (price !== undefined) {
        const priceNumber = parseFloat(price);
        if (isNaN(priceNumber) || priceNumber <= 0) {
          return res.status(HTTP_STATUS.BAD_REQUEST).json({
            success: false,
            message: 'Price must be a positive number',
          });
        }
        updates.price = priceNumber;
      }

      if (sortOrder !== undefined) {
        updates.sortOrder = parseInt(sortOrder, 10);
      }

      // Check if there are any updates
      if (Object.keys(updates).length === 0) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
          success: false,
          message: 'No valid fields to update',
        });
      }

      const updatedBundle = await BundleService.updateBundle(id, updates);

      return res.json({
        success: true,
        message: 'Bundle updated successfully',
        data: updatedBundle,
      });
    } catch (error) {
      logger.error('Error updating bundle:', error);
      next(error);
    }
  }

  /**
   * Delete bundle (admin)
   * DELETE /api/bundles/:id
   */
  async deleteBundle(req, res, next) {
    try {
      const { id } = req.params;

      // Check if bundle exists
      const existingBundle = await BundleService.getBundleById(id);
      if (!existingBundle) {
        return res.status(HTTP_STATUS.NOT_FOUND).json({
          success: false,
          message: 'Bundle not found',
        });
      }

      await BundleService.deleteBundle(id);

      return res.json({
        success: true,
        message: 'Bundle deleted successfully',
      });
    } catch (error) {
      logger.error('Error deleting bundle:', error);
      next(error);
    }
  }

  /**
   * Deactivate bundle (admin - soft delete)
   * PATCH /api/bundles/:id/deactivate
   */
  async deactivateBundle(req, res, next) {
    try {
      const { id } = req.params;

      // Check if bundle exists
      const existingBundle = await BundleService.getBundleById(id);
      if (!existingBundle) {
        return res.status(HTTP_STATUS.NOT_FOUND).json({
          success: false,
          message: 'Bundle not found',
        });
      }

      const bundle = await BundleService.deactivateBundle(id);

      return res.json({
        success: true,
        message: 'Bundle deactivated successfully',
        data: bundle,
      });
    } catch (error) {
      logger.error('Error deactivating bundle:', error);
      next(error);
    }
  }
}

module.exports = new BundleController();


