// src/sockets/callInvitationHandler.js
const logger = require('../config/logger');
const { RedisService, CallService, UserService } = require('../services');
const { SOCKET_EVENTS } = require('../constants');

class CallInvitationHandler {
  constructor(io, socketConnections, userSockets, activeRooms) {
    this.io = io;
    this.socketConnections = socketConnections;
    this.userSockets = userSockets;
    this.activeRooms = activeRooms;
    this.pendingInvitations = new Map(); // Store pending invitations
  }

  /**
   * Send call invitation to another user
   */
  async handleSendCallInvitation(socket, { fromUserId, toUserId, fromUserName, fromUserPhoto }) {
    try {
      logger.info(`📞 Call invitation from ${fromUserId} to ${toUserId}`);

      // Validate both users exist
      const fromUser = await UserService.getUserById(fromUserId);
      const toUser = await UserService.getUserById(toUserId);

      if (!fromUser || !toUser) {
        socket.emit(SOCKET_EVENTS.ERROR, { message: 'User not found' });
        return;
      }

      // Check if receiver is online
      const toUserStatus = await RedisService.getUserStatus(toUserId);
      if (toUserStatus !== 'online') {
        socket.emit(SOCKET_EVENTS.ERROR, { 
          message: 'User is not available',
          status: toUserStatus 
        });
        return;
      }

      // Check if receiver has a socket connection
      const toSocketId = this.userSockets.get(toUserId);
      if (!toSocketId) {
        socket.emit(SOCKET_EVENTS.ERROR, { message: 'User is not connected' });
        return;
      }

      const toSocket = this.io.sockets.sockets.get(toSocketId);
      if (!toSocket) {
        socket.emit(SOCKET_EVENTS.ERROR, { message: 'User socket not found' });
        return;
      }

      // Store pending invitation
      const invitationId = `${fromUserId}_${toUserId}_${Date.now()}`;
      this.pendingInvitations.set(invitationId, {
        fromUserId,
        toUserId,
        timestamp: Date.now(),
      });

      // Send invitation to receiver
      toSocket.emit(SOCKET_EVENTS.CALL_INVITATION_RECEIVED, {
        invitationId,
        from: {
          userId: fromUserId,
          name: fromUserName || fromUser.name,
          photoURL: fromUserPhoto || fromUser.photoURL,
        },
      });

      logger.info(`✅ Call invitation sent from ${fromUserId} to ${toUserId}`);
    } catch (error) {
      logger.error(`Failed to send call invitation: ${error.message}`);
      socket.emit(SOCKET_EVENTS.ERROR, { message: 'Failed to send invitation' });
    }
  }

  /**
   * Accept call invitation
   */
  async handleAcceptCallInvitation(socket, { invitationId, userId }) {
    try {
      logger.info(`✅ Call invitation accepted: ${invitationId} by ${userId}`);

      // Get invitation details
      const invitation = this.pendingInvitations.get(invitationId);
      if (!invitation) {
        socket.emit(SOCKET_EVENTS.ERROR, { message: 'Invitation not found or expired' });
        return;
      }

      const { fromUserId, toUserId } = invitation;

      // Verify the accepting user is the correct recipient
      if (userId !== toUserId) {
        socket.emit(SOCKET_EVENTS.ERROR, { message: 'Invalid invitation acceptance' });
        return;
      }

      // Remove from pending invitations
      this.pendingInvitations.delete(invitationId);

      // Get socket IDs
      const fromSocketId = this.userSockets.get(fromUserId);
      const toSocketId = this.userSockets.get(toUserId);

      if (!fromSocketId || !toSocketId) {
        socket.emit(SOCKET_EVENTS.ERROR, { message: 'One or both users disconnected' });
        return;
      }

      const fromSocket = this.io.sockets.sockets.get(fromSocketId);
      const toSocket = this.io.sockets.sockets.get(toSocketId);

      if (!fromSocket || !toSocket) {
        socket.emit(SOCKET_EVENTS.ERROR, { message: 'Socket connection lost' });
        return;
      }

      // Create call in database
      const call = await CallService.createCall(fromUserId, toUserId);
      const roomId = `room_${call.id}`;

      // Mark both users as busy
      await RedisService.setUserBusy(fromUserId);
      await RedisService.setUserBusy(toUserId);

      // Join both to the room
      fromSocket.join(roomId);
      toSocket.join(roomId);

      // Store room info
      this.activeRooms.set(roomId, {
        participants: [fromUserId, toUserId],
        callId: call.id,
        startTime: new Date(),
      });

      // Notify both users that call is ready
      this.io.to(roomId).emit(SOCKET_EVENTS.CALL_READY, {
        roomId,
        callId: call.id,
        isInitiator: fromUserId === call.callerId,
        participants: [
          { userId: fromUserId, socketId: fromSocketId },
          { userId: toUserId, socketId: toSocketId },
        ],
      });

      // Also send specific event to caller
      fromSocket.emit(SOCKET_EVENTS.CALL_INVITATION_ACCEPTED, {
        callId: call.id,
        roomId,
        acceptedBy: toUserId,
      });

      logger.info(`📞 Call created: ${call.id} between ${fromUserId} and ${toUserId}`);
    } catch (error) {
      logger.error(`Failed to accept call invitation: ${error.message}`);
      socket.emit(SOCKET_EVENTS.ERROR, { message: 'Failed to accept invitation' });
    }
  }

  /**
   * Reject call invitation
   */
  async handleRejectCallInvitation(socket, { invitationId, userId }) {
    try {
      logger.info(`❌ Call invitation rejected: ${invitationId} by ${userId}`);

      // Get invitation details
      const invitation = this.pendingInvitations.get(invitationId);
      if (!invitation) {
        socket.emit(SOCKET_EVENTS.ERROR, { message: 'Invitation not found or expired' });
        return;
      }

      const { fromUserId, toUserId } = invitation;

      // Verify the rejecting user is the correct recipient
      if (userId !== toUserId) {
        socket.emit(SOCKET_EVENTS.ERROR, { message: 'Invalid invitation rejection' });
        return;
      }

      // Remove from pending invitations
      this.pendingInvitations.delete(invitationId);

      // Notify the caller that invitation was rejected
      const fromSocketId = this.userSockets.get(fromUserId);
      if (fromSocketId) {
        const fromSocket = this.io.sockets.sockets.get(fromSocketId);
        if (fromSocket) {
          fromSocket.emit(SOCKET_EVENTS.CALL_INVITATION_REJECTED, {
            rejectedBy: toUserId,
          });
        }
      }

      logger.info(`❌ Call invitation rejected from ${fromUserId} by ${toUserId}`);
    } catch (error) {
      logger.error(`Failed to reject call invitation: ${error.message}`);
      socket.emit(SOCKET_EVENTS.ERROR, { message: 'Failed to reject invitation' });
    }
  }

  /**
   * Cancel call invitation (caller cancels)
   */
  async handleCancelCallInvitation(socket, { invitationId, userId }) {
    try {
      logger.info(`🚫 Call invitation cancelled: ${invitationId} by ${userId}`);

      // Get invitation details
      const invitation = this.pendingInvitations.get(invitationId);
      if (!invitation) {
        socket.emit(SOCKET_EVENTS.ERROR, { message: 'Invitation not found or expired' });
        return;
      }

      const { fromUserId, toUserId } = invitation;

      // Verify the cancelling user is the caller
      if (userId !== fromUserId) {
        socket.emit(SOCKET_EVENTS.ERROR, { message: 'Invalid invitation cancellation' });
        return;
      }

      // Remove from pending invitations
      this.pendingInvitations.delete(invitationId);

      // Notify the receiver that invitation was cancelled
      const toSocketId = this.userSockets.get(toUserId);
      if (toSocketId) {
        const toSocket = this.io.sockets.sockets.get(toSocketId);
        if (toSocket) {
          toSocket.emit(SOCKET_EVENTS.CALL_INVITATION_CANCELLED, {
            cancelledBy: fromUserId,
          });
        }
      }

      logger.info(`🚫 Call invitation cancelled by ${fromUserId} to ${toUserId}`);
    } catch (error) {
      logger.error(`Failed to cancel call invitation: ${error.message}`);
      socket.emit(SOCKET_EVENTS.ERROR, { message: 'Failed to cancel invitation' });
    }
  }

  /**
   * Clean up expired invitations (call periodically)
   */
  cleanupExpiredInvitations() {
    const now = Date.now();
    const EXPIRY_TIME = 60000; // 1 minute

    for (const [invitationId, invitation] of this.pendingInvitations.entries()) {
      if (now - invitation.timestamp > EXPIRY_TIME) {
        this.pendingInvitations.delete(invitationId);
        logger.info(`🗑️ Expired invitation removed: ${invitationId}`);
      }
    }
  }
}

module.exports = CallInvitationHandler;

