// src/controllers/PaymentController.js
const logger = require('../config/logger');
const PaymentService = require('../services/PaymentService');
const WalletService = require('../services/WalletService');
const { HTTP_STATUS } = require('../constants');
const { getUserFromToken } = require('../middleware/auth');

class PaymentController {
  /**
   * Get payment information
   * GET /api/payments/info
   */
  async getPaymentInfo(req, res, next) {
    try {
      const info = PaymentService.getPaymentInfo();

      return res.json({
        success: true,
        data: info,
      });
    } catch (error) {
      logger.error('Error getting payment info:', error);
      next(error);
    }
  }

  /**
   * Purchase multiple coin bundles
   * POST /api/payments/purchase
   * Body: { 
   *   bundles: [{ bundleId: string, count: number }], 
   *   promoCode?: string 
   * }
   * Or: { 
   *   bundleIds: [string], 
   *   promoCode?: string 
   * }
   */
  async purchaseBundles(req, res, next) {
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

      const { bundleIds, promoCode } = req.body;

      // Support both 'bundleIds' array and 'bundles' array for backward compatibility
      const bundles = req.body.bundles || 
        (Array.isArray(bundleIds) ? bundleIds.map(id => ({ bundleId: id, count: 1 })) : null);

      if (!bundles || !Array.isArray(bundles) || bundles.length === 0) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
          success: false,
          message: 'Bundles list is required and must not be empty. Expected format: { bundles: [{ bundleId: "id", count: 1 }] } or { bundleIds: ["id1", "id2"] }',
        });
      }

      const result = await PaymentService.purchaseMultipleBundles(user.id, bundles, promoCode);

      return res.json({
        success: true,
        message: 'Bundles purchased successfully',
        data: result,
      });
    } catch (error) {
      logger.error('❌ Error processing multiple bundle purchase:', error);
      
      // Handle specific error types
      if (error.message.includes('Bundle not found') || error.message.includes('inactive')) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
          success: false,
          message: error.message,
        });
      }
      
      next(error);
    }
  }


  /**
   * Handle Stripe webhook
   * POST /api/payments/webhook
   */
  async handleWebhook(req, res, next) {
    try {
      const signature = req.headers['stripe-signature'];
      
      if (!signature) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
          success: false,
          message: 'Missing stripe-signature header',
        });
      }

      // Verify webhook signature and get event
      const event = PaymentService.verifyWebhookSignature(
        req.body,
        signature
      );

      logger.info(`Received webhook event: ${event.type}`);

      // Handle the event
      await PaymentService.handleWebhookEvent(event);

      return res.json({ received: true });
    } catch (error) {
      logger.error('Webhook error:', error);
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: `Webhook Error: ${error.message}`,
      });
    }
  }

  /**
   * Get payment history for authenticated user
   * GET /api/payments/history
   */
  async getPaymentHistory(req, res, next) {
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

      const { limit, offset, status } = req.query;

      const history = await PaymentService.getPaymentHistory(user.id, {
        limit: limit ? parseInt(limit) : undefined,
        offset: offset ? parseInt(offset) : undefined,
        status,
      });

      return res.json({
        success: true,
        data: history,
      });
    } catch (error) {
      logger.error('Error getting payment history:', error);
      next(error);
    }
  }

  /**
   * Get wallet balance and summary
   * GET /api/payments/wallet
   */
  async getWallet(req, res, next) {
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

      const summary = await WalletService.getWalletSummary(user.id);

      return res.json({
        success: true,
        data: summary,
      });
    } catch (error) {
      logger.error('Error getting wallet:', error);
      next(error);
    }
  }

  /**
   * Get transaction history
   * GET /api/payments/transactions
   */
  async getTransactionHistory(req, res, next) {
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

      const { limit, offset, type } = req.query;

      const history = await WalletService.getTransactionHistory(user.id, {
        limit: limit ? parseInt(limit) : undefined,
        offset: offset ? parseInt(offset) : undefined,
        type,
      });

      return res.json({
        success: true,
        data: history,
      });
    } catch (error) {
      logger.error('Error getting transaction history:', error);
      next(error);
    }
  }

  /**
   * Get purchased bundle history
   * GET /api/payments/bundles/purchased
   */
  async getPurchasedBundles(req, res, next) {
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

      const history = await WalletService.getPurchasedBundles(user.id, {
        limit: limit ? parseInt(limit) : undefined,
        offset: offset ? parseInt(offset) : undefined,
      });

      return res.json({
        success: true,
        data: history,
      });
    } catch (error) {
      logger.error('Error getting purchased bundles:', error);
      next(error);
    }
  }
}

module.exports = new PaymentController();

