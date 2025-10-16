// src/constants/index.js

// Socket Events (Matching Flutter frontend naming convention)
// fe- prefix = Frontend emits (Client → Server)
// be- prefix = Backend emits (Server → Client)
const SOCKET_EVENTS = {
  // System Events
  CONNECTION: 'connection',
  DISCONNECT: 'disconnect',
  
  // Frontend → Backend (User Presence)
  FE_USER_AVAILABLE: 'fe-user-available',
  FE_USER_UNAVAILABLE: 'fe-user-unavailable',
  FE_GET_AVAILABLE_COUNT: 'fe-get-available-count',
  FE_REQUEST_NEXT_USER: 'fe-request-next-user',
  
  // Frontend → Backend (Matching - Legacy, keeping for compatibility)
  FE_MATCH_REQUEST: 'fe-match-request',
  FE_TOGGLE_MATCHING: 'fe-toggle-matching',
  
  // Frontend → Backend (Call Management)
  FE_END_CALL: 'fe-end-call',
  FE_SEND_CALL_INVITATION: 'fe-send-call-invitation',
  FE_ACCEPT_CALL_INVITATION: 'fe-accept-call-invitation',
  FE_REJECT_CALL_INVITATION: 'fe-reject-call-invitation',
  FE_CANCEL_CALL_INVITATION: 'fe-cancel-call-invitation',
  
  // Frontend → Backend (WebRTC Signaling)
  FE_OFFER: 'fe-offer',
  FE_ANSWER: 'fe-answer',
  FE_ICE_CANDIDATE: 'fe-ice-candidate',
  
  // Backend → Frontend (User Lists & Status)
  BE_AVAILABLE_USERS: 'be-available-users',
  BE_AVAILABLE_USERS_COUNT: 'be-available-users-count',
  BE_NO_USERS_AVAILABLE: 'be-no-users-available',
  BE_USER_JOINED: 'be-user-joined',
  BE_USER_LEFT: 'be-user-left',
  BE_USER_STATUS_CHANGED: 'be-user-status-changed',
  
  // Backend → Frontend (Call Management)
  BE_CALL_READY: 'be-call-ready',
  BE_CALL_ENDED: 'be-call-ended',
  BE_END_CALL_ACK: 'be-end-call-ack',
  BE_CALL_INVITATION_RECEIVED: 'be-call-invitation-received',
  BE_CALL_INVITATION_ACCEPTED: 'be-call-invitation-accepted',
  BE_CALL_INVITATION_REJECTED: 'be-call-invitation-rejected',
  BE_CALL_INVITATION_CANCELLED: 'be-call-invitation-cancelled',
  
  // Backend → Frontend (Matching - Legacy)
  BE_MATCH_ACCEPTED: 'be-match-accepted',
  BE_MATCH_DECLINED: 'be-match-declined',
  BE_TOGGLE_MATCHING_ACK: 'be-toggle-matching-ack',
  BE_USER_UNAVAILABLE_ACK: 'be-user-unavailable-ack',
  
  // Backend → Frontend (WebRTC Signaling)
  BE_OFFER: 'be-offer',
  BE_ANSWER: 'be-answer',
  BE_ICE_CANDIDATE: 'be-ice-candidate',
  
  // Backend → Frontend (System)
  BE_JOINED: 'be-joined',
  BE_ERROR: 'be-error',
};

// User Status (Removed OFFLINE - only showing available users)
const USER_STATUS = {
  ONLINE: 'online',    // Available for calls
  BUSY: 'busy',        // Currently in a call
};

// Call Status
const CALL_STATUS = {
  PENDING: 'pending',
  ACTIVE: 'active',
  ENDED: 'ended',
  REJECTED: 'rejected',
  CANCELLED: 'cancelled',
};

// User Roles
const USER_ROLES = {
  USER: 'USER',
  ADMIN: 'ADMIN',
};

// Gender
const GENDER = {
  MALE: 'MALE',
  FEMALE: 'FEMALE',
  OTHER: 'OTHER',
};

// Redis Keys
const REDIS_KEYS = {
  AVAILABLE_USERS: 'jalwa:available_users',
  USER_STATUS: (userId) => `jalwa:user:${userId}:status`,
  USER_SOCKET: (userId) => `jalwa:user:${userId}:socket`,
  AUTO_MATCHING: (userId) => `jalwa:user:${userId}:auto_matching`,
};

// HTTP Status Codes
const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  INTERNAL_SERVER_ERROR: 500,
};

module.exports = {
  SOCKET_EVENTS,
  USER_STATUS,
  CALL_STATUS,
  USER_ROLES,
  GENDER,
  REDIS_KEYS,
  HTTP_STATUS,
};
