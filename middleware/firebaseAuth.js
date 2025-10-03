const admin = require('firebase-admin');
const { PrismaClient } = require('@prisma/client');

// Verify and decode Firebase token
const verifyAndDecodeToken = async (idToken) => {
  try {
    return await admin.auth().verifyIdToken(idToken);
  } catch (error) {
    console.error('Error verifying token:', error);
    throw new Error('Invalid or expired token');
  }
};

// Middleware to verify token and attach user to request
const verifyToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ 
      success: false, 
      message: 'No token provided' 
    });
  }

  const idToken = authHeader.split('Bearer ')[1];
  
  try {
    const decodedToken = await verifyAndDecodeToken(idToken);
    req.user = decodedToken;
    next();
  } catch (error) {
    return res.status(401).json({ 
      success: false, 
      message: error.message,
      error: error.message 
    });
  }
};

// Function to get or create user from token
const getUserFromToken = async (idToken) => {
  const decodedToken = await verifyAndDecodeToken(idToken);
  const prisma = new PrismaClient();
  
  try {
    // Check if user exists
    let user = await prisma.user.findUnique({
      where: { id: decodedToken.uid }
    });

    // If user doesn't exist, create them
    if (!user) {
      user = await prisma.user.create({
        data: {
          id: decodedToken.uid,
          name: decodedToken.name || 'Anonymous',
          email: decodedToken.email || null,
          photoURL: decodedToken.picture || null,
          phone: decodedToken.phone_number || null,
          gender: 'unspecified',
          role: 'user',
          createdAt: new Date(),
          updatedAt: new Date()
        }
      });
    }
    
    return user;
  } finally {
    await prisma.$disconnect();
  }
};

module.exports = {
  verifyToken,
  verifyAndDecodeToken,
  getUserFromToken
};
