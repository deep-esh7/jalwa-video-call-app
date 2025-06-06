const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = 4000;
const HOST = '147.93.108.247';

// Middleware
app.use(cors());
app.use(express.json());

// Store connected users and their profiles
const connectedUsers = new Map();
const availableUsers = new Map(); // Users available for matching
const activeMatches = new Map(); // Active video calls
const pendingConnections = new Map(); // Users trying to connect

// ENHANCED STUN/TURN configuration with FREE TURN servers
const iceServers = [
  // STUN servers (for IP discovery)
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun.relay.metered.ca:80' },
  
  // FREE TURN servers (for video relay when P2P fails)
  {
    urls: 'turn:relay.metered.ca:80',
    username: 'openrelayproject',
    credential: 'openrelayproject'
  },
  {
    urls: 'turn:relay.metered.ca:443',
    username: 'openrelayproject', 
    credential: 'openrelayproject'
  },
  {
    urls: 'turn:relay.metered.ca:443?transport=tcp',
    username: 'openrelayproject',
    credential: 'openrelayproject'
  }
];

// Generate random profile data
const generateRandomProfile = () => {
  const firstNames = ['Alex', 'Jordan', 'Casey', 'Riley', 'Avery', 'Quinn', 'Blake', 'Cameron', 'Drew', 'Sage', 'Taylor', 'Morgan', 'Skyler', 'Rowan', 'Phoenix'];
  const interests = ['Travel', 'Music', 'Photography', 'Fitness', 'Cooking', 'Reading', 'Gaming', 'Art', 'Dancing', 'Sports', 'Movies', 'Nature', 'Technology', 'Fashion', 'Yoga'];
  const genders = ['male', 'female'];
  
  const randomName = firstNames[Math.floor(Math.random() * firstNames.length)];
  const randomAge = Math.floor(Math.random() * 15) + 18; // 18-32
  const randomGender = genders[Math.floor(Math.random() * genders.length)];
  const randomInterests = interests.sort(() => 0.5 - Math.random()).slice(0, 3);
  
  return {
    id: Date.now() + Math.random().toString(36),
    name: randomName,
    age: randomAge,
    gender: randomGender,
    interests: randomInterests,
    bio: `Hey! I'm ${randomName}, ${randomAge} years old. Love ${randomInterests.join(', ')}.`,
    avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${randomName}&backgroundColor=b6e3f4,c0aede,d1d4f9`,
    isOnline: true,
    lastSeen: new Date()
  };
};

// Find available user for instant connection
const findAvailableUser = (excludeSocketId) => {
  const available = Array.from(availableUsers.values())
    .filter(user => user.socketId !== excludeSocketId && !pendingConnections.has(user.socketId));
  
  return available.length > 0 ? available[0] : null;
};

// Socket connection handling
io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  // User joins with profile
  socket.on('join', (userData) => {
    const profile = userData || generateRandomProfile();
    profile.socketId = socket.id;
    profile.isOnline = true;
    
    connectedUsers.set(socket.id, profile);
    availableUsers.set(socket.id, profile);
    
    socket.emit('profile-created', profile);
    socket.emit('ice-servers', iceServers);
    
    console.log(`User ${profile.name} joined with ID: ${socket.id}`);
    console.log(`Total connected users: ${connectedUsers.size}`);
  });

  // Get available users (exclude current user and those in calls)
  socket.on('get-matches', () => {
    const currentUser = connectedUsers.get(socket.id);
    if (!currentUser) return;

    const availableMatches = Array.from(availableUsers.values())
      .filter(user => user.socketId !== socket.id && !pendingConnections.has(user.socketId))
      .slice(0, 20); // Get more users for better experience

    socket.emit('potential-matches', availableMatches);
    console.log(`Sent ${availableMatches.length} available users to ${currentUser.name}`);
  });

  // Instant connect - accept match (simplified, no swipe-right needed)
  socket.on('accept-match', (targetUserId) => {
    const currentUser = connectedUsers.get(socket.id);
    const targetUser = Array.from(connectedUsers.values())
      .find(user => user.id === targetUserId);

    if (!currentUser || !targetUser) {
      console.log('Invalid connection attempt: user not found');
      socket.emit('match-sent', { message: 'User not available' });
      return;
    }

    // Check if target user is still available
    if (!availableUsers.has(targetUser.socketId) || pendingConnections.has(targetUser.socketId)) {
      console.log(`${targetUser.name} is no longer available`);
      socket.emit('match-sent', { message: 'User is no longer available' });
      return;
    }

    const roomId = `room_${Date.now()}_${socket.id}`;
    
    console.log(`Creating instant connection between ${currentUser.name} and ${targetUser.name} in room ${roomId}`);
    
    // Mark both users as pending connection
    pendingConnections.set(socket.id, { targetSocketId: targetUser.socketId, roomId });
    pendingConnections.set(targetUser.socketId, { targetSocketId: socket.id, roomId });
    
    // Join both users to the same room
    socket.join(roomId);
    io.sockets.sockets.get(targetUser.socketId)?.join(roomId);

    // Store active match
    activeMatches.set(roomId, {
      user1: currentUser,
      user2: targetUser,
      startTime: new Date()
    });

    // Remove from available users during call
    availableUsers.delete(socket.id);
    availableUsers.delete(targetUser.socketId);

    // Notify both users to start call immediately
    io.to(roomId).emit('call-ready', {
      roomId,
      participants: [currentUser, targetUser]
    });

    console.log(`Active video calls: ${activeMatches.size}`);
  });

  // Swipe right - instant connect to any available user
  socket.on('swipe-right', (targetUserId) => {
    const currentUser = connectedUsers.get(socket.id);
    
    if (!currentUser) {
      console.log('Invalid swipe: user not found');
      return;
    }

    // Find an available user (could be the target or any other available user)
    let targetUser = Array.from(connectedUsers.values()).find(user => user.id === targetUserId);
    
    // If target user is not available, find any available user
    if (!targetUser || !availableUsers.has(targetUser.socketId) || pendingConnections.has(targetUser.socketId)) {
      targetUser = findAvailableUser(socket.id);
    }

    if (!targetUser) {
      console.log('No available users for connection');
      socket.emit('match-found', { message: 'No users available right now' });
      return;
    }

    // Trigger instant connection
    socket.emit('accept-match', targetUser.id);
  });

  // WebRTC signaling
  socket.on('offer', (data) => {
    console.log(`Relaying offer in room ${data.roomId}`);
    socket.to(data.roomId).emit('offer', {
      offer: data.offer,
      from: socket.id
    });
  });

  socket.on('answer', (data) => {
    console.log(`Relaying answer in room ${data.roomId}`);
    socket.to(data.roomId).emit('answer', {
      answer: data.answer,
      from: socket.id
    });
  });

  socket.on('ice-candidate', (data) => {
    socket.to(data.roomId).emit('ice-candidate', {
      candidate: data.candidate,
      from: socket.id
    });
  });

  // Network quality reporting for adaptive bitrate
  socket.on('network-quality', (data) => {
    const { roomId, quality, bitrate, packetLoss, latency } = data;
    
    socket.to(roomId).emit('peer-network-quality', {
      from: socket.id,
      quality,
      bitrate,
      packetLoss,
      latency,
      recommendedBitrate: calculateRecommendedBitrate(quality, packetLoss, latency)
    });
  });

  // End call
  socket.on('end-call', (roomId) => {
    const match = activeMatches.get(roomId);
    if (match) {
      console.log(`Ending video call between ${match.user1.name} and ${match.user2.name}`);
      
      // Clear pending connections
      pendingConnections.delete(match.user1.socketId);
      pendingConnections.delete(match.user2.socketId);
      
      // Return users to available pool
      if (connectedUsers.has(match.user1.socketId)) {
        availableUsers.set(match.user1.socketId, match.user1);
      }
      if (connectedUsers.has(match.user2.socketId)) {
        availableUsers.set(match.user2.socketId, match.user2);
      }
      
      activeMatches.delete(roomId);
      
      io.to(roomId).emit('call-ended');
      
      // Leave room
      const room = io.sockets.adapter.rooms.get(roomId);
      if (room) {
        room.forEach(socketId => {
          io.sockets.sockets.get(socketId)?.leave(roomId);
        });
      }
      
      console.log(`Active video calls: ${activeMatches.size}`);
    }
  });

  // Handle disconnect
  socket.on('disconnect', () => {
    const user = connectedUsers.get(socket.id);
    if (user) {
      console.log(`User ${user.name} disconnected`);
      
      // Clear pending connections
      pendingConnections.delete(socket.id);
      
      // Remove from all collections
      connectedUsers.delete(socket.id);
      availableUsers.delete(socket.id);
      
      // End any active calls
      for (const [roomId, match] of activeMatches.entries()) {
        if (match.user1.socketId === socket.id || match.user2.socketId === socket.id) {
          socket.to(roomId).emit('call-ended', 'peer-disconnected');
          activeMatches.delete(roomId);
          
          // Clear pending for other user and return to available pool
          const otherUserSocketId = match.user1.socketId === socket.id ? 
            match.user2.socketId : match.user1.socketId;
          const otherUser = connectedUsers.get(otherUserSocketId);
          if (otherUser) {
            pendingConnections.delete(otherUserSocketId);
            availableUsers.set(otherUserSocketId, otherUser);
          }
          break;
        }
      }
      
      console.log(`Remaining connected users: ${connectedUsers.size}`);
    }
  });
});

// Calculate recommended bitrate based on network conditions
function calculateRecommendedBitrate(quality, packetLoss, latency) {
  let baseBitrate = 1000; // 1 Mbps base
  
  switch (quality) {
    case 'excellent': baseBitrate = 2000; break;
    case 'good': baseBitrate = 1500; break;
    case 'fair': baseBitrate = 1000; break;
    case 'poor': baseBitrate = 500; break;
    default: baseBitrate = 1000;
  }
  
  if (packetLoss > 5) baseBitrate *= 0.7;
  if (packetLoss > 10) baseBitrate *= 0.5;
  
  if (latency > 200) baseBitrate *= 0.8;
  if (latency > 500) baseBitrate *= 0.6;
  
  return Math.max(baseBitrate, 250);
}

// API endpoints
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    connectedUsers: connectedUsers.size,
    availableUsers: availableUsers.size,
    activeMatches: activeMatches.size,
    pendingConnections: pendingConnections.size,
    uptime: process.uptime(),
    iceServersCount: iceServers.length
  });
});

app.get('/stats', (req, res) => {
  res.json({
    connectedUsers: connectedUsers.size,
    availableUsers: availableUsers.size,
    activeMatches: activeMatches.size,
    pendingConnections: pendingConnections.size,
    serverTime: new Date().toISOString(),
    iceServers: iceServers
  });
});

// Get all connected users (for debugging)
app.get('/users', (req, res) => {
  const users = Array.from(connectedUsers.values()).map(user => ({
    id: user.id,
    name: user.name,
    age: user.age,
    gender: user.gender,
    isOnline: user.isOnline,
    isAvailable: availableUsers.has(user.socketId),
    isPending: pendingConnections.has(user.socketId)
  }));
  res.json(users);
});

// Start server
server.listen(PORT, HOST, () => {
  console.log(`🚀 Instant Video Chat Server running on http://${HOST}:${PORT}`);
  console.log(`📡 STUN servers: ${iceServers.filter(s => s.urls.includes('stun')).length}`);
  console.log(`🔄 TURN servers: ${iceServers.filter(s => s.urls.includes('turn')).length}`);
  console.log(`👥 Connected users: ${connectedUsers.size}`);
  console.log(`💚 Available for connection: ${availableUsers.size}`);
  console.log(`📹 Active video calls: ${activeMatches.size}`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down server gracefully...');
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

module.exports = app;