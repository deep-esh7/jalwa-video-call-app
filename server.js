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
const waitingUsers = new Map(); // Users waiting for automatic connection
const activeMatches = new Map(); // Active video calls

// ENHANCED STUN/TURN configuration
const iceServers = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun.relay.metered.ca:80' },
  {
    urls: 'turn:relay.metered.ca:80',
    username: 'openrelayproject',
    credential: 'openrelayproject'
  },
  {
    urls: 'turn:relay.metered.ca:443',
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
  const randomAge = Math.floor(Math.random() * 15) + 18;
  const randomGender = genders[Math.floor(Math.random() * genders.length)];
  const randomInterests = interests.sort(() => 0.5 - Math.random()).slice(0, 3);
  
  return {
    id: Date.now() + Math.random().toString(36),
    name: randomName,
    age: randomAge,
    gender: randomGender,
    interests: randomInterests,
    bio: `Hey! I'm ${randomName}, ${randomAge} years old. Love ${randomInterests.join(', ')}.`,
    avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${randomName}`,
    isOnline: true,
    lastSeen: new Date()
  };
};

// Auto-match algorithm - pair waiting users immediately
const autoMatchUsers = () => {
  const waitingUsersList = Array.from(waitingUsers.values());
  
  while (waitingUsersList.length >= 2) {
    const user1 = waitingUsersList.shift();
    const user2 = waitingUsersList.shift();
    
    // Remove from waiting
    waitingUsers.delete(user1.socketId);
    waitingUsers.delete(user2.socketId);
    
    // Create room and start call
    const roomId = `room_${Date.now()}_${user1.socketId}_${user2.socketId}`;
    
    console.log(`AUTO-MATCHING: ${user1.name} with ${user2.name} in room ${roomId}`);
    
    // Join both to room
    io.sockets.sockets.get(user1.socketId)?.join(roomId);
    io.sockets.sockets.get(user2.socketId)?.join(roomId);
    
    // Store active match
    activeMatches.set(roomId, {
      user1,
      user2,
      startTime: new Date()
    });
    
    // Notify both users immediately
    io.to(roomId).emit('call-ready', {
      roomId,
      participants: [user1, user2]
    });
    
    console.log(`Auto-match successful. Active calls: ${activeMatches.size}, Waiting: ${waitingUsers.size}`);
  }
};

// Socket connection handling
io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  // User joins - immediately add to waiting pool for auto-matching
  socket.on('join', (userData) => {
    const profile = userData || generateRandomProfile();
    profile.socketId = socket.id;
    profile.isOnline = true;
    
    connectedUsers.set(socket.id, profile);
    
    socket.emit('profile-created', profile);
    socket.emit('ice-servers', iceServers);
    
    console.log(`User ${profile.name} joined and added to auto-matching pool`);
    
    // Add to waiting pool for automatic matching
    waitingUsers.set(socket.id, profile);
    
    // Try auto-matching immediately
    autoMatchUsers();
    
    console.log(`Total users: ${connectedUsers.size}, Waiting for match: ${waitingUsers.size}`);
  });

  // Get matches - return waiting users (for display while waiting)
  socket.on('get-matches', () => {
    const currentUser = connectedUsers.get(socket.id);
    if (!currentUser) return;

    // Return all waiting users except current user
    const potentialMatches = Array.from(waitingUsers.values())
      .filter(user => user.socketId !== socket.id)
      .slice(0, 10);

    socket.emit('potential-matches', potentialMatches);
    console.log(`Sent ${potentialMatches.length} waiting users to ${currentUser.name}`);
  });

  // Accept match - used for manual connections or next user
  socket.on('accept-match', (targetUserId) => {
    const currentUser = connectedUsers.get(socket.id);
    if (!currentUser) return;

    // If user is in a call, end it first
    for (const [roomId, match] of activeMatches.entries()) {
      if (match.user1.socketId === socket.id || match.user2.socketId === socket.id) {
        endCall(roomId);
        break;
      }
    }

    // Add current user back to waiting pool
    waitingUsers.set(socket.id, currentUser);
    
    // Try auto-matching
    autoMatchUsers();
    
    console.log(`${currentUser.name} requested next user. Added back to waiting pool.`);
  });

  // Swipe right - same as accept match (find next user)
  socket.on('swipe-right', (targetUserId) => {
    socket.emit('accept-match', targetUserId);
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

  // End call
  socket.on('end-call', (roomId) => {
    endCall(roomId);
  });

  // Function to end a call and add users back to waiting pool
  function endCall(roomId) {
    const match = activeMatches.get(roomId);
    if (match) {
      console.log(`Ending call between ${match.user1.name} and ${match.user2.name}`);
      
      // Add both users back to waiting pool if still connected
      if (connectedUsers.has(match.user1.socketId)) {
        waitingUsers.set(match.user1.socketId, match.user1);
        console.log(`${match.user1.name} added back to waiting pool`);
      }
      if (connectedUsers.has(match.user2.socketId)) {
        waitingUsers.set(match.user2.socketId, match.user2);
        console.log(`${match.user2.name} added back to waiting pool`);
      }
      
      // Clean up
      activeMatches.delete(roomId);
      io.to(roomId).emit('call-ended');
      
      // Leave room
      const room = io.sockets.adapter.rooms.get(roomId);
      if (room) {
        room.forEach(socketId => {
          io.sockets.sockets.get(socketId)?.leave(roomId);
        });
      }
      
      // Try auto-matching remaining users
      setTimeout(() => {
        autoMatchUsers();
      }, 1000); // Small delay to allow users to reconnect
      
      console.log(`Call ended. Active calls: ${activeMatches.size}, Waiting: ${waitingUsers.size}`);
    }
  }

  // Handle disconnect
  socket.on('disconnect', () => {
    const user = connectedUsers.get(socket.id);
    if (user) {
      console.log(`User ${user.name} disconnected`);
      
      // Remove from all collections
      connectedUsers.delete(socket.id);
      waitingUsers.delete(socket.id);
      
      // End any active calls
      for (const [roomId, match] of activeMatches.entries()) {
        if (match.user1.socketId === socket.id || match.user2.socketId === socket.id) {
          socket.to(roomId).emit('call-ended', 'peer-disconnected');
          
          // Add other user back to waiting pool
          const otherUserSocketId = match.user1.socketId === socket.id ? 
            match.user2.socketId : match.user1.socketId;
          const otherUser = connectedUsers.get(otherUserSocketId);
          if (otherUser) {
            waitingUsers.set(otherUserSocketId, otherUser);
            console.log(`${otherUser.name} added back to waiting pool after peer disconnect`);
          }
          
          activeMatches.delete(roomId);
          
          // Try auto-matching remaining users
          setTimeout(() => {
            autoMatchUsers();
          }, 1000);
          break;
        }
      }
      
      console.log(`Remaining users: ${connectedUsers.size}, Waiting: ${waitingUsers.size}`);
    }
  });
});

// Periodic auto-matching (backup)
setInterval(() => {
  if (waitingUsers.size >= 2) {
    autoMatchUsers();
  }
}, 5000); // Every 5 seconds

// API endpoints
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    connectedUsers: connectedUsers.size,
    waitingUsers: waitingUsers.size,
    activeMatches: activeMatches.size,
    uptime: process.uptime(),
    iceServersCount: iceServers.length
  });
});

app.get('/stats', (req, res) => {
  res.json({
    connectedUsers: connectedUsers.size,
    waitingUsers: waitingUsers.size,
    activeMatches: activeMatches.size,
    serverTime: new Date().toISOString(),
    autoMatchingActive: true
  });
});

// Get all users (for debugging)
app.get('/users', (req, res) => {
  const users = Array.from(connectedUsers.values()).map(user => ({
    id: user.id,
    name: user.name,
    age: user.age,
    isOnline: user.isOnline,
    isWaiting: waitingUsers.has(user.socketId),
    inCall: Array.from(activeMatches.values()).some(match => 
      match.user1.socketId === user.socketId || match.user2.socketId === user.socketId
    )
  }));
  res.json(users);
});

// Force auto-match (for testing)
app.post('/force-match', (req, res) => {
  autoMatchUsers();
  res.json({ 
    message: 'Auto-matching triggered',
    waitingUsers: waitingUsers.size,
    activeMatches: activeMatches.size
  });
});

// Start server
server.listen(PORT, HOST, () => {
  console.log(`🚀 AUTO-CONNECT Chatroulette Server running on http://${HOST}:${PORT}`);
  console.log(`📡 STUN servers: ${iceServers.filter(s => s.urls.includes('stun')).length}`);
  console.log(`🔄 TURN servers: ${iceServers.filter(s => s.urls.includes('turn')).length}`);
  console.log(`👥 Connected users: ${connectedUsers.size}`);
  console.log(`⏳ Waiting for auto-match: ${waitingUsers.size}`);
  console.log(`📹 Active video calls: ${activeMatches.size}`);
  console.log(`🤖 Auto-matching enabled - users connect automatically!`);
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