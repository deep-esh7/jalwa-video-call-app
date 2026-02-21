# Deployment Guide - Jalwa Video Call App

## Server Info

| Key | Value |
|-----|-------|
| VPS IP | `72.61.225.146` |
| OS | Ubuntu 24.04 |
| App path | `/var/www/jalwa-video-call-app` |
| PM2 process | `jalwa-server` |
| Port | `4000` |
| Node.js | v18 |
| Package manager | pnpm |

## CI/CD Pipeline

**Trigger:** Push to `deployment-prod` branch → GitHub Actions auto-deploys.

### Workflow (`.github/workflows/deploy.yml`)

1. SSH into VPS
2. `git pull origin deployment-prod`
3. `pnpm install`
4. `npx prisma generate && npx prisma migrate deploy`
5. `pm2 restart jalwa-server` (or `pm2 start` if first time)
6. Health check with retries at `http://localhost:4000/health`

### GitHub Secrets Required

| Secret | Description |
|--------|-------------|
| `VPS_HOST` | Server IP (`72.61.225.146`) |
| `VPS_USERNAME` | SSH user (`root`) |
| `VPS_SSH_KEY` | ED25519 private key (`/root/.ssh/github_actions`) |
| `VPS_PORT` | SSH port (`22`) |

## Manual Deploy

```bash
# SSH into server
ssh root@72.61.225.146

# Deploy
cd /var/www/jalwa-video-call-app
git pull origin deployment-prod
pnpm install
npx prisma generate && npx prisma migrate deploy
pm2 restart jalwa-server
pm2 save
```

## Server Stack

| Service | Details |
|---------|---------|
| PostgreSQL 16 | DB: `jalwa_db`, User: `video_user` |
| Redis | `redis://localhost:6379` |
| PM2 | Process manager with auto-startup |
| Firebase | Service account key at project root (gitignored) |

## Useful Commands

```bash
# PM2 management
pm2 list                          # Show processes
pm2 logs jalwa-server             # Live logs
pm2 logs jalwa-server --lines 50  # Recent logs
pm2 restart jalwa-server          # Restart
pm2 monit                         # Resource monitor

# Health check
curl http://72.61.225.146:4000/health

# Database
sudo -u postgres psql -d jalwa_db  # Connect to DB
npx prisma studio                  # Browser GUI (dev only)

# Prisma migrations
npx prisma migrate deploy          # Apply pending migrations
npx prisma migrate status          # Check migration status
```

## Branch Strategy

| Branch | Purpose |
|--------|---------|
| `development` | Active development |
| `deployment-prod` | Production deployment (auto-deploys on push) |
| `main` | Stable releases |

## Co-hosted Services (DO NOT TOUCH)

| Service | Path | Port/Domain |
|---------|------|-------------|
| akkuott (PHP/Laravel) | `/var/www/akkuott` | akkuott.com / akkuott.cloud |
| horilla (Python/Gunicorn) | `/var/www/horilla` | hrnexto.com (port 8001) |
