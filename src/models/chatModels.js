// src/models/chatModels.js
const mongoose = require('mongoose');
const { Schema } = mongoose;

// Message schema
const messageSchema = new Schema({
  roomId: { 
    type: process.env.NODE_ENV !== 'production' ? String : Schema.Types.ObjectId,
    ref: 'ChatRoom',
    required: true 
  },
  senderId: { 
    type: String,  // This will store Prisma's User ID (UUID)
    required: true 
  },
  content: {
    type: String,
    required: true
  },
  readBy: [{
    userId: String,  // Prisma User ID
    readAt: {
      type: Date,
      default: Date.now
    }
  }],
  type: {
    type: String,
    enum: ['text', 'image', 'video', 'audio', 'file'],
    default: 'text'
  },
  metadata: Schema.Types.Mixed
}, { timestamps: true });

// Chat room schema
const chatRoomSchema = new Schema({
  _id: process.env.NODE_ENV !== 'production' ? String : Schema.Types.ObjectId,
  name: String,
  isGroup: {
    type: Boolean,
    default: false
  },
  participants: [{
    userId: String,  // Prisma User ID
    joinedAt: {
      type: Date,
      default: Date.now
    },
    leftAt: Date,
    isActive: {
      type: Boolean,
      default: true
    },
    lastSeen: {
      type: Date,
      default: Date.now
    },
    role: {
      type: String,
      enum: ['admin', 'moderator', 'member'],
      default: 'member'
    }
  }],
  lastMessage: {
    type: Schema.Types.ObjectId,
    ref: 'Message'
  },
  createdBy: String,  // Prisma User ID
  updatedBy: String   // Prisma User ID
}, { timestamps: true });

// Typing status schema
const typingStatusSchema = new Schema({
  userId: String,  // Prisma User ID
  roomId: {
    type: Schema.Types.ObjectId,
    ref: 'ChatRoom'
  },
  isTyping: {
    type: Boolean,
    default: false
  }
}, { timestamps: true });

// Indexes
messageSchema.index({ roomId: 1, createdAt: -1 });
chatRoomSchema.index({ 'participants.userId': 1, updatedAt: -1 });
typingStatusSchema.index({ userId: 1, roomId: 1 }, { unique: true });

// Create models
const Message = mongoose.model('Message', messageSchema);
const ChatRoom = mongoose.model('ChatRoom', chatRoomSchema);
const TypingStatus = mongoose.model('TypingStatus', typingStatusSchema);

module.exports = {
  Message,
  ChatRoom,
  TypingStatus
};