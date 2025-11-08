-- CreateTable
CREATE TABLE IF NOT EXISTS "Payment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "stripePaymentId" TEXT,
    "stripeSessionId" TEXT,
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'usd',
    "coins" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "paymentMethod" TEXT,
    "stripeCustomerId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "CoinBundle" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "coins" INTEGER NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CoinBundle_pkey" PRIMARY KEY ("id")
);

-- AlterTable Transaction - Add new columns
ALTER TABLE "Transaction" ADD COLUMN IF NOT EXISTS "balanceBefore" INTEGER DEFAULT 0;
ALTER TABLE "Transaction" ADD COLUMN IF NOT EXISTS "balanceAfter" INTEGER DEFAULT 0;
ALTER TABLE "Transaction" ADD COLUMN IF NOT EXISTS "description" TEXT;
ALTER TABLE "Transaction" ADD COLUMN IF NOT EXISTS "metadata" JSONB;

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Payment_stripePaymentId_key" ON "Payment"("stripePaymentId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Payment_stripeSessionId_key" ON "Payment"("stripeSessionId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Payment_userId_idx" ON "Payment"("userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Payment_status_idx" ON "Payment"("status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Payment_stripePaymentId_idx" ON "Payment"("stripePaymentId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Payment_stripeSessionId_idx" ON "Payment"("stripeSessionId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CoinBundle_isActive_sortOrder_idx" ON "CoinBundle"("isActive", "sortOrder");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Transaction_userId_createdAt_idx" ON "Transaction"("userId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Transaction_type_idx" ON "Transaction"("type");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Transaction_status_idx" ON "Transaction"("status");

