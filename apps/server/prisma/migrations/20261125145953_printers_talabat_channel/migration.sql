-- CreateEnum
CREATE TYPE "PrinterRole" AS ENUM ('CUSTOMER_RECEIPT', 'KITCHEN_ALL', 'KITCHEN_BY_CATEGORY', 'DELIVERY_DISPATCH', 'SHIFT_Z_REPORT');

-- CreateEnum
CREATE TYPE "PrinterConnection" AS ENUM ('SPOOLER', 'NETWORK');

-- AlterEnum
ALTER TYPE "OrderChannel" ADD VALUE 'TALABAT';

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "externalRef" TEXT;

-- CreateTable
CREATE TABLE "printers" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "connection" "PrinterConnection" NOT NULL DEFAULT 'SPOOLER',
    "deviceName" TEXT,
    "host" TEXT,
    "port" INTEGER NOT NULL DEFAULT 9100,
    "paperWidth" INTEGER NOT NULL DEFAULT 80,
    "role" "PrinterRole" NOT NULL,
    "categoryIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "channels" "OrderChannel"[] DEFAULT ARRAY[]::"OrderChannel"[],
    "copies" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "template" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "printers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "printers_branchId_isActive_idx" ON "printers"("branchId", "isActive");

-- AddForeignKey
ALTER TABLE "printers" ADD CONSTRAINT "printers_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
