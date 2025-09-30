require('dotenv').config({ path: `.env.${process.env.NODE_ENV || 'local'}` });

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const { PrismaClient } = require('@prisma/client');
const Redis = require('ioredis');
const winston = require('winston');
const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');
const serviceAccount = require('./firebase-service-account-key.json');
const verifyToken = require('./middleware/firebaseAuth');

// Initialize Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

// =============================
// Config
// =============================
const ENV = process.env.NODE_ENV || 'local';
const PORT = process.env.PORT || 4000;
const HOST = process.env.HOST || '127.0.0.1';
const DATABASE_URL = process.env.DATABASE_URL;
const REDIS_URL = process.env.REDIS_URL;

// =============================
// Logger Setup
// =============================
const logDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir);
}

const logger = winston.createLogger({
  level: 'debug',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.printf(
      ({ level, message, timestamp }) => `${timestamp} [${level.toUpperCase()}] ${message}`
    )
  ),
  transports: [
    new winston.transports.Console({
      level: ENV === 'production' ? 'info' : 'debug',
    }),
    new winston.transports.File({
      filename: path.join(logDir, 'error.log'),
      level: 'error',
    }),
    new winston.transports.File({
      filename: path.join(logDir, 'combined.log'),
      level: 'info',
    }),
  ],
});

// =============================
// Express + Socket.io
// =============================
const app = express();
app.use(express.json());


const server = http.createServer(app);
const io = socketIo(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

// =============================
// DB Clients
// =============================
const prisma = new PrismaClient();
const redis = new Redis(REDIS_URL);

// =============================
// State
// =============================
const socketConnections = new Map();
const activeRooms = new Map();
const userSockets = new Map();
const ongoingMatching = new Set();

// =============================
// ICE Servers (WebRTC)
// =============================
const iceServers = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  {
    urls: 'turn:relay.metered.ca:443',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
];

// =============================
// Redis Helpers
// =============================
async function setUserAvailable(userId) {
  await redis.sadd('jalwa:available_users', userId);
  await redis.set(`jalwa:user:${userId}:status`, 'online');
  logger.info(`User ${userId} marked available`);
}

async function setUserBusy(userId) {
  await redis.srem('jalwa:available_users', userId);
  await redis.set(`jalwa:user:${userId}:status`, 'busy');
  logger.info(`User ${userId} marked busy`);
}

async function getAvailableUsers() {
  const users = await redis.smembers('jalwa:available_users');
  const alive = users.filter((id) => userSockets.has(id));
  const stale = users.filter((id) => !alive.includes(id));
  if (stale.length > 0) {
    await redis.srem('jalwa:available_users', ...stale);
    stale.forEach((id) => logger.warn(`Removed stale user from Redis: ${id}`));
  }
  return alive;
}


// =============================
// Call Persistence (Postgres)
// =============================
async function createCall(user1Id, user2Id) {
  await ensureUserExists(user1Id);
  await ensureUserExists(user2Id);

  const call = await prisma.call.create({
    data: {
      callerId: user1Id,
      receiverId: user2Id,
      status: 'active',
      startTime: new Date(),
    },
  });
  await setUserBusy(user1Id);
  await setUserBusy(user2Id);
  logger.info(`Call created ${call.id} between ${user1Id} and ${user2Id}`);
  return call;
}



async function ensureUserExists(userId) {
  let user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    user = await prisma.user.create({
      data: { 
        id: userId, 
        name: `User ${userId}`,
        gender: 'MALE',
        role: 'USER',
      },
    });
  }
  return user;
}


async function endSocketCall(roomId) {
  const room = activeRooms.get(roomId);
  if (!room) {
    logger.warn(`No active room found for ${roomId}`);
    return;
  }

  const sockets = io.sockets.adapter.rooms.get(roomId);
  if (sockets) {
    for (const socketId of sockets) {
      const socket = io.sockets.sockets.get(socketId);
      if (socket) {
        socket.leave(roomId);
        socket.emit('call-ended', { roomId, callId: room.callId });
      }
    }
  }

  activeRooms.delete(roomId);
  logger.info(`Room ${roomId} closed and cleaned up`);
}


async function endCall(callId) {
  const call = await prisma.call.update({
    where: { id: callId },
    data: { status: 'ended', endTime: new Date() },
  });
  // mark users available only after call status is updated
  await setUserAvailable(call.callerId);
  await setUserAvailable(call.receiverId);
  logger.info(`Call ended ${callId}`);
  return call;
}

// =============================
// Auto-Matching
// =============================
async function performAutoMatching() {
  try {
    logger.debug('Running auto-matching...');
    const availableUsers = await getAvailableUsers();

    if (!availableUsers || availableUsers.length < 2) {
      logger.debug('Not enough available users for matching');
      return;
    }

    // Query active calls that include any of the available users (one DB call)
    const activeCalls = await prisma.call.findMany({
      where: {
        status: 'active',
        OR: [
          { callerId: { in: availableUsers } },
          { receiverId: { in: availableUsers } },
        ],
      },
      select: { callerId: true, receiverId: true, id: true },
    });

    // Build a set of userIds that are currently in active calls
    const busySet = new Set();
    for (const c of activeCalls) {
      if (c.callerId) busySet.add(c.callerId);
      if (c.receiverId) busySet.add(c.receiverId);
    }

    // Build readyUsers excluding busy users and those already being matched
    const readyUsers = availableUsers.filter(
      (id) => userSockets.has(id) && !ongoingMatching.has(id) && !busySet.has(id)
    );

    if (readyUsers.length < 2) {
      logger.debug('No ready users after filtering busy/ongoing ones');
      return;
    }

    // Use a queue-like process over readyUsers
    while (readyUsers.length >= 2) {
      const user1Id = readyUsers.shift();
      const user2Id = readyUsers.shift();

      // double-check they are valid and still not in ongoingMatching
      if (!user1Id || !user2Id) break;
      if (ongoingMatching.has(user1Id) || ongoingMatching.has(user2Id)) {
        // skip if some race occurred
        continue;
      }

      // mark them as being matched to avoid races
      ongoingMatching.add(user1Id);
      ongoingMatching.add(user2Id);

      const user1SocketId = userSockets.get(user1Id);
      const user2SocketId = userSockets.get(user2Id);
      if (!user1SocketId || !user2SocketId) {
        ongoingMatching.delete(user1Id);
        ongoingMatching.delete(user2Id);
        continue;
      }

      // final DB double-check just before creating call (optional but safer)
      const currentlyActive = await prisma.call.findFirst({
        where: {
          status: 'active',
          OR: [
            { callerId: user1Id },
            { receiverId: user1Id },
            { callerId: user2Id },
            { receiverId: user2Id },
          ],
        },
      });

      if (currentlyActive) {
        // somebody got matched meanwhile — release and continue
        logger.warn(`Race condition: one of the users already in active call, skipping (${user1Id}, ${user2Id})`);
        ongoingMatching.delete(user1Id);
        ongoingMatching.delete(user2Id);
        continue;
      }

      const call = await createCall(user1Id, user2Id);
      const roomId = `room_${call.id}`;
      const user1Socket = io.sockets.sockets.get(user1SocketId);
      const user2Socket = io.sockets.sockets.get(user2SocketId);

      if (user1Socket && user2Socket) {
        user1Socket.join(roomId);
        user2Socket.join(roomId);
        activeRooms.set(roomId, {
          participants: [user1Id, user2Id],
          callId: call.id,
          startTime: new Date(),
        });

        io.to(roomId).emit('call-ready', {
          roomId,
          callId: call.id,
          participants: [
            { userId: user1Id, socketId: user1SocketId },
            { userId: user2Id, socketId: user2SocketId },
          ],
        });

        logger.info(`Auto-match success: ${user1Id} <-> ${user2Id}`);
      } else {
        // if sockets gone, clean up DB call and mark users available again (defensive)
        logger.warn(`Sockets not found for matched users, cleaning up call ${call.id}`);
        await endCall(call.id);
        await endSocketCall(roomId);
      }

      ongoingMatching.delete(user1Id);
      ongoingMatching.delete(user2Id);
    }
  } catch (err) {
    logger.error(`Auto-matching failed: ${err.message}`);
  }
}

// =============================
// Socket Handling
// =============================
io.on('connection', (socket) => {
  logger.info(`Socket connected: ${socket.id}`);

  socket.on('join-firebase', async ({ userId }) => {
    try {
      if (!userId) {
        socket.emit('error', { message: 'User ID required' });
        return;
      }
      socketConnections.set(socket.id, { userId, socketRef: socket });
      userSockets.set(userId, socket.id);
      await setUserAvailable(userId);

      socket.emit('joined', { userId, socketId: socket.id, iceServers });
      logger.info(`User ${userId} joined with socket ${socket.id}`);

      setTimeout(performAutoMatching, 1000);
    } catch (err) {
      logger.error(`Join failed: ${err.message}`);
    }
  });

  socket.on('end-call', async ({ roomId, callId, userId }) => {
    try {
      if (callId) await endCall(callId);
      if (roomId) await endSocketCall(roomId);
      // don't aggressively set available here — endCall already does it after DB update
      // if userId provided and you want to force availability for specific flows, do it carefully
    } catch (err) {
      logger.error(`End call error: ${err.message}`);
    }
  });

  socket.on('get-available-count', async () => {
    const availableUsers = await getAvailableUsers();
    socket.emit('available-count', { count: availableUsers.length });
  });

  socket.on('request-next-user', async ({ userId }) => {
    logger.info(`User ${userId} requested next match`);
    ongoingMatching.delete(userId);
    await setUserAvailable(userId);
    setTimeout(performAutoMatching, 500);
  });

  socket.on('offer', (data) => {
    const { roomId, offer } = data;
    logger.debug(`Offer from ${socket.id} to room ${roomId}`);
    socket.to(roomId).emit('offer', { offer });
  });

  socket.on('answer', (data) => {
    const { roomId, answer } = data;
    logger.debug(`Answer from ${socket.id} to room ${roomId}`);
    socket.to(roomId).emit('answer', { answer });
  });

  socket.on('ice-candidate', (data) => {
    const { roomId, candidate } = data;
    logger.debug(`ICE candidate from ${socket.id} to room ${roomId}`);
    socket.to(roomId).emit('ice-candidate', { candidate });
  });

  socket.on('disconnect', async () => {
    const conn = socketConnections.get(socket.id);
    if (conn) {
      const { userId } = conn;

      // Clean up in-memory maps
      socketConnections.delete(socket.id);
      userSockets.delete(userId);
      ongoingMatching.delete(userId);

      // Mark user offline in Redis
      await redis.srem('jalwa:available_users', userId);
      await redis.set(`jalwa:user:${userId}:status`, 'offline');

      logger.info(`User ${userId} disconnected and marked offline`);

      // 🔥 End active calls if user was in one
      for (const [roomId, room] of activeRooms) {
        if (room.participants.includes(userId)) {
          await endCall(room.callId);
          await endSocketCall(roomId);
        }
      }
    }
  });
}); 



// =============================
// User Endpoints
// =============================

// Delete ALL users (⚠️ secure this in production)
app.delete('/api/users', async (req, res) => {
  try {
    await prisma.call.deleteMany({});   // remove dependent records
    await prisma.user.deleteMany({});   // now safe to delete users
    logger.warn('⚠️ All users and calls deleted from database');
    res.status(200).json({ message: 'All users (and calls) deleted successfully' });
  } catch (error) {
    logger.error(`❌ Failed to delete users: ${error.message}`);
    res.status(500).json({ error: 'Failed to delete users' });
  }
});


// Get user profile by ID
app.get('/api/users/:id', async (req, res) => {
  try {
    const userId = req.params.id;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        photoURL: true,
        gender: true,
        role: true,
        phone: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    return res.json(user);
  } catch (err) {
    logger.error(`❌ Failed to fetch user profile: ${err.message}`);
    return res.status(500).json({ error: 'Failed to fetch user profile' });
  }
});


/**
 * @route GET /api/user/me
 * @desc Get current user's data
 * @access Private (requires valid Firebase token)
 */
app.get('/api/user/me', verifyToken, async (req, res) => {
  try {
    const userId = req.user.uid;
    
    // Get user data from Firebase
    const userRecord = await admin.auth().getUser(userId);
    
    logger.info(`✅ Fetched user profile: ${userRecord}`);
    
    res.json({
      success: true,
      data: {
        uid: userRecord.uid,
        email: userRecord.email,
        emailVerified: userRecord.emailVerified,
        displayName: userRecord.displayName,
        photoURL: userRecord.photoURL,
        phoneNumber: userRecord.phoneNumber,
        // Include additional user data from your database here
        // ...userData
      }
    });
  } catch (error) {
    console.error('Error fetching user data:', error);
    res.status(400).json({
      success: false,
      message: 'Error fetching user data',
      error: error.message
    });
  }
});


app.get('/api/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    // log the request here 
    logger.info(`fetch user profile: ${userId}`);
    
    // Get user data from Firebase
    const userRecord = await admin.auth().getUser(userId);
    
    // Get public user data from your database if needed
    // const userData = await prisma.user.findUnique({ 
    //   where: { id: userId },
    //   select: { /* public fields only */ }
    // });
    
    res.json({
      success: true,
      data: {
        uid: userRecord.uid,
        displayName: userRecord.displayName,
        photoURL: userRecord.photoURL,
        // Include public user data from your database here
        // ...userData
      }
    });
  } catch (error) {
    console.error('Error fetching user data:', error);
    res.status(400).json({
      success: false,
      message: 'Error fetching user data',
      error: error.message
    });
  }
});

app.get('/health', async (req, res) => {
   try { 
    const availableUsers = await getAvailableUsers(); 
    res.json({ 
      status: 'healthy', 
      socketConnections: socketConnections.size, 
      activeRooms: activeRooms.size, 
      availableUsers: availableUsers.length, 
      ongoingMatching: ongoingMatching.size, 
      uptime: process.uptime(), 
      iceServersCount: iceServers.length, 
      firebaseConnected: true 
    }); 
  } catch (error) { 
    res.status(500).json({ 
      status: 'error', error: 
      error.message, 
      firebaseConnected: false 
    }); 
  } 
});


// Sync (upsert) a user
// app.post('/api/users/sync', async (req, res) => {
//   try {
//     const { uid, name, email, photoURL, gender, role, phone } = req.body;

//     if (!uid) {
//       return res.status(400).json({ error: 'uid is required' });
//     }

//     const user = await prisma.user.upsert({
//       where: { id: uid },
//       update: {
//         name,
//         email,
//         photoURL,
//         phone,
//         updatedAt: new Date(),
//       },
//       create: {
//         id: uid,
//         name: name || `User ${uid}`,
//         email,
//         photoURL,
//         gender: gender || 'MALE',
//         role: role && role.toUpperCase() === 'ADMIN' ? 'ADMIN' : 'USER', // prevent privilege escalation
//         phone,
//         createdAt: new Date(),
//         updatedAt: new Date(),
//       },
//     });

//     logger.info(`✅ Synced user profile: ${uid}`);
//     return res.json(user);
//   } catch (err) {
//     logger.error(`❌ Failed to sync user: ${err.message}`);
//     return res.status(500).json({ error: 'Failed to sync user' });
//   }
// });


// =============================
// Start Server
// =============================
server.listen(PORT, HOST, () => {
  logger.info(`🚀 Jalwa Server running on http://${HOST}:${PORT} [${ENV}]`);
  logger.info(`DB: ${DATABASE_URL}`);
  logger.info(`Redis: ${REDIS_URL}`);
});
