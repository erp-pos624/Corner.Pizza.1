import { randomBytes } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import {
  buildPaginated,
  idSchema,
  pickLocalized,
  purchaseOrderCreateSchema,
  purchaseOrderQuerySchema,
  purchaseOrderStatusSchema,
  purchaseOrderUpdateSchema,
  purchaseReceiveSchema,
  type PurchaseOrderCreateInput,
  type PurchaseOrderDto,
  type PurchaseOrderQuery,
  type PurchaseOrderStatusInput,
  type PurchaseReceiveInput,
  type PurchaseReceiptDto,
} from '@posshope/shared';
import type { Prisma } from '@prisma/client';
import { asyncHandler } from '../../lib/asyncHandler.js';
import { recordAudit } from '../../lib/audit.js';
import { resolveBranchId } from '../../lib/branches.js';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../lib/errors.js';
import { currentLanguage } from '../../lib/request-language.js';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { validate } from '../../middleware/validate.js';
import { prisma } from '../../prisma.js';
import { syncStockAlerts } from '../inventory/alerts.service.js';

export const purchasingRouter = Router();
purchasingRouter.use(authenticate);

const idParams = z.object({ id: idSchema });
const qty3 = (value: number | string | Prisma.Decimal): string => Number(value).toFixed(3);
const money2 = (value: number): string => value.toFixed(2);

function assertBranchAccess(
  req: { user?: { role: string; branchId: string | null } },
  branchId: string,
): void {
  if (req.user!.role !== 'ADMIN' && req.user!.branchId && req.user!.branchId !== branchId) {
    throw new ForbiddenError('This record belongs to another store');
  }
}

async function uniqueOrderNumber(): Promise<string> {
  const dayKey = new Date().toISOString().slice(0, 10).replace(/-/gu, '');
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const orderNumber = `PO-${dayKey}-${randomBytes(3).toString('hex').toUpperCase()}`;
    const clash = await prisma.purchaseOrder.findUnique({
      where: { orderNumber },
      select: { id: true },
    });
    if (!clash) return orderNumber;
  }
  throw new ConflictError('Could not allocate a purchase order number, please retry');
}

async function uniqueReceiptNumber(): Promise<string> {
  const dayKey = new Date().toISOString().slice(0, 10).replace(/-/gu, '');
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const receiptNumber = `GRN-${dayKey}-${randomBytes(3).toString('hex').toUpperCase()}`;
    const clash = await prisma.purchaseReceipt.findUnique({
      where: { receiptNumber },
      select: { id: true },
    });
    if (!clash) return receiptNumber;
  }
  throw new ConflictError('Could not allocate a receipt number, please retry');
}

const purchaseOrderInclude = {
  supplier: true,
  branch: { select: { name: true } },
  createdBy: { select: { fullName: true } },
  approvedBy: { select: { fullName: true } },
  items: {
    include: { ingredient: true },
    orderBy: { ingredient: { name: 'asc' } },
  },
  receipts: { select: { id: true } },
} satisfies Prisma.PurchaseOrderInclude;

type PurchaseOrderRow = Prisma.PurchaseOrderGetPayload<{
  include: typeof purchaseOrderInclude;
}>;

const receiptInclude = {
  purchaseOrder: { select: { orderNumber: true } },
  branch: { select: { name: true } },
  receivedBy: { select: { fullName: true } },
  items: {
    include: { ingredient: true },
    orderBy: { ingredient: { name: 'asc' } },
  },
} satisfies Prisma.PurchaseReceiptInclude;

type ReceiptRow = Prisma.PurchaseReceiptGetPayload<{ include: typeof receiptInclude }>;

function toPurchaseOrderDto(row: PurchaseOrderRow): PurchaseOrderDto {
  const language = currentLanguage();
  return {
    id: row.id,
    orderNumber: row.orderNumber,
    supplierId: row.supplierId,
    supplierName: pickLocalized(language, row.supplier.name, row.supplier.nameAr),
    branchId: row.branchId,
    branchName: row.branch.name,
    status: row.status,
    notes: row.notes,
    expectedAt: row.expectedAt?.toISOString().slice(0, 10) ?? null,
    subtotal: money2(Number(row.subtotal)),
    discount: money2(Number(row.discount)),
    tax: money2(Number(row.tax)),
    total: money2(Number(row.total)),
    createdByName: row.createdBy.fullName,
    approvedByName: row.approvedBy?.fullName ?? null,
    approvedAt: row.approvedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    items: row.items.map((item) => ({
      id: item.id,
      ingredientId: item.ingredientId,
      ingredientName: pickLocalized(language, item.ingredient.name, item.ingredient.nameAr),
      unit: item.ingredient.unit,
      quantity: Number(item.quantity),
      unitPrice: money2(Number(item.unitPrice)),
      discount: money2(Number(item.discount)),
      taxRate: Number(item.taxRate),
      receivedQuantity: Number(item.receivedQuantity),
      lineTotal: money2(
        Number(item.quantity) * Number(item.unitPrice) - Number(item.discount),
      ),
    })),
    receiptCount: row.receipts.length,
    receivedTotal: money2(
      row.items.reduce(
        (sum, item) => sum + Number(item.receivedQuantity) * Number(item.unitPrice),
        0,
      ),
    ),
  };
}

function toReceiptDto(row: ReceiptRow): PurchaseReceiptDto {
  const language = currentLanguage();
  return {
    id: row.id,
    receiptNumber: row.receiptNumber,
    purchaseOrderId: row.purchaseOrderId,
    purchaseOrderNumber: row.purchaseOrder.orderNumber,
    supplierInvoiceNo: row.supplierInvoiceNo,
    notes: row.notes,
    branchId: row.branchId,
    branchName: row.branch.name,
    receivedByName: row.receivedBy.fullName,
    receivedAt: row.receivedAt.toISOString(),
    items: row.items.map((item) => ({
      id: item.id,
      ingredientId: item.ingredientId,
      ingredientName: pickLocalized(language, item.ingredient.name, item.ingredient.nameAr),
      unit: item.ingredient.unit,
      quantity: Number(item.quantity),
      unitCost: money2(Number(item.unitCost)),
      lineTotal: money2(Number(item.quantity) * Number(item.unitCost)),
    })),
    total: money2(
      row.items.reduce((sum, item) => sum + Number(item.quantity) * Number(item.unitCost), 0),
    ),
  };
}

function itemTotals(
  items: ReadonlyArray<{ quantity: number; unitPrice: string; discount: string; taxRate: number }>,
  headerDiscount: string,
): { subtotal: number; tax: number; total: number } {
  const subtotal = items.reduce(
    (sum, item) => sum + item.quantity * Number(item.unitPrice) - Number(item.discount),
    0,
  );
  const tax = items.reduce(
    (sum, item) =>
      sum +
      (item.quantity * Number(item.unitPrice) - Number(item.discount)) *
        (item.taxRate / 100),
    0,
  );
  const total = Math.max(0, subtotal - Number(headerDiscount)) + tax;
  return { subtotal, tax, total };
}

// ---------------------------------------------------------------------------
// Purchase orders
// ---------------------------------------------------------------------------

purchasingRouter.get(
  '/purchase-orders',
  authorize('purchasing:read'),
  validate({ query: purchaseOrderQuerySchema }),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as PurchaseOrderQuery;
    const branchId =
      req.user!.role === 'ADMIN' ? (query.branchId ?? undefined) : resolveBranchId(req);
    const where: Prisma.PurchaseOrderWhereInput = {
      ...(branchId ? { branchId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.supplierId ? { supplierId: query.supplierId } : {}),
      ...(query.q
        ? {
            OR: [
              { orderNumber: { contains: query.q, mode: 'insensitive' } },
              { supplier: { name: { contains: query.q, mode: 'insensitive' } } },
            ],
          }
        : {}),
      ...(query.from || query.to
        ? {
            createdAt: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lt: new Date(`${query.to}T23:59:59.999Z`) } : {}),
            },
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      prisma.purchaseOrder.findMany({
        where,
        include: purchaseOrderInclude,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      prisma.purchaseOrder.count({ where }),
    ]);
    res
      .status(200)
      .json(buildPaginated(rows.map(toPurchaseOrderDto), total, query.page, query.pageSize));
  }),
);

purchasingRouter.get(
  '/purchase-orders/:id',
  authorize('purchasing:read'),
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    const row = await prisma.purchaseOrder.findUnique({
      where: { id: req.params.id! },
      include: purchaseOrderInclude,
    });
    if (!row) throw new NotFoundError('Purchase order not found');
    assertBranchAccess(req, row.branchId);
    res.status(200).json(toPurchaseOrderDto(row));
  }),
);

purchasingRouter.post(
  '/purchase-orders',
  authorize('purchasing:write'),
  validate({ body: purchaseOrderCreateSchema }),
  asyncHandler(async (req, res) => {
    const input = req.body as PurchaseOrderCreateInput;
    const branchId = input.branchId ? input.branchId : resolveBranchId(req);
    assertBranchAccess(req, branchId);
    const supplier = await prisma.supplier.findUnique({ where: { id: input.supplierId } });
    if (!supplier || !supplier.isActive) throw new ValidationError('Select an active supplier');
    const branch = await prisma.branch.findUnique({ where: { id: branchId } });
    if (!branch) throw new ValidationError('Select a valid store');

    const quantities = new Map<string, number>();
    for (const item of input.items) {
      quantities.set(item.ingredientId, (quantities.get(item.ingredientId) ?? 0) + 1);
    }
    const ingredientIds = [...quantities.keys()];
    const ingredients = await prisma.ingredient.findMany({
      where: { id: { in: ingredientIds }, isActive: true },
      select: { id: true },
    });
    if (ingredients.length !== ingredientIds.length)
      throw new ValidationError('One or more ingredients are unavailable');

    const totals = itemTotals(input.items, input.discount);
    const orderNumber = await uniqueOrderNumber();
    const row = await prisma.$transaction(async (tx) => {
      const created = await tx.purchaseOrder.create({
        data: {
          orderNumber,
          supplierId: supplier.id,
          branchId,
          status: 'DRAFT',
          notes: input.notes ?? null,
          expectedAt: input.expectedAt ? new Date(input.expectedAt) : null,
          subtotal: money2(totals.subtotal),
          discount: input.discount,
          tax: money2(totals.tax),
          total: money2(totals.total),
          createdById: req.user!.id,
          items: {
            create: input.items.map((item) => ({
              ingredientId: item.ingredientId,
              quantity: qty3(item.quantity),
              unitPrice: item.unitPrice,
              discount: item.discount,
              taxRate: item.taxRate,
            })),
          },
        },
        include: purchaseOrderInclude,
      });
      await recordAudit(
        {
          action: 'purchasing.order.created',
          entityType: 'PurchaseOrder',
          entityId: created.id,
          after: { orderNumber, supplierId: supplier.id, total: money2(totals.total) },
          userId: req.user!.id,
        },
        tx,
      );
      return created;
    });
    res.status(201).json(toPurchaseOrderDto(row));
  }),
);

purchasingRouter.patch(
  '/purchase-orders/:id',
  authorize('purchasing:write'),
  validate({ params: idParams, body: purchaseOrderUpdateSchema }),
  asyncHandler(async (req, res) => {
    const input = req.body as Partial<PurchaseOrderCreateInput>;
    const existing = await prisma.purchaseOrder.findUnique({
      where: { id: req.params.id! },
      include: { items: true },
    });
    if (!existing) throw new NotFoundError('Purchase order not found');
    assertBranchAccess(req, existing.branchId);
    if (existing.status !== 'DRAFT')
      throw new ConflictError('Only a draft purchase order can be edited');

    const items = input.items ?? [];
    if (items.length > 0) {
      const ids = [...new Set(items.map((item) => item.ingredientId))];
      const found = await prisma.ingredient.count({
        where: { id: { in: ids }, isActive: true },
      });
      if (found !== ids.length) throw new ValidationError('One or more ingredients are unavailable');
    }
    const effectiveItems =
      items.length > 0
        ? items
        : existing.items.map((item) => ({
            quantity: Number(item.quantity),
            unitPrice: Number(item.unitPrice).toFixed(2),
            discount: Number(item.discount).toFixed(2),
            taxRate: Number(item.taxRate),
          }));
    const discount = input.discount ?? Number(existing.discount).toFixed(2);
    const totals = itemTotals(effectiveItems, discount);

    const row = await prisma.$transaction(async (tx) => {
      if (items.length > 0) {
        await tx.purchaseOrderItem.deleteMany({ where: { purchaseOrderId: existing.id } });
        await tx.purchaseOrderItem.createMany({
          data: items.map((item) => ({
            purchaseOrderId: existing.id,
            ingredientId: item.ingredientId,
            quantity: qty3(item.quantity),
            unitPrice: item.unitPrice,
            discount: item.discount,
            taxRate: item.taxRate,
          })),
        });
      }
      const updated = await tx.purchaseOrder.update({
        where: { id: existing.id },
        data: {
          ...(input.expectedAt !== undefined
            ? { expectedAt: input.expectedAt ? new Date(input.expectedAt) : null }
            : {}),
          ...(input.notes !== undefined ? { notes: input.notes ?? null } : {}),
          ...(input.supplierId !== undefined ? { supplierId: input.supplierId } : {}),
          subtotal: money2(totals.subtotal),
          discount,
          tax: money2(totals.tax),
          total: money2(totals.total),
        },
        include: purchaseOrderInclude,
      });
      await recordAudit(
        {
          action: 'purchasing.order.updated',
          entityType: 'PurchaseOrder',
          entityId: existing.id,
          after: { total: money2(totals.total) },
          userId: req.user!.id,
        },
        tx,
      );
      return updated;
    });
    res.status(200).json(toPurchaseOrderDto(row));
  }),
);

purchasingRouter.post(
  '/purchase-orders/:id/status',
  authorize('purchasing:write'),
  validate({ params: idParams, body: purchaseOrderStatusSchema }),
  asyncHandler(async (req, res) => {
    const input = req.body as PurchaseOrderStatusInput;
    const existing = await prisma.purchaseOrder.findUnique({
      where: { id: req.params.id! },
      include: { receipts: { select: { id: true } } },
    });
    if (!existing) throw new NotFoundError('Purchase order not found');
    assertBranchAccess(req, existing.branchId);

    const row = await prisma.$transaction(async (tx) => {
      if (input.action === 'submit') {
        if (existing.status !== 'DRAFT')
          throw new ConflictError('Only a draft order can be submitted');
        await tx.purchaseOrder.update({
          where: { id: existing.id },
          data: { status: 'PENDING' },
        });
      } else if (input.action === 'approve') {
        if (existing.status !== 'PENDING')
          throw new ConflictError('Only a pending order can be approved');
        await tx.purchaseOrder.update({
          where: { id: existing.id },
          data: {
            status: 'APPROVED',
            approvedById: req.user!.id,
            approvedAt: new Date(),
          },
        });
      } else {
        if (existing.status === 'RECEIVED' || existing.status === 'CANCELLED')
          throw new ConflictError('This order can no longer be cancelled');
        if (existing.receipts.length > 0)
          throw new ConflictError('Goods were already received against this order');
        await tx.purchaseOrder.update({
          where: { id: existing.id },
          data: { status: 'CANCELLED', notes: input.reason ?? existing.notes },
        });
      }
      const updated = await tx.purchaseOrder.findUnique({
        where: { id: existing.id },
        include: purchaseOrderInclude,
      });
      await recordAudit(
        {
          action: `purchasing.order.${input.action}`,
          entityType: 'PurchaseOrder',
          entityId: existing.id,
          after: { status: updated!.status, reason: input.reason ?? null },
          userId: req.user!.id,
        },
        tx,
      );
      return updated!;
    });
    res.status(200).json(toPurchaseOrderDto(row));
  }),
);

// ---------------------------------------------------------------------------
// Goods receiving
// ---------------------------------------------------------------------------

purchasingRouter.post(
  '/purchase-orders/:id/receive',
  authorize('purchasing:receive'),
  validate({ params: idParams, body: purchaseReceiveSchema }),
  asyncHandler(async (req, res) => {
    const input = req.body as PurchaseReceiveInput;
    const order = await prisma.purchaseOrder.findUnique({
      where: { id: req.params.id! },
      include: { items: { include: { ingredient: true } } },
    });
    if (!order) throw new NotFoundError('Purchase order not found');
    assertBranchAccess(req, order.branchId);
    if (order.status !== 'APPROVED' && order.status !== 'PARTIALLY_RECEIVED')
      throw new ConflictError('Approve the purchase order before receiving goods');

    const itemById = new Map(order.items.map((item) => [item.id, item]));
    const requested = new Map<string, { quantity: number; unitCost: string | undefined }>();
    for (const line of input.items) {
      const orderItem = itemById.get(line.purchaseOrderItemId);
      if (!orderItem) throw new ValidationError('Unknown purchase order line');
      const remaining = Number(orderItem.quantity) - Number(orderItem.receivedQuantity);
      if (line.quantity > remaining + 1e-9)
        throw new ValidationError(
          `Received quantity for ${orderItem.ingredient.name} exceeds the remaining ${remaining.toFixed(3)}`,
        );
      const current = requested.get(orderItem.id);
      requested.set(orderItem.id, {
        quantity: (current?.quantity ?? 0) + line.quantity,
        unitCost: line.unitCost ?? current?.unitCost,
      });
    }

    const receiptNumber = await uniqueReceiptNumber();
    const row = await prisma.$transaction(async (tx) => {
      const receipt = await tx.purchaseReceipt.create({
        data: {
          receiptNumber,
          purchaseOrderId: order.id,
          branchId: order.branchId,
          supplierInvoiceNo: input.supplierInvoiceNo ?? null,
          notes: input.notes ?? null,
          receivedById: req.user!.id,
          items: {
            create: [...requested.entries()].map(([itemId, entry]) => {
              const orderItem = itemById.get(itemId)!;
              return {
                ingredientId: orderItem.ingredientId,
                quantity: qty3(entry.quantity),
                unitCost: entry.unitCost ?? Number(orderItem.unitPrice).toFixed(2),
              };
            }),
          },
        },
      });

      for (const [itemId, entry] of requested.entries()) {
        const orderItem = itemById.get(itemId)!;
        const unitCost = Number(entry.unitCost ?? orderItem.unitPrice);
        await tx.purchaseOrderItem.update({
          where: { id: orderItem.id },
          data: { receivedQuantity: { increment: qty3(entry.quantity) } },
        });

        const stock = await tx.ingredientStock.findUnique({
          where: {
            ingredientId_branchId: {
              ingredientId: orderItem.ingredientId,
              branchId: order.branchId,
            },
          },
          select: { currentStock: true },
        });
        const currentQty = Number(stock?.currentStock ?? 0);
        const baseQty = Math.max(currentQty, 0);
        const currentAverage =
          Number(orderItem.ingredient.averageCost) || Number(orderItem.ingredient.costPerUnit);
        const nextQty = currentQty + entry.quantity;
        const averageCost =
          nextQty > 0
            ? (baseQty * currentAverage + entry.quantity * unitCost) / nextQty
            : unitCost;

        await tx.ingredient.update({
          where: { id: orderItem.ingredientId },
          data: {
            costPerUnit: unitCost.toFixed(2),
            averageCost: averageCost.toFixed(3),
          },
        });
        await tx.ingredientStock.upsert({
          where: {
            ingredientId_branchId: {
              ingredientId: orderItem.ingredientId,
              branchId: order.branchId,
            },
          },
          create: {
            ingredientId: orderItem.ingredientId,
            branchId: order.branchId,
            currentStock: qty3(nextQty),
          },
          update: { currentStock: qty3(nextQty) },
        });
        await tx.inventoryMovement.create({
          data: {
            ingredientId: orderItem.ingredientId,
            branchId: order.branchId,
            type: 'PURCHASE',
            quantity: qty3(entry.quantity),
            unitCost: unitCost.toFixed(2),
            reference: input.supplierInvoiceNo
              ? `${receiptNumber} · ${input.supplierInvoiceNo}`
              : receiptNumber,
            note: `Purchase order ${order.orderNumber}`,
            userId: req.user!.id,
          },
        });
        await syncStockAlerts(tx, orderItem.ingredientId, order.branchId);
      }

      const refreshed = await tx.purchaseOrderItem.findMany({
        where: { purchaseOrderId: order.id },
        select: { quantity: true, receivedQuantity: true },
      });
      const fullyReceived = refreshed.every(
        (item) => Number(item.receivedQuantity) + 1e-9 >= Number(item.quantity),
      );
      await tx.purchaseOrder.update({
        where: { id: order.id },
        data: { status: fullyReceived ? 'RECEIVED' : 'PARTIALLY_RECEIVED' },
      });
      await recordAudit(
        {
          action: 'purchasing.receipt.created',
          entityType: 'PurchaseReceipt',
          entityId: receipt.id,
          after: {
            receiptNumber,
            purchaseOrderId: order.id,
            lines: requested.size,
            supplierInvoiceNo: input.supplierInvoiceNo ?? null,
          },
          userId: req.user!.id,
        },
        tx,
      );
      return tx.purchaseReceipt.findUnique({
        where: { id: receipt.id },
        include: receiptInclude,
      });
    });
    res.status(201).json(toReceiptDto(row!));
  }),
);

purchasingRouter.get(
  '/receipts',
  authorize('purchasing:read'),
  validate({
    query: z.object({
      page: z.coerce.number().int().min(1).default(1),
      pageSize: z.coerce.number().int().min(1).max(100).default(20),
      purchaseOrderId: z.string().trim().min(1).optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as {
      page: number;
      pageSize: number;
      purchaseOrderId?: string;
    };
    const branchId = req.user!.role === 'ADMIN' ? undefined : resolveBranchId(req);
    const where: Prisma.PurchaseReceiptWhereInput = {
      ...(branchId ? { branchId } : {}),
      ...(query.purchaseOrderId ? { purchaseOrderId: query.purchaseOrderId } : {}),
    };
    const [rows, total] = await Promise.all([
      prisma.purchaseReceipt.findMany({
        where,
        include: receiptInclude,
        orderBy: { receivedAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      prisma.purchaseReceipt.count({ where }),
    ]);
    res
      .status(200)
      .json(buildPaginated(rows.map(toReceiptDto), total, query.page, query.pageSize));
  }),
);
