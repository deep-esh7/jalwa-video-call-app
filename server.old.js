// server.js (updated)
// Full file - includes new socket events: toggle-matching, match-request, match-accepted, match-declined, no-users-available handling.

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
  const isMember = await redis.sismember('jalwa:available_users', userId);

  if (isMember) {
    // User is already marked as available, so skip re-adding
    const currentStatus = await redis.get(`jalwa:user:${userId}:status`);
    if (currentStatus !== 'online') {
      await redis.set(`jalwa:user:${userId}:status`, 'online');
      logger.info(`User ${userId} status corrected to online`);
    } else {
      logger.debug(`User ${userId} already available, skipping duplicate entry`);
    }
    return;
  }

  // Otherwise, add them to the available set
  await redis.sadd('jalwa:available_users', userId);
  await redis.set(`jalwa:user:${userId}:status`, 'online');
  logger.info(`✅ User ${userId} marked available`);
}

async function setUserBusy(userId) {
  const isMember = await redis.sismember('jalwa:available_users', userId);

  if (!isMember) {
    logger.debug(`User ${userId} already busy, skipping removal`);
  } else {
    await redis.srem('jalwa:available_users', userId);
    logger.info(`User ${userId} removed from available list`);
  }

  await redis.set(`jalwa:user:${userId}:status`, 'busy');
  logger.info(`User ${userId} marked busy`);
}

async function isAutoMatchingEnabled(userId) {
  try {
    const v = await redis.get(`jalwa:user:${userId}:auto_matching`);
    // default is enabled unless explicitly 'false'
    return v !== 'false';
  } catch (e) {
    logger.warn(`Failed to read auto-matching flag for ${userId}: ${e.message}`);
    return true;
  }
}

async function getAvailableUsers() {
  const users = await redis.smembers('jalwa:available_users');
  // filter out sockets that are not connected and users who disabled auto-matching
  const alive = [];
  const stale = [];

  for (const id of users) {
    if (!userSockets.has(id)) {
      stale.push(id);
      continue;
    }
    // verify auto-matching preference
    // users who explicitly turned off auto-matching should not be part of auto-match pool
    // Note: getAvailableUsers is used by auto-matching — so respect auto_matching flag
    // It's ok to await per-user here; for large scale you'd want a better approach
    // (e.g., maintain a separate Redis set of auto-enabled users).
    // For now this keeps correctness.
    // eslint-disable-next-line no-await-in-loop
    const enabled = await isAutoMatchingEnabled(id);
    if (!enabled) {
      // skip — but do not remove from available set: they might still be "available" but not auto-matchable
      logger.debug(`User ${id} is available but auto-matching is disabled; filtering out.`);
      continue;
    }
    alive.push(id);
  }

  if (stale.length > 0) {
    await redis.srem('jalwa:available_users', ...stale);
    stale.forEach((id) => logger.warn(`Removed stale user from Redis: ${id}`));
  }
  return alive;
}

async function cleanupStaleCalls() {
  const activeCalls = await prisma.call.findMany({ where: { status: 'active' } });
  let cleaned = 0;

  for (const call of activeCalls) {
    const { callerId, receiverId } = call;
    const callerConnected = userSockets.has(callerId);
    const receiverConnected = userSockets.has(receiverId);

    if (!callerConnected && !receiverConnected) {
      await prisma.call.update({
        where: { id: call.id },
        data: { status: 'ended', endTime: new Date() },
      });
      cleaned++;
    }
  }

  if (cleaned > 0) {
    logger.warn(`🧹 Cleaned up ${cleaned} stale active calls`);
  }
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
    if (!availableUsers || availableUsers.length < 1) {
      logger.debug('Not enough available users for matching');
      return;
    }

    // Query active calls that include any of the available users
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

    // ✅ Initialize busySet *before* logging
    const busySet = new Set();
    for (const c of activeCalls) {
      const callerOnline = userSockets.has(c.callerId);
      const receiverOnline = userSockets.has(c.receiverId);

      // only consider active calls where at least one user is still connected
      if (callerOnline || receiverOnline) {
        if (c.callerId) busySet.add(c.callerId);
        if (c.receiverId) busySet.add(c.receiverId);
      } else {
        await prisma.call.update({
          where: { id: c.id },
          data: { status: 'ended', endTime: new Date() },
        });
        logger.warn(`🧹 Auto-cleaned stale call ${c.id}`);
      }
    }

    logger.debug(`Available users: ${availableUsers.length}`);
    logger.debug(`Busy users: ${busySet.size}`);
    logger.debug(`Ongoing matching users: ${ongoingMatching.size}`);

    // Filter ready users
    const readyUsers = availableUsers.filter(
      (id) => userSockets.has(id) && !ongoingMatching.has(id) && !busySet.has(id)
    );

    if (readyUsers.length < 2) {
      logger.debug('No ready users after filtering busy/ongoing ones');
      return;
    }

    // Proceed with pairing logic
    while (readyUsers.length >= 2) {
      const user1Id = readyUsers.shift();
      const user2Id = readyUsers.shift();

      if (!user1Id || !user2Id) break;
      if (ongoingMatching.has(user1Id) || ongoingMatching.has(user2Id)) continue;

      ongoingMatching.add(user1Id);
      ongoingMatching.add(user2Id);

      const user1SocketId = userSockets.get(user1Id);
      const user2SocketId = userSockets.get(user2Id);

      if (!user1SocketId || !user2SocketId) {
        ongoingMatching.delete(user1Id);
        ongoingMatching.delete(user2Id);
        continue;
      }

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
        logger.warn(
          `Race condition: one of the users already in active call, skipping (${user1Id}, ${user2Id})`
        );
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
          isInitiator: user1Id === call.callerId,
          participants: [
            { userId: user1Id, socketId: user1SocketId },
            { userId: user2Id, socketId: user2SocketId },
          ],
        });

        logger.info(`Auto-match success: ${user1Id} <-> ${user2Id}`);
      } else {
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

// -----------------------------
// Manual match attempt helper
// -----------------------------
async function findPartnerForUser(requesterId) {
  // Get auto-enabled available users (excluding requester)
  const available = await getAvailableUsers();
  const candidates = available.filter((id) => id !== requesterId && userSockets.has(id) && !ongoingMatching.has(id));
  if (candidates.length === 0) return null;
  // simplest: pick first candidate
  return candidates[0];
}

// =============================
// Socket Handling
// =============================
io.on('connection', (socket) => {
  logger.info(`🔌 New connection: ${socket.id}`);

  socket.on('user-available', async ({ userId }) => {
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

      await cleanupStaleCalls();
    } catch (err) {
      logger.error(`Join failed: ${err.message}`);
    }
  });

  // Toggle whether the user participates in auto-matching
  socket.on('toggle-matching', async ({ userId, enabled }) => {
    try {
      logger.info(`Request to toggle matching for user ${userId}: ${enabled}`);
      if (!userId) {
        socket.emit('error', { message: 'User ID required for toggle-matching' });
        return;
      }
      // enabled true/false; store as 'true' or 'false' string
      await redis.set(`jalwa:user:${userId}:auto_matching`, enabled ? 'true' : 'false');
      logger.info(`User ${userId} auto-matching set to ${enabled}`);
      socket.emit('toggle-matching-ack', { userId, enabled });
    } catch (err) {
      logger.error(`toggle-matching failed for ${userId}: ${err.message}`);
    }
  });


  // =============================
// Handle explicit call end
// =============================
socket.on('end-call', async ({ roomId, callId, userId }) => {
  try {
    logger.info(`📞 end-call received: roomId=${roomId}, callId=${callId}, userId=${userId}`);

    // 1️⃣ End DB call
    if (callId) {
      const existingCall = await prisma.call.findUnique({ where: { id: callId } });
      if (existingCall && existingCall.status === 'active') {
        await prisma.call.update({
          where: { id: callId },
          data: { status: 'ended', endTime: new Date() },
        });
        logger.info(`✅ Call ${callId} marked ended by ${userId}`);
      }
    }

    // 2️⃣ Clean up active room if exists
    if (roomId && activeRooms.has(roomId)) {
      const room = activeRooms.get(roomId);
      const participants = room.participants || [];

      for (const uid of participants) {
        await setUserAvailable(uid);
      }

      // Notify both users that the call ended
      io.to(roomId).emit('call-ended', {
        roomId,
        callId,
        endedBy: userId,
      });

      // Remove users from the room and cleanup
      for (const socketId of io.sockets.adapter.rooms.get(roomId) || []) {
        const s = io.sockets.sockets.get(socketId);
        if (s) s.leave(roomId);
      }
      activeRooms.delete(roomId);
      logger.info(`🧹 Room ${roomId} closed, participants freed`);
    } else {
      // fallback: free user directly if room info missing
      if (userId) {
        await setUserAvailable(userId);
        logger.info(`Freed user ${userId} (no active room found)`);
      }
    }

    // 3️⃣ Broadcast a cleanup event
    socket.emit('end-call-ack', { callId, roomId, success: true });

  } catch (err) {
    logger.error(`❌ end-call handler failed: ${err.message}`);
    socket.emit('end-call-ack', { success: false, error: err.message });
  }
});


  // Manual match request: client asks to find a partner now
  socket.on('match-request', async ({ userId }) => {
    try {
      if (!userId) {
        socket.emit('error', { message: 'User ID required for match-request' });
        return;
      }

      logger.info(`User ${userId} requested manual match`);

      // ensure requester is available
      await setUserAvailable(userId);
      ongoingMatching.delete(userId); // ensure not blocked

      const partnerId = await findPartnerForUser(userId);
      if (!partnerId) {
        socket.emit('no-users-available', { message: 'No users available right now' });
        logger.debug(`No partner found for manual request by ${userId}`);
        return;
      }

      // mark both as matching
      ongoingMatching.add(userId);
      ongoingMatching.add(partnerId);

      // double-check sockets
      const partnerSocketId = userSockets.get(partnerId);
      const requesterSocketId = userSockets.get(userId);
      if (!partnerSocketId || !requesterSocketId) {
        ongoingMatching.delete(userId);
        ongoingMatching.delete(partnerId);
        socket.emit('no-users-available', { message: 'Partner disconnected' });
        return;
      }

      // ensure neither is in an active call now
      const currentlyActive = await prisma.call.findFirst({
        where: {
          status: 'active',
          OR: [
            { callerId: userId },
            { receiverId: userId },
            { callerId: partnerId },
            { receiverId: partnerId },
          ],
        },
      });
      if (currentlyActive) {
        ongoingMatching.delete(userId);
        ongoingMatching.delete(partnerId);
        socket.emit('no-users-available', { message: 'Partner busy' });
        return;
      }

      // create DB call and emit call-ready to both
      const call = await createCall(userId, partnerId);
      const roomId = `room_${call.id}`;
      const requesterSocket = io.sockets.sockets.get(requesterSocketId);
      const partnerSocket = io.sockets.sockets.get(partnerSocketId);

      if (requesterSocket && partnerSocket) {
        requesterSocket.join(roomId);
        partnerSocket.join(roomId);
        activeRooms.set(roomId, {
          participants: [userId, partnerId],
          callId: call.id,
          startTime: new Date(),
        });

        io.to(roomId).emit('call-ready', {
          roomId,
          callId: call.id,
          isInitiator: userId === call.callerId,
          participants: [
            { userId, socketId: requesterSocketId },
            { userId: partnerId, socketId: partnerSocketId },
          ],
        });

        logger.info(`Manual-match success: ${userId} <-> ${partnerId}`);
      } else {
        logger.warn(`Manual-match sockets missing, cleaning up call ${call.id}`);
        await endCall(call.id);
        await endSocketCall(roomId);
      }

      ongoingMatching.delete(userId);
      ongoingMatching.delete(partnerId);
    } catch (err) {
      logger.error(`match-request failed: ${err.message}`);
      socket.emit('no-users-available', { message: 'Server error during matching' });
    }
  });

  // When a client accepts a match (optional: we relay to the other party/room)
  socket.on('match-accepted', async ({ roomId, callId, fromUserId, toUserId }) => {
    try {
      logger.info(`match-accepted from ${fromUserId} for call ${callId}`);
      // Relay to others in the room if present
      if (roomId) {
        socket.to(roomId).emit('match-accepted', { roomId, callId, fromUserId, toUserId });
      } else if (callId) {
        // find roomId by activeRooms mapping
        for (const [rId, room] of activeRooms) {
          if (room.callId === callId) {
            io.to(rId).emit('match-accepted', { roomId: rId, callId, fromUserId, toUserId });
            break;
          }
        }
      }
    } catch (err) {
      logger.error(`match-accepted handler error: ${err.message}`);
    }
  });

  socket.on('user-unavailable', async ({ userId }) => {
    try {
      if (!userId) return socket.emit('error', { message: 'User ID required' });
  
      // Remove from available pool
      await redis.srem('jalwa:available_users', userId);
      await redis.set(`jalwa:user:${userId}:status`, 'offline');
  
      logger.info(`🚫 User ${userId} marked unavailable via client`);
      socket.emit('user-unavailable-ack', { userId, status: 'offline' });
    } catch (err) {
      logger.error(`user-unavailable failed for ${userId}: ${err.message}`);
    }
  });
  

  // When a client declines a match, end call and free other user
  socket.on('match-declined', async ({ roomId, callId, fromUserId }) => {
    try {
      logger.info(`match-declined from ${fromUserId} for call ${callId || roomId}`);
      if (callId) {
        // end DB call and mark participants available
        const call = await prisma.call.findUnique({ where: { id: callId } });
        if (call && call.status === 'active') {
          await prisma.call.update({
            where: { id: callId },
            data: { status: 'ended', endTime: new Date() },
          });
          // mark participants available
          await setUserAvailable(call.callerId);
          await setUserAvailable(call.receiverId);
          logger.info(`Call ${callId} ended due to decline by ${fromUserId}`);
        }
      }

      if (roomId) {
        await endSocketCall(roomId);
      }
    } catch (err) {
      logger.error(`match-declined handler failed: ${err.message}`);
    }
  });

  // existing get available count handler (keeps enum naming)
  socket.on('get-available-count', async () => {
    try {
      logger.info(`[get-available-count] Request from socket ${socket.id}`);
  
      // 1️⃣ Get IDs of available users
      const availableUsers = await getAvailableUsers();
      const count = availableUsers.length;
  
      // 2️⃣ Fetch their basic details from Postgres
      let users = [];
      if (count > 0) {
        users = await prisma.user.findMany({
          where: { id: { in: availableUsers } },
          select: {
            id: true,
            name: true,
            gender: true,
            role: true,
            createdAt: true,
          },
        });
      }
  
      // 3️⃣ Emit structured data back to client
      socket.emit('available-users', {
        count,
        users,
      });
  
      logger.debug(`[get-available-count] Returned ${count} users`);
    } catch (err) {
      logger.error(`❌ get-available-count failed: ${err.message}`);
      socket.emit('error', { message: 'Failed to fetch available users' });
    }
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

  socket.on('force-available', async ({ userId }) => {
    try {
      if (!userId) {
        socket.emit('error', { message: 'User ID required for force-available' });
        return;
      }
  
      // 🧹 Remove user from all maps and ongoing sets
      ongoingMatching.delete(userId);
  
      // 🧹 End any active calls involving this user
      const activeCalls = await prisma.call.findMany({
        where: {
          status: 'active',
          OR: [{ callerId: userId }, { receiverId: userId }],
        },
      });
  
      for (const call of activeCalls) {
        await prisma.call.update({
          where: { id: call.id },
          data: { status: 'ended', endTime: new Date() },
        });
        logger.warn(`🧹 Force-ended stuck call ${call.id} for user ${userId}`);
      }
  
      // 🧹 Clean from all rooms
      for (const [roomId, room] of activeRooms) {
        if (room.participants.includes(userId)) {
          await endSocketCall(roomId);
        }
      }
  
      // 🧹 Reset Redis state to “available” and enable auto-matching
      await redis.sadd('jalwa:available_users', userId);
      await redis.set(`jalwa:user:${userId}:status`, 'online');
      await redis.set(`jalwa:user:${userId}:auto_matching`, 'true');
  
      // 🧹 Ensure socket is registered
      const socketId = userSockets.get(userId);
      if (socketId) {
        const userSocket = io.sockets.sockets.get(socketId);
        if (userSocket) {
          userSocket.emit('freed', { userId });
          logger.info(`✅ User ${userId} forcibly freed and marked available`);
        }
      }
  
      // ✅ Trigger rematching right away
      setTimeout(performAutoMatching, 500);
    } catch (err) {
      logger.error(`Force-free failed for ${userId}: ${err.message}`);
    }
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
 * @route   GET /api/user/me
 * @desc    Get current user profile, create user in database if not exists
 * @access  Private (requires valid Firebase token)
 */
app.get('/api/user/me', async (req, res) => {
  try {
    logger.info('Received request to /api/user/me');
    
    const authHeader = req.headers.authorization;
    logger.debug('Auth header:', authHeader ? 'Present' : 'Missing');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      logger.warn('No Bearer token provided');
      return res.status(401).json({ 
        success: false, 
        message: 'No token provided' 
      });
    }

    const idToken = authHeader.split('Bearer ')[1];
    logger.debug('Extracted token');
    
    try {
      const { getUserFromToken } = require('./middleware/firebaseAuth');
      logger.debug('Getting user from token...');
      
      // This will verify the token and get/create user in one step
      const user = await getUserFromToken(idToken);
      
      if (!user) {
        throw new Error('Failed to get or create user');
      }
      
      logger.info(`✅ Fetched/created user: ${user.id}`);
      
      return res.json({
        success: true,
        data: {
          id: user.id,
          name: user.name,
          email: user.email,
          photoURL: user.photoURL,
          phoneNumber: user.phoneNumber,
          gender: user.gender,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt
        }
      });
    } catch (authError) {
      logger.error('Auth error in /api/user/me:', {
        error: authError.message,
        stack: authError.stack
      });
      throw authError;
    }
  } catch (error) {
    logger.error(`❌ Error in /api/user/me: ${error.message}`, {
      stack: error.stack,
      name: error.name,
      code: error.code
    });
    
    const statusCode = error.statusCode || 401;
    res.status(statusCode).json({
      success: false,
      message: 'Authentication failed',
      error: process.env.NODE_ENV === 'prod' 
        ? 'Authentication error' 
        : error.message
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
