/*
  Warnings:

  - Added the required column `balanceAfter` to the `Transaction` table without a default value. This is not possible if the table is not empty.
  - Added the required column `balanceBefore` to the `Transaction` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "public"."Transaction" ADD COLUMN     "balanceAfter" INTEGER NOT NULL,
ADD COLUMN     "balanceBefore" INTEGER NOT NULL,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "metadata" JSONB;

-- CreateTable
CREATE TABLE "public"."Payment" (
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

-- CreateIndex
CREATE UNIQUE INDEX "Payment_stripePaymentId_key" ON "public"."Payment"("stripePaymentId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_stripeSessionId_key" ON "public"."Payment"("stripeSessionId");

-- CreateIndex
CREATE INDEX "Payment_userId_idx" ON "public"."Payment"("userId");

-- CreateIndex
CREATE INDEX "Payment_status_idx" ON "public"."Payment"("status");

-- CreateIndex
CREATE INDEX "Payment_stripePaymentId_idx" ON "public"."Payment"("stripePaymentId");

-- CreateIndex
CREATE INDEX "Payment_stripeSessionId_idx" ON "public"."Payment"("stripeSessionId");

-- CreateIndex
CREATE INDEX "Transaction_userId_createdAt_idx" ON "public"."Transaction"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Transaction_type_idx" ON "public"."Transaction"("type");

-- CreateIndex
CREATE INDEX "Transaction_status_idx" ON "public"."Transaction"("status");
