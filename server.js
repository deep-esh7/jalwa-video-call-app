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

// STUN/TURN configuration
const iceServers = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  // Add your TURN server here when needed
  // {
  //   urls: 'turn:your-turn-server:3478',
  //   username: 'username',
  //   credential: 'password'
  // }
];

// Generate random profile data
const generateRandomProfile = () => {
  const firstNames = ['Alex', 'Jordan', 'Casey', 'Riley', 'Avery', 'Quinn', 'Blake', 'Cameron', 'Drew', 'Sage'];
  const interests = ['Travel', 'Music', 'Photography', 'Fitness', 'Cooking', 'Reading', 'Gaming', 'Art', 'Dancing', 'Sports'];
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
  });

  // Get potential matches
  socket.on('get-matches', () => {
    const currentUser = connectedUsers.get(socket.id);
    if (!currentUser) return;

    const potentialMatches = Array.from(availableUsers.values())
      .filter(user => user.socketId !== socket.id)
      .slice(0, 10); // Limit to 10 matches at a time

    socket.emit('potential-matches', potentialMatches);
  });

  // Swipe right (like)
  socket.on('swipe-right', (targetUserId) => {
    const currentUser = connectedUsers.get(socket.id);
    const targetUser = Array.from(connectedUsers.values())
      .find(user => user.id === targetUserId);

    if (!currentUser || !targetUser) return;

    // Notify target user of the match
    io.to(targetUser.socketId).emit('match-found', {
      user: currentUser,
      message: `${currentUser.name} liked you! Start a video call?`
    });

    socket.emit('match-sent', {
      user: targetUser,
      message: `You liked ${targetUser.name}. Waiting for response...`
    });
  });

  // Accept match and start call
  socket.on('accept-match', (targetUserId) => {
    const currentUser = connectedUsers.get(socket.id);
    const targetUser = Array.from(connectedUsers.values())
      .find(user => user.id === targetUserId);

    if (!currentUser || !targetUser) return;

    const roomId = `room_${Date.now()}`;
    
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

    // Notify both users to start call
    io.to(roomId).emit('call-ready', {
      roomId,
      participants: [currentUser, targetUser]
    });
  });

  // WebRTC signaling
  socket.on('offer', (data) => {
    socket.to(data.roomId).emit('offer', {
      offer: data.offer,
      from: socket.id
    });
  });

  socket.on('answer', (data) => {
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
    
    // Broadcast network quality to other participants for adaptive streaming
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
      // Return users to available pool
      availableUsers.set(match.user1.socketId, match.user1);
      availableUsers.set(match.user2.socketId, match.user2);
      
      activeMatches.delete(roomId);
      
      io.to(roomId).emit('call-ended');
      
      // Leave room
      const room = io.sockets.adapter.rooms.get(roomId);
      if (room) {
        room.forEach(socketId => {
          io.sockets.sockets.get(socketId)?.leave(roomId);
        });
      }
    }
  });

  // Handle disconnect
  socket.on('disconnect', () => {
    const user = connectedUsers.get(socket.id);
    if (user) {
      console.log(`User ${user.name} disconnected`);
      
      // Remove from all collections
      connectedUsers.delete(socket.id);
      availableUsers.delete(socket.id);
      
      // End any active calls
      for (const [roomId, match] of activeMatches.entries()) {
        if (match.user1.socketId === socket.id || match.user2.socketId === socket.id) {
          socket.to(roomId).emit('call-ended', 'peer-disconnected');
          activeMatches.delete(roomId);
          break;
        }
      }
    }
  });
});

// Calculate recommended bitrate based on network conditions
function calculateRecommendedBitrate(quality, packetLoss, latency) {
  let baseBitrate = 1000; // 1 Mbps base
  
  // Adjust based on quality
  switch (quality) {
    case 'excellent': baseBitrate = 2000; break;
    case 'good': baseBitrate = 1500; break;
    case 'fair': baseBitrate = 1000; break;
    case 'poor': baseBitrate = 500; break;
    default: baseBitrate = 1000;
  }
  
  // Reduce bitrate based on packet loss
  if (packetLoss > 5) baseBitrate *= 0.7;
  if (packetLoss > 10) baseBitrate *= 0.5;
  
  // Reduce bitrate based on latency
  if (latency > 200) baseBitrate *= 0.8;
  if (latency > 500) baseBitrate *= 0.6;
  
  return Math.max(baseBitrate, 250); // Minimum 250 kbps
}

// API endpoints
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    connectedUsers: connectedUsers.size,
    availableUsers: availableUsers.size,
    activeMatches: activeMatches.size,
    uptime: process.uptime()
  });
});

app.get('/stats', (req, res) => {
  res.json({
    connectedUsers: connectedUsers.size,
    availableUsers: availableUsers.size,
    activeMatches: activeMatches.size,
    serverTime: new Date().toISOString()
  });
});

// Start server
server.listen(PORT, HOST, () => {
  console.log(`WebRTC P2P Video Calling Server running on http://${HOST}:${PORT}`);
  console.log(`Connected users: ${connectedUsers.size}`);
  console.log(`Available for matching: ${availableUsers.size}`);
  console.log(`Active video calls: ${activeMatches.size}`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('Shutting down server gracefully...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

module.exports = app;