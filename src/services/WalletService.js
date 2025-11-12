// src/services/WalletService.js
const { PrismaClient } = require('@prisma/client');
const logger = require('../config/logger');

const prisma = new PrismaClient();

class WalletService {
  /**
   * Get or create wallet for user
   * @param {string} userId - User ID
   * @returns {Promise<Object>} - Wallet object
   */
  async getOrCreateWallet(userId) {
    try {
      let wallet = await prisma.wallet.findUnique({
        where: { userId },
      });

      if (!wallet) {
        wallet = await prisma.wallet.create({
          data: {
            userId,
            balance: 0,
          },
        });
        logger.info(`Created wallet for user: ${userId}`);
      }

      return wallet;
    } catch (error) {
      logger.error('Error getting/creating wallet:', error);
      throw error;
    }
  }

  /**
   * Get wallet balance
   * @param {string} userId - User ID
   * @returns {Promise<number>} - Wallet balance
   */
  async getBalance(userId) {
    try {
      const wallet = await this.getOrCreateWallet(userId);
      return wallet.balance;
    } catch (error) {
      logger.error('Error getting balance:', error);
      throw error;
    }
  }

  /**
   * Credit coins to wallet (with transaction record)
   * @param {string} userId - User ID
   * @param {number} amount - Amount to credit
   * @param {string} type - Transaction type
   * @param {string} description - Transaction description
   * @param {Object} metadata - Additional metadata
   * @returns {Promise<Object>} - Updated wallet and transaction
   */
  async credit(userId, amount, type = 'deposit', description = null, metadata = null) {
    try {
      // Use transaction to ensure atomicity
      const result = await prisma.$transaction(async (tx) => {
        // Get current wallet
        const wallet = await tx.wallet.findUnique({
          where: { userId },
        });

        if (!wallet) {
          throw new Error('Wallet not found');
        }

        const balanceBefore = wallet.balance;
        const balanceAfter = balanceBefore + amount;

        // Update wallet
        const updatedWallet = await tx.wallet.update({
          where: { userId },
          data: { balance: balanceAfter },
        });

        // Create transaction record
        const transaction = await tx.transaction.create({
          data: {
            userId,
            type,
            amount,
            balanceBefore,
            balanceAfter,
            status: 'completed',
            description,
            metadata,
          },
        });

        return { wallet: updatedWallet, transaction };
      });

      logger.info(`Credited ${amount} coins to user ${userId}. New balance: ${result.wallet.balance}`);
      return result;
    } catch (error) {
      logger.error('Error crediting wallet:', error);
      throw error;
    }
  }

  /**
   * Debit coins from wallet (with transaction record)
   * @param {string} userId - User ID
   * @param {number} amount - Amount to debit
   * @param {string} type - Transaction type
   * @param {string} description - Transaction description
   * @param {Object} metadata - Additional metadata
   * @returns {Promise<Object>} - Updated wallet and transaction
   */
  async debit(userId, amount, type = 'withdrawal', description = null, metadata = null) {
    try {
      // Use transaction to ensure atomicity
      const result = await prisma.$transaction(async (tx) => {
        // Get current wallet
        const wallet = await tx.wallet.findUnique({
          where: { userId },
        });

        if (!wallet) {
          throw new Error('Wallet not found');
        }

        const balanceBefore = wallet.balance;

        // Check sufficient balance
        if (balanceBefore < amount) {
          throw new Error(`Insufficient balance. Current: ${balanceBefore}, Required: ${amount}`);
        }

        const balanceAfter = balanceBefore - amount;

        // Update wallet
        const updatedWallet = await tx.wallet.update({
          where: { userId },
          data: { balance: balanceAfter },
        });

        // Create transaction record
        const transaction = await tx.transaction.create({
          data: {
            userId,
            type,
            amount: -amount, // Negative for debit
            balanceBefore,
            balanceAfter,
            status: 'completed',
            description,
            metadata,
          },
        });

        return { wallet: updatedWallet, transaction };
      });

      logger.info(`Debited ${amount} coins from user ${userId}. New balance: ${result.wallet.balance}`);
      return result;
    } catch (error) {
      logger.error('Error debiting wallet:', error);
      throw error;
    }
  }

  /**
   * Get transaction history for user
   * @param {string} userId - User ID
   * @param {Object} options - Query options (limit, offset, type)
   * @returns {Promise<Array>} - Transaction history
   */
  async getTransactionHistory(userId, options = {}) {
    try {
      const { limit = 50, offset = 0, type = null } = options;

      const where = { userId };
      if (type) {
        where.type = type;
      }

      const transactions = await prisma.transaction.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      });

      const total = await prisma.transaction.count({ where });

      return {
        transactions,
        total,
        limit,
        offset,
      };
    } catch (error) {
      logger.error('Error getting transaction history:', error);
      throw error;
    }
  }

  /**
   * Get wallet summary with recent transactions
   * @param {string} userId - User ID
   * @returns {Promise<Object>} - Wallet summary
   */
  async getWalletSummary(userId) {
    try {
      const wallet = await this.getOrCreateWallet(userId);
      
      const recentTransactions = await prisma.transaction.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 10,
      });

      // Get statistics
      const [deposits, withdrawals, expenses] = await Promise.all([
        prisma.transaction.aggregate({
          where: { userId, type: 'deposit', status: 'completed' },
          _sum: { amount: true },
        }),
        prisma.transaction.aggregate({
          where: { userId, type: 'withdrawal', status: 'completed' },
          _sum: { amount: true },
        }),
        prisma.transaction.aggregate({
          where: { 
            userId, 
            type: { in: ['call_charge', 'gift_sent'] }, 
            status: 'completed' 
          },
          _sum: { amount: true },
        }),
      ]);

      return {
        balance: wallet.balance,
        totalDeposits: Math.abs(deposits._sum.amount || 0),
        totalWithdrawals: Math.abs(withdrawals._sum.amount || 0),
        totalExpenses: Math.abs(expenses._sum.amount || 0),
        recentTransactions,
        updatedAt: wallet.updatedAt,
      };
    } catch (error) {
      logger.error('Error getting wallet summary:', error);
      throw error;
    }
  }

  /**
   * Get purchased bundle history for user
   * @param {string} userId - User ID
   * @param {Object} options - Query options (limit, offset)
   * @returns {Promise<Object>} - Purchased bundle history
   */
  async getPurchasedBundles(userId, options = {}) {
    try {
      const { limit = 50, offset = 0 } = options;

      // Get all deposit transactions that have bundle information in metadata
      const transactions = await prisma.transaction.findMany({
        where: {
          userId,
          type: 'deposit',
          status: 'completed',
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      });

      // Filter transactions that have bundle information and format the response
      const bundlePurchases = transactions
        .filter(tx => tx.metadata && typeof tx.metadata === 'object' && tx.metadata.bundleId)
        .map(tx => {
          const metadata = tx.metadata;
          return {
            id: tx.id,
            bundleId: metadata.bundleId,
            bundleName: metadata.bundleName,
            quantity: metadata.quantity || 1,
            coinsReceived: metadata.coins || tx.amount,
            amountPaid: metadata.amountUsd,
            purchaseDate: metadata.purchaseDate || tx.createdAt,
            transactionId: tx.id,
            description: tx.description,
            createdAt: tx.createdAt,
          };
        });

      // Get total count of bundle purchases
      const allTransactions = await prisma.transaction.findMany({
        where: {
          userId,
          type: 'deposit',
          status: 'completed',
        },
        select: {
          metadata: true,
        },
      });

      const total = allTransactions.filter(
        tx => tx.metadata && typeof tx.metadata === 'object' && tx.metadata.bundleId
      ).length;

      // Calculate statistics
      const totalCoinsFromBundles = bundlePurchases.reduce(
        (sum, purchase) => sum + (purchase.coinsReceived || 0), 
        0
      );
      const totalAmountSpent = bundlePurchases.reduce(
        (sum, purchase) => sum + (purchase.amountPaid || 0), 
        0
      );

      return {
        purchases: bundlePurchases,
        total,
        limit,
        offset,
        statistics: {
          totalPurchases: total,
          totalCoinsFromBundles,
          totalAmountSpent: parseFloat(totalAmountSpent.toFixed(2)),
        },
      };
    } catch (error) {
      logger.error('Error getting purchased bundles:', error);
      throw error;
    }
  }

  /**
   * Get wallet object
   * @param {string} userId - User ID
   * @returns {Promise<Object>} - Wallet object
   */
  async getWallet(userId) {
    try {
      return await this.getOrCreateWallet(userId);
    } catch (error) {
      logger.error('Error getting wallet:', error);
      throw error;
    }
  }
}

module.exports = new WalletService();

