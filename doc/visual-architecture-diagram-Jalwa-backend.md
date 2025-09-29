---

# 📘 Jalwa Backend Reference (No Docker)

## 1. System Overview

* **Backend:** Node.js (Express + Socket.io + Prisma ORM)
* **Databases (all installed natively):**

  * **PostgreSQL (`jalwa_db`)** → Wallet, Transactions, Calls, Gifts, Withdrawals, Users
  * **MongoDB (`jalwa_chat`)** → Chat messages & conversations
  * **Redis (`jalwa:*`)** → Presence tracking & matchmaking
* **Frontend:** Flutter (Clean Architecture + BLoC)

---

## 2. Local Setup (Mac/Linux)

### PostgreSQL

* Installed via **Homebrew**:

  ```bash
  brew install postgresql@15
  brew services start postgresql@15
  ```
* Database setup:

  ```sql
  CREATE DATABASE jalwa_db;
  CREATE USER video_user WITH ENCRYPTED PASSWORD 'Storybyte@123';
  ALTER USER video_user CREATEDB;
  GRANT ALL ON SCHEMA public TO video_user;
  ```

### MongoDB

* Installed via **Homebrew**:

  ```bash
  brew tap mongodb/brew
  brew install mongodb-community@7.0
  brew services start mongodb-community
  ```
* Database: `jalwa_chat` (auto-created on first use).

### Redis

* Installed via **Homebrew**:

  ```bash
  brew install redis
  brew services start redis
  ```
* Namespace convention: `jalwa:*`

  * `jalwa:user:<id>:status` (online/offline)
  * `jalwa:available_users` (set of available users)

---

## 3. Prisma Setup

* Installed:

  ```bash
  npm install prisma --save-dev
  npm install @prisma/client
  npx prisma init
  ```
* `.env` config:

  ```env
  DATABASE_URL="postgresql://video_user:Storybyte%40123@localhost:5432/jalwa_db?schema=public"
  ```
* Migration commands:

  ```bash
  npx prisma migrate dev --name init
  npx prisma migrate deploy   # for production
  npx prisma studio           # browser GUI
  ```

---

## 4. Schema (Prisma `schema.prisma`)

✔ Already applied, includes:

* `User`
* `Wallet`
* `Transaction`
* `Call`
* `Gift`
* `GiftTransaction`
* `Withdrawal`

(see schema snippet in earlier doc)

---

## 5. Architecture Diagram

```mermaid
flowchart TD

subgraph Flutter App (Client)
    UI[Flutter UI: Video Call + Chat + Wallet]
    BLoC[BLoC (Clean Arch)]
    UI --> BLoC
end

subgraph Backend (Express + Socket.io + Prisma)
    API[REST API]
    WS[WebSockets]
    Prisma[Prisma ORM]
end

subgraph Databases (Installed Locally)
    PG[(Postgres: jalwa_db)]
    Mongo[(MongoDB: jalwa_chat)]
    Redis[(Redis: jalwa:*)]
end

UI <--> WS
UI <--> API

API --> Prisma --> PG
API --> Mongo
WS --> Redis
```

---

## 6. Roadmap

* ✅ Postgres schema + migrations done
* 🔄 Replace Firebase presence → Redis
* 🔄 Replace Firebase calls → Postgres
* 🔄 Add Wallet logic
* 🔄 Add Gifts + Withdrawals logic
* 🔄 Add MongoDB Chat system
* 🔄 Scale WebSockets with Redis pub/sub

---
