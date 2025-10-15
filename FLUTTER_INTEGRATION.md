# 🚀 Flutter Integration Guide - Jalwa Video Call Backend

## Overview

This backend is now fully compatible with your Flutter app's socket event naming convention (`fe-` and `be-` prefixes).

**Event Naming Convention:**
- `fe-` prefix = Frontend Emits (Flutter → Backend)
- `be-` prefix = Backend Emits (Backend → Flutter)

---

## 📡 API Endpoints

### 1. Primary Endpoint: User Authentication & Creation

```dart
// Endpoint: GET /api/users/me
// Headers: Authorization: Bearer <firebase_token>

Future<User> authenticateUser(String firebaseToken) async {
  final response = await http.get(
    Uri.parse('http://localhost:4000/api/users/me'),
    headers: {
      'Authorization': 'Bearer $firebaseToken',
    },
  );
  
  if (response.statusCode == 200) {
    final data = jsonDecode(response.body);
    return User.fromJson(data['data']);
  }
  throw Exception('Failed to authenticate');
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "user-123",
    "name": "John Doe",
    "email": "john@example.com",
    "photoURL": "https://...",
    "phoneNumber": "+1234567890",
    "gender": "MALE",
    "createdAt": "2025-10-14T...",
    "updatedAt": "2025-10-14T..."
  }
}
```

**Note:** This endpoint creates/updates the user in the database but does NOT mark them online. User will be marked online when they connect via socket.

---

## 🔌 Socket.io Integration

### Initialize Socket Connection

```dart
import 'package:socket_io_client/socket_io_client.dart' as IO;

IO.Socket socket;

void connectSocket(String userId) {
  socket = IO.io('http://localhost:4000', <String, dynamic>{
    'transports': ['websocket'],
    'autoConnect': false,
  });

  // Setup listeners before connecting
  setupSocketListeners();

  // Connect
  socket.connect();

  // When connected, mark user as available
  socket.on('connect', (_) {
    print('Socket connected: ${socket.id}');
    markUserAvailable(userId);
  });
}
```

---

## 📨 Socket Events Reference

### 1. User Presence Events

#### ✅ Mark User Online/Available

```dart
// Flutter Event Name: fe-user-available
void markUserAvailable(String userId) {
  socket.emit('fe-user-available', {
    'userId': userId,
  });
}
```

**Backend Response:**
```dart
// Backend Event: be-joined
socket.on('be-joined', (data) {
  print('Joined successfully!');
  print('User ID: ${data['userId']}');
  print('Socket ID: ${data['socketId']}');
  print('ICE Servers: ${data['iceServers']}');
});
```

#### 🔴 Mark User Unavailable

```dart
// Flutter Event Name: fe-user-unavailable
void markUserUnavailable(String userId) {
  socket.emit('fe-user-unavailable', {
    'userId': userId,
  });
}
```

---

### 2. Available Users List (Real-time)

#### 📡 Listen for Available Users List

```dart
// Backend Event: be-available-users
socket.on('be-available-users', (data) {
  List<dynamic> users = data['users'];
  int count = data['count'];
  
  print('Available users: $count');
  
  for (var user in users) {
    print('User: ${user['name']} - Status: ${user['status']}');
    // user['status'] can be 'online' or 'busy'
  }
  
  // Update your UI with available users
  setState(() {
    availableUsers = users.map((u) => User.fromJson(u)).toList();
  });
});
```

#### 📡 Listen for No Users Available

```dart
// Backend Event: be-no-users-available
socket.on('be-no-users-available', (_) {
  print('No users available right now');
  setState(() {
    availableUsers = [];
  });
});
```

#### 👤 Listen for User Joined

```dart
// Backend Event: be-user-joined
socket.on('be-user-joined', (data) {
  String userId = data['userId'];
  print('User $userId just joined');
  // The available users list will be automatically broadcasted
});
```

#### 👋 Listen for User Left

```dart
// Backend Event: be-user-left
socket.on('be-user-left', (data) {
  String userId = data['userId'];
  print('User $userId just left');
  // The available users list will be automatically broadcasted
});
```

#### 📊 Get Available Count

```dart
// Flutter Event Name: fe-get-available-count
void getAvailableCount() {
  socket.emit('fe-get-available-count');
}

// Backend Response: be-available-users-count
socket.on('be-available-users-count', (data) {
  int count = data['count'];
  print('Available users count: $count');
});
```

---

### 3. Call Invitation Events

#### 📞 Send Call Invitation

```dart
// Flutter Event Name: fe-send-call-invitation
void sendCallInvitation(String fromUserId, String toUserId, String fromUserName) {
  socket.emit('fe-send-call-invitation', {
    'fromUserId': fromUserId,
    'toUserId': toUserId,
    'fromUserName': fromUserName,
  });
}
```

#### 🔔 Receive Call Invitation

```dart
// Backend Event: be-call-invitation-received
socket.on('be-call-invitation-received', (data) {
  String invitationId = data['invitationId'];
  Map<String, dynamic> from = data['from'];
  
  print('Incoming call from: ${from['name']}');
  
  // Show incoming call UI
  showIncomingCallDialog(
    callerName: from['name'],
    callerPhoto: from['photoURL'],
    onAccept: () => acceptCallInvitation(invitationId, currentUserId),
    onReject: () => rejectCallInvitation(invitationId, currentUserId),
  );
});
```

#### ✅ Accept Call Invitation

```dart
// Flutter Event Name: fe-accept-call-invitation
void acceptCallInvitation(String invitationId, String userId) {
  socket.emit('fe-accept-call-invitation', {
    'invitationId': invitationId,
    'userId': userId,
  });
}
```

#### ❌ Reject Call Invitation

```dart
// Flutter Event Name: fe-reject-call-invitation
void rejectCallInvitation(String invitationId, String userId) {
  socket.emit('fe-reject-call-invitation', {
    'invitationId': invitationId,
    'userId': userId,
  });
}
```

#### 🚫 Cancel Call Invitation (Caller)

```dart
// Flutter Event Name: fe-cancel-call-invitation
void cancelCallInvitation(String invitationId, String userId) {
  socket.emit('fe-cancel-call-invitation', {
    'invitationId': invitationId,
    'userId': userId,
  });
}
```

#### 🎉 Call Invitation Accepted

```dart
// Backend Event: be-call-invitation-accepted
socket.on('be-call-invitation-accepted', (data) {
  String invitationId = data['invitationId'];
  String roomId = data['roomId'];
  String callId = data['callId'];
  String toUserId = data['toUserId'];
  
  print('Call accepted! Waiting for call-ready event...');
});
```

#### 💔 Call Invitation Rejected

```dart
// Backend Event: be-call-invitation-rejected
socket.on('be-call-invitation-rejected', (data) {
  String invitationId = data['invitationId'];
  String reason = data['reason'];
  
  print('Call rejected: $reason');
  // Hide "calling..." UI
});
```

#### 🚫 Call Invitation Cancelled

```dart
// Backend Event: be-call-invitation-cancelled
socket.on('be-call-invitation-cancelled', (data) {
  String invitationId = data['invitationId'];
  String reason = data['reason'];
  
  print('Call cancelled: $reason');
  // Hide incoming call UI
});
```

---

### 4. Call Ready & WebRTC

#### 🎥 Call is Ready (Start WebRTC)

```dart
// Backend Event: be-call-ready
socket.on('be-call-ready', (data) async {
  String roomId = data['roomId'];
  String callId = data['callId'];
  List<dynamic> participants = data['participants'];
  
  print('Call is ready! Room: $roomId');
  
  // Find if you are the initiator
  String mySocketId = socket.id;
  bool amIInitiator = participants.firstWhere(
    (p) => p['socketId'] == mySocketId
  ) == participants.first;
  
  // Initialize WebRTC
  await initializeWebRTC(roomId, callId, amIInitiator);
});
```

---

### 5. WebRTC Signaling Events

#### 📡 Send Offer

```dart
// Flutter Event Name: fe-offer
void sendOffer(String roomId, RTCSessionDescription offer) {
  socket.emit('fe-offer', {
    'roomId': roomId,
    'offer': {
      'type': offer.type,
      'sdp': offer.sdp,
    },
  });
}

// Backend Event: be-offer
socket.on('be-offer', (data) async {
  String roomId = data['roomId'];
  Map<String, dynamic> offerData = data['offer'];
  
  RTCSessionDescription offer = RTCSessionDescription(
    offerData['sdp'],
    offerData['type'],
  );
  
  // Handle offer in WebRTC
  await handleOffer(offer, roomId);
});
```

#### 📡 Send Answer

```dart
// Flutter Event Name: fe-answer
void sendAnswer(String roomId, RTCSessionDescription answer) {
  socket.emit('fe-answer', {
    'roomId': roomId,
    'answer': {
      'type': answer.type,
      'sdp': answer.sdp,
    },
  });
}

// Backend Event: be-answer
socket.on('be-answer', (data) async {
  String roomId = data['roomId'];
  Map<String, dynamic> answerData = data['answer'];
  
  RTCSessionDescription answer = RTCSessionDescription(
    answerData['sdp'],
    answerData['type'],
  );
  
  // Handle answer in WebRTC
  await handleAnswer(answer);
});
```

#### 📡 Send ICE Candidate

```dart
// Flutter Event Name: fe-ice-candidate
void sendIceCandidate(String roomId, RTCIceCandidate candidate) {
  socket.emit('fe-ice-candidate', {
    'roomId': roomId,
    'candidate': {
      'candidate': candidate.candidate,
      'sdpMid': candidate.sdpMid,
      'sdpMLineIndex': candidate.sdpMLineIndex,
    },
  });
}

// Backend Event: be-ice-candidate
socket.on('be-ice-candidate', (data) async {
  String roomId = data['roomId'];
  Map<String, dynamic> candidateData = data['candidate'];
  
  RTCIceCandidate candidate = RTCIceCandidate(
    candidateData['candidate'],
    candidateData['sdpMid'],
    candidateData['sdpMLineIndex'],
  );
  
  // Add ICE candidate to peer connection
  await peerConnection.addCandidate(candidate);
});
```

---

### 6. End Call

#### 🔚 End Call

```dart
// Flutter Event Name: fe-end-call
void endCall(String roomId, String callId, String userId) {
  socket.emit('fe-end-call', {
    'roomId': roomId,
    'callId': callId,
    'userId': userId,
  });
}

// Backend Response: be-end-call-ack
socket.on('be-end-call-ack', (data) {
  bool success = data['success'];
  print('Call ended: $success');
});
```

#### 📞 Call Ended (Notification)

```dart
// Backend Event: be-call-ended
socket.on('be-call-ended', (data) {
  String roomId = data['roomId'];
  String callId = data['callId'];
  String endedBy = data['endedBy'];
  
  print('Call ended by: $endedBy');
  
  // Clean up WebRTC resources
  cleanupWebRTC();
  
  // Show "Call ended" message
  // Navigate back to home screen
});
```

---

## 🎯 Complete Flow Example

```dart
class VideoCallService {
  IO.Socket socket;
  String currentUserId;
  String currentRoomId;
  String currentCallId;

  // 1. Initialize
  Future<void> initialize(String firebaseToken) async {
    // Authenticate with backend
    final user = await authenticateUser(firebaseToken);
    currentUserId = user.id;
    
    // Connect socket
    connectSocket(user.id);
  }

  // 2. Setup socket listeners
  void connectSocket(String userId) {
    socket = IO.io('http://localhost:4000', {...});
    
    socket.on('connect', (_) {
      socket.emit('fe-user-available', {'userId': userId});
    });
    
    socket.on('be-available-users', (data) {
      // Update UI with available users
      updateAvailableUsersList(data['users']);
    });
    
    socket.on('be-call-invitation-received', (data) {
      // Show incoming call UI
      showIncomingCall(data);
    });
    
    socket.on('be-call-ready', (data) {
      // Start WebRTC
      currentRoomId = data['roomId'];
      currentCallId = data['callId'];
      initializeWebRTC(data);
    });
    
    socket.on('be-call-ended', (_) {
      // Clean up and go back
      cleanupCall();
    });
    
    // WebRTC signaling
    socket.on('be-offer', handleWebRTCOffer);
    socket.on('be-answer', handleWebRTCAnswer);
    socket.on('be-ice-candidate', handleICECandidate);
    
    socket.connect();
  }

  // 3. Call a user
  void callUser(String targetUserId) {
    socket.emit('fe-send-call-invitation', {
      'fromUserId': currentUserId,
      'toUserId': targetUserId,
      'fromUserName': 'John Doe',
    });
  }

  // 4. Accept incoming call
  void acceptCall(String invitationId) {
    socket.emit('fe-accept-call-invitation', {
      'invitationId': invitationId,
      'userId': currentUserId,
    });
  }

  // 5. End call
  void endCall() {
    socket.emit('fe-end-call', {
      'roomId': currentRoomId,
      'callId': currentCallId,
      'userId': currentUserId,
    });
  }

  // 6. Disconnect
  void disconnect() {
    socket.emit('fe-user-unavailable', {'userId': currentUserId});
    socket.disconnect();
  }
}
```

---

## 🔄 Real-time Updates

### How User List Updates Work

The backend automatically broadcasts the updated available users list whenever:
1. A user connects (`fe-user-available`)
2. A user disconnects (`fe-user-unavailable` or socket disconnect)
3. A user accepts a call (both users become `busy`)
4. A call ends (both users become `online` again)

**You don't need to manually fetch the user list** - just listen to `be-available-users` and it will update automatically!

---

## 📊 User Status

Users can have two statuses:
- `online` - Available for calls
- `busy` - Currently in a call

**Note:** There is no `offline` status. Users who are not connected simply won't appear in the available users list.

---

## 🐛 Error Handling

```dart
// Backend Error Event: be-error
socket.on('be-error', (data) {
  String message = data['message'];
  print('Socket error: $message');
  
  // Show error to user
  showErrorSnackbar(message);
});
```

---

## ✅ Testing Checklist

- [ ] User authentication via `/api/users/me`
- [ ] Socket connection successful
- [ ] User marked as available (`fe-user-available`)
- [ ] Receiving available users list (`be-available-users`)
- [ ] Sending call invitation (`fe-send-call-invitation`)
- [ ] Receiving call invitation (`be-call-invitation-received`)
- [ ] Accepting call (`fe-accept-call-invitation`)
- [ ] Call ready event received (`be-call-ready`)
- [ ] WebRTC offer/answer/ICE exchange working
- [ ] Video call established
- [ ] End call working (`fe-end-call`)
- [ ] User status updates properly
- [ ] Disconnect and cleanup working

---

## 🚀 Backend Server

- **URL**: `http://localhost:4000`
- **Health Check**: `GET /health`
- **Socket.io Path**: `/socket.io/`

---

## 📞 Need Help?

Check the backend logs for debugging:
```bash
tail -f logs/jalwa-combined-*.log
```

All socket events are logged with detailed information!

---

**Backend Version**: 2.1.0  
**Last Updated**: 2025-10-14  
**Status**: ✅ Production Ready

