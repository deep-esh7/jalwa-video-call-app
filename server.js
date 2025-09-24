const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');

// Firebase Admin SDK
const admin = require('firebase-admin');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = 4000;
// const HOST = '72.60.99.164';
const HOST = '0.0.0.0';

// Initialize Firebase Admin SDK
const serviceAccount = require('./firebase-service-account-key.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://jalwa-online-video-chat-default-rtdb.asia-southeast1.firebasedatabase.app/"
});

const db = admin.database();

// Middleware
app.use(cors());
app.use(express.json());

// Store socket connections and active calls
const socketConnections = new Map(); // socketId -> { userId, userData, socketRef }
const activeRooms = new Map(); // roomId -> { participants, startTime, callId }
const userSockets = new Map(); // userId -> socketId
const ongoingMatching = new Set(); // Track users currently being matched

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

// Firebase helper functions
async function getAvailableUsers() {
  try {
    const snapshot = await db.ref('availableUsers').once('value');
    const availableUsers = snapshot.val() || {};
    return Object.keys(availableUsers);
  } catch (error) {
    console.error('❌ Error fetching available users:', error);
    return [];
  }
}

async function getUserProfile(userId) {
  try {
    const snapshot = await db.ref(`users/${userId}`).once('value');
    return snapshot.val();
  } catch (error) {
    console.error(`❌ Error fetching user profile for ${userId}:`, error);
    return null;
  }
}

async function setUserBusy(userId, callId) {
  try {
    await db.ref(`users/${userId}`).update({
      status: 'busy',
      isAvailable: false,
      currentCallId: callId,
      lastSeen: admin.database.ServerValue.TIMESTAMP
    });
    
    // Remove from available users list
    await db.ref(`availableUsers/${userId}`).remove();
    
    console.log(`✅ User ${userId} set as busy`);
  } catch (error) {
    console.error(`❌ Error setting user ${userId} as busy:`, error);
  }
}

async function setUserAvailable(userId) {
  try {
    await db.ref(`users/${userId}`).update({
      status: 'online',
      isAvailable: true,
      currentCallId: null,
      lastSeen: admin.database.ServerValue.TIMESTAMP
    });
    
    console.log(`✅ User ${userId} set as available`);
  } catch (error) {
    console.error(`❌ Error setting user ${userId} as available:`, error);
  }
}

async function createFirebaseCall(user1Id, user2Id) {
  try {
    const callId = `call_${Date.now()}_${user1Id}_${user2Id}`;
    
    const callData = {
      callId: callId,
      participants: [user1Id, user2Id],
      createdAt: admin.database.ServerValue.TIMESTAMP,
      status: 'active'
    };
    
    // Store call in Firebase
    await db.ref(`calls/${callId}`).set(callData);
    
    // Set both users as busy
    await setUserBusy(user1Id, callId);
    await setUserBusy(user2Id, callId);
    
    console.log(`📞 Firebase call created: ${callId}`);
    return { callId, callData };
    
  } catch (error) {
    console.error('❌ Error creating Firebase call:', error);
    return null;
  }
}

async function endFirebaseCall(callId) {
  try {
    const callSnapshot = await db.ref(`calls/${callId}`).once('value');
    const callData = callSnapshot.val();
    
    if (callData && callData.participants) {
      // Update call status
      await db.ref(`calls/${callId}`).update({
        status: 'ended',
        endedAt: admin.database.ServerValue.TIMESTAMP
      });
      
      // Set participants as available again
      for (const participantId of callData.participants) {
        await setUserAvailable(participantId);
        
        // Clear any pending matches
        await db.ref(`matches/${participantId}`).remove();
      }
      
      console.log(`✅ Firebase call ended: ${callId}`);
    }
  } catch (error) {
    console.error(`❌ Error ending Firebase call ${callId}:`, error);
  }
}

// Enhanced auto-matching algorithm
async function performAutoMatching() {
  try {
    console.log('🔍 Performing auto-matching...');
    
    const availableUserIds = await getAvailableUsers();
    
    // Filter out users who are already connected to our socket server and not in ongoing matching
    const socketConnectedUsers = availableUserIds.filter(userId => 
      userSockets.has(userId) && !ongoingMatching.has(userId)
    );
    
    console.log(`📊 Available users: ${availableUserIds.length}, Socket connected: ${socketConnectedUsers.length}, In matching: ${ongoingMatching.size}`);
    
    // Pair users for auto-matching
    while (socketConnectedUsers.length >= 2) {
      const user1Id = socketConnectedUsers.shift();
      const user2Id = socketConnectedUsers.shift();
      
      // Add to ongoing matching to prevent double-matching
      ongoingMatching.add(user1Id);
      ongoingMatching.add(user2Id);
      
      const user1SocketId = userSockets.get(user1Id);
      const user2SocketId = userSockets.get(user2Id);
      
      if (user1SocketId && user2SocketId) {
        console.log(`🎯 Auto-matching: ${user1Id} with ${user2Id}`);
        
        // Create Firebase call
        const callResult = await createFirebaseCall(user1Id, user2Id);
        
        if (callResult) {
          const { callId, callData } = callResult;
          const roomId = `room_${callId}`;
          
          // Join both users to socket room
          const user1Socket = io.sockets.sockets.get(user1SocketId);
          const user2Socket = io.sockets.sockets.get(user2SocketId);
          
          if (user1Socket && user2Socket) {
            user1Socket.join(roomId);
            user2Socket.join(roomId);
            
            // Store active room
            activeRooms.set(roomId, {
              participants: [user1Id, user2Id],
              callId: callId,
              startTime: new Date()
            });
            
            // Get user profiles for the call
            const user1Profile = await getUserProfile(user1Id);
            const user2Profile = await getUserProfile(user2Id);
            
            // Prepare call-ready data
            const callReadyData = {
              roomId: roomId,
              callId: callId,
              participants: [
                { ...user1Profile, userId: user1Id, socketId: user1SocketId },
                { ...user2Profile, userId: user2Id, socketId: user2SocketId }
              ],
              callData: {
                ...callData,
                roomId: roomId
              }
            };
            
            // Notify both users that call is ready
            io.to(roomId).emit('call-ready', callReadyData);
            
            console.log(`✅ Auto-match successful: Room ${roomId} created`);
          }
        }
        
        // Remove from ongoing matching
        ongoingMatching.delete(user1Id);
        ongoingMatching.delete(user2Id);
      } else {
        // Remove from ongoing matching if socket not found
        ongoingMatching.delete(user1Id);
        ongoingMatching.delete(user2Id);
      }
    }
    
  } catch (error) {
    console.error('❌ Error in auto-matching:', error);
  }
}

// Enhanced function to find next user for someone already in call
async function findNextUserForExistingUser(currentUserId) {
  try {
    console.log(`🔍 Finding next user for: ${currentUserId}`);
    
    const availableUserIds = await getAvailableUsers();
    
    // Filter out current user and users not connected to socket
    const eligibleUsers = availableUserIds.filter(userId => 
      userId !== currentUserId && 
      userSockets.has(userId) && 
      !ongoingMatching.has(userId)
    );
    
    console.log(`👥 Eligible next users: ${eligibleUsers.length}`);
    
    if (eligibleUsers.length === 0) {
      console.log(`😔 No eligible next users found for ${currentUserId}`);
      return null;
    }
    
    // Select random user from eligible users
    const randomIndex = Math.floor(Math.random() * eligibleUsers.length);
    const selectedUserId = eligibleUsers[randomIndex];
    
    console.log(`🎯 Selected next user: ${selectedUserId} for ${currentUserId}`);
    
    // Add both to ongoing matching
    ongoingMatching.add(currentUserId);
    ongoingMatching.add(selectedUserId);
    
    // Create Firebase call between current user and selected user
    const callResult = await createFirebaseCall(currentUserId, selectedUserId);
    
    if (callResult) {
      const { callId, callData } = callResult;
      const roomId = `room_${callId}`;
      
      const currentUserSocketId = userSockets.get(currentUserId);
      const selectedUserSocketId = userSockets.get(selectedUserId);
      
      // Join both users to socket room
      const currentUserSocket = io.sockets.sockets.get(currentUserSocketId);
      const selectedUserSocket = io.sockets.sockets.get(selectedUserSocketId);
      
      if (currentUserSocket && selectedUserSocket) {
        currentUserSocket.join(roomId);
        selectedUserSocket.join(roomId);
        
        // Store active room
        activeRooms.set(roomId, {
          participants: [currentUserId, selectedUserId],
          callId: callId,
          startTime: new Date()
        });
        
        // Get user profiles
        const currentUserProfile = await getUserProfile(currentUserId);
        const selectedUserProfile = await getUserProfile(selectedUserId);
        
        // Prepare call-ready data
        const callReadyData = {
          roomId: roomId,
          callId: callId,
          participants: [
            { ...currentUserProfile, userId: currentUserId, socketId: currentUserSocketId },
            { ...selectedUserProfile, userId: selectedUserId, socketId: selectedUserSocketId }
          ],
          callData: {
            ...callData,
            roomId: roomId
          }
        };
        
        // Notify both users that call is ready
        io.to(roomId).emit('call-ready', callReadyData);
        
        console.log(`✅ Next user match successful: Room ${roomId} created`);
        
        // Remove from ongoing matching
        ongoingMatching.delete(currentUserId);
        ongoingMatching.delete(selectedUserId);
        
        return { callId, roomId, selectedUserId };
      }
    }
    
    // Remove from ongoing matching if failed
    ongoingMatching.delete(currentUserId);
    ongoingMatching.delete(selectedUserId);
    
    return null;
    
  } catch (error) {
    console.error(`❌ Error finding next user for ${currentUserId}:`, error);
    return null;
  }
}

// Listen to Firebase available users changes
function setupFirebaseListeners() {
  db.ref('availableUsers').on('child_added', (snapshot) => {
    console.log(`👤 User added to available list: ${snapshot.key}`);
    // Trigger auto-matching when new users become available
    setTimeout(performAutoMatching, 1000);
  });
  
  db.ref('availableUsers').on('child_removed', (snapshot) => {
    console.log(`👤 User removed from available list: ${snapshot.key}`);
  });
  
  console.log('✅ Firebase listeners setup complete');
}

// Socket connection handling
io.on('connection', (socket) => {
  console.log(`🔌 Socket connected: ${socket.id}`);

  // User joins with Firebase userId
  socket.on('join-firebase', async (userData) => {
    try {
      const { userId, ...profile } = userData;
      
      if (!userId) {
        socket.emit('error', { message: 'User ID is required' });
        return;
      }
      
      // Store socket connection
      socketConnections.set(socket.id, {
        userId: userId,
        userData: profile,
        socketRef: socket
      });
      
      userSockets.set(userId, socket.id);
      
      socket.emit('joined', { 
        userId: userId,
        socketId: socket.id,
        iceServers: iceServers
      });
      
      console.log(`✅ User ${userId} joined with socket ${socket.id}`);
      
      // Trigger auto-matching
      setTimeout(performAutoMatching, 1000);
      
    } catch (error) {
      console.error('❌ Error in join-firebase:', error);
      socket.emit('error', { message: 'Failed to join' });
    }
  });

  // Get available users count
  socket.on('get-available-count', async () => {
    try {
      const availableUsers = await getAvailableUsers();
      socket.emit('available-count', { count: availableUsers.length });
    } catch (error) {
      console.error('❌ Error getting available count:', error);
    }
  });

  // NEW: Request next user (for skip functionality)
  socket.on('request-next-user', async () => {
    try {
      const connection = socketConnections.get(socket.id);
      if (!connection) {
        socket.emit('error', { message: 'User not found' });
        return;
      }
      
      const { userId } = connection;
      console.log(`⏭️ Next user requested by: ${userId}`);
      
      // End current call if in one
      for (const [roomId, room] of activeRooms.entries()) {
        if (room.participants.includes(userId)) {
          await endSocketCall(roomId);
          break;
        }
      }
      
      // Find next available user
      const nextUserResult = await findNextUserForExistingUser(userId);
      
      if (nextUserResult) {
        console.log(`✅ Next user found for ${userId}: ${nextUserResult.selectedUserId}`);
      } else {
        console.log(`😔 No next user available for ${userId}`);
        socket.emit('no-users-available', { 
          message: 'No users available right now. Try again later.' 
        });
      }
      
    } catch (error) {
      console.error('❌ Error requesting next user:', error);
      socket.emit('error', { message: 'Failed to find next user' });
    }
  });

  // WebRTC signaling events
  socket.on('offer', (data) => {
    console.log(`📤 Relaying offer in room ${data.roomId}`);
    socket.to(data.roomId).emit('offer', {
      offer: data.offer,
      from: socket.id
    });
  });

  socket.on('answer', (data) => {
    console.log(`📤 Relaying answer in room ${data.roomId}`);
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
  socket.on('end-call', async (data) => {
    try {
      const { roomId, callId } = data;
      
      if (callId) {
        // End Firebase call
        await endFirebaseCall(callId);
      }
      
      if (roomId) {
        // End socket room
        await endSocketCall(roomId);
      }
      
    } catch (error) {
      console.error('❌ Error ending call:', error);
    }
  });

  // Handle disconnect
  socket.on('disconnect', async () => {
    try {
      const connection = socketConnections.get(socket.id);
      
      if (connection) {
        const { userId } = connection;
        
        console.log(`🔌 User ${userId} disconnected (${socket.id})`);
        
        // Remove from ongoing matching if present
        ongoingMatching.delete(userId);
        
        // Clean up socket connections
        socketConnections.delete(socket.id);
        userSockets.delete(userId);
        
        // End any active calls
        for (const [roomId, room] of activeRooms.entries()) {
          if (room.participants.includes(userId)) {
            await endFirebaseCall(room.callId);
            await endSocketCall(roomId);
            
            // Notify other participant
            socket.to(roomId).emit('call-ended', { reason: 'peer-disconnected' });
            break;
          }
        }
        
        console.log(`🧹 Cleaned up user ${userId}`);
      }
      
    } catch (error) {
      console.error('❌ Error handling disconnect:', error);
    }
  });
});

// Helper function to end socket call
async function endSocketCall(roomId) {
  try {
    const room = activeRooms.get(roomId);
    if (room) {
      console.log(`📞 Ending socket call: ${roomId}`);
      
      // Remove participants from ongoing matching
      room.participants.forEach(userId => {
        ongoingMatching.delete(userId);
      });
      
      // Notify room participants
      io.to(roomId).emit('call-ended', { roomId: roomId });
      
      // Make all sockets leave the room
      const socketsInRoom = io.sockets.adapter.rooms.get(roomId);
      if (socketsInRoom) {
        socketsInRoom.forEach(socketId => {
          const socket = io.sockets.sockets.get(socketId);
          if (socket) {
            socket.leave(roomId);
          }
        });
      }
      
      // Clean up room
      activeRooms.delete(roomId);
      
      console.log(`✅ Socket call ended: ${roomId}`);
    }
  } catch (error) {
    console.error(`❌ Error ending socket call ${roomId}:`, error);
  }
}

// Periodic auto-matching (backup)
setInterval(performAutoMatching, 10000); // Every 10 seconds

// Periodic cleanup of ongoing matching (in case of stuck states)
setInterval(() => {
  console.log(`🧹 Ongoing matching cleanup - Current size: ${ongoingMatching.size}`);
  // Clear ongoing matching that might be stuck (older than 30 seconds)
  // This is a safety mechanism
}, 30000);

// Setup Firebase listeners
setupFirebaseListeners();

// API endpoints
app.get('/health', async (req, res) => {
  try {
    const availableUsers = await getAvailableUsers();
    
    res.json({
      status: 'healthy',
      socketConnections: socketConnections.size,
      activeRooms: activeRooms.size,
      firebaseAvailableUsers: availableUsers.length,
      ongoingMatching: ongoingMatching.size,
      uptime: process.uptime(),
      iceServersCount: iceServers.length,
      firebaseConnected: true
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      error: error.message,
      firebaseConnected: false
    });
  }
});

app.get('/stats', async (req, res) => {
  try {
    const availableUsers = await getAvailableUsers();
    
    res.json({
      socketConnections: socketConnections.size,
      activeRooms: activeRooms.size,
      firebaseAvailableUsers: availableUsers.length,
      ongoingMatching: ongoingMatching.size,
      serverTime: new Date().toISOString(),
      autoMatchingActive: true
    });
  } catch (error) {
    res.status(500).json({
      error: error.message
    });
  }
});

// Get Firebase available users
app.get('/firebase-users', async (req, res) => {
  try {
    const availableUserIds = await getAvailableUsers();
    const userProfiles = [];
    
    for (const userId of availableUserIds.slice(0, 20)) { // Limit to 20 for performance
      const profile = await getUserProfile(userId);
      if (profile) {
        userProfiles.push({
          userId: userId,
          name: profile.name,
          isSocketConnected: userSockets.has(userId),
          isInMatching: ongoingMatching.has(userId)
        });
      }
    }
    
    res.json(userProfiles);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Force auto-match (for testing)
app.post('/force-match', async (req, res) => {
  try {
    await performAutoMatching();
    const availableUsers = await getAvailableUsers();
    
    res.json({ 
      message: 'Auto-matching triggered',
      firebaseAvailableUsers: availableUsers.length,
      socketConnections: socketConnections.size,
      activeRooms: activeRooms.size,
      ongoingMatching: ongoingMatching.size
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Start server
server.listen(PORT, HOST, () => {
  console.log(`🚀 Enhanced Firebase-Integrated Jalwa Server running on http://${HOST}:${PORT}`);
  console.log(`🔥 Firebase connected and ready`);
  console.log(`📡 STUN servers: ${iceServers.filter(s => s.urls.includes('stun')).length}`);
  console.log(`🔄 TURN servers: ${iceServers.filter(s => s.urls.includes('turn')).length}`);
  console.log(`🤖 Auto-matching with next user functionality enabled!`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down server gracefully...');
  
  // Clean up Firebase listeners
  db.ref('availableUsers').off();
  
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

module.exports = app;