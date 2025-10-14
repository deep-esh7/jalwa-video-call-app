// src/sockets/index.js
const logger = require('../config/logger');
const { SOCKET_EVENTS } = require('../constants');
const { MatchingService } = require('../services');

const ConnectionHandler = require('./connectionHandler');
const MatchingHandler = require('./matchingHandler');
const CallHandler = require('./callHandler');
const CallInvitationHandler = require('./callInvitationHandler');
const WebRTCHandler = require('./webrtcHandler');

// In-memory state
const socketConnections = new Map();
const activeRooms = new Map();
const userSockets = new Map();

/**
 * Initialize Socket.io handlers
 */
function initializeSocketHandlers(io) {
  // Create handler instances
  const connectionHandler = new ConnectionHandler(io, socketConnections, userSockets);
  const matchingHandler = new MatchingHandler(io, socketConnections, userSockets, activeRooms);
  const callHandler = new CallHandler(io, activeRooms);
  const callInvitationHandler = new CallInvitationHandler(io, socketConnections, userSockets, activeRooms);
  const webrtcHandler = new WebRTCHandler();

  // Cleanup expired invitations every minute
  setInterval(() => {
    callInvitationHandler.cleanupExpiredInvitations();
  }, 60000);

  // Handle new connections
  io.on(SOCKET_EVENTS.CONNECTION, (socket) => {
    logger.info(`Socket connected: ${socket.id}`);

    // Connection events
    socket.on(SOCKET_EVENTS.USER_AVAILABLE, (data) =>
      connectionHandler.handleUserAvailable(socket, data)
    );

    socket.on(SOCKET_EVENTS.USER_UNAVAILABLE, (data) =>
      connectionHandler.handleUserUnavailable(socket, data)
    );

    // Matching events
    socket.on(SOCKET_EVENTS.TOGGLE_MATCHING, (data) =>
      matchingHandler.handleToggleMatching(socket, data)
    );

    socket.on(SOCKET_EVENTS.MATCH_REQUEST, (data) =>
      matchingHandler.handleMatchRequest(socket, data)
    );

    socket.on(SOCKET_EVENTS.MATCH_ACCEPTED, (data) =>
      matchingHandler.handleMatchAccepted(socket, data)
    );

    socket.on(SOCKET_EVENTS.MATCH_DECLINED, (data) =>
      matchingHandler.handleMatchDeclined(socket, data)
    );

    socket.on(SOCKET_EVENTS.GET_AVAILABLE_COUNT, () =>
      matchingHandler.handleGetAvailableCount(socket)
    );

    socket.on(SOCKET_EVENTS.REQUEST_NEXT_USER, (data) =>
      matchingHandler.handleRequestNextUser(socket, data)
    );

    // Call events
    socket.on(SOCKET_EVENTS.END_CALL, (data) =>
      callHandler.handleEndCall(socket, data)
    );

    socket.on(SOCKET_EVENTS.FORCE_AVAILABLE, (data) =>
      callHandler.handleForceAvailable(socket, data, userSockets, MatchingService)
    );

    // Call invitation events (NEW)
    socket.on(SOCKET_EVENTS.SEND_CALL_INVITATION, (data) =>
      callInvitationHandler.handleSendCallInvitation(socket, data)
    );

    socket.on(SOCKET_EVENTS.ACCEPT_CALL_INVITATION, (data) =>
      callInvitationHandler.handleAcceptCallInvitation(socket, data)
    );

    socket.on(SOCKET_EVENTS.REJECT_CALL_INVITATION, (data) =>
      callInvitationHandler.handleRejectCallInvitation(socket, data)
    );

    socket.on(SOCKET_EVENTS.CANCEL_CALL_INVITATION, (data) =>
      callInvitationHandler.handleCancelCallInvitation(socket, data)
    );

    // WebRTC signaling events
    socket.on(SOCKET_EVENTS.OFFER, (data) =>
      webrtcHandler.handleOffer(socket, data)
    );

    socket.on(SOCKET_EVENTS.ANSWER, (data) =>
      webrtcHandler.handleAnswer(socket, data)
    );

    socket.on(SOCKET_EVENTS.ICE_CANDIDATE, (data) =>
      webrtcHandler.handleIceCandidate(socket, data)
    );

    // Disconnect event
    socket.on(SOCKET_EVENTS.DISCONNECT, () =>
      connectionHandler.handleDisconnect(socket, activeRooms, MatchingService)
    );
  });

  logger.info('✅ Socket.io handlers initialized');

  // Return state for health checks and other uses
  return {
    socketConnections,
    activeRooms,
    userSockets,
  };
}

module.exports = initializeSocketHandlers;

