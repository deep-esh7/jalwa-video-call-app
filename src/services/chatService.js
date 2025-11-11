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
    // In development, don't use transactions
    const useTransaction = process.env.NODE_ENV === 'production';
    const session = useTransaction ? await mongoose.startSession() : null;
    
    try {
      if (useTransaction) await session.startTransaction();

      // In development, handle string IDs
      let query = { 'participants.userId': senderId };
      if (process.env.NODE_ENV !== 'production') {
        query._id = roomId;
      } else {
        // In production, we expect a valid ObjectId
        query._id = mongoose.Types.ObjectId(roomId);
      }

      const options = useTransaction ? { session } : {};
      let room = await ChatRoom.findOne(query, null, options);
      
      if (!room) {
        if (process.env.NODE_ENV !== 'production') {
          // In development, create a dummy room if it doesn't exist
          logger.warn(`Room ${roomId} not found, creating a dummy room for development`);
          const newRoom = new ChatRoom({
            _id: roomId,
            name: `Room ${roomId}`,
            participants: [{ userId: senderId, role: 'member' }],
            createdBy: senderId,
            updatedBy: senderId,
            isTemporary: true
          });
          await newRoom.save(options);
          return this.sendMessage(roomId, senderId, content, type, metadata);
        }
        throw new Error('Room not found or user is not a participant');
      }

      const message = new Message({
        roomId,
        senderId,
        content,
        type,
        metadata,
        readBy: [{ userId: senderId, readAt: new Date() }],
      });

      await message.save(options);

      room.lastMessage = message._id;
      room.updatedAt = new Date();
      room.updatedBy = senderId;
      
      // Find the participant and update their lastSeen
      const participant = room.participants.find(p => p.userId === senderId);
      if (participant) {
        participant.lastSeen = new Date();
      }
      
      await room.save(options);

      if (useTransaction) await session.commitTransaction();
      return message;
    } catch (error) {
      if (useTransaction) {
        await session.abortTransaction();
      }
      logger.error('Error sending message:', error);
      throw error;
    } finally {
      if (session) {
        session.endSession();
      }
    }
  }

  // Get room info
  async getRoomInfo(roomId, userId) {
    try {
      // In development, create a dummy room if it doesn't exist
      if (process.env.NODE_ENV !== 'production') {
        let room = await ChatRoom.findById(roomId).lean();
        
        if (!room) {
          logger.warn(`Room ${roomId} not found, creating a dummy room for development`);
          room = {
            _id: roomId,
            name: `Room ${roomId}`,
            participants: [{ 
              userId: userId || 'anonymous', 
              role: 'member',
              joinedAt: new Date()
            }],
            createdAt: new Date(),
            updatedAt: new Date(),
            isTemporary: true,
            isGroup: false,
            lastMessage: null
          };
          
          // Save the dummy room to the database
          await new ChatRoom(room).save().catch(err => {
            logger.warn('Error saving dummy room (this is expected in some cases):', err.message);
          });
        }

        // Generate participant details without Prisma in development
        const participantsWithDetails = room.participants.map(p => {
          const isCurrentUser = p.userId === userId;
          const displayName = isCurrentUser ? 'You' : 
            (p.userId.startsWith('anon-') ? 'Anonymous User' : `User ${p.userId.substring(0, 6)}`);
            
          return {
            ...p,
            user: {
              id: p.userId,
              name: displayName,
              photoURL: null,
              status: 'online',
              isAnonymous: p.userId.startsWith('anon-')
            }
          };
        });

        return { 
          ...room, 
          participants: participantsWithDetails,
          isTemporary: room.isTemporary !== false // Ensure isTemporary is always defined
        };
      }

      // Production code
      const room = await ChatRoom.findById(roomId)
        .populate('lastMessage')
        .populate('participants.userId', 'name avatar');

      if (!room) {
        throw new Error('Room not found');
      }

      const participantIds = room.participants.map(p => p.userId);
      let users = [];

      try {
        users = await prisma.user.findMany({
          where: { id: { in: participantIds } },
          select: { id: true, name: true, email: true, photoURL: true, status: true },
        });
      } catch (prismaError) {
        logger.error('Error fetching user details from Prisma:', prismaError);
        throw prismaError;
      }

      const participantsWithDetails = room.participants.map(p => ({
        ...p.toObject(),
        user: users.find(u => u.id === p.userId) || { id: p.userId },
      }));

      return { ...room.toObject(), participants: participantsWithDetails };
    } catch (error) {
      logger.error('Error getting room info:', error);
      // In development, return a dummy room instead of throwing
      if (process.env.NODE_ENV !== 'production') {
        return {
          _id: roomId,
          name: `Room ${roomId}`,
          participants: [{ userId: userId || 'anonymous', role: 'member' }],
          createdAt: new Date(),
          updatedAt: new Date(),
          isTemporary: true
        };
      }
      throw error;
    }
  }

  // Get chat history
  async getChatHistory(roomId, userId, { skip = 0, limit = 50 } = {}) {
    try {
      // In development, return mock data
      if (process.env.NODE_ENV !== 'production') {
        console.log('Development mode: Returning mock chat history for room', roomId);
        // Return empty array or mock messages for development
        return [];
      }

      // Production: Check room access
      const hasAccess = await ChatRoom.exists({ _id: roomId, 'participants.userId': userId });
      if (!hasAccess) throw new Error('Access denied');

      const messages = await Message.find({ roomId })
        .sort({ createdAt: -1 })
        .skip(parseInt(skip))
        .limit(parseInt(limit))
        .lean();

      const senderIds = [...new Set(messages.map(m => m.senderId))];
      
      // Try to get sender info, but don't fail if it doesn't work
      let senders = [];
      try {
        senders = await prisma.user.findMany({
          where: { id: { in: senderIds } },
          select: { id: true, name: true, email: true, photoURL: true },
        });
      } catch (prismaError) {
        logger.warn('Error fetching sender details from Prisma:', prismaError.message);
      }

      return messages.map(m => ({
        ...m,
        sender: senders.find(s => s.id === m.senderId) || { 
          id: m.senderId,
          name: m.senderId === userId ? 'You' : `User ${m.senderId.substring(0, 6)}`,
          photoURL: null
        }
      }));
    } catch (error) {
      logger.error('Error getting chat history:', error);
      // In development, return empty array instead of throwing
      if (process.env.NODE_ENV !== 'production') {
        return [];
      }
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



  // Verify if a user can access a chat room
  async verifyRoomAccess(roomId, userId) {
    try {
      // For testing, allow all anonymous users to access any room
      if (userId && userId.startsWith('anon-')) {
        // Check if room exists, if not create it
        try {
          await ChatRoom.findOneAndUpdate(
            { _id: roomId },
            { 
              $setOnInsert: { 
                name: `Room ${roomId}`,
                participants: [{ userId, role: 'member' }],
                createdBy: userId,
                updatedBy: userId,
                isTemporary: true
              }
            },
            { upsert: true, new: true }
          );
          logger.info(`✅ Access granted: Anonymous user ${userId} accessing room ${roomId}`);
          return true;
        } catch (error) {
          // If we get a duplicate key error, it means another process created the room
          if (error.code === 11000) {
            logger.info(`✅ Room ${roomId} already exists, access granted to ${userId}`);
            return true;
          }
          throw error;
        }
      }

      // For development/testing, allow any roomId (bypassing the database check)
      if (process.env.NODE_ENV !== 'production') {
        logger.info(`✅ Development mode: Allowing access to room ${roomId} for user ${userId}`);
        return true;
      }

      // For production, check if the room exists and user is a participant
      const room = await ChatRoom.findOne({
        _id: roomId,
        'participants.userId': userId
      });

      if (!room) {
        logger.warn(`Access denied: User ${userId} not in room ${roomId}`);
        return false;
      }

      logger.info(`✅ Access granted: User ${userId} can access room ${roomId}`);
      return true;
    } catch (error) {
      // If there's an error (like invalid ObjectId), log it but allow access in development
      if (process.env.NODE_ENV !== 'production') {
        logger.warn(`⚠️  Error verifying room access (allowing in dev): ${error.message}`);
        return true;
      }
      
      logger.error('Error verifying room access:', {
        error: error.message,
        roomId,
        userId
      });
      return false;
    }
  }
}
module.exports = new ChatService();
