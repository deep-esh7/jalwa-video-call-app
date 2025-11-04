// src/services/PaymentService.js
const Stripe = require('stripe');
const { PrismaClient } = require('@prisma/client');
const logger = require('../config/logger');
const config = require('../config/environment');
const WalletService = require('./WalletService');

const prisma = new PrismaClient();
const stripe = config.stripeSecretKey ? new Stripe(config.stripeSecretKey) : null;

class PaymentService {
  /**
   * Initialize Stripe
   */
  constructor() {
    if (!stripe) {
      logger.warn('⚠️ Stripe not initialized - STRIPE_SECRET_KEY not configured');
    } else {
      logger.info('✅ Stripe initialized successfully');
    }
  }

  /**
   * Create Stripe checkout session for coin purchase
   * @param {string} userId - User ID
   * @param {number} amount - Amount in USD
   * @param {string} successUrl - Success redirect URL
   * @param {string} cancelUrl - Cancel redirect URL
   * @returns {Promise<Object>} - Checkout session
   */
  async createCheckoutSession(userId, amount, successUrl, cancelUrl) {
    try {
      if (!stripe) {
        throw new Error('Stripe not configured');
      }

      // Validate amount
      if (!amount || amount <= 0) {
        throw new Error('Amount must be greater than 0');
      }

      // Convert amount to coins (1 USD = 1 coin)
      const coins = Math.floor(amount);

      // Get or create Stripe customer
      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user) {
        throw new Error('User not found');
      }

      let stripeCustomerId = null;
      
      // Check if user has a Stripe customer ID in previous payments
      const previousPayment = await prisma.payment.findFirst({
        where: { userId, stripeCustomerId: { not: null } },
        orderBy: { createdAt: 'desc' },
      });

      if (previousPayment?.stripeCustomerId) {
        stripeCustomerId = previousPayment.stripeCustomerId;
      } else {
        // Create new Stripe customer
        const customer = await stripe.customers.create({
          email: user.email,
          name: user.name,
          metadata: {
            userId: user.id,
          },
        });
        stripeCustomerId = customer.id;
        logger.info(`Created Stripe customer: ${stripeCustomerId} for user: ${userId}`);
      }

      // Create checkout session
      const session = await stripe.checkout.sessions.create({
        customer: stripeCustomerId,
        payment_method_types: ['card'],
        line_items: [
          {
            price_data: {
              currency: 'usd',
              product_data: {
                name: `${coins} Coins`,
                description: `Purchase ${coins} coins for Jalwa ($${amount} = ${coins} coins)`,
              },
              unit_amount: Math.round(amount * 100), // Convert to cents
            },
            quantity: 1,
          },
        ],
        mode: 'payment',
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata: {
          userId,
          amount: amount.toString(),
          coins: coins.toString(),
        },
      });

      // Create pending payment record
      await prisma.payment.create({
        data: {
          userId,
          stripeSessionId: session.id,
          amount: amount,
          currency: 'usd',
          coins: coins,
          status: 'pending',
          stripeCustomerId,
          metadata: {
            amountUsd: amount,
            sessionUrl: session.url,
          },
        },
      });

      logger.info(`Created checkout session for user ${userId}: ${session.id} (${amount} USD = ${coins} coins)`);

      return {
        sessionId: session.id,
        sessionUrl: session.url,
        amount: amount,
        coins: coins,
      };
    } catch (error) {
      logger.error('Error creating checkout session:', error);
      throw error;
    }
  }

  /**
   * Handle Stripe webhook events
   * @param {Object} event - Stripe event
   * @returns {Promise<void>}
   */
  async handleWebhookEvent(event) {
    try {
      logger.info(`Processing webhook event: ${event.type}`);

      switch (event.type) {
        case 'checkout.session.completed':
          await this.handleCheckoutSessionCompleted(event.data.object);
          break;

        case 'payment_intent.succeeded':
          await this.handlePaymentIntentSucceeded(event.data.object);
          break;

        case 'payment_intent.payment_failed':
          await this.handlePaymentIntentFailed(event.data.object);
          break;

        case 'charge.refunded':
          await this.handleChargeRefunded(event.data.object);
          break;

        default:
          logger.info(`Unhandled event type: ${event.type}`);
      }
    } catch (error) {
      logger.error('Error handling webhook event:', error);
      throw error;
    }
  }

  /**
   * Handle successful checkout session
   * @param {Object} session - Stripe checkout session
   */
  async handleCheckoutSessionCompleted(session) {
    try {
      const { userId, coins } = session.metadata;
      
      logger.info(`Checkout completed for user ${userId}, session: ${session.id}`);

      // Update payment record
      const payment = await prisma.payment.findUnique({
        where: { stripeSessionId: session.id },
      });

      if (!payment) {
        logger.error(`Payment not found for session: ${session.id}`);
        return;
      }

      // Update payment status
      await prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: 'succeeded',
          stripePaymentId: session.payment_intent,
          paymentMethod: session.payment_method_types?.[0] || 'card',
        },
      });

      // Credit coins to wallet
      await WalletService.credit(
        userId,
        parseInt(coins),
        'deposit',
        `Purchased ${coins} coins via Stripe`,
        {
          paymentId: payment.id,
          stripeSessionId: session.id,
          stripePaymentIntent: session.payment_intent,
        }
      );

      logger.info(`✅ Credited ${coins} coins to user ${userId}`);
    } catch (error) {
      logger.error('Error handling checkout session completed:', error);
      throw error;
    }
  }

  /**
   * Handle successful payment intent
   * @param {Object} paymentIntent - Stripe payment intent
   */
  async handlePaymentIntentSucceeded(paymentIntent) {
    try {
      logger.info(`Payment intent succeeded: ${paymentIntent.id}`);

      // Update payment record if exists
      const payment = await prisma.payment.findFirst({
        where: { stripePaymentId: paymentIntent.id },
      });

      if (payment && payment.status !== 'succeeded') {
        await prisma.payment.update({
          where: { id: payment.id },
          data: { status: 'succeeded' },
        });
      }
    } catch (error) {
      logger.error('Error handling payment intent succeeded:', error);
      throw error;
    }
  }

  /**
   * Handle failed payment intent
   * @param {Object} paymentIntent - Stripe payment intent
   */
  async handlePaymentIntentFailed(paymentIntent) {
    try {
      logger.error(`Payment intent failed: ${paymentIntent.id}`);

      // Update payment record
      const payment = await prisma.payment.findFirst({
        where: { stripePaymentId: paymentIntent.id },
      });

      if (payment) {
        await prisma.payment.update({
          where: { id: payment.id },
          data: { 
            status: 'failed',
            metadata: {
              ...(payment.metadata as object || {}),
              failureReason: paymentIntent.last_payment_error?.message || 'Unknown error',
            },
          },
        });
      }
    } catch (error) {
      logger.error('Error handling payment intent failed:', error);
      throw error;
    }
  }

  /**
   * Handle charge refunded
   * @param {Object} charge - Stripe charge
   */
  async handleChargeRefunded(charge) {
    try {
      logger.info(`Charge refunded: ${charge.id}`);

      // Find payment by payment intent
      const payment = await prisma.payment.findFirst({
        where: { stripePaymentId: charge.payment_intent },
      });

      if (payment) {
        // Update payment status
        await prisma.payment.update({
          where: { id: payment.id },
          data: { status: 'refunded' },
        });

        // Debit coins from wallet
        await WalletService.debit(
          payment.userId,
          payment.coins,
          'refund',
          `Refund for payment ${payment.id}`,
          {
            paymentId: payment.id,
            stripeChargeId: charge.id,
          }
        );

        logger.info(`✅ Refunded ${payment.coins} coins from user ${payment.userId}`);
      }
    } catch (error) {
      logger.error('Error handling charge refunded:', error);
      // Don't throw - refund should not fail
    }
  }

  /**
   * Get payment history for user
   * @param {string} userId - User ID
   * @param {Object} options - Query options
   * @returns {Promise<Object>} - Payment history
   */
  async getPaymentHistory(userId, options = {}) {
    try {
      const { limit = 50, offset = 0, status = null } = options;

      const where = { userId };
      if (status) {
        where.status = status;
      }

      const payments = await prisma.payment.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      });

      const total = await prisma.payment.count({ where });

      return {
        payments,
        total,
        limit,
        offset,
      };
    } catch (error) {
      logger.error('Error getting payment history:', error);
      throw error;
    }
  }

  /**
   * Get payment info - Simple 1:1 conversion
   * @returns {Object} - Payment information
   */
  getPaymentInfo() {
    return {
      conversionRate: '1:1',
      description: '1 USD = 1 Coin',
      minimumAmount: 1,
      currency: 'USD',
    };
  }

  /**
   * Verify Stripe webhook signature
   * @param {string} payload - Request body
   * @param {string} signature - Stripe signature header
   * @returns {Object} - Verified event
   */
  verifyWebhookSignature(payload, signature) {
    try {
      if (!stripe || !config.stripeWebhookSecret) {
        throw new Error('Stripe webhook not configured');
      }

      const event = stripe.webhooks.constructEvent(
        payload,
        signature,
        config.stripeWebhookSecret
      );

      return event;
    } catch (error) {
      logger.error('Error verifying webhook signature:', error);
      throw error;
    }
  }
}

module.exports = new PaymentService();

