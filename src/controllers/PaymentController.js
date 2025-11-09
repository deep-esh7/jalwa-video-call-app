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
   * Purchase coin bundle
   * POST /api/payments/purchase
   * Body: { bundleId }
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

    const { bundles, promoCode } = req.body;

    if (!Array.isArray(bundles) || bundles.length === 0) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: 'Bundles list is required and must not be empty',
      });
    }

    const BundleService = require('../services/BundleService');
    const WalletService = require('../services/WalletService');

    // Get or create user wallet
    const wallet = await WalletService.getOrCreateWallet(user.id);

    let totalCoins = 0;
    let totalAmountUsd = 0;
    const purchasedBundles = [];

    // Start a transaction block (pseudo — depends on your DB)
    for (const item of bundles) {
      const { bundleId, count } = item;

      if (!bundleId || !count || isNaN(Number(count)) || Number(count) <= 0) {
        throw new Error(`Invalid bundle entry: ${JSON.stringify(item)}`);
      }

      const bundle = await BundleService.getBundleById(bundleId);

      if (!bundle || !bundle.isActive) {
        throw new Error(`Bundle not found or inactive: ${bundleId}`);
      }

      const quantity = Number(count);
      const coinsToAdd = bundle.coins * quantity;
      const totalPrice = bundle.price * quantity;

      const result = await WalletService.credit(
        user.id,
        coinsToAdd,
        'deposit',
        `Purchased ${quantity}x ${bundle.name}`,
        {
          bundleId: bundle.id,
          bundleName: bundle.name,
          amountUsd: totalPrice,
          coins: coinsToAdd,
          purchaseDate: new Date().toISOString(),
        }
      );

      totalCoins += coinsToAdd;
      totalAmountUsd += totalPrice;

      purchasedBundles.push({
        id: bundle.id,
        name: bundle.name,
        price: bundle.price,
        coins: bundle.coins,
        quantity,
        totalCoins: coinsToAdd,
        totalPrice,
      });

      logger.info(
        `✅ User ${user.id} purchased ${quantity}x ${bundle.name} — ${coinsToAdd} coins ($${totalPrice}).`
      );
    }

    // Apply promo logic here (if needed)
    if (promoCode) {
      logger.info(`Promo code applied: ${promoCode}`);
      // Apply discounts, bonus coins, etc.
    }

    return res.json({
      success: true,
      message: 'Bundles purchased successfully',
      data: {
        purchasedBundles,
        totalCoins,
        totalAmountUsd,
        newBalance: (await WalletService.getWallet(user.id)).balance,
      },
    });
  } catch (error) {
    logger.error('❌ Error processing multiple bundle purchase:', error);
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
}

module.exports = new PaymentController();

