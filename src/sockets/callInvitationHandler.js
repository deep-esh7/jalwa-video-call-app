// src/sockets/callInvitationHandler.js
const { v4: uuidv4 } = require('uuid');
const logger = require('../config/logger');
const { SOCKET_EVENTS, USER_STATUS } = require('../constants');
const { CallService, RedisService, UserService } = require('../services');

class CallInvitationHandler {
  constructor(io, socketConnections, userSockets, activeRooms) {
    this.io = io;
    this.socketConnections = socketConnections;
    this.userSockets = userSockets;
    this.activeRooms = activeRooms;
    this.pendingInvitations = new Map(); // Map<invitationId, {callerId, receiverId, timestamp}>
  }

  /**
   * Broadcast available users list to everyone
   */
  async broadcastAvailableUsers() {
    try {
      const availableUserIds = await RedisService.getAllAvailableUserIds();
      
      if (availableUserIds.length === 0) {
        this.io.emit(SOCKET_EVENTS.BE_NO_USERS_AVAILABLE);
        return;
      }

      const users = await UserService.getAvailableUsersWithDetails(availableUserIds);
      const usersWithStatus = await Promise.all(
        users.map(async (user) => {
          const status = await RedisService.getUserStatus(user.id);
          return { ...user, status: status || USER_STATUS.ONLINE };
        })
      );

      this.io.emit(SOCKET_EVENTS.BE_AVAILABLE_USERS, {
        users: usersWithStatus,
        count: usersWithStatus.length,
      });
    } catch (error) {
      logger.error(`Failed to broadcast available users: ${error.message}`);
    }
  }

  /**
   * Handle send call invitation
   */
  async handleSendCallInvitation(socket, data) {
    try {
      const { fromUserId, toUserId, fromUserName } = data;

      logger.info(`📞 Call invitation from ${fromUserId} to ${toUserId}`);

      // Validate receiver is online
      const receiverStatus = await RedisService.getUserStatus(toUserId);
      if (receiverStatus !== USER_STATUS.ONLINE) {
        socket.emit(SOCKET_EVENTS.BE_CALL_INVITATION_REJECTED, {
          reason: `User is ${receiverStatus || 'not available'}`,
          toUserId,
        });
        logger.warn(`Call invitation failed: ${toUserId} is ${receiverStatus}`);
        return;
      }

      // Validate caller is online
      const callerStatus = await RedisService.getUserStatus(fromUserId);
      if (callerStatus !== USER_STATUS.ONLINE) {
        socket.emit(SOCKET_EVENTS.BE_CALL_INVITATION_REJECTED, {
          reason: 'You are not available for a call',
          toUserId,
        });
        logger.warn(`Call invitation failed: ${fromUserId} is ${callerStatus}`);
        return;
      }

      // Get receiver's socket
      const receiverSocketId = this.userSockets.get(toUserId);
      if (!receiverSocketId) {
        socket.emit(SOCKET_EVENTS.BE_CALL_INVITATION_REJECTED, {
          reason: 'Receiver socket not found',
          toUserId,
        });
        logger.warn(`Call invitation failed: ${toUserId} has no active socket`);
        return;
      }

      // Create invitation ID
      const invitationId = `${fromUserId}_${toUserId}_${Date.now()}`;
      this.pendingInvitations.set(invitationId, {
        callerId: fromUserId,
        receiverId: toUserId,
        timestamp: Date.now(),
        status: 'pending',
      });

      // Get caller info
      const callerInfo = await UserService.getUserById(fromUserId);

      // Notify receiver
      this.io.to(receiverSocketId).emit(SOCKET_EVENTS.BE_CALL_INVITATION_RECEIVED, {
        invitationId,
        from: {
          userId: fromUserId,
          name: callerInfo?.name || fromUserName || 'Unknown User',
          photoURL: callerInfo?.photoURL || null,
        },
      });

      logger.info(`✅ Call invitation sent from ${fromUserId} to ${toUserId}`);
    } catch (error) {
      logger.error(`Error sending call invitation: ${error.message}`);
      socket.emit(SOCKET_EVENTS.BE_ERROR, { message: 'Failed to send call invitation' });
    }
  }

  /**
   * Handle accept call invitation
   */
  async handleAcceptCallInvitation(socket, data) {
    try {
      const { invitationId, userId } = data;

      const invitation = this.pendingInvitations.get(invitationId);
      if (!invitation || invitation.status !== 'pending') {
        socket.emit(SOCKET_EVENTS.BE_ERROR, { message: 'Invalid or expired invitation' });
        logger.warn(`Invalid invitation acceptance attempt: ${invitationId}`);
        return;
      }

      const { callerId, receiverId } = invitation;

      logger.info(`✅ Call invitation accepted: ${invitationId} by ${userId}`);

      // Verify both users are still online
      const callerStatus = await RedisService.getUserStatus(callerId);
      const receiverStatus = await RedisService.getUserStatus(receiverId);

      if (callerStatus !== USER_STATUS.ONLINE || receiverStatus !== USER_STATUS.ONLINE) {
        socket.emit(SOCKET_EVENTS.BE_ERROR, { message: 'One or both users are no longer available' });
        this.io.to(this.userSockets.get(callerId)).emit(SOCKET_EVENTS.BE_CALL_INVITATION_REJECTED, {
          reason: 'One or both users are no longer available',
          toUserId: receiverId,
        });
        this.pendingInvitations.delete(invitationId);
        return;
      }

      // Create call in database
      const call = await CallService.createCall(callerId, receiverId);
      const roomId = `room_${call.id}`;

      // Mark both users as busy
      await RedisService.setUserBusy(callerId);
      await RedisService.setUserBusy(receiverId);

      // Join both sockets to room
      const callerSocket = this.io.sockets.sockets.get(this.userSockets.get(callerId));
      const receiverSocket = this.io.sockets.sockets.get(this.userSockets.get(receiverId));

      if (callerSocket && receiverSocket) {
        callerSocket.join(roomId);
        receiverSocket.join(roomId);

        this.activeRooms.set(roomId, {
          participants: [callerId, receiverId],
          callId: call.id,
          startTime: new Date(),
        });

        // Notify both users that call is ready. Provide explicit initiator identity.
        this.io.to(roomId).emit(SOCKET_EVENTS.BE_CALL_READY, {
          roomId,
          callId: call.id,
          initiatorUserId: callerId,
          initiatorSocketId: this.userSockets.get(callerId),
          participants: [
            { userId: callerId, socketId: this.userSockets.get(callerId) },
            { userId: receiverId, socketId: this.userSockets.get(receiverId) },
          ],
        });

        // Notify caller specifically
        this.io.to(this.userSockets.get(callerId)).emit(SOCKET_EVENTS.BE_CALL_INVITATION_ACCEPTED, {
          invitationId,
          roomId,
          callId: call.id,
          toUserId: receiverId,
        });

        logger.info(`📞 Call created: ${call.id} between ${callerId} and ${receiverId}`);
        
        this.pendingInvitations.delete(invitationId);

        // Broadcast updated available users (both now busy)
        await this.broadcastAvailableUsers();
      } else {
        logger.warn(`Sockets not found for accepted call, cleaning up`);
        await CallService.endCall(call.id);
        this.pendingInvitations.delete(invitationId);
      }
    } catch (error) {
      logger.error(`Error accepting call invitation: ${error.message}`);
      socket.emit(SOCKET_EVENTS.BE_ERROR, { message: 'Failed to accept call invitation' });
    }
  }

  /**
   * Handle reject call invitation
   */
  async handleRejectCallInvitation(socket, data) {
    try {
      const { invitationId, userId } = data;

      const invitation = this.pendingInvitations.get(invitationId);
      if (!invitation) {
        socket.emit(SOCKET_EVENTS.BE_ERROR, { message: 'Invalid or expired invitation' });
        return;
      }

      const { callerId, receiverId } = invitation;
      const callerSocketId = this.userSockets.get(callerId);

      if (callerSocketId) {
        this.io.to(callerSocketId).emit(SOCKET_EVENTS.BE_CALL_INVITATION_REJECTED, {
          invitationId,
          toUserId: receiverId,
          reason: 'Rejected by user',
        });
      }

      this.pendingInvitations.delete(invitationId);
      logger.info(`Invitation ${invitationId} rejected by ${receiverId}`);
    } catch (error) {
      logger.error(`Error rejecting call invitation: ${error.message}`);
      socket.emit(SOCKET_EVENTS.BE_ERROR, { message: 'Failed to reject call invitation' });
    }
  }

  /**
   * Handle cancel call invitation
   */
  async handleCancelCallInvitation(socket, data) {
    try {
      const { invitationId, userId } = data;

      const invitation = this.pendingInvitations.get(invitationId);
      if (!invitation) {
        socket.emit(SOCKET_EVENTS.BE_ERROR, { message: 'Invalid or expired invitation' });
        return;
      }

      const { callerId, receiverId } = invitation;
      const receiverSocketId = this.userSockets.get(receiverId);

      if (receiverSocketId) {
        this.io.to(receiverSocketId).emit(SOCKET_EVENTS.BE_CALL_INVITATION_CANCELLED, {
          invitationId,
          fromUserId: callerId,
          reason: 'Caller cancelled',
        });
      }

      this.pendingInvitations.delete(invitationId);
      logger.info(`Invitation ${invitationId} cancelled by ${callerId}`);
    } catch (error) {
      logger.error(`Error cancelling call invitation: ${error.message}`);
      socket.emit(SOCKET_EVENTS.BE_ERROR, { message: 'Failed to cancel call invitation' });
    }
  }

  /**
   * Cleanup expired invitations (called periodically)
   */
  cleanupExpiredInvitations() {
    const now = Date.now();
    const expirationTime = 60 * 1000; // 1 minute

    for (const [invitationId, invitation] of this.pendingInvitations.entries()) {
      if (now - invitation.timestamp > expirationTime) {
        logger.info(`Cleaning up expired invitation: ${invitationId}`);
        
        const { callerId, receiverId } = invitation;

        // Notify caller
        const callerSocketId = this.userSockets.get(callerId);
        if (callerSocketId) {
          this.io.to(callerSocketId).emit(SOCKET_EVENTS.BE_CALL_INVITATION_REJECTED, {
            invitationId,
            toUserId: receiverId,
            reason: 'Invitation expired',
          });
        }

        // Notify receiver
        const receiverSocketId = this.userSockets.get(receiverId);
        if (receiverSocketId) {
          this.io.to(receiverSocketId).emit(SOCKET_EVENTS.BE_CALL_INVITATION_CANCELLED, {
            invitationId,
            fromUserId: callerId,
            reason: 'Invitation expired',
          });
        }

        this.pendingInvitations.delete(invitationId);
      }
    }
  }
}

module.exports = CallInvitationHandler;
