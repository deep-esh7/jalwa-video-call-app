# 📞 Manual Call Flow Documentation

## Overview

The system has been updated to support **manual user selection** instead of auto-matching. Users can now see all available users with their online/offline status and initiate calls manually.

---

## 🔄 New Call Flow

### 1. **User Authentication & Presence**

```
User authenticates with Firebase
    ↓
Client calls /api/users/me with Firebase token
    ↓
Server creates/updates user in database
    ↓
Server marks user as ONLINE in Redis
    ↓
User receives profile data with status: "online"
```

### 2. **Viewing Available Users**

```
Client calls GET /api/users
    ↓
Server fetches all users from database
    ↓
Server enriches with status from Redis (online/offline/busy)
    ↓
Client receives list of all users with current status
```

### 3. **Manual Call Initiation**

```
User A clicks on User B (who is online)
    ↓
Client emits 'send-call-invitation' via Socket.io
    ↓
Server validates both users exist and are online
    ↓
Server sends 'call-invitation-received' to User B
    ↓
User B sees incoming call notification
```

### 4. **Call Acceptance**

```
User B accepts the call
    ↓
Client emits 'accept-call-invitation'
    ↓
Server creates Call record in database
    ↓
Server creates socket room
    ↓
Server marks both users as BUSY
    ↓
Server emits 'call-ready' to both users
    ↓
WebRTC connection established
    ↓
Video call starts
```

### 5. **Call End**

```
Either user ends the call
    ↓
Client emits 'end-call'
    ↓
Server ends Call in database
    ↓
Server marks both users as ONLINE
    ↓
Server cleans up room
    ↓
Both users back to online state
```

---

## 📡 API Endpoints

### 1. **Get Current User (Authentication)**

**Endpoint:** `GET /api/users/me`

**Headers:**
```
Authorization: Bearer <FIREBASE_TOKEN>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "firebase_uid",
    "name": "John Doe",
    "email": "john@example.com",
    "photoURL": "https://...",
    "gender": "MALE",
    "status": "online",
    "createdAt": "2025-10-14T...",
    "updatedAt": "2025-10-14T..."
  }
}
```

**What happens:**
- Creates user in database if doesn't exist
- Updates user info from Firebase
- Marks user as **ONLINE** in Redis

---

### 2. **Get All Users with Status**

**Endpoint:** `GET /api/users`

**Response:**
```json
{
  "success": true,
  "count": 5,
  "data": [
    {
      "id": "user1",
      "name": "Alice",
      "email": "alice@example.com",
      "photoURL": "https://...",
      "gender": "FEMALE",
      "status": "online",
      "createdAt": "2025-10-14T..."
    },
    {
      "id": "user2",
      "name": "Bob",
      "status": "busy",
      ...
    },
    {
      "id": "user3",
      "name": "Charlie",
      "status": "offline",
      ...
    }
  ]
}
```

**Status Values:**
- `online` - User is available for calls
- `busy` - User is currently in a call
- `offline` - User is not connected

---

### 3. **Mark User as Offline**

**Endpoint:** `POST /api/users/:userId/offline`

**Response:**
```json
{
  "success": true,
  "message": "User marked as offline"
}
```

**When to call:**
- When user logs out
- When app goes to background
- Before closing the app

---

## 🔌 Socket Events

### Client → Server Events

#### 1. **Send Call Invitation**

**Event:** `send-call-invitation`

**Payload:**
```javascript
{
  fromUserId: "user1",
  toUserId: "user2",
  fromUserName: "Alice",      // Optional
  fromUserPhoto: "https://..."  // Optional
}
```

**Description:** Initiates a call invitation to another user.

---

#### 2. **Accept Call Invitation**

**Event:** `accept-call-invitation`

**Payload:**
```javascript
{
  invitationId: "user1_user2_1234567890",
  userId: "user2"
}
```

**Description:** Accepts an incoming call invitation.

---

#### 3. **Reject Call Invitation**

**Event:** `reject-call-invitation`

**Payload:**
```javascript
{
  invitationId: "user1_user2_1234567890",
  userId: "user2"
}
```

**Description:** Rejects an incoming call invitation.

---

#### 4. **Cancel Call Invitation**

**Event:** `cancel-call-invitation`

**Payload:**
```javascript
{
  invitationId: "user1_user2_1234567890",
  userId: "user1"
}
```

**Description:** Caller cancels the invitation before it's accepted.

---

### Server → Client Events

#### 1. **Call Invitation Received**

**Event:** `call-invitation-received`

**Payload:**
```javascript
{
  invitationId: "user1_user2_1234567890",
  from: {
    userId: "user1",
    name: "Alice",
    photoURL: "https://..."
  }
}
```

**Description:** Notifies user of incoming call invitation.

---

#### 2. **Call Ready**

**Event:** `call-ready`

**Payload:**
```javascript
{
  roomId: "room_call_123",
  callId: "call_123",
  isInitiator: true,  // true for caller, false for receiver
  participants: [
    { userId: "user1", socketId: "socket1" },
    { userId: "user2", socketId: "socket2" }
  ]
}
```

**Description:** Call has been accepted, room created, ready for WebRTC.

---

#### 3. **Call Invitation Accepted**

**Event:** `call-invitation-accepted`

**Payload:**
```javascript
{
  callId: "call_123",
  roomId: "room_call_123",
  acceptedBy: "user2"
}
```

**Description:** Notifies caller that invitation was accepted.

---

#### 4. **Call Invitation Rejected**

**Event:** `call-invitation-rejected`

**Payload:**
```javascript
{
  rejectedBy: "user2"
}
```

**Description:** Notifies caller that invitation was rejected.

---

#### 5. **Call Invitation Cancelled**

**Event:** `call-invitation-cancelled`

**Payload:**
```javascript
{
  cancelledBy: "user1"
}
```

**Description:** Notifies receiver that invitation was cancelled.

---

## 💻 Frontend Implementation Example

### 1. **User Authentication**

```javascript
// After Firebase authentication
const idToken = await firebase.auth().currentUser.getIdToken();

const response = await fetch('http://localhost:4000/api/users/me', {
  headers: {
    'Authorization': `Bearer ${idToken}`
  }
});

const { data: currentUser } = await response.json();
console.log('Logged in as:', currentUser);
```

---

### 2. **Get All Users**

```javascript
const response = await fetch('http://localhost:4000/api/users');
const { data: users } = await response.json();

// Display users with status
users.forEach(user => {
  console.log(`${user.name}: ${user.status}`);
});
```

---

### 3. **Connect to Socket & Handle Events**

```javascript
import io from 'socket.io-client';

const socket = io('http://localhost:4000');

// Mark user as available
socket.emit('user-available', { userId: currentUser.id });

// Listen for incoming call
socket.on('call-invitation-received', ({ invitationId, from }) => {
  showIncomingCallUI({
    callerName: from.name,
    callerPhoto: from.photoURL,
    onAccept: () => {
      socket.emit('accept-call-invitation', {
        invitationId,
        userId: currentUser.id
      });
    },
    onReject: () => {
      socket.emit('reject-call-invitation', {
        invitationId,
        userId: currentUser.id
      });
    }
  });
});

// Call is ready, start WebRTC
socket.on('call-ready', ({ roomId, callId, isInitiator }) => {
  startWebRTCCall(roomId, isInitiator);
});
```

---

### 4. **Initiate Call**

```javascript
function callUser(toUser) {
  if (toUser.status !== 'online') {
    alert('User is not available');
    return;
  }

  socket.emit('send-call-invitation', {
    fromUserId: currentUser.id,
    toUserId: toUser.id,
    fromUserName: currentUser.name,
    fromUserPhoto: currentUser.photoURL
  });

  showOutgoingCallUI(toUser.name);
}

// Handle responses
socket.on('call-invitation-accepted', ({ callId }) => {
  console.log('Call accepted, waiting for call-ready...');
});

socket.on('call-invitation-rejected', () => {
  alert('Call was rejected');
  hideOutgoingCallUI();
});
```

---

### 5. **End Call**

```javascript
function endCall(roomId, callId) {
  socket.emit('end-call', {
    roomId,
    callId,
    userId: currentUser.id
  });
}

socket.on('call-ended', ({ roomId, callId }) => {
  closeWebRTCConnection();
  updateUserStatus('online');
});
```

---

### 6. **Mark Offline on App Close**

```javascript
// When user logs out or closes app
async function handleUserLogout() {
  await fetch(`http://localhost:4000/api/users/${currentUser.id}/offline`, {
    method: 'POST'
  });
  
  socket.emit('user-unavailable', { userId: currentUser.id });
  socket.disconnect();
}

// Listen for page unload
window.addEventListener('beforeunload', handleUserLogout);
```

---

## 🔄 User Status Flow

```
┌─────────────┐
│   OFFLINE   │ ← User not authenticated
└──────┬──────┘
       │
       │ (Login & call /api/users/me)
       ↓
┌─────────────┐
│   ONLINE    │ ← User available for calls
└──┬───────┬──┘
   │       │
   │       │ (Receives/sends call invitation)
   │       ↓
   │  ┌─────────────┐
   │  │    BUSY     │ ← User in active call
   │  └─────────────┘
   │       │
   │       │ (Call ends)
   │       │
   ├───────┘
   │
   │ (Logout or disconnect)
   ↓
┌─────────────┐
│   OFFLINE   │
└─────────────┘
```

---

## 📊 Database Changes

### Call Table

```sql
status: 'pending' | 'active' | 'ended' | 'rejected' | 'cancelled'
```

**Status meanings:**
- `pending` - Invitation sent, waiting for response (future use)
- `active` - Call ongoing
- `ended` - Call completed normally
- `rejected` - Invitation was rejected
- `cancelled` - Invitation was cancelled

---

## 🧪 Testing the Flow

### Test 1: User Authentication

```bash
# Get Firebase token from your app, then:
curl -H "Authorization: Bearer YOUR_TOKEN" http://localhost:4000/api/users/me
```

### Test 2: Get All Users

```bash
curl http://localhost:4000/api/users
```

### Test 3: Socket Connection

```javascript
// Use Socket.io client library
const socket = io('http://localhost:4000');

socket.on('connect', () => {
  console.log('Connected');
  socket.emit('user-available', { userId: 'test-user-1' });
});
```

---

## ⚠️ Important Notes

1. **Auto-matching is DISABLED** - Users must manually select who to call
2. **Status tracking** - Status is stored in Redis for fast access
3. **Invitation expiry** - Invitations expire after 1 minute if not answered
4. **Concurrent calls** - Users can only be in one call at a time
5. **Offline cleanup** - Call `/api/users/:userId/offline` before closing app

---

## 🎯 Summary

| Feature | Implementation |
|---------|---------------|
| **User List** | `/api/users` returns all users with status |
| **Status** | `online`, `busy`, `offline` (stored in Redis) |
| **Call Flow** | Manual invitation → Accept → WebRTC → End |
| **Presence** | Tracked via Firebase auth + Redis |
| **Call History** | Stored in PostgreSQL |

---

**Version:** 2.1.0  
**Last Updated:** 2025-10-14  
**Architecture:** Manual User Selection

