// src/controllers/GiftController.js
const logger = require('../config/logger');
const GiftService = require('../services/GiftService');
const { HTTP_STATUS } = require('../constants');

class GiftController {
  /**
   * Create a new gift with image upload
   * POST /api/gifts
   * Body: multipart/form-data with fields: name, cost, image (file)
   */
  async createGift(req, res, next) {
    try {
      logger.info('Received request to create gift');

      const { name, cost } = req.body;
      const imageFile = req.file;

      // Validate required fields
      if (!name || !cost) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
          success: false,
          message: 'Name and cost are required',
        });
      }

      if (!imageFile) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
          success: false,
          message: 'Gift image is required',
        });
      }

      // Validate cost is a positive number
      const costNumber = parseInt(cost, 10);
      if (isNaN(costNumber) || costNumber <= 0) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
          success: false,
          message: 'Cost must be a positive number',
        });
      }

      // Validate image file type
      const allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
      if (!allowedMimeTypes.includes(imageFile.mimetype)) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
          success: false,
          message: 'Invalid image format. Allowed formats: JPEG, PNG, GIF, WEBP',
        });
      }

      // Create gift with image upload
      const gift = await GiftService.createGift(
        name,
        costNumber,
        imageFile.buffer,
        imageFile.originalname
      );

      logger.info(`✅ Gift created successfully: ${gift.id}`);

      return res.status(HTTP_STATUS.CREATED).json({
        success: true,
        message: 'Gift created successfully',
        data: gift,
      });
    } catch (error) {
      logger.error('Error creating gift:', error);
      next(error);
    }
  }

  /**
   * Get all gifts
   * GET /api/gifts
   */
  async getAllGifts(req, res, next) {
    try {
      logger.info('Fetching all gifts');

      const gifts = await GiftService.getAllGifts();

      return res.json({
        success: true,
        data: gifts,
        count: gifts.length,
      });
    } catch (error) {
      logger.error('Error fetching gifts:', error);
      next(error);
    }
  }

  /**
   * Get gift by ID
   * GET /api/gifts/:id
   */
  async getGiftById(req, res, next) {
    try {
      const { id } = req.params;

      const gift = await GiftService.getGiftById(id);

      if (!gift) {
        return res.status(HTTP_STATUS.NOT_FOUND).json({
          success: false,
          message: 'Gift not found',
        });
      }

      return res.json({
        success: true,
        data: gift,
      });
    } catch (error) {
      logger.error('Error fetching gift:', error);
      next(error);
    }
  }

  /**
   * Update gift
   * PUT /api/gifts/:id
   * Body: { name?, cost?, imageUrl? }
   */
  async updateGift(req, res, next) {
    try {
      const { id } = req.params;
      const { name, cost, imageUrl } = req.body;

      // Check if gift exists
      const existingGift = await GiftService.getGiftById(id);
      if (!existingGift) {
        return res.status(HTTP_STATUS.NOT_FOUND).json({
          success: false,
          message: 'Gift not found',
        });
      }

      // Build update object
      const updates = {};
      if (name !== undefined) updates.name = name;
      if (cost !== undefined) {
        const costNumber = parseInt(cost, 10);
        if (isNaN(costNumber) || costNumber <= 0) {
          return res.status(HTTP_STATUS.BAD_REQUEST).json({
            success: false,
            message: 'Cost must be a positive number',
          });
        }
        updates.cost = costNumber;
      }
      if (imageUrl !== undefined) updates.imageUrl = imageUrl;

      // Check if there are any updates
      if (Object.keys(updates).length === 0) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
          success: false,
          message: 'No valid fields to update',
        });
      }

      const updatedGift = await GiftService.updateGift(id, updates);

      return res.json({
        success: true,
        message: 'Gift updated successfully',
        data: updatedGift,
      });
    } catch (error) {
      logger.error('Error updating gift:', error);
      next(error);
    }
  }

  /**
   * Delete gift
   * DELETE /api/gifts/:id
   */
  async deleteGift(req, res, next) {
    try {
      const { id } = req.params;

      // Check if gift exists
      const existingGift = await GiftService.getGiftById(id);
      if (!existingGift) {
        return res.status(HTTP_STATUS.NOT_FOUND).json({
          success: false,
          message: 'Gift not found',
        });
      }

      await GiftService.deleteGift(id);

      return res.json({
        success: true,
        message: 'Gift deleted successfully',
      });
    } catch (error) {
      logger.error('Error deleting gift:', error);
      next(error);
    }
  }
}

module.exports = new GiftController();


