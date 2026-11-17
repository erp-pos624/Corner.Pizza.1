-- CreateEnum
CREATE TYPE "OrderChannel" AS ENUM ('POS', 'ONLINE');

-- CreateEnum
CREATE TYPE "OnlinePaymentStatus" AS ENUM ('PENDING', 'PAID', 'FAILED', 'EXPIRED', 'CANCELLED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "PaymentStatus" ADD VALUE 'PENDING_PAYMENT';
ALTER TYPE "PaymentStatus" ADD VALUE 'PAID_ONLINE';
ALTER TYPE "PaymentStatus" ADD VALUE 'PAYMENT_FAILED';

-- AlterTable
ALTER TABLE "branches" ADD COLUMN     "onlineCloseTime" TEXT,
ADD COLUMN     "onlineOpenTime" TEXT,
ADD COLUMN     "onlineOrderingEnabled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "channel" "OrderChannel" NOT NULL DEFAULT 'POS',
ADD COLUMN     "paidOnlineAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "online_payments" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'BASATA',
    "reference" TEXT NOT NULL,
    "providerRef" TEXT,
    "status" "OnlinePaymentStatus" NOT NULL DEFAULT 'PENDING',
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EGP',
    "checkoutUrl" TEXT,
    "failureReason" TEXT,
    "rawPayload" JSONB,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "online_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "online_payments_orderId_key" ON "online_payments"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "online_payments_reference_key" ON "online_payments"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "online_payments_providerRef_key" ON "online_payments"("providerRef");

-- CreateIndex
CREATE INDEX "online_payments_status_idx" ON "online_payments"("status");

-- CreateIndex
CREATE INDEX "online_payments_createdAt_idx" ON "online_payments"("createdAt");

-- CreateIndex
CREATE INDEX "orders_channel_createdAt_idx" ON "orders"("channel", "createdAt");

-- AddForeignKey
ALTER TABLE "online_payments" ADD CONSTRAINT "online_payments_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
