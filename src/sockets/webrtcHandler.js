// src/sockets/webrtcHandler.js
const logger = require('../config/logger');
const { SOCKET_EVENTS } = require('../constants');

class WebRTCHandler {
  /**
   * Handle WebRTC offer (from frontend)
   * Frontend emits: fe-offer
   * Backend relays to room as: be-offer
   */
  handleOffer(socket, { roomId, offer }) {
    logger.debug(`📹 Offer from ${socket.id} to room ${roomId}`);
    socket.to(roomId).emit(SOCKET_EVENTS.BE_OFFER, { roomId, offer });
  }

  /**
   * Handle WebRTC answer (from frontend)
   * Frontend emits: fe-answer
   * Backend relays to room as: be-answer
   */
  handleAnswer(socket, { roomId, answer }) {
    logger.debug(`📹 Answer from ${socket.id} to room ${roomId}`);
    socket.to(roomId).emit(SOCKET_EVENTS.BE_ANSWER, { roomId, answer });
  }

  /**
   * Handle ICE candidate (from frontend)
   * Frontend emits: fe-ice-candidate
   * Backend relays to room as: be-ice-candidate
   */
  handleIceCandidate(socket, { roomId, candidate }) {
    logger.debug(`📹 ICE candidate from ${socket.id} to room ${roomId}`);
    socket.to(roomId).emit(SOCKET_EVENTS.BE_ICE_CANDIDATE, { roomId, candidate });
  }
}

module.exports = WebRTCHandler;

