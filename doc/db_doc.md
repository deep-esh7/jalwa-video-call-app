

# 📘 Jalwa Backend Reference

## 1. Overview

* Project: **Jalwa (video calling + wallet + chat)**
* Backend: **Node.js (Express + Socket.io + Prisma ORM)**
* Databases:

  * **PostgreSQL (`jalwa_db`)** → Wallet, Transactions, Calls, Gifts, Withdrawals, Users
  * **MongoDB (`jalwa_chat`)** → Chat messages & conversations (to be added)
  * **Redis (`jalwa:` namespace)** → Presence tracking & matchmaking

---

## 2. Database Setup

### PostgreSQL

* Database: `jalwa_db`
* Owner: `video_user`
* Password: `Storybyte@123` (URL-encoded `%40` in `.env`)
* Schema: Prisma-managed
* Tables created via Prisma migrations:

  * `User`
  * `Wallet`
  * `Transaction`
  * `Call`
  * `Gift`
  * `GiftTransaction`
  * `Withdrawal`
  * `_prisma_migrations`

### MongoDB

* Database: `jalwa_chat` (to store chat messages)
* Collections (planned):

  * `conversations`
  * `messages`

### Redis

* Namespace: `jalwa:*`
* Keys (planned):

  * `jalwa:user:<id>:status` → online/offline
  * `jalwa:user:<id>:socket` → socket id
  * `jalwa:available_users` → set of online available user IDs

---

## 3. Prisma Setup

* Installed with:

  ```bash
  npm install prisma --save-dev
  npm install @prisma/client
  npx prisma init
  ```
* `.env` config:

  ```env
  DATABASE_URL="postgresql://video_user:Storybyte%40123@localhost:5432/jalwa_db?schema=public"
  ```
* Migration command:

  ```bash
  npx prisma migrate dev --name <migration_name>
  ```
* Production deploy:

  ```bash
  npx prisma migrate deploy
  ```
* GUI:

  ```bash
  npx prisma studio
  ```

---

## 4. Prisma Schema (`prisma/schema.prisma`)

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

model User {
  id           String            @id @default(uuid())
  name         String
  gender       String
  role         String
  createdAt    DateTime          @default(now())

  wallet       Wallet?
  callsMade    Call[]            @relation("Caller")
  callsReceived Call[]           @relation("Receiver")
  transactions Transaction[]
  giftsSent    GiftTransaction[] @relation("Sender")
  giftsReceived GiftTransaction[] @relation("Receiver")
  withdrawals  Withdrawal[]
}

model Wallet {
  id        String   @id @default(uuid())
  user      User     @relation(fields: [userId], references: [id])
  userId    String   @unique
  balance   Int      @default(0)
  updatedAt DateTime @updatedAt
}

model Transaction {
  id        String   @id @default(uuid())
  user      User     @relation(fields: [userId], references: [id])
  userId    String
  type      String
  amount    Int
  status    String
  createdAt DateTime @default(now())
}

model Call {
  id          String   @id @default(uuid())
  caller      User     @relation("Caller", fields: [callerId], references: [id])
  callerId    String
  receiver    User     @relation("Receiver", fields: [receiverId], references: [id])
  receiverId  String
  status      String
  startTime   DateTime @default(now())
  endTime     DateTime?
  totalCoins  Int      @default(0)
}

model Gift {
  id       String @id @default(uuid())
  name     String
  cost     Int
  sent     GiftTransaction[]
}

model GiftTransaction {
  id         String @id @default(uuid())
  sender     User   @relation("Sender", fields: [senderId], references: [id])
  senderId   String
  receiver   User   @relation("Receiver", fields: [receiverId], references: [id])
  receiverId String
  gift       Gift   @relation(fields: [giftId], references: [id])
  giftId     String
  coinsSpent Int
  createdAt  DateTime @default(now())
}

model Withdrawal {
  id        String   @id @default(uuid())
  user      User     @relation(fields: [userId], references: [id])
  userId    String
  coins     Int
  status    String
  createdAt DateTime @default(now())
}
```

---

## 5. Next Features to Build

* ✅ **Core DB schema (done)**
* 🔄 Replace **Firebase presence → Redis presence**
* 🔄 Replace **Firebase calls → Postgres calls**
* 🔄 Add **Wallet logic**: coin deduction, credit women
* 🔄 Add **Gift logic**: spend coins, create gift transaction, credit women
* 🔄 Add **Withdrawals** for women
* 🔄 Add **MongoDB chat system** (conversations + messages)

---

## 6. Migration Commands

* Create new migration:

  ```bash
  npx prisma migrate dev --name <feature_name>
  ```
* Apply in production:

  ```bash
  npx prisma migrate deploy
  ```

---
