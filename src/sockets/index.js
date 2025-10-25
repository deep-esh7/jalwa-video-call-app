// src/sockets/index.js
const logger = require('../config/logger');
const { SOCKET_EVENTS } = require('../constants');

// Import handlers
const ConnectionHandler = require('./connectionHandler');
const CallInvitationHandler = require('./callInvitationHandler');
const CallHandler = require('./callHandler');
const WebRTCHandler = require('./webrtcHandler');
const MatchingHandler = require('./matchingHandler');

// In-memory state
const socketConnections = new Map(); // socketId -> userId
const activeRooms = new Map();       // roomId -> { participants, callId, startTime }
const userSockets = new Map();       // userId -> socketId

/**
 * Initialize Socket.io handlers with Flutter-compatible event names
 * Event naming convention:
 * - fe- prefix: Frontend emits (Client → Server)
 * - be- prefix: Backend emits (Server → Client)
 */
function initializeSocketHandlers(io) {
  // Create handler instances
  const connectionHandler = new ConnectionHandler(io, socketConnections, userSockets);
  const callInvitationHandler = new CallInvitationHandler(io, socketConnections, userSockets, activeRooms);
  const callHandler = new CallHandler(io, activeRooms);
  const webrtcHandler = new WebRTCHandler();
  const matchingHandler = new MatchingHandler(io, socketConnections, userSockets, activeRooms);

  // Cleanup expired invitations every minute
  setInterval(() => {
    callInvitationHandler.cleanupExpiredInvitations();
  }, 60000);

  // Handle new connections
  io.on(SOCKET_EVENTS.CONNECTION, (socket) => {
    logger.info(`🔌 Socket connected: ${socket.id}`);

    // =====================================================================
    // USER PRESENCE EVENTS
    // =====================================================================
    
    // Frontend emits: fe-user-available
    socket.on(SOCKET_EVENTS.FE_USER_AVAILABLE, (data) => {
      connectionHandler.handleUserAvailable(socket, data);
    });

    // Frontend emits: fe-user-unavailable
    socket.on(SOCKET_EVENTS.FE_USER_UNAVAILABLE, (data) => {
      connectionHandler.handleUserUnavailable(socket, data);
    });

    // Frontend emits: fe-get-available-user
    socket.on(SOCKET_EVENTS.FE_GET_AVAILABLE_USER, () => {
      connectionHandler.handleGetAvailableUsers(socket);
    });

    // Frontend emits: fe-request-next-user
    socket.on(SOCKET_EVENTS.FE_REQUEST_NEXT_USER, (data) => {
      matchingHandler.handleRequestNextUser(socket, data);
    });

    // =====================================================================
    // MATCHING EVENTS (Legacy Support)
    // =====================================================================
    
    // Frontend emits: fe-toggle-matching
    socket.on(SOCKET_EVENTS.FE_TOGGLE_MATCHING, (data) => {
      matchingHandler.handleToggleMatching(socket, data);
    });

    // Frontend emits: fe-match-request
    socket.on(SOCKET_EVENTS.FE_MATCH_REQUEST, (data) => {
      matchingHandler.handleMatchRequest(socket, data);
    });

    // =====================================================================
    // CALL INVITATION EVENTS
    // =====================================================================
    
    // Frontend emits: fe-send-call-invitation
    socket.on(SOCKET_EVENTS.FE_SEND_CALL_INVITATION, (data) => {
      callInvitationHandler.handleSendCallInvitation(socket, data);
    });

    // Frontend emits: fe-accept-call-invitation
    socket.on(SOCKET_EVENTS.FE_ACCEPT_CALL_INVITATION, (data) => {
      callInvitationHandler.handleAcceptCallInvitation(socket, data);
    });

    // Frontend emits: fe-reject-call-invitation
    socket.on(SOCKET_EVENTS.FE_REJECT_CALL_INVITATION, (data) => {
      callInvitationHandler.handleRejectCallInvitation(socket, data);
    });

    // Frontend emits: fe-cancel-call-invitation
    socket.on(SOCKET_EVENTS.FE_CANCEL_CALL_INVITATION, (data) => {
      callInvitationHandler.handleCancelCallInvitation(socket, data);
    });

    // =====================================================================
    // CALL MANAGEMENT EVENTS
    // =====================================================================
    
    // Frontend emits: fe-end-call
    socket.on(SOCKET_EVENTS.FE_END_CALL, (data) => {
      callHandler.handleEndCall(socket, data);
    });

    // =====================================================================
    // WEBRTC SIGNALING EVENTS
    // =====================================================================
    
    // Frontend emits: fe-offer
    socket.on(SOCKET_EVENTS.FE_OFFER, (data) => {
      webrtcHandler.handleOffer(socket, data);
    });

    // Frontend emits: fe-answer
    socket.on(SOCKET_EVENTS.FE_ANSWER, (data) => {
      webrtcHandler.handleAnswer(socket, data);
    });

    // Frontend emits: fe-ice-candidate
    socket.on(SOCKET_EVENTS.FE_ICE_CANDIDATE, (data) => {
      webrtcHandler.handleIceCandidate(socket, data);
    });

    // =====================================================================
    // DISCONNECT EVENT
    // =====================================================================
    
    socket.on(SOCKET_EVENTS.DISCONNECT, () => {
      connectionHandler.handleDisconnect(socket);
    });

    // Catch-all logger for any events not explicitly handled above
    const knownEvents = new Set([
      SOCKET_EVENTS.FE_USER_AVAILABLE,
      SOCKET_EVENTS.FE_USER_UNAVAILABLE,
      SOCKET_EVENTS.FE_GET_AVAILABLE_USER,
      SOCKET_EVENTS.FE_REQUEST_NEXT_USER,
      SOCKET_EVENTS.FE_TOGGLE_MATCHING,
      SOCKET_EVENTS.FE_MATCH_REQUEST,
      SOCKET_EVENTS.FE_SEND_CALL_INVITATION,
      SOCKET_EVENTS.FE_ACCEPT_CALL_INVITATION,
      SOCKET_EVENTS.FE_REJECT_CALL_INVITATION,
      SOCKET_EVENTS.FE_CANCEL_CALL_INVITATION,
      SOCKET_EVENTS.FE_END_CALL,
      SOCKET_EVENTS.FE_OFFER,
      SOCKET_EVENTS.FE_ANSWER,
      SOCKET_EVENTS.FE_ICE_CANDIDATE,
      SOCKET_EVENTS.DISCONNECT,
    ]);

    socket.onAny((event, ...args) => {
      if (!knownEvents.has(event)) {
        try {
          logger.debug(`📥 [UNHANDLED EVENT] ${event} from ${socket.id}: ${JSON.stringify(args && args[0])}`);
        } catch (_) {
          logger.debug(`📥 [UNHANDLED EVENT] ${event} from ${socket.id} (payload not JSON-serializable)`);
        }
      }
    });
  });

  logger.info('✅ Socket.io handlers initialized with Flutter-compatible events');
  
  // Return socket state for server.js to use
  return {
    socketConnections,
    activeRooms,
    userSockets,
  };
}

module.exports = {
  initializeSocketHandlers,
  socketState: {
    socketConnections,
    activeRooms,
    userSockets,
  },
};
