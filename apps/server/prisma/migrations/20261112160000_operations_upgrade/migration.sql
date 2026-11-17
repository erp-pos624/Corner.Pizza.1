-- CreateEnum
CREATE TYPE "ShiftStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "CashMovementType" AS ENUM ('CASH_IN', 'CASH_OUT');

-- CreateEnum
CREATE TYPE "TableStatus" AS ENUM ('AVAILABLE', 'OCCUPIED', 'NEEDS_CLEANING');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('PENDING', 'ASSIGNED', 'PICKED_UP', 'DELIVERED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SettlementStatus" AS ENUM ('OPEN', 'SETTLED');

-- CreateEnum
CREATE TYPE "StocktakeStatus" AS ENUM ('DRAFT', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TransferStatus" AS ENUM ('DRAFT', 'IN_TRANSIT', 'RECEIVED', 'CANCELLED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "MovementType" ADD VALUE 'TRANSFER_IN';
ALTER TYPE "MovementType" ADD VALUE 'TRANSFER_OUT';
ALTER TYPE "MovementType" ADD VALUE 'STOCKTAKE';

-- AlterEnum
ALTER TYPE "PaymentStatus" ADD VALUE 'PARTIALLY_REFUNDED';

-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'DRIVER';

-- AlterTable
ALTER TABLE "inventory_movements" ADD COLUMN     "branchId" TEXT,
ADD COLUMN     "stocktakeId" TEXT,
ADD COLUMN     "transferId" TEXT;

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "branchId" TEXT,
ADD COLUMN     "deliveredAt" TIMESTAMP(3),
ADD COLUMN     "deliveryDriverId" TEXT,
ADD COLUMN     "deliveryStatus" "DeliveryStatus",
ADD COLUMN     "dispatchedAt" TIMESTAMP(3),
ADD COLUMN     "settledAt" TIMESTAMP(3),
ADD COLUMN     "shiftId" TEXT,
ADD COLUMN     "tableId" TEXT;

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "shiftId" TEXT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "branchId" TEXT;

-- CreateTable
CREATE TABLE "branches" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameAr" TEXT,
    "address" TEXT,
    "phone" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "branches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ingredient_stocks" (
    "id" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "currentStock" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "minStock" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "reorderPoint" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ingredient_stocks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shifts" (
    "id" TEXT NOT NULL,
    "shiftNumber" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "terminalId" TEXT NOT NULL,
    "openedById" TEXT NOT NULL,
    "closedById" TEXT,
    "openingFloat" DECIMAL(14,2) NOT NULL,
    "countedCash" DECIMAL(14,2),
    "expectedCash" DECIMAL(14,2),
    "variance" DECIMAL(14,2),
    "status" "ShiftStatus" NOT NULL DEFAULT 'OPEN',
    "notes" TEXT,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "shifts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_movements" (
    "id" TEXT NOT NULL,
    "shiftId" TEXT NOT NULL,
    "type" "CashMovementType" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cash_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "z_reports" (
    "id" TEXT NOT NULL,
    "reportNumber" TEXT NOT NULL,
    "shiftId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "businessDate" TEXT NOT NULL,
    "terminalId" TEXT NOT NULL,
    "totals" JSONB NOT NULL,
    "lockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "z_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refunds" (
    "id" TEXT NOT NULL,
    "refundNumber" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "paymentId" TEXT,
    "branchId" TEXT NOT NULL,
    "shiftId" TEXT,
    "method" "PaymentMethod" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refunds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_notes" (
    "id" TEXT NOT NULL,
    "creditNoteNumber" TEXT NOT NULL,
    "refundId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credit_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dining_tables" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "seats" INTEGER NOT NULL DEFAULT 4,
    "status" "TableStatus" NOT NULL DEFAULT 'AVAILABLE',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dining_tables_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "driver_settlements" (
    "id" TEXT NOT NULL,
    "settlementNumber" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "ordersCount" INTEGER NOT NULL,
    "grossSales" DECIMAL(14,2) NOT NULL,
    "cashCollected" DECIMAL(14,2) NOT NULL,
    "cardCollected" DECIMAL(14,2) NOT NULL,
    "deliveryFees" DECIMAL(14,2) NOT NULL,
    "amountHandedOver" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "variance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "status" "SettlementStatus" NOT NULL DEFAULT 'OPEN',
    "settledAt" TIMESTAMP(3),
    "settledById" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "driver_settlements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stocktakes" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "status" "StocktakeStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "completedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "stocktakes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stocktake_items" (
    "id" TEXT NOT NULL,
    "stocktakeId" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "expectedQty" DECIMAL(12,3) NOT NULL,
    "countedQty" DECIMAL(12,3) NOT NULL,
    "variance" DECIMAL(12,3) NOT NULL,

    CONSTRAINT "stocktake_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_transfers" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "fromBranchId" TEXT NOT NULL,
    "toBranchId" TEXT NOT NULL,
    "status" "TransferStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "receivedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "receivedAt" TIMESTAMP(3),

    CONSTRAINT "stock_transfers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_transfer_items" (
    "id" TEXT NOT NULL,
    "transferId" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,

    CONSTRAINT "stock_transfer_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "branches_code_key" ON "branches"("code");

-- CreateIndex
CREATE INDEX "branches_isActive_idx" ON "branches"("isActive");

-- CreateIndex
CREATE INDEX "ingredient_stocks_branchId_idx" ON "ingredient_stocks"("branchId");

-- CreateIndex
CREATE INDEX "ingredient_stocks_branchId_currentStock_idx" ON "ingredient_stocks"("branchId", "currentStock");

-- CreateIndex
CREATE UNIQUE INDEX "ingredient_stocks_ingredientId_branchId_key" ON "ingredient_stocks"("ingredientId", "branchId");

-- CreateIndex
CREATE UNIQUE INDEX "shifts_shiftNumber_key" ON "shifts"("shiftNumber");

-- CreateIndex
CREATE INDEX "shifts_branchId_status_idx" ON "shifts"("branchId", "status");

-- CreateIndex
CREATE INDEX "shifts_terminalId_status_idx" ON "shifts"("terminalId", "status");

-- CreateIndex
CREATE INDEX "shifts_openedAt_idx" ON "shifts"("openedAt");

-- CreateIndex
CREATE INDEX "cash_movements_shiftId_createdAt_idx" ON "cash_movements"("shiftId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "z_reports_reportNumber_key" ON "z_reports"("reportNumber");

-- CreateIndex
CREATE UNIQUE INDEX "z_reports_shiftId_key" ON "z_reports"("shiftId");

-- CreateIndex
CREATE INDEX "z_reports_branchId_businessDate_idx" ON "z_reports"("branchId", "businessDate");

-- CreateIndex
CREATE UNIQUE INDEX "refunds_refundNumber_key" ON "refunds"("refundNumber");

-- CreateIndex
CREATE INDEX "refunds_orderId_idx" ON "refunds"("orderId");

-- CreateIndex
CREATE INDEX "refunds_branchId_createdAt_idx" ON "refunds"("branchId", "createdAt");

-- CreateIndex
CREATE INDEX "refunds_shiftId_idx" ON "refunds"("shiftId");

-- CreateIndex
CREATE UNIQUE INDEX "credit_notes_creditNoteNumber_key" ON "credit_notes"("creditNoteNumber");

-- CreateIndex
CREATE UNIQUE INDEX "credit_notes_refundId_key" ON "credit_notes"("refundId");

-- CreateIndex
CREATE INDEX "credit_notes_orderId_idx" ON "credit_notes"("orderId");

-- CreateIndex
CREATE INDEX "dining_tables_branchId_status_idx" ON "dining_tables"("branchId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "dining_tables_branchId_name_key" ON "dining_tables"("branchId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "driver_settlements_settlementNumber_key" ON "driver_settlements"("settlementNumber");

-- CreateIndex
CREATE INDEX "driver_settlements_driverId_status_idx" ON "driver_settlements"("driverId", "status");

-- CreateIndex
CREATE INDEX "driver_settlements_branchId_createdAt_idx" ON "driver_settlements"("branchId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "stocktakes_reference_key" ON "stocktakes"("reference");

-- CreateIndex
CREATE INDEX "stocktakes_branchId_status_idx" ON "stocktakes"("branchId", "status");

-- CreateIndex
CREATE INDEX "stocktake_items_ingredientId_idx" ON "stocktake_items"("ingredientId");

-- CreateIndex
CREATE UNIQUE INDEX "stocktake_items_stocktakeId_ingredientId_key" ON "stocktake_items"("stocktakeId", "ingredientId");

-- CreateIndex
CREATE UNIQUE INDEX "stock_transfers_reference_key" ON "stock_transfers"("reference");

-- CreateIndex
CREATE INDEX "stock_transfers_fromBranchId_status_idx" ON "stock_transfers"("fromBranchId", "status");

-- CreateIndex
CREATE INDEX "stock_transfers_toBranchId_status_idx" ON "stock_transfers"("toBranchId", "status");

-- CreateIndex
CREATE INDEX "stock_transfer_items_ingredientId_idx" ON "stock_transfer_items"("ingredientId");

-- CreateIndex
CREATE UNIQUE INDEX "stock_transfer_items_transferId_ingredientId_key" ON "stock_transfer_items"("transferId", "ingredientId");

-- CreateIndex
CREATE INDEX "inventory_movements_branchId_createdAt_idx" ON "inventory_movements"("branchId", "createdAt");

-- CreateIndex
CREATE INDEX "inventory_movements_stocktakeId_idx" ON "inventory_movements"("stocktakeId");

-- CreateIndex
CREATE INDEX "inventory_movements_transferId_idx" ON "inventory_movements"("transferId");

-- CreateIndex
CREATE INDEX "orders_branchId_createdAt_idx" ON "orders"("branchId", "createdAt");

-- CreateIndex
CREATE INDEX "orders_branchId_status_idx" ON "orders"("branchId", "status");

-- CreateIndex
CREATE INDEX "orders_tableId_idx" ON "orders"("tableId");

-- CreateIndex
CREATE INDEX "orders_shiftId_idx" ON "orders"("shiftId");

-- CreateIndex
CREATE INDEX "orders_deliveryDriverId_idx" ON "orders"("deliveryDriverId");

-- CreateIndex
CREATE INDEX "payments_shiftId_idx" ON "payments"("shiftId");

-- CreateIndex
CREATE INDEX "users_branchId_idx" ON "users"("branchId");

-- Data migration: every existing row belongs to the original shop.
INSERT INTO "branches" ("id", "code", "name", "nameAr", "isActive", "updatedAt")
VALUES ('branch-main', 'MAIN', 'Forno Pizza Co. — Main Branch', 'فرع فرنو الرئيسي', true, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

UPDATE "orders" SET "branchId" = 'branch-main' WHERE "branchId" IS NULL;
UPDATE "inventory_movements" SET "branchId" = 'branch-main' WHERE "branchId" IS NULL;
ALTER TABLE "orders" ALTER COLUMN "branchId" SET NOT NULL;

INSERT INTO "ingredient_stocks" ("id", "ingredientId", "branchId", "currentStock", "minStock", "reorderPoint", "updatedAt")
SELECT 'stock-' || "id", "id", 'branch-main', "currentStock", "minStock", "minStock", CURRENT_TIMESTAMP
FROM "ingredients";

ALTER TABLE "ingredients" DROP COLUMN "currentStock",
DROP COLUMN "minStock";

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingredient_stocks" ADD CONSTRAINT "ingredient_stocks_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "ingredients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingredient_stocks" ADD CONSTRAINT "ingredient_stocks_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_stocktakeId_fkey" FOREIGN KEY ("stocktakeId") REFERENCES "stocktakes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_transferId_fkey" FOREIGN KEY ("transferId") REFERENCES "stock_transfers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "shifts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "dining_tables"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_deliveryDriverId_fkey" FOREIGN KEY ("deliveryDriverId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "shifts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_openedById_fkey" FOREIGN KEY ("openedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "shifts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "z_reports" ADD CONSTRAINT "z_reports_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "shifts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "z_reports" ADD CONSTRAINT "z_reports_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "shifts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_refundId_fkey" FOREIGN KEY ("refundId") REFERENCES "refunds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dining_tables" ADD CONSTRAINT "dining_tables_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver_settlements" ADD CONSTRAINT "driver_settlements_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver_settlements" ADD CONSTRAINT "driver_settlements_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver_settlements" ADD CONSTRAINT "driver_settlements_settledById_fkey" FOREIGN KEY ("settledById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stocktakes" ADD CONSTRAINT "stocktakes_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stocktakes" ADD CONSTRAINT "stocktakes_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stocktakes" ADD CONSTRAINT "stocktakes_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stocktake_items" ADD CONSTRAINT "stocktake_items_stocktakeId_fkey" FOREIGN KEY ("stocktakeId") REFERENCES "stocktakes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stocktake_items" ADD CONSTRAINT "stocktake_items_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "ingredients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_fromBranchId_fkey" FOREIGN KEY ("fromBranchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_toBranchId_fkey" FOREIGN KEY ("toBranchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_receivedById_fkey" FOREIGN KEY ("receivedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfer_items" ADD CONSTRAINT "stock_transfer_items_transferId_fkey" FOREIGN KEY ("transferId") REFERENCES "stock_transfers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfer_items" ADD CONSTRAINT "stock_transfer_items_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "ingredients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

