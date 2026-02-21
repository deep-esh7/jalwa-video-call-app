# Jalwa Video Call App - Documentation

## Project Overview

Jalwa is a video calling and chat application with a coin-based wallet system. The backend is built with **Node.js (Express + Socket.io + Prisma ORM)** following MVC architecture, backed by **PostgreSQL**, **MongoDB**, and **Redis**.

### Key Features
- Video calling with coin-based billing
- Real-time one-to-one chat via Socket.io
- Wallet system with coin bundles and payments (Stripe)
- Gift system with R2 storage
- Promo codes and referral system
- Firebase authentication

---

## Documentation Index

| Document | Description |
|----------|-------------|
| [Architecture & Ideas](./idea.md) | Backend architecture blueprint covering MVC structure, database design, and system overview |
| [Visual Architecture Diagram](./visual-architecture-diagram-Jalwa-backend.md) | System overview with native database setup (PostgreSQL, MongoDB, Redis) and deployment reference |
| [Database Documentation](./db_doc.md) | Database schema reference for Jalwa backend (tables, relations, indexes) |
| [Flutter Integration Guide](./FLUTTER_INTEGRATION.md) | Full guide for Flutter frontend integration with socket event naming conventions (`fe-`/`be-` prefixes) |
| [Flutter Implementation Summary](./FLUTTER_IMPLEMENTATION_SUMMARY.md) | Summary of backend refactoring changes made for Flutter frontend compatibility |
| [Gift API Summary](./GIFT_API_SUMMARY.md) | Gift API usage guide including R2 worker configuration and endpoints |
