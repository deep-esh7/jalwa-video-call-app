// src/constants/index.js

// Socket Events
const SOCKET_EVENTS = {
  // Client → Server
  CONNECTION: 'connection',
  DISCONNECT: 'disconnect',
  USER_AVAILABLE: 'user-available',
  USER_UNAVAILABLE: 'user-unavailable',
  TOGGLE_MATCHING: 'toggle-matching',
  MATCH_REQUEST: 'match-request',
  MATCH_ACCEPTED: 'match-accepted',
  MATCH_DECLINED: 'match-declined',
  END_CALL: 'end-call',
  FORCE_AVAILABLE: 'force-available',
  GET_AVAILABLE_COUNT: 'get-available-count',
  REQUEST_NEXT_USER: 'request-next-user',
  
  // WebRTC Signaling
  OFFER: 'offer',
  ANSWER: 'answer',
  ICE_CANDIDATE: 'ice-candidate',
  
  // Server → Client
  JOINED: 'joined',
  CALL_READY: 'call-ready',
  CALL_ENDED: 'call-ended',
  AVAILABLE_USERS: 'available-users',
  NO_USERS_AVAILABLE: 'no-users-available',
  FREED: 'freed',
  TOGGLE_MATCHING_ACK: 'toggle-matching-ack',
  USER_UNAVAILABLE_ACK: 'user-unavailable-ack',
  END_CALL_ACK: 'end-call-ack',
  ERROR: 'error',
};

// User Status
const USER_STATUS = {
  ONLINE: 'online',
  OFFLINE: 'offline',
  BUSY: 'busy',
};

// Call Status
const CALL_STATUS = {
  ACTIVE: 'active',
  ENDED: 'ended',
  REJECTED: 'rejected',
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

