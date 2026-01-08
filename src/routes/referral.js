// src/routes/referral.js
const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { body, validationResult } = require('express-validator');
const { v4: uuidv4 } = require('uuid');

const router = express.Router();
const prisma = new PrismaClient();

// Middleware to check if user is authenticated
const isAuthenticated = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
};

// Generate a random referral code
const generateReferralCode = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

// 1. Generate or get user's referral code
router.post('/generate', isAuthenticated, async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Check if user already has a referral code
    let user = await prisma.user.findUnique({
      where: { id: userId },
      select: { referralCode: true }
    });

    // If no referral code exists, generate a new one
    if (!user.referralCode) {
      let isUnique = false;
      let referralCode;
      
      // Ensure the generated code is unique
      while (!isUnique) {
        referralCode = generateReferralCode();
        const existing = await prisma.user.findUnique({
          where: { referralCode },
          select: { id: true }
        });
        if (!existing) isUnique = true;
      }

      // Update user with new referral code
      user = await prisma.user.update({
        where: { id: userId },
        data: { referralCode },
        select: { referralCode: true }
      });
    }

    return res.json({ referralCode: user.referralCode });
  } catch (error) {
    console.error('Error generating referral code:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// 2. Apply a referral code
router.post('/apply', [
  body('referralCode').isString().trim().notEmpty(),
  body('userId').isString().trim().notEmpty()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { referralCode, userId } = req.body;

  try {
    // Find the referrer by referral code
    const referrer = await prisma.user.findUnique({
      where: { referralCode },
      select: { id: true }
    });

    if (!referrer) {
      return res.status(404).json({ error: 'Invalid referral code' });
    }

    // Check if user has already been referred
    const existingReferral = await prisma.referral.findUnique({
      where: { referredUserId: userId }
    });

    if (existingReferral) {
      return res.status(400).json({ error: 'User already has a referral' });
    }

    // Create referral record
    const referral = await prisma.referral.create({
      data: {
        referrerId: referrer.id,
        referredUserId: userId,
        referralCode,
        status: 'PENDING'
      }
    });

    // Create or update referral stats
    await prisma.userReferralStats.upsert({
      where: { userId: referrer.id },
      create: {
        userId: referrer.id,
        totalReferrals: 1,
        activeReferrals: 1
      },
      update: {
        totalReferrals: { increment: 1 },
        activeReferrals: { increment: 1 }
      }
    });

    // Create signup bonus reward
    await prisma.referralReward.create({
      data: {
        referralId: referral.id,
        type: 'SIGNUP_BONUS',
        amount: 100, // Example: 100 coins for signup
        status: 'PENDING'
      }
    });

    return res.json({ success: true, message: 'Referral applied successfully' });
  } catch (error) {
    console.error('Error applying referral code:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// 3. Get user's referral statistics
router.get('/stats', isAuthenticated, async (req, res) => {
  try {
    const userId = req.user.id;
    
    const stats = await prisma.userReferralStats.findUnique({
      where: { userId },
      select: {
        totalReferrals: true,
        activeReferrals: true,
        totalEarnings: true,
        availableBalance: true,
        lastUpdated: true
      }
    });

    // If no stats exist, return default values
    if (!stats) {
      return res.json({
        totalReferrals: 0,
        activeReferrals: 0,
        totalEarnings: 0,
        availableBalance: 0,
        lastUpdated: new Date()
      });
    }

    return res.json(stats);
  } catch (error) {
    console.error('Error fetching referral stats:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// 4. Get referral history
router.get('/history', isAuthenticated, async (req, res) => {
  try {
    const userId = req.user.id;
    
    const referrals = await prisma.referral.findMany({
      where: { referrerId: userId },
      include: {
        referredUser: {
          select: {
            id: true,
            name: true,
            email: true,
            photoURL: true
          }
        },
        rewards: {
          select: {
            id: true,
            type: true,
            amount: true,
            status: true,
            createdAt: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    return res.json({ referrals });
  } catch (error) {
    console.error('Error fetching referral history:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// 5. Claim referral rewards
router.post('/claim', isAuthenticated, async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Find all pending rewards for the user
    const pendingRewards = await prisma.referralReward.findMany({
      where: {
        referral: { referrerId: userId },
        status: 'PENDING'
      }
    });

    if (pendingRewards.length === 0) {
      return res.status(400).json({ error: 'No pending rewards to claim' });
    }

    const totalAmount = pendingRewards.reduce((sum, reward) => sum + reward.amount, 0);

    // Start a transaction to ensure data consistency
    const result = await prisma.$transaction(async (tx) => {
      // Update all pending rewards to CREDITED
      await tx.referralReward.updateMany({
        where: {
          id: { in: pendingRewards.map(r => r.id) },
          status: 'PENDING'
        },
        data: { status: 'CREDITED' }
      });

      // Update user's wallet balance
      await tx.wallet.upsert({
        where: { userId },
        create: {
          userId,
          balance: totalAmount
        },
        update: {
          balance: { increment: totalAmount }
        }
      });

      // Update referral stats
      await tx.userReferralStats.upsert({
        where: { userId },
        create: {
          userId,
          availableBalance: 0,
          totalEarnings: totalAmount
        },
        update: {
          availableBalance: { increment: totalAmount },
          totalEarnings: { increment: totalAmount }
        }
      });

      return { success: true, amount: totalAmount };
    });

    return res.json(result);
  } catch (error) {
    console.error('Error claiming rewards:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
