// src/controllers/PromoCodeController.js
const logger = require('../config/logger');
const PromoCodeService = require('../services/PromoCodeService');
const { HTTP_STATUS } = require('../constants');
const { getUserFromToken } = require('../middleware/auth');

class PromoCodeController {
  /**
   * Create a new promo code (Admin only)
   * POST /api/promo-codes
   */
  async createPromoCode(req, res, next) {
    try {
      const authHeader = req.headers.authorization;

      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(HTTP_STATUS.UNAUTHORIZED).json({
          success: false,
          message: 'No token provided',
        });
      }

      const idToken = authHeader.split('Bearer ')[1];
      const user = await getUserFromToken(idToken);

      if (!user) {
        return res.status(HTTP_STATUS.UNAUTHORIZED).json({
          success: false,
          message: 'Invalid token',
        });
      }

      // TODO: Add admin role check
      // if (user.role !== 'admin') {
      //   return res.status(HTTP_STATUS.FORBIDDEN).json({
      //     success: false,
      //     message: 'Only admins can create promo codes',
      //   });
      // }

      const promoCodeData = {
        ...req.body,
        createdBy: user.id,
      };

      const promoCode = await PromoCodeService.createPromoCode(promoCodeData);

      return res.status(HTTP_STATUS.CREATED).json({
        success: true,
        message: 'Promo code created successfully',
        data: promoCode,
      });
    } catch (error) {
      logger.error('Error creating promo code:', error);
      
      if (error.message === 'Promo code already exists') {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
          success: false,
          message: error.message,
        });
      }
      
      next(error);
    }
  }

  /**
   * Validate promo code
   * POST /api/promo-codes/validate
   */
  async validatePromoCode(req, res, next) {
    try {
      const authHeader = req.headers.authorization;

      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(HTTP_STATUS.UNAUTHORIZED).json({
          success: false,
          message: 'No token provided',
        });
      }

      const idToken = authHeader.split('Bearer ')[1];
      const user = await getUserFromToken(idToken);

      if (!user) {
        return res.status(HTTP_STATUS.UNAUTHORIZED).json({
          success: false,
          message: 'Invalid token',
        });
      }

      const { code, bundles, totalAmount } = req.body;

      if (!code) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
          success: false,
          message: 'Promo code is required',
        });
      }

      const validation = await PromoCodeService.validatePromoCode(
        code,
        user.id,
        bundles || [],
        totalAmount || 0
      );

      if (!validation.valid) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
          success: false,
          message: validation.message,
        });
      }

      return res.json({
        success: true,
        message: validation.message,
        data: {
          promoCode: {
            id: validation.promoCode.id,
            code: validation.promoCode.code,
            promoType: validation.promoCode.promoType,
            description: validation.promoCode.description,
          },
          discount: validation.discount,
        },
      });
    } catch (error) {
      logger.error('Error validating promo code:', error);
      next(error);
    }
  }

  /**
   * Get all promo codes (Admin only)
   * GET /api/promo-codes
   */
  async getPromoCodes(req, res, next) {
    try {
      const authHeader = req.headers.authorization;

      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(HTTP_STATUS.UNAUTHORIZED).json({
          success: false,
          message: 'No token provided',
        });
      }

      const idToken = authHeader.split('Bearer ')[1];
      const user = await getUserFromToken(idToken);

      if (!user) {
        return res.status(HTTP_STATUS.UNAUTHORIZED).json({
          success: false,
          message: 'Invalid token',
        });
      }

      // TODO: Add admin role check

      const { isActive, includeExpired, limit, offset } = req.query;

      const result = await PromoCodeService.getPromoCodes({
        isActive: isActive !== undefined ? isActive === 'true' : undefined,
        includeExpired: includeExpired === 'true',
        limit: limit ? parseInt(limit) : undefined,
        offset: offset ? parseInt(offset) : undefined,
      });

      return res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      logger.error('Error getting promo codes:', error);
      next(error);
    }
  }

  /**
   * Get promo code by ID (Admin only)
   * GET /api/promo-codes/:id
   */
  async getPromoCodeById(req, res, next) {
    try {
      const authHeader = req.headers.authorization;

      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(HTTP_STATUS.UNAUTHORIZED).json({
          success: false,
          message: 'No token provided',
        });
      }

      const idToken = authHeader.split('Bearer ')[1];
      const user = await getUserFromToken(idToken);

      if (!user) {
        return res.status(HTTP_STATUS.UNAUTHORIZED).json({
          success: false,
          message: 'Invalid token',
        });
      }

      // TODO: Add admin role check

      const { id } = req.params;
      const promoCode = await PromoCodeService.getPromoCodeById(id);

      if (!promoCode) {
        return res.status(HTTP_STATUS.NOT_FOUND).json({
          success: false,
          message: 'Promo code not found',
        });
      }

      return res.json({
        success: true,
        data: promoCode,
      });
    } catch (error) {
      logger.error('Error getting promo code:', error);
      next(error);
    }
  }

  /**
   * Update promo code (Admin only)
   * PATCH /api/promo-codes/:id
   */
  async updatePromoCode(req, res, next) {
    try {
      const authHeader = req.headers.authorization;

      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(HTTP_STATUS.UNAUTHORIZED).json({
          success: false,
          message: 'No token provided',
        });
      }

      const idToken = authHeader.split('Bearer ')[1];
      const user = await getUserFromToken(idToken);

      if (!user) {
        return res.status(HTTP_STATUS.UNAUTHORIZED).json({
          success: false,
          message: 'Invalid token',
        });
      }

      // TODO: Add admin role check

      const { id } = req.params;
      const updateData = req.body;

      // Prevent changing code
      delete updateData.code;
      delete updateData.currentUsage;

      const promoCode = await PromoCodeService.updatePromoCode(id, updateData);

      return res.json({
        success: true,
        message: 'Promo code updated successfully',
        data: promoCode,
      });
    } catch (error) {
      logger.error('Error updating promo code:', error);
      next(error);
    }
  }

  /**
   * Deactivate promo code (Admin only)
   * POST /api/promo-codes/:id/deactivate
   */
  async deactivatePromoCode(req, res, next) {
    try {
      const authHeader = req.headers.authorization;

      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(HTTP_STATUS.UNAUTHORIZED).json({
          success: false,
          message: 'No token provided',
        });
      }

      const idToken = authHeader.split('Bearer ')[1];
      const user = await getUserFromToken(idToken);

      if (!user) {
        return res.status(HTTP_STATUS.UNAUTHORIZED).json({
          success: false,
          message: 'Invalid token',
        });
      }

      // TODO: Add admin role check

      const { id } = req.params;
      const promoCode = await PromoCodeService.deactivatePromoCode(id);

      return res.json({
        success: true,
        message: 'Promo code deactivated successfully',
        data: promoCode,
      });
    } catch (error) {
      logger.error('Error deactivating promo code:', error);
      next(error);
    }
  }

  /**
   * Delete promo code (Admin only)
   * DELETE /api/promo-codes/:id
   */
  async deletePromoCode(req, res, next) {
    try {
      const authHeader = req.headers.authorization;

      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(HTTP_STATUS.UNAUTHORIZED).json({
          success: false,
          message: 'No token provided',
        });
      }

      const idToken = authHeader.split('Bearer ')[1];
      const user = await getUserFromToken(idToken);

      if (!user) {
        return res.status(HTTP_STATUS.UNAUTHORIZED).json({
          success: false,
          message: 'Invalid token',
        });
      }

      // TODO: Add admin role check

      const { id } = req.params;
      await PromoCodeService.deletePromoCode(id);

      return res.json({
        success: true,
        message: 'Promo code deleted successfully',
      });
    } catch (error) {
      logger.error('Error deleting promo code:', error);
      
      if (error.message.includes('Cannot delete promo code')) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
          success: false,
          message: error.message,
        });
      }
      
      next(error);
    }
  }

  /**
   * Get promo code statistics (Admin only)
   * GET /api/promo-codes/:id/stats
   */
  async getPromoCodeStats(req, res, next) {
    try {
      const authHeader = req.headers.authorization;

      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(HTTP_STATUS.UNAUTHORIZED).json({
          success: false,
          message: 'No token provided',
        });
      }

      const idToken = authHeader.split('Bearer ')[1];
      const user = await getUserFromToken(idToken);

      if (!user) {
        return res.status(HTTP_STATUS.UNAUTHORIZED).json({
          success: false,
          message: 'Invalid token',
        });
      }

      // TODO: Add admin role check

      const { id } = req.params;
      const stats = await PromoCodeService.getPromoCodeStats(id);

      return res.json({
        success: true,
        data: stats,
      });
    } catch (error) {
      logger.error('Error getting promo code stats:', error);
      next(error);
    }
  }

  /**
   * Get user's promo code usage history
   * GET /api/promo-codes/my-usage
   */
  async getUserPromoUsage(req, res, next) {
    try {
      const authHeader = req.headers.authorization;

      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(HTTP_STATUS.UNAUTHORIZED).json({
          success: false,
          message: 'No token provided',
        });
      }

      const idToken = authHeader.split('Bearer ')[1];
      const user = await getUserFromToken(idToken);

      if (!user) {
        return res.status(HTTP_STATUS.UNAUTHORIZED).json({
          success: false,
          message: 'Invalid token',
        });
      }

      const { limit, offset } = req.query;

      const result = await PromoCodeService.getUserPromoUsage(user.id, {
        limit: limit ? parseInt(limit) : undefined,
        offset: offset ? parseInt(offset) : undefined,
      });

      return res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      logger.error('Error getting user promo usage:', error);
      next(error);
    }
  }
}

module.exports = new PromoCodeController();

