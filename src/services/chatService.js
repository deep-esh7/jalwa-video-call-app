const mongoose = require('mongoose');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { Message, ChatRoom, TypingStatus } = require('../models/chatModels');
const logger = require('../config/logger');

class ChatService {
  // Create a new chat room
  async createRoom(roomData, participantIds, creatorId) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // Verify all users exist in Prisma
      const users = await prisma.user.findMany({
        where: { id: { in: [...participantIds, creatorId] } },
        select: { id: true },
      });

      const userIds = users.map(u => u.id);
      const missingUsers = participantIds.filter(id => !userIds.includes(id));
      if (missingUsers.length > 0) throw new Error(`Users not found: ${missingUsers.join(', ')}`);

      const participants = [...new Set([...participantIds, creatorId])].map(id => ({
        userId: id,
        role: id === creatorId ? 'admin' : 'member',
      }));

      const room = new ChatRoom({
        ...roomData,
        participants,
        createdBy: creatorId,
        updatedBy: creatorId,
      });

      await room.save({ session });
      await session.commitTransaction();

      return this.getRoomInfo(room._id, creatorId);
    } catch (error) {
      await session.abortTransaction();
      logger.error('Error creating chat room:', error);
      throw error;
    } finally {
      session.endSession();
    }
  }

  // Send a message
  async sendMessage(roomId, senderId, content, type = 'text', metadata = {}) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const room = await ChatRoom.findOne({ _id: roomId, 'participants.userId': senderId }).session(session);
      if (!room) throw new Error('Room not found or user is not a participant');

      const message = new Message({
        roomId,
        senderId,
        content,
        type,
        metadata,
        readBy: [{ userId: senderId, readAt: new Date() }],
      });

      await message.save({ session });

      room.lastMessage = message._id;
      room.updatedBy = senderId;
      await room.save({ session });

      await session.commitTransaction();
      return message;
    } catch (error) {
      await session.abortTransaction();
      logger.error('Error sending message:', error);
      throw error;
    } finally {
      session.endSession();
    }
  }

  // Get room info
  async getRoomInfo(roomId, userId) {
    try {
      const room = await ChatRoom.findById(roomId);
      if (!room) throw new Error('Room not found');

      const participantIds = room.participants.map(p => p.userId);
      const users = await prisma.user.findMany({
        where: { id: { in: participantIds } },
        select: { id: true, name: true, email: true, photoURL: true, status: true },
      });

      const participantsWithDetails = room.participants.map(p => ({
        ...p.toObject(),
        user: users.find(u => u.id === p.userId) || { id: p.userId },
      }));

      return { ...room.toObject(), participants: participantsWithDetails };
    } catch (error) {
      logger.error('Error getting room info:', error);
      throw error;
    }
  }

  // Get chat history
  async getChatHistory(roomId, userId, { skip = 0, limit = 50 } = {}) {
    try {
      const hasAccess = await ChatRoom.exists({ _id: roomId, 'participants.userId': userId });
      if (!hasAccess) throw new Error('Access denied');

      const messages = await Message.find({ roomId })
        .sort({ createdAt: -1 })
        .skip(parseInt(skip))
        .limit(parseInt(limit))
        .lean();

      const senderIds = [...new Set(messages.map(m => m.senderId))];
      const senders = await prisma.user.findMany({
        where: { id: { in: senderIds } },
        select: { id: true, name: true, email: true, photoURL: true },
      });

      return messages.map(m => ({ ...m, sender: senders.find(s => s.id === m.senderId) || { id: m.senderId } }));
    } catch (error) {
      logger.error('Error getting chat history:', error);
      throw error;
    }
  }

  // Update typing status
  async updateTypingStatus(roomId, userId, isTyping) {
    try {
      await TypingStatus.findOneAndUpdate({ roomId, userId }, { isTyping }, { upsert: true, new: true });
    } catch (error) {
      logger.error('Error updating typing status:', error);
      throw error;
    }
  }

  // Mark messages as read
  async markMessagesAsRead(roomId, userId, messageIds) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      await Message.updateMany(
        { _id: { $in: messageIds }, roomId, 'readBy.userId': { $ne: userId } },
        { $push: { readBy: { userId, readAt: new Date() } } }
      ).session(session);

      await ChatRoom.updateOne(
        { _id: roomId, 'participants.userId': userId },
        { $set: { 'participants.$.lastSeen': new Date() } }
      ).session(session);

      await session.commitTransaction();
    } catch (error) {
      await session.abortTransaction();
      logger.error('Error marking messages as read:', error);
      throw error;
    } finally {
      session.endSession();
    }
  }
}

module.exports = new ChatService();
