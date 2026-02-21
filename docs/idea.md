Got it 🚀 Let’s put everything we discussed into a **well-structured document** for your backend architecture (Express + PostgreSQL + MongoDB + Redis). This will serve as a **blueprint** you can follow while building your video calling app.

---

# 📘 Backend Architecture Document

## 1. Overview

We are building a **video calling & chat application** with a **coin-based wallet system**. The backend is built using **Express.js (Node.js)** in **MVC architecture**, with three databases:

* **PostgreSQL** → Wallet, Transactions, Calls, Gifts (structured, financial).
* **MongoDB** → Chat Messages & Conversations (high-volume, flexible).
* **Redis** → Online/Offline Presence, Fast Matchmaking, WebSocket scaling.

---

## 2. Tech Stack

* **Backend Framework**: Express.js + Socket.io
* **Database 1 (SQL)**: PostgreSQL (via Prisma / Sequelize / pg)
* **Database 2 (NoSQL)**: MongoDB (via Mongoose)
* **In-Memory Store**: Redis (via ioredis)
* **Deployment**: PM2 + Nginx reverse proxy
* **OS**: Ubuntu 24.04 (Server)

---

## 3. System Responsibilities

### PostgreSQL

* Users (profiles, gender, roles)
* Wallets (balance per user)
* Transactions (earnings, deductions, withdrawals)
* Calls (call logs, duration, cost)
* Gifts (catalog + gift transactions)
* Withdrawals (women cash-out requests)

### MongoDB

* Conversations (who is talking to whom)
* Messages (actual chat history, delivery/read receipts)

### Redis

* Online/offline presence (TTL keys)
* Matchmaking (sorted sets by location)
* WebSocket pub/sub for scaling across multiple servers

---

## 4. Express Project Structure (MVC)

```
/backend
│── src
│   ├── config/             # DB & server configs
│   │   ├── postgres.ts
│   │   ├── mongo.ts
│   │   └── redis.ts
│   │
│   ├── models/             # Data models
│   │   ├── postgres/       # Sequelize/Prisma models
│   │   │   ├── User.ts
│   │   │   ├── Wallet.ts
│   │   │   ├── Transaction.ts
│   │   │   ├── Call.ts
│   │   │   └── Gift.ts
│   │   └── mongo/          # Mongoose models
│   │       ├── Conversation.ts
│   │       └── Message.ts
│   │
│   ├── controllers/        # Handle requests
│   │   ├── AuthController.ts
│   │   ├── WalletController.ts
│   │   ├── CallController.ts
│   │   ├── GiftController.ts
│   │   ├── ChatController.ts
│   │   └── AdminController.ts
│   │
│   ├── services/           # Business logic
│   │   ├── WalletService.ts
│   │   ├── CallService.ts
│   │   ├── GiftService.ts
│   │   ├── ChatService.ts
│   │   └── PresenceService.ts
│   │
│   ├── routes/             # Express routes
│   │   ├── auth.ts
│   │   ├── wallet.ts
│   │   ├── calls.ts
│   │   ├── gifts.ts
│   │   └── chat.ts
│   │
│   ├── sockets/            # WebSocket (Socket.io)
│   │   ├── chatSocket.ts
│   │   ├── callSocket.ts
│   │   └── presenceSocket.ts
│   │
│   ├── utils/              # Helpers
│   │   ├── token.ts
│   │   └── response.ts
│   │
│   ├── app.ts              # Express app
│   └── server.ts           # HTTP + Socket.io server
│
│── package.json
│── tsconfig.json
```

---

## 5. Database Design

### PostgreSQL (Structured Tables)

**users**

```sql
id (PK) | name | gender | role | email | password_hash | created_at
```

**wallets**

```sql
id (PK) | user_id (FK) | balance | updated_at
```

**transactions**

```sql
id (PK) | user_id (FK) | type (purchase/deduction/earn/withdraw/gift)
amount | status | created_at
```

**calls**

```sql
id (PK) | caller_id (FK) | receiver_id (FK)
start_time | end_time | total_coins
```

**gifts**

```sql
id (PK) | name | cost_coins
```

**gift\_transactions**

```sql
id (PK) | sender_id (FK) | receiver_id (FK)
gift_id (FK) | coins_spent | created_at
```

**withdrawals**

```sql
id (PK) | user_id (FK) | coins | status (pending/approved/rejected) | created_at
```

---

### MongoDB (Flexible Chat Storage)

**Conversation Schema**

```json
{
  "_id": "conv123",
  "participants": ["user1", "user2"],
  "lastMessage": "Hey, you online?",
  "updatedAt": "2025-09-25T12:00:00Z"
}
```

**Message Schema**

```json
{
  "_id": "msg123",
  "conversationId": "conv123",
  "senderId": "user1",
  "receiverId": "user2",
  "text": "Hello 👋",
  "status": "sent | delivered | read",
  "createdAt": "2025-09-25T12:01:00Z"
}
```

---

### Redis (Ephemeral Presence & Matchmaking)

**Keys Example**

* `user:123:status = online` (TTL: 60s, auto-expire)
* `user:123:socket = socketId123`
* `nearby:delhi = [user1, user2, user3]`

---

## 6. WebSocket Events

| Event             | Direction       | Description                |
| ----------------- | --------------- | -------------------------- |
| `chat:message`    | Client ↔ Server | Send/receive chat messages |
| `chat:typing`     | Client ↔ Server | Typing indicator           |
| `presence:update` | Client → Server | Online/offline update      |
| `call:invite`     | Client → Server | Initiate call              |
| `call:answer`     | Client ↔ Server | Accept/reject call         |
| `call:end`        | Client ↔ Server | End call                   |
| `gift:sent`       | Client → Server | Send gifts in real time    |

---

## 7. Flow Example (Video Call + Wallet)

1. Man clicks **Call** → Express (REST) creates `call_session`.
2. WebSocket → `call:invite` sent to woman.
3. Woman accepts → WebRTC signaling starts (via WebSocket).
4. Every minute → coins deducted (Postgres transaction).

   * 50% → woman’s wallet.
   * 50% → app revenue.
5. When call ends → update session in Postgres.

---

## 8. Deployment Notes

* **VPS**: `72.61.225.146` (Ubuntu 24.04)
* **App path**: `/var/www/jalwa-video-call-app`
* **PM2** process: `jalwa-server` on port 4000
* **CI/CD**: Push to `deployment-prod` branch → GitHub Actions auto-deploys
* Ensure **Postgres + Mongo + Redis** are **bound to localhost only** (not public).
* Backups:

  * Postgres → `pg_dump`.
  * MongoDB → `mongodump`.
  * Redis → persistence via RDB/AOF if needed.

See [Deployment Guide](./DEPLOYMENT.md) for full setup details.

---

✅ This gives you a **production-ready backend blueprint**:

* **Express** = main engine
* **Postgres** = wallet & financials
* **MongoDB** = chat
* **Redis** = presence & matchmaking

