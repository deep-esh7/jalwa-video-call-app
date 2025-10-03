# ============================
# Development
# ============================
runLocal:
	npm run start:local

runDevServer:
	npm run start:dev

runProdServer:
	pm2 start ecosystem.config.js --env production && pm2 save


runCloudTunnel:
	cloudflared tunnel --url http://localhost:4000

# ============================
# Prisma Commands

# ============================
prismaStudio:
	npx prisma studio

prismaFormat:
	npx prisma format

prismaGenerate:
	npx prisma generate

prismaMigrateDev:
	npx prisma migrate dev --name $(name)

prismaMigrateDeploy:
	npx prisma migrate deploy

prismaPush:
	npx prisma db push

prismaReset:
	npx prisma migrate reset --force

# ============================
# Dependency Management
# ============================
listWinston:
	npm list winston

listIoredis:
	npm list ioredis

listPrisma:
	npm list @prisma/client

# ============================
# Help
# ============================
help:
	@echo "Available commands:"
	@echo "  make runDev           - Start local development server"
	@echo "  make runDevServer     - Start development server"
	@echo "  make runProdServer    - Start production server with PM2"
	@echo "  make runCloudTunnel   - Start Cloudflare tunnel"
	@echo ""
	@echo "Prisma Commands:"
	@echo "  make prismaStudio     - Open Prisma Studio"
	@echo "  make prismaFormat     - Format Prisma schema"
	@echo "  make prismaGenerate   - Generate Prisma Client"
	@echo "  make prismaMigrateDev - Create and apply migration (dev)"
	@echo "  make prismaMigrateDeploy - Apply migrations (prod)"
	@echo "  make prismaPush       - Push schema to database"
	@echo "  make prismaReset      - Reset database (DANGER: drops all data)"
	@echo ""
	@echo "Dependency Management:"
	@echo "  make listWinston      - Show winston version"
	@echo "  make listIoredis      - Show ioredis version"
	@echo "  make listPrisma       - Show @prisma/client version"


listPostgres:
	brew list | grep postgres


stopPostgress: 
	brew services stop postgresql@15