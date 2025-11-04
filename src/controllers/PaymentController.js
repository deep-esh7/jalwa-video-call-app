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
   * Dummy deposit endpoint (for testing without Stripe)
   * POST /api/payments/deposit
   * Body: { amount }
   */
  async dummyDeposit(req, res, next) {
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

      const { amount } = req.body;

      if (!amount) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
          success: false,
          message: 'Amount is required',
        });
      }

      const amountNumber = parseFloat(amount);
      if (isNaN(amountNumber) || amountNumber <= 0) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
          success: false,
          message: 'Amount must be a positive number',
        });
      }

      // Convert amount to coins (1 USD = 1 coin)
      const coins = Math.floor(amountNumber);

      // Get or create wallet
      await WalletService.getOrCreateWallet(user.id);

      // Credit coins to wallet
      const result = await WalletService.credit(
        user.id,
        coins,
        'deposit',
        `Dummy deposit: $${amountNumber} = ${coins} coins`,
        {
          amountUsd: amountNumber,
          method: 'dummy',
          timestamp: new Date().toISOString(),
        }
      );

      logger.info(`✅ Dummy deposit: User ${user.id} credited ${coins} coins. New balance: ${result.wallet.balance}`);

      return res.json({
        success: true,
        message: 'Deposit successful',
        data: {
          amountUsd: amountNumber,
          coinsAdded: coins,
          newBalance: result.wallet.balance,
          transaction: result.transaction,
        },
      });
    } catch (error) {
      logger.error('Error processing dummy deposit:', error);
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

