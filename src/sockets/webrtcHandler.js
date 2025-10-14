// src/sockets/webrtcHandler.js
const logger = require('../config/logger');
const { SOCKET_EVENTS } = require('../constants');

class WebRTCHandler {
  /**
   * Handle WebRTC offer
   */
  handleOffer(socket, { roomId, offer }) {
    logger.debug(`Offer from ${socket.id} to room ${roomId}`);
    socket.to(roomId).emit(SOCKET_EVENTS.OFFER, { offer });
  }

  /**
   * Handle WebRTC answer
   */
  handleAnswer(socket, { roomId, answer }) {
    logger.debug(`Answer from ${socket.id} to room ${roomId}`);
    socket.to(roomId).emit(SOCKET_EVENTS.ANSWER, { answer });
  }

  /**
   * Handle ICE candidate
   */
  handleIceCandidate(socket, { roomId, candidate }) {
    logger.debug(`ICE candidate from ${socket.id} to room ${roomId}`);
    socket.to(roomId).emit(SOCKET_EVENTS.ICE_CANDIDATE, { candidate });
  }
}

module.exports = WebRTCHandler;

