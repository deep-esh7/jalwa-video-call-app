// src/services/PromoCodeService.js
const { PrismaClient } = require('@prisma/client');
const logger = require('../config/logger');

const prisma = new PrismaClient();

class PromoCodeService {
  /**
   * Create a new promo code
   * @param {Object} promoData - Promo code data
   * @returns {Promise<Object>} - Created promo code
   */
  async createPromoCode(promoData) {
    try {
      const {
        code,
        promoType,
        discountValue,
        bonusCoins = 0,
        maxUsage,
        perUserMaxUsage = 1,
        expiryTime,
        applicableBundles,
        minPurchaseAmount = 0,
        description,
        createdBy,
      } = promoData;

      // Validate promo code uniqueness
      const existing = await prisma.promoCode.findUnique({
        where: { code: code.toUpperCase() },
      });

      if (existing) {
        throw new Error('Promo code already exists');
      }

      // Validate promo type
      const validTypes = ['percentage', 'fixed_amount', 'bonus_coins', 'free_bundle'];
      if (!validTypes.includes(promoType)) {
        throw new Error(`Invalid promo type. Must be one of: ${validTypes.join(', ')}`);
      }

      // Create promo code
      const promoCode = await prisma.promoCode.create({
        data: {
          code: code.toUpperCase(),
          promoType,
          discountValue: parseFloat(discountValue),
          bonusCoins: parseInt(bonusCoins),
          maxUsage: parseInt(maxUsage),
          perUserMaxUsage: parseInt(perUserMaxUsage),
          expiryTime: expiryTime ? new Date(expiryTime) : null,
          applicableBundles: applicableBundles || null,
          minPurchaseAmount: parseFloat(minPurchaseAmount),
          description,
          createdBy,
          isActive: true,
        },
      });

      logger.info(`Created promo code: ${promoCode.code}`);
      return promoCode;
    } catch (error) {
      logger.error('Error creating promo code:', error);
      throw error;
    }
  }

  /**
   * Validate promo code for a purchase
   * @param {string} code - Promo code
   * @param {string} userId - User ID
   * @param {Array} bundles - Array of {bundleId, totalPrice}
   * @param {number} totalAmount - Total purchase amount
   * @returns {Promise<Object>} - Validation result with discount calculation
   */
  async validatePromoCode(code, userId, bundles, totalAmount) {
    try {
      // Get promo code
      const promoCode = await prisma.promoCode.findUnique({
        where: { code: code.toUpperCase() },
      });

      if (!promoCode) {
        return {
          valid: false,
          message: 'Invalid promo code',
        };
      }

      // Check if active
      if (!promoCode.isActive) {
        return {
          valid: false,
          message: 'Promo code is inactive',
        };
      }

      // Check expiry
      if (promoCode.expiryTime && new Date(promoCode.expiryTime) < new Date()) {
        return {
          valid: false,
          message: 'Promo code has expired',
        };
      }

      // Check max usage
      if (promoCode.currentUsage >= promoCode.maxUsage) {
        return {
          valid: false,
          message: 'Promo code usage limit reached',
        };
      }

      // Check per-user usage
      const userUsageCount = await prisma.promoCodeUsage.count({
        where: {
          promoCodeId: promoCode.id,
          userId,
        },
      });

      if (userUsageCount >= promoCode.perUserMaxUsage) {
        return {
          valid: false,
          message: `You have already used this promo code ${promoCode.perUserMaxUsage} time(s)`,
        };
      }

      // Check minimum purchase amount
      if (totalAmount < promoCode.minPurchaseAmount) {
        return {
          valid: false,
          message: `Minimum purchase amount of $${promoCode.minPurchaseAmount} required`,
        };
      }

      // Check applicable bundles
      if (promoCode.applicableBundles) {
        const applicableBundleIds = promoCode.applicableBundles;
        const purchasedBundleIds = bundles.map(b => b.bundleId);
        
        const hasApplicableBundle = purchasedBundleIds.some(id =>
          applicableBundleIds.includes(id)
        );

        if (!hasApplicableBundle) {
          return {
            valid: false,
            message: 'This promo code is not applicable to the selected bundles',
          };
        }
      }

      // Calculate discount
      const discount = this.calculateDiscount(promoCode, totalAmount, bundles);

      return {
        valid: true,
        promoCode,
        discount,
        message: 'Promo code applied successfully',
      };
    } catch (error) {
      logger.error('Error validating promo code:', error);
      throw error;
    }
  }

  /**
   * Calculate discount based on promo type
   * @param {Object} promoCode - Promo code object
   * @param {number} totalAmount - Total purchase amount
   * @param {Array} bundles - Array of bundles
   * @returns {Object} - Discount details
   */
  calculateDiscount(promoCode, totalAmount, bundles) {
    let discountAmount = 0;
    let bonusCoins = 0;

    switch (promoCode.promoType) {
      case 'percentage':
        // Calculate percentage discount
        discountAmount = (totalAmount * promoCode.discountValue) / 100;
        break;

      case 'fixed_amount':
        // Fixed amount discount (not exceeding total)
        discountAmount = Math.min(promoCode.discountValue, totalAmount);
        break;

      case 'bonus_coins':
        // Add bonus coins
        bonusCoins = promoCode.bonusCoins;
        discountAmount = 0;
        break;

      case 'free_bundle':
        // Free bundle logic (would need specific implementation)
        // For now, treat as 100% discount on specific bundle
        if (promoCode.applicableBundles && promoCode.applicableBundles.length > 0) {
          const freeBundleId = promoCode.applicableBundles[0];
          const freeBundle = bundles.find(b => b.bundleId === freeBundleId);
          if (freeBundle) {
            discountAmount = freeBundle.totalPrice;
          }
        }
        break;

      default:
        discountAmount = 0;
    }

    // Round discount to 2 decimal places
    discountAmount = Math.round(discountAmount * 100) / 100;

    return {
      discountAmount,
      bonusCoins,
      finalAmount: Math.max(0, totalAmount - discountAmount),
    };
  }

  /**
   * Apply promo code to a purchase
   * @param {string} promoCodeId - Promo code ID
   * @param {string} userId - User ID
   * @param {string} orderId - Transaction/order ID
   * @param {number} discountAmount - Discount amount applied
   * @param {number} bonusCoins - Bonus coins given
   * @returns {Promise<Object>} - Usage record
   */
  async applyPromoCode(promoCodeId, userId, orderId, discountAmount, bonusCoins = 0) {
    try {
      // Record usage
      const usage = await prisma.promoCodeUsage.create({
        data: {
          promoCodeId,
          userId,
          orderId,
          discountAmount,
          bonusCoins,
        },
      });

      // Increment current usage count
      await prisma.promoCode.update({
        where: { id: promoCodeId },
        data: {
          currentUsage: {
            increment: 1,
          },
        },
      });

      logger.info(`Applied promo code for user ${userId}, discount: $${discountAmount}, bonus coins: ${bonusCoins}`);
      return usage;
    } catch (error) {
      logger.error('Error applying promo code:', error);
      throw error;
    }
  }

  /**
   * Get all promo codes (with filters)
   * @param {Object} options - Filter options
   * @returns {Promise<Object>} - Promo codes list
   */
  async getPromoCodes(options = {}) {
    try {
      const {
        isActive,
        includeExpired = false,
        limit = 50,
        offset = 0,
      } = options;

      const where = {};

      if (isActive !== undefined) {
        where.isActive = isActive;
      }

      if (!includeExpired) {
        where.OR = [
          { expiryTime: null },
          { expiryTime: { gt: new Date() } },
        ];
      }

      const promoCodes = await prisma.promoCode.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
        include: {
          _count: {
            select: { usages: true },
          },
        },
      });

      const total = await prisma.promoCode.count({ where });

      return {
        promoCodes,
        total,
        limit,
        offset,
      };
    } catch (error) {
      logger.error('Error getting promo codes:', error);
      throw error;
    }
  }

  /**
   * Get promo code by ID
   * @param {string} id - Promo code ID
   * @returns {Promise<Object>} - Promo code
   */
  async getPromoCodeById(id) {
    try {
      return await prisma.promoCode.findUnique({
        where: { id },
        include: {
          usages: {
            take: 10,
            orderBy: { createdAt: 'desc' },
          },
          _count: {
            select: { usages: true },
          },
        },
      });
    } catch (error) {
      logger.error('Error getting promo code:', error);
      throw error;
    }
  }

  /**
   * Get promo code by code
   * @param {string} code - Promo code
   * @returns {Promise<Object>} - Promo code
   */
  async getPromoCodeByCode(code) {
    try {
      return await prisma.promoCode.findUnique({
        where: { code: code.toUpperCase() },
      });
    } catch (error) {
      logger.error('Error getting promo code:', error);
      throw error;
    }
  }

  /**
   * Update promo code
   * @param {string} id - Promo code ID
   * @param {Object} updateData - Data to update
   * @returns {Promise<Object>} - Updated promo code
   */
  async updatePromoCode(id, updateData) {
    try {
      const promoCode = await prisma.promoCode.update({
        where: { id },
        data: updateData,
      });

      logger.info(`Updated promo code: ${promoCode.code}`);
      return promoCode;
    } catch (error) {
      logger.error('Error updating promo code:', error);
      throw error;
    }
  }

  /**
   * Deactivate promo code
   * @param {string} id - Promo code ID
   * @returns {Promise<Object>} - Updated promo code
   */
  async deactivatePromoCode(id) {
    try {
      return await this.updatePromoCode(id, { isActive: false });
    } catch (error) {
      logger.error('Error deactivating promo code:', error);
      throw error;
    }
  }

  /**
   * Delete promo code
   * @param {string} id - Promo code ID
   * @returns {Promise<void>}
   */
  async deletePromoCode(id) {
    try {
      // Check if promo code has been used
      const usageCount = await prisma.promoCodeUsage.count({
        where: { promoCodeId: id },
      });

      if (usageCount > 0) {
        throw new Error('Cannot delete promo code that has been used. Deactivate it instead.');
      }

      await prisma.promoCode.delete({
        where: { id },
      });

      logger.info(`Deleted promo code: ${id}`);
    } catch (error) {
      logger.error('Error deleting promo code:', error);
      throw error;
    }
  }

  /**
   * Get promo code usage statistics
   * @param {string} promoCodeId - Promo code ID
   * @returns {Promise<Object>} - Usage statistics
   */
  async getPromoCodeStats(promoCodeId) {
    try {
      const promoCode = await prisma.promoCode.findUnique({
        where: { id: promoCodeId },
        include: {
          usages: true,
        },
      });

      if (!promoCode) {
        throw new Error('Promo code not found');
      }

      const totalUsage = promoCode.usages.length;
      const totalDiscount = promoCode.usages.reduce(
        (sum, usage) => sum + usage.discountAmount,
        0
      );
      const totalBonusCoins = promoCode.usages.reduce(
        (sum, usage) => sum + usage.bonusCoins,
        0
      );
      const uniqueUsers = new Set(promoCode.usages.map(u => u.userId)).size;

      return {
        code: promoCode.code,
        totalUsage,
        remainingUsage: promoCode.maxUsage - promoCode.currentUsage,
        totalDiscount,
        totalBonusCoins,
        uniqueUsers,
        isActive: promoCode.isActive,
        expiryTime: promoCode.expiryTime,
      };
    } catch (error) {
      logger.error('Error getting promo code stats:', error);
      throw error;
    }
  }

  /**
   * Get user's promo code usage history
   * @param {string} userId - User ID
   * @param {Object} options - Query options
   * @returns {Promise<Object>} - Usage history
   */
  async getUserPromoUsage(userId, options = {}) {
    try {
      const { limit = 50, offset = 0 } = options;

      const usages = await prisma.promoCodeUsage.findMany({
        where: { userId },
        include: {
          promoCode: {
            select: {
              code: true,
              promoType: true,
              description: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      });

      const total = await prisma.promoCodeUsage.count({
        where: { userId },
      });

      return {
        usages,
        total,
        limit,
        offset,
      };
    } catch (error) {
      logger.error('Error getting user promo usage:', error);
      throw error;
    }
  }
}

module.exports = new PromoCodeService();

