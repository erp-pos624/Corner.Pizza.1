import { randomBytes } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import {
  buildPaginated,
  idSchema,
  ingredientCategorySchema,
  ingredientCategoryUpdateSchema,
  ingredientInputSchema,
  ingredientQuerySchema,
  ingredientUpdateSchema,
  movementQuerySchema,
  pickLocalized,
  stockAdjustSchema,
  stockAlertQuerySchema,
  stockLossSchema,
  stockPurchaseSchema,
  stocktakeCreateSchema,
  stocktakeQuerySchema,
  storeStockQuerySchema,
  transferCreateSchema,
  transferQuerySchema,
  transferStatusSchema,
  type IngredientCategoryDto,
  type IngredientInput,
  type IngredientQuery,
  type IngredientCategoryInput,
  type MovementQuery,
  type ReplenishmentSuggestionDto,
  type StockAdjustInput,
  type StockAlertDto,
  type StockAlertQuery,
  type StockLossInput,
  type StockPurchaseInput,
  type StocktakeCreateInput,
  type StocktakeDto,
  type StocktakeQuery,
  type StockTransferDto,
  type StoreStockRowDto,
  type TransferCreateInput,
  type TransferQuery,
  type TransferStatusInput,
} from '@posshope/shared';
import type { Prisma } from '@prisma/client';
import { asyncHandler } from '../../lib/asyncHandler.js';
import { recordAudit } from '../../lib/audit.js';
import { resolveBranchId } from '../../lib/branches.js';
import { businessDayStart } from '../../lib/dates.js';
import {
  ConflictError,
  ForbiddenError,
  InsufficientStockError,
  NotFoundError,
  ValidationError,
} from '../../lib/errors.js';
import { toIngredientDto, toMovementDto } from '../../lib/mappers.js';
import { currentLanguage } from '../../lib/request-language.js';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { validate } from '../../middleware/validate.js';
import { prisma } from '../../prisma.js';
import { syncStockAlerts } from './alerts.service.js';

export const inventoryRouter = Router();
inventoryRouter.use(authenticate);

const idParams = z.object({ id: idSchema });
const TODAY_KEY = (): string => new Date().toISOString().slice(0, 10).replace(/-/gu, '');
const qty3 = (value: number | string | Prisma.Decimal): string => Number(value).toFixed(3);

function slugSku(name: string): string {
  const base = name
    .toUpperCase()
    .replace(/[^A-Z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .slice(0, 28);
  return base ? `ING-${base}` : 'ING-ITEM';
}

async function uniqueSku(base: string, ignoreId?: string): Promise<string> {
  let candidate = base;
  let suffix = 1;
  for (;;) {
    const clash = await prisma.ingredient.findUnique({ where: { sku: candidate } });
    if (!clash || clash.id === ignoreId) return candidate;
    suffix += 1;
    candidate = `${base}-${suffix}`;
  }
}

async function uniqueReference(prefix: 'STK' | 'TRF'): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const reference = `${prefix}-${TODAY_KEY()}-${randomBytes(3).toString('hex').toUpperCase()}`;
    const clash =
      prefix === 'STK'
        ? await prisma.stocktake.findUnique({ where: { reference }, select: { id: true } })
        : await prisma.stockTransfer.findUnique({ where: { reference }, select: { id: true } });
    if (!clash) return reference;
  }
  throw new ConflictError('Could not allocate a reference, please retry');
}

async function stockMapFor(
  branchId: string,
  ingredientIds: readonly string[],
): Promise<
  Map<
    string,
    { currentStock: Prisma.Decimal; minStock: Prisma.Decimal; reorderPoint: Prisma.Decimal }
  >
> {
  if (ingredientIds.length === 0) return new Map();
  const rows = await prisma.ingredientStock.findMany({
    where: { branchId, ingredientId: { in: [...ingredientIds] } },
    select: {
      ingredientId: true,
      currentStock: true,
      minStock: true,
      reorderPoint: true,
      maxStock: true,
    },
  });
  return new Map(rows.map((row) => [row.ingredientId, row]));
}

type StocktakeRow = Prisma.StocktakeGetPayload<{
  include: {
    createdBy: { select: { fullName: true } };
    items: { include: { ingredient: true } };
  };
}>;

const stocktakeInclude = {
  createdBy: { select: { fullName: true } },
  items: { include: { ingredient: true }, orderBy: { ingredientId: 'asc' } },
} satisfies Prisma.StocktakeInclude;

function toStocktakeDto(row: StocktakeRow): StocktakeDto {
  const language = currentLanguage();
  return {
    id: row.id,
    reference: row.reference,
    branchId: row.branchId,
    status: row.status,
    notes: row.notes,
    createdById: row.createdById,
    createdByName: row.createdBy.fullName,
    completedAt: row.completedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    items: row.items.map((item) => ({
      id: item.id,
      ingredientId: item.ingredientId,
      ingredientName: pickLocalized(language, item.ingredient.name, item.ingredient.nameAr),
      unit: item.ingredient.unit,
      expectedQty: Number(item.expectedQty),
      countedQty: Number(item.countedQty),
      variance: Number(item.variance),
    })),
  };
}

type TransferRow = Prisma.StockTransferGetPayload<{
  include: {
    fromBranch: { select: { name: true } };
    toBranch: { select: { name: true } };
    createdBy: { select: { fullName: true } };
    items: { include: { ingredient: true } };
  };
}>;

const transferInclude = {
  fromBranch: { select: { name: true } },
  toBranch: { select: { name: true } },
  createdBy: { select: { fullName: true } },
  items: { include: { ingredient: true }, orderBy: { ingredientId: 'asc' } },
} satisfies Prisma.StockTransferInclude;

function toTransferDto(row: TransferRow): StockTransferDto {
  const language = currentLanguage();
  return {
    id: row.id,
    reference: row.reference,
    fromBranchId: row.fromBranchId,
    fromBranchName: row.fromBranch.name,
    toBranchId: row.toBranchId,
    toBranchName: row.toBranch.name,
    status: row.status,
    notes: row.notes,
    createdByName: row.createdBy.fullName,
    createdAt: row.createdAt.toISOString(),
    receivedAt: row.receivedAt?.toISOString() ?? null,
    items: row.items.map((item) => ({
      id: item.id,
      ingredientId: item.ingredientId,
      ingredientName: pickLocalized(language, item.ingredient.name, item.ingredient.nameAr),
      unit: item.ingredient.unit,
      quantity: Number(item.quantity),
    })),
  };
}

function assertBranchAccess(req: { user?: { role: string; branchId: string | null } }, branchId: string): void {
  if (req.user!.role !== 'ADMIN' && req.user!.branchId && req.user!.branchId !== branchId) {
    throw new ForbiddenError('This record belongs to another branch');
  }
}

// ---------------------------------------------------------------------------
// Ingredients (branch-scoped stock levels)
// ---------------------------------------------------------------------------

inventoryRouter.get(
  '/ingredients',
  authorize('inventory:read'),
  validate({ query: ingredientQuerySchema }),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as IngredientQuery;
    const branchId = resolveBranchId(req);
    const where: Prisma.IngredientWhereInput = {
      ...(query.q
        ? {
            OR: [
              { name: { contains: query.q, mode: 'insensitive' } },
              { nameAr: { contains: query.q, mode: 'insensitive' } },
              { sku: { contains: query.q, mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
    };

    if (query.lowStock) {
      const rows = await prisma.ingredient.findMany({
        where,
        include: { supplier: true, category: true },
        orderBy: [{ name: 'asc' }],
      });
      const stocks = await stockMapFor(branchId, rows.map((row) => row.id));
      const filtered = rows.filter((row) => {
        const stock = stocks.get(row.id);
        return Number(stock?.currentStock ?? 0) <= Number(stock?.minStock ?? 0);
      });
      const start = (query.page - 1) * query.pageSize;
      res.status(200).json(
        buildPaginated(
          filtered
            .slice(start, start + query.pageSize)
            .map((row) => toIngredientDto(row, stocks.get(row.id) ?? null)),
          filtered.length,
          query.page,
          query.pageSize,
        ),
      );
      return;
    }

    const [rows, total] = await Promise.all([
      prisma.ingredient.findMany({
        where,
        include: { supplier: true, category: true },
        orderBy: [{ name: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      prisma.ingredient.count({ where }),
    ]);
    const stocks = await stockMapFor(branchId, rows.map((row) => row.id));
    res
      .status(200)
      .json(
        buildPaginated(
          rows.map((row) => toIngredientDto(row, stocks.get(row.id) ?? null)),
          total,
          query.page,
          query.pageSize,
        ),
      );
  }),
);

inventoryRouter.get(
  '/ingredients/low-stock',
  authorize('inventory:read'),
  asyncHandler(async (req, res) => {
    const branchId = resolveBranchId(req);
    const rows = await prisma.ingredient.findMany({
      where: { isActive: true },
      include: { supplier: true, category: true },
      orderBy: { name: 'asc' },
    });
    const stocks = await stockMapFor(branchId, rows.map((row) => row.id));
    const low = rows
      .filter((row) => {
        const stock = stocks.get(row.id);
        return Number(stock?.currentStock ?? 0) <= Number(stock?.minStock ?? 0);
      })
      .sort(
        (a, b) =>
          Number(stocks.get(a.id)?.currentStock ?? 0) -
          Number(stocks.get(b.id)?.currentStock ?? 0),
      )
      .slice(0, 50);
    res.status(200).json(low.map((row) => toIngredientDto(row, stocks.get(row.id) ?? null)));
  }),
);

inventoryRouter.get(
  '/ingredients/reorder-alerts',
  authorize('inventory:read'),
  asyncHandler(async (req, res) => {
    const branchId = resolveBranchId(req);
    const rows = await prisma.ingredient.findMany({
      where: { isActive: true },
      include: { supplier: true, category: true },
      orderBy: { name: 'asc' },
    });
    const stocks = await stockMapFor(branchId, rows.map((row) => row.id));
    const alerts = rows
      .filter((row) => {
        const stock = stocks.get(row.id);
        const reorderPoint = Number(stock?.reorderPoint ?? 0);
        return reorderPoint > 0 && Number(stock?.currentStock ?? 0) <= reorderPoint;
      })
      .map((row) => toIngredientDto(row, stocks.get(row.id) ?? null));
    res.status(200).json(alerts);
  }),
);

inventoryRouter.get(
  '/ingredients/:id',
  authorize('inventory:read'),
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    const branchId = resolveBranchId(req);
    const row = await prisma.ingredient.findUnique({
      where: { id: req.params.id! },
      include: { supplier: true, category: true },
    });
    if (!row) throw new NotFoundError('Ingredient not found');
    const stock = await prisma.ingredientStock.findUnique({
      where: { ingredientId_branchId: { ingredientId: row.id, branchId } },
      select: { currentStock: true, minStock: true, reorderPoint: true, maxStock: true },
    });
    res.status(200).json(toIngredientDto(row, stock));
  }),
);

inventoryRouter.post(
  '/ingredients',
  authorize('inventory:write'),
  validate({ body: ingredientInputSchema }),
  asyncHandler(async (req, res) => {
    const input = req.body as IngredientInput;
    const branchId = resolveBranchId(req);
    if (input.supplierId) {
      const supplier = await prisma.supplier.findUnique({ where: { id: input.supplierId } });
      if (!supplier) throw new ValidationError('Select a valid supplier');
    }
    if (input.categoryId) {
      const category = await prisma.ingredientCategory.findUnique({
        where: { id: input.categoryId },
      });
      if (!category) throw new ValidationError('Select a valid category');
    }
    const sku = input.sku
      ? await uniqueSku(input.sku.toUpperCase())
      : await uniqueSku(slugSku(input.name));
    const created = await prisma.$transaction(async (tx) => {
      const row = await tx.ingredient.create({
        data: {
          sku,
          name: input.name,
          nameAr: input.nameAr ?? null,
          unit: input.unit,
          categoryId: input.categoryId ?? null,
          storageLocation: input.storageLocation ?? null,
          expiryDate: input.expiryDate ? new Date(input.expiryDate) : null,
          costPerUnit: input.costPerUnit,
          averageCost: input.costPerUnit,
          supplierId: input.supplierId ?? null,
          isActive: input.isActive,
        },
        include: { supplier: true, category: true },
      });
      const stock = await tx.ingredientStock.create({
        data: {
          ingredientId: row.id,
          branchId,
          currentStock: qty3(input.currentStock),
          minStock: qty3(input.minStock),
          reorderPoint: qty3(input.reorderPoint),
          maxStock: qty3(input.maxStock),
        },
        select: { currentStock: true, minStock: true, reorderPoint: true, maxStock: true },
      });
      await syncStockAlerts(tx, row.id, branchId);
      await recordAudit(
        {
          action: 'inventory.ingredient.created',
          entityType: 'Ingredient',
          entityId: row.id,
          after: { name: row.name, sku: row.sku, branchId },
          userId: req.user!.id,
        },
        tx,
      );
      return { row, stock };
    });
    res.status(201).json(toIngredientDto(created.row, created.stock));
  }),
);

inventoryRouter.patch(
  '/ingredients/:id',
  authorize('inventory:write'),
  validate({ params: idParams, body: ingredientUpdateSchema }),
  asyncHandler(async (req, res) => {
    const input = req.body as Partial<IngredientInput>;
    const branchId = resolveBranchId(req);
    const existing = await prisma.ingredient.findUnique({ where: { id: req.params.id! } });
    if (!existing) throw new NotFoundError('Ingredient not found');
    if (input.supplierId) {
      const supplier = await prisma.supplier.findUnique({ where: { id: input.supplierId } });
      if (!supplier) throw new ValidationError('Select a valid supplier');
    }
    if (input.categoryId) {
      const category = await prisma.ingredientCategory.findUnique({
        where: { id: input.categoryId },
      });
      if (!category) throw new ValidationError('Select a valid category');
    }
    const sku =
      input.sku && input.sku.toUpperCase() !== existing.sku
        ? await uniqueSku(input.sku.toUpperCase(), existing.id)
        : undefined;
    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.ingredient.update({
        where: { id: existing.id },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.nameAr !== undefined ? { nameAr: input.nameAr ?? null } : {}),
          ...(sku ? { sku } : {}),
          ...(input.unit !== undefined ? { unit: input.unit } : {}),
          ...(input.categoryId !== undefined ? { categoryId: input.categoryId ?? null } : {}),
          ...(input.storageLocation !== undefined
            ? { storageLocation: input.storageLocation ?? null }
            : {}),
          ...(input.expiryDate !== undefined
            ? { expiryDate: input.expiryDate ? new Date(input.expiryDate) : null }
            : {}),
          ...(input.costPerUnit !== undefined ? { costPerUnit: input.costPerUnit } : {}),
          ...(input.supplierId !== undefined ? { supplierId: input.supplierId } : {}),
          ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        },
        include: { supplier: true, category: true },
      });
      const stockData = {
        ...(input.currentStock !== undefined ? { currentStock: qty3(input.currentStock) } : {}),
        ...(input.minStock !== undefined ? { minStock: qty3(input.minStock) } : {}),
        ...(input.reorderPoint !== undefined ? { reorderPoint: qty3(input.reorderPoint) } : {}),
        ...(input.maxStock !== undefined ? { maxStock: qty3(input.maxStock) } : {}),
      };
      if (Object.keys(stockData).length > 0) {
        await tx.ingredientStock.upsert({
          where: { ingredientId_branchId: { ingredientId: row.id, branchId } },
          create: {
            ingredientId: row.id,
            branchId,
            currentStock: qty3(input.currentStock ?? 0),
            minStock: qty3(input.minStock ?? 0),
            reorderPoint: qty3(input.reorderPoint ?? 0),
            maxStock: qty3(input.maxStock ?? 0),
          },
          update: stockData,
        });
        await syncStockAlerts(tx, row.id, branchId);
      }
      await recordAudit(
        {
          action: 'inventory.ingredient.updated',
          entityType: 'Ingredient',
          entityId: row.id,
          after: { branchId, ...stockData },
          userId: req.user!.id,
        },
        tx,
      );
      return row;
    });
    const stock = await prisma.ingredientStock.findUnique({
      where: { ingredientId_branchId: { ingredientId: updated.id, branchId } },
      select: { currentStock: true, minStock: true, reorderPoint: true, maxStock: true },
    });
    res.status(200).json(toIngredientDto(updated, stock));
  }),
);

inventoryRouter.delete(
  '/ingredients/:id',
  authorize('inventory:write'),
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    const existing = await prisma.ingredient.findUnique({
      where: { id: req.params.id! },
      include: { _count: { select: { movements: true, recipeItems: true, toppings: true } } },
    });
    if (!existing) throw new NotFoundError('Ingredient not found');
    if (
      existing._count.movements > 0 ||
      existing._count.recipeItems > 0 ||
      existing._count.toppings > 0
    ) {
      throw new ConflictError(
        'This ingredient is used by recipes, toppings or stock history. Deactivate it instead.',
      );
    }
    await prisma.$transaction(async (tx) => {
      await tx.ingredient.delete({ where: { id: existing.id } });
      await recordAudit(
        {
          action: 'inventory.ingredient.deleted',
          entityType: 'Ingredient',
          entityId: existing.id,
          before: { name: existing.name },
          userId: req.user!.id,
        },
        tx,
      );
    });
    res.status(200).json({ ok: true });
  }),
);

async function stockLevels(
  branchId: string,
  ingredientId: string,
): Promise<{
  current: number;
  costPerUnit: Prisma.Decimal;
  averageCost: number;
  name: string;
}> {
  const ingredient = await prisma.ingredient.findUnique({ where: { id: ingredientId } });
  if (!ingredient) throw new NotFoundError('Ingredient not found');
  const stock = await prisma.ingredientStock.findUnique({
    where: { ingredientId_branchId: { ingredientId, branchId } },
    select: { currentStock: true },
  });
  return {
    current: Number(stock?.currentStock ?? 0),
    costPerUnit: ingredient.costPerUnit,
    averageCost:
      Number(ingredient.averageCost) > 0
        ? Number(ingredient.averageCost)
        : Number(ingredient.costPerUnit),
    name: ingredient.name,
  };
}

async function withIngredientStock(ingredientId: string, branchId: string) {
  const row = await prisma.ingredient.findUnique({
    where: { id: ingredientId },
    include: { supplier: true, category: true },
  });
  if (!row) throw new NotFoundError('Ingredient not found');
  const stock = await prisma.ingredientStock.findUnique({
    where: { ingredientId_branchId: { ingredientId, branchId } },
    select: { currentStock: true, minStock: true, reorderPoint: true, maxStock: true },
  });
  return toIngredientDto(row, stock);
}

inventoryRouter.post(
  '/ingredients/:id/adjust',
  authorize('inventory:adjust'),
  validate({ params: idParams, body: stockAdjustSchema }),
  asyncHandler(async (req, res) => {
    const input = req.body as StockAdjustInput;
    const branchId = resolveBranchId(req);
    const level = await stockLevels(branchId, req.params.id!);

    const nextStock = level.current + input.quantity;
    if (nextStock < 0) {
      throw new InsufficientStockError(
        `Adjustment would leave ${level.name} at ${nextStock.toFixed(3)}. Available: ${level.current.toFixed(3)}`,
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.ingredientStock.upsert({
        where: { ingredientId_branchId: { ingredientId: req.params.id!, branchId } },
        create: {
          ingredientId: req.params.id!,
          branchId,
          currentStock: qty3(nextStock),
        },
        update: { currentStock: qty3(nextStock) },
      });
      await tx.inventoryMovement.create({
        data: {
          ingredientId: req.params.id!,
          branchId,
          type: 'ADJUSTMENT',
          quantity: qty3(input.quantity),
          unitCost: level.averageCost.toFixed(2),
          note: input.reason,
          userId: req.user!.id,
        },
      });
      await syncStockAlerts(tx, req.params.id!, branchId);
      await recordAudit(
        {
          action: 'inventory.adjusted',
          entityType: 'Ingredient',
          entityId: req.params.id!,
          before: { currentStock: level.current, branchId },
          after: { currentStock: nextStock, reason: input.reason },
          userId: req.user!.id,
        },
        tx,
      );
    });

    res.status(200).json(await withIngredientStock(req.params.id!, branchId));
  }),
);

inventoryRouter.post(
  '/ingredients/:id/purchase',
  authorize('inventory:write'),
  validate({ params: idParams, body: stockPurchaseSchema }),
  asyncHandler(async (req, res) => {
    const input = req.body as StockPurchaseInput;
    const branchId = resolveBranchId(req);
    const level = await stockLevels(branchId, req.params.id!);
    if (input.supplierId) {
      const supplier = await prisma.supplier.findUnique({ where: { id: input.supplierId } });
      if (!supplier) throw new ValidationError('Select a valid supplier');
    }

    const unitCost = input.unitCost ?? Number(level.costPerUnit).toFixed(2);
    const nextStock = level.current + input.quantity;
    const weightedBase = Math.max(level.current, 0);
    const averageCost =
      nextStock > 0
        ? (weightedBase * level.averageCost + input.quantity * Number(unitCost)) / nextStock
        : Number(unitCost);

    await prisma.$transaction(async (tx) => {
      await tx.ingredient.update({
        where: { id: req.params.id! },
        data: {
          costPerUnit: unitCost,
          averageCost: averageCost.toFixed(3),
          ...(input.supplierId !== undefined ? { supplierId: input.supplierId } : {}),
        },
      });
      await tx.ingredientStock.upsert({
        where: { ingredientId_branchId: { ingredientId: req.params.id!, branchId } },
        create: {
          ingredientId: req.params.id!,
          branchId,
          currentStock: qty3(nextStock),
        },
        update: { currentStock: qty3(nextStock) },
      });
      await tx.inventoryMovement.create({
        data: {
          ingredientId: req.params.id!,
          branchId,
          type: 'PURCHASE',
          quantity: qty3(input.quantity),
          unitCost,
          reference: input.reference ?? null,
          note: input.note ?? null,
          userId: req.user!.id,
        },
      });
      await syncStockAlerts(tx, req.params.id!, branchId);
      await recordAudit(
        {
          action: 'inventory.purchased',
          entityType: 'Ingredient',
          entityId: req.params.id!,
          before: { currentStock: level.current, branchId },
          after: { currentStock: nextStock, quantity: input.quantity },
          userId: req.user!.id,
        },
        tx,
      );
    });

    res.status(200).json(await withIngredientStock(req.params.id!, branchId));
  }),
);

async function recordLoss(
  req: Parameters<typeof resolveBranchId>[0],
  movementType: 'WASTE' | 'RETURN',
): Promise<unknown> {
  const input = req.body as StockLossInput;
  const branchId = resolveBranchId(req);
  const level = await stockLevels(branchId, req.params.id!);
  if (level.current < input.quantity) {
    throw new InsufficientStockError(
      `Only ${level.current.toFixed(3)} of ${level.name} is available`,
    );
  }
  await prisma.$transaction(async (tx) => {
    const claimed = await tx.ingredientStock.updateMany({
      where: { ingredientId: req.params.id!, branchId, currentStock: { gte: qty3(input.quantity) } },
      data: { currentStock: { decrement: qty3(input.quantity) } },
    });
    if (claimed.count === 0) {
      throw new InsufficientStockError(`Not enough ${level.name} available`);
    }
    await tx.inventoryMovement.create({
      data: {
        ingredientId: req.params.id!,
        branchId,
        type: movementType,
        quantity: qty3(-input.quantity),
        unitCost: level.averageCost.toFixed(2),
        note: input.reason,
        userId: req.user!.id,
      },
    });
    await syncStockAlerts(tx, req.params.id!, branchId);
    await recordAudit(
      {
        action: movementType === 'WASTE' ? 'inventory.waste' : 'inventory.returned',
        entityType: 'Ingredient',
        entityId: req.params.id!,
        before: { currentStock: level.current, branchId },
        after: { quantity: input.quantity, reason: input.reason },
        userId: req.user!.id,
      },
      tx,
    );
  });
  return withIngredientStock(req.params.id!, branchId);
}

inventoryRouter.post(
  '/ingredients/:id/waste',
  authorize('inventory:adjust'),
  validate({ params: idParams, body: stockLossSchema }),
  asyncHandler(async (req, res) => {
    res.status(200).json(await recordLoss(req, 'WASTE'));
  }),
);

inventoryRouter.post(
  '/ingredients/:id/return',
  authorize('inventory:adjust'),
  validate({ params: idParams, body: stockLossSchema }),
  asyncHandler(async (req, res) => {
    res.status(200).json(await recordLoss(req, 'RETURN'));
  }),
);

inventoryRouter.get(
  '/movements',
  authorize('inventory:read'),
  validate({ query: movementQuerySchema }),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as MovementQuery;
    const branchId = req.user!.role === 'ADMIN' ? undefined : resolveBranchId(req);
    const where: Prisma.InventoryMovementWhereInput = {
      ...(branchId ? { branchId } : {}),
      ...(query.ingredientId ? { ingredientId: query.ingredientId } : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(query.from || query.to
        ? {
            createdAt: {
              ...(query.from ? { gte: businessDayStart(query.from) } : {}),
              ...(query.to
                ? { lt: new Date(businessDayStart(query.to).getTime() + 86_400_000) }
                : {}),
            },
          }
        : {}),
    };

    const [rows, total] = await Promise.all([
      prisma.inventoryMovement.findMany({
        where,
        include: { ingredient: true, user: { select: { fullName: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      prisma.inventoryMovement.count({ where }),
    ]);

    res
      .status(200)
      .json(buildPaginated(rows.map(toMovementDto), total, query.page, query.pageSize));
  }),
);

// ---------------------------------------------------------------------------
// Ingredient categories
// ---------------------------------------------------------------------------

type CategoryRow = Prisma.IngredientCategoryGetPayload<{
  include: { _count: { select: { ingredients: true } } };
}>;

function toIngredientCategoryDto(row: CategoryRow): IngredientCategoryDto {
  const language = currentLanguage();
  return {
    id: row.id,
    name: pickLocalized(language, row.name, row.nameAr),
    nameEn: row.name,
    nameAr: row.nameAr,
    sortOrder: row.sortOrder,
    isActive: row.isActive,
    ingredientCount: row._count.ingredients,
  };
}

const categoryInclude = {
  _count: { select: { ingredients: true } },
} satisfies Prisma.IngredientCategoryInclude;

inventoryRouter.get(
  '/categories',
  authorize('inventory:read'),
  asyncHandler(async (_req, res) => {
    const rows = await prisma.ingredientCategory.findMany({
      include: categoryInclude,
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    res.status(200).json(rows.map(toIngredientCategoryDto));
  }),
);

inventoryRouter.post(
  '/categories',
  authorize('inventory:write'),
  validate({ body: ingredientCategorySchema }),
  asyncHandler(async (req, res) => {
    const input = req.body as IngredientCategoryInput;
    const row = await prisma.ingredientCategory.create({
      data: {
        name: input.name,
        nameAr: input.nameAr ?? null,
        sortOrder: input.sortOrder,
        isActive: input.isActive,
      },
      include: categoryInclude,
    });
    await recordAudit(
      {
        action: 'inventory.category.created',
        entityType: 'IngredientCategory',
        entityId: row.id,
        after: { name: row.name },
        userId: req.user!.id,
      },
      prisma,
    );
    res.status(201).json(toIngredientCategoryDto(row));
  }),
);

inventoryRouter.patch(
  '/categories/:id',
  authorize('inventory:write'),
  validate({ params: idParams, body: ingredientCategoryUpdateSchema }),
  asyncHandler(async (req, res) => {
    const existing = await prisma.ingredientCategory.findUnique({
      where: { id: req.params.id! },
    });
    if (!existing) throw new NotFoundError('Category not found');
    const input = req.body as Partial<IngredientCategoryInput>;
    const row = await prisma.ingredientCategory.update({
      where: { id: existing.id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.nameAr !== undefined ? { nameAr: input.nameAr ?? null } : {}),
        ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
      include: categoryInclude,
    });
    res.status(200).json(toIngredientCategoryDto(row));
  }),
);

inventoryRouter.delete(
  '/categories/:id',
  authorize('inventory:write'),
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    const existing = await prisma.ingredientCategory.findUnique({
      where: { id: req.params.id! },
    });
    if (!existing) throw new NotFoundError('Category not found');
    await prisma.ingredientCategory.delete({ where: { id: existing.id } });
    res.status(200).json({ ok: true });
  }),
);

// ---------------------------------------------------------------------------
// Stores (branches) & per-store stock
// ---------------------------------------------------------------------------

function scopedBranchIds(
  req: Parameters<typeof resolveBranchId>[0],
  requested?: string,
): string[] | null {
  if (req.user!.role === 'ADMIN') return requested ? [requested] : null;
  return [req.user!.branchId ?? resolveBranchId(req)];
}

inventoryRouter.get(
  '/stores',
  authorize('inventory:read'),
  asyncHandler(async (req, res) => {
    const ids = scopedBranchIds(req);
    const branches = await prisma.branch.findMany({
      where: ids ? { id: { in: ids } } : {},
      orderBy: { name: 'asc' },
    });
    const stocks = await prisma.ingredientStock.findMany({
      where: { branchId: { in: branches.map((branch) => branch.id) } },
      include: { ingredient: true },
    });
    const byBranch = new Map<
      string,
      { count: number; low: number; out: number; value: number }
    >();
    for (const stock of stocks) {
      const entry = byBranch.get(stock.branchId) ?? { count: 0, low: 0, out: 0, value: 0 };
      const current = Number(stock.currentStock);
      const cost =
        Number(stock.ingredient.averageCost) || Number(stock.ingredient.costPerUnit);
      entry.count += 1;
      entry.value += current * cost;
      if (current <= 0) entry.out += 1;
      else if (current <= Number(stock.minStock)) entry.low += 1;
      byBranch.set(stock.branchId, entry);
    }
    res.status(200).json(
      branches.map((branch) => {
        const entry = byBranch.get(branch.id) ?? { count: 0, low: 0, out: 0, value: 0 };
        return {
          id: branch.id,
          code: branch.code,
          name: branch.name,
          nameAr: branch.nameAr,
          address: branch.address,
          isActive: branch.isActive,
          ingredientCount: entry.count,
          lowCount: entry.low,
          outCount: entry.out,
          stockValue: entry.value.toFixed(2),
        };
      }),
    );
  }),
);

inventoryRouter.get(
  '/stores/stock',
  authorize('inventory:read'),
  validate({ query: storeStockQuerySchema }),
  asyncHandler(async (req, res) => {
    const query = req.query as { branchId?: string; q?: string };
    const ids = scopedBranchIds(req, query.branchId);
    const branchId = ids?.[0] ?? resolveBranchId(req);
    const rows = await prisma.ingredientStock.findMany({
      where: {
        ...(branchId ? { branchId } : {}),
        ...(query.q
          ? {
              ingredient: {
                OR: [
                  { name: { contains: query.q, mode: 'insensitive' } },
                  { nameAr: { contains: query.q, mode: 'insensitive' } },
                  { sku: { contains: query.q, mode: 'insensitive' } },
                ],
              },
            }
          : {}),
      },
      include: {
        branch: { select: { id: true, name: true, code: true, isActive: true } },
        ingredient: { include: { category: true } },
      },
      orderBy: { ingredient: { name: 'asc' } },
    });
    const language = currentLanguage();
    const payload: StoreStockRowDto[] = rows.map((row) => {
      const current = Number(row.currentStock);
      const cost =
        Number(row.ingredient.averageCost) || Number(row.ingredient.costPerUnit);
      return {
        branchId: row.branchId,
        branchName: row.branch.name,
        branchCode: row.branch.code,
        branchActive: row.branch.isActive,
        ingredientId: row.ingredientId,
        ingredientName: pickLocalized(
          language,
          row.ingredient.name,
          row.ingredient.nameAr,
        ),
        categoryName: row.ingredient.category
          ? pickLocalized(
              language,
              row.ingredient.category.name,
              row.ingredient.category.nameAr,
            )
          : null,
        unit: row.ingredient.unit,
        currentStock: current,
        minStock: Number(row.minStock),
        reorderPoint: Number(row.reorderPoint),
        maxStock: Number(row.maxStock),
        averageCost: cost.toFixed(2),
        stockValue: (current * cost).toFixed(2),
        isLow: current <= Number(row.minStock),
        isOut: current <= 0,
      };
    });
    res.status(200).json(payload);
  }),
);

// ---------------------------------------------------------------------------
// Persisted low/out-of-stock alerts
// ---------------------------------------------------------------------------

type AlertRow = Prisma.StockAlertGetPayload<{
  include: {
    ingredient: true;
    branch: { select: { name: true } };
  };
}>;

function toStockAlertDto(row: AlertRow): StockAlertDto {
  const language = currentLanguage();
  return {
    id: row.id,
    ingredientId: row.ingredientId,
    ingredientName: pickLocalized(language, row.ingredient.name, row.ingredient.nameAr),
    branchId: row.branchId,
    branchName: row.branch.name,
    type: row.type,
    status: row.status,
    currentStock: Number(row.currentStock),
    threshold: Number(row.threshold),
    unit: row.ingredient.unit,
    message: row.message,
    createdAt: row.createdAt.toISOString(),
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
  };
}

const alertInclude = {
  ingredient: true,
  branch: { select: { name: true } },
} satisfies Prisma.StockAlertInclude;

inventoryRouter.get(
  '/alerts',
  authorize('inventory:read'),
  validate({ query: stockAlertQuerySchema }),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as StockAlertQuery;
    const branchId =
      req.user!.role === 'ADMIN' ? (query.branchId ?? undefined) : resolveBranchId(req);
    const where: Prisma.StockAlertWhereInput = {
      ...(branchId ? { branchId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.type ? { type: query.type } : {}),
    };
    const [rows, total] = await Promise.all([
      prisma.stockAlert.findMany({
        where,
        include: alertInclude,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      prisma.stockAlert.count({ where }),
    ]);
    res
      .status(200)
      .json(buildPaginated(rows.map(toStockAlertDto), total, query.page, query.pageSize));
  }),
);

inventoryRouter.post(
  '/alerts/:id/resolve',
  authorize('alerts:manage'),
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    const alert = await prisma.stockAlert.findUnique({ where: { id: req.params.id! } });
    if (!alert) throw new NotFoundError('Alert not found');
    assertBranchAccess(req, alert.branchId);
    if (alert.status === 'RESOLVED') {
      throw new ConflictError('This alert is already resolved');
    }
    const row = await prisma.stockAlert.update({
      where: { id: alert.id },
      data: { status: 'RESOLVED', resolvedAt: new Date(), resolvedById: req.user!.id },
      include: alertInclude,
    });
    res.status(200).json(toStockAlertDto(row));
  }),
);

inventoryRouter.get(
  '/replenishment',
  authorize('inventory:read'),
  asyncHandler(async (req, res) => {
    const branchId = resolveBranchId(req);
    const rows = await prisma.ingredientStock.findMany({
      where: { branchId, ingredient: { isActive: true } },
      include: {
        ingredient: { include: { category: true, supplier: true } },
        branch: { select: { name: true } },
      },
      orderBy: { ingredient: { name: 'asc' } },
    });
    const language = currentLanguage();
    const suggestions: ReplenishmentSuggestionDto[] = rows
      .filter((row) => {
        const current = Number(row.currentStock);
        return (
          current <= 0 ||
          (Number(row.reorderPoint) > 0 && current <= Number(row.reorderPoint)) ||
          current <= Number(row.minStock)
        );
      })
      .map((row) => {
        const current = Number(row.currentStock);
        const max = Number(row.maxStock);
        const target = max > 0 ? max : Number(row.reorderPoint) * 2;
        return {
          ingredientId: row.ingredientId,
          ingredientName: pickLocalized(
            language,
            row.ingredient.name,
            row.ingredient.nameAr,
          ),
          categoryName: row.ingredient.category
            ? pickLocalized(
                language,
                row.ingredient.category.name,
                row.ingredient.category.nameAr,
              )
            : null,
          branchId,
          branchName: row.branch.name,
          unit: row.ingredient.unit,
          currentStock: current,
          reorderPoint: Number(row.reorderPoint),
          maxStock: max,
          suggestedQty: Math.max(0, Number((target - current).toFixed(3))),
          supplierId: row.ingredient.supplierId,
          supplierName: row.ingredient.supplier
            ? pickLocalized(
                language,
                row.ingredient.supplier.name,
                row.ingredient.supplier.nameAr,
              )
            : null,
        };
      });
    res.status(200).json(suggestions);
  }),
);

// ---------------------------------------------------------------------------
// Physical stocktakes
// ---------------------------------------------------------------------------

inventoryRouter.get(
  '/stocktakes',
  authorize('stocktakes:manage'),
  validate({ query: stocktakeQuerySchema }),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as StocktakeQuery;
    const branchId =
      req.user!.role === 'ADMIN' ? (query.branchId ?? undefined) : resolveBranchId(req);
    const where: Prisma.StocktakeWhereInput = branchId ? { branchId } : {};
    const [rows, total] = await Promise.all([
      prisma.stocktake.findMany({
        where,
        include: stocktakeInclude,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      prisma.stocktake.count({ where }),
    ]);
    res
      .status(200)
      .json(buildPaginated(rows.map(toStocktakeDto), total, query.page, query.pageSize));
  }),
);

inventoryRouter.get(
  '/stocktakes/:id',
  authorize('stocktakes:manage'),
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    const row = await prisma.stocktake.findUnique({
      where: { id: req.params.id! },
      include: stocktakeInclude,
    });
    if (!row) throw new NotFoundError('Stocktake not found');
    assertBranchAccess(req, row.branchId);
    res.status(200).json(toStocktakeDto(row));
  }),
);

inventoryRouter.post(
  '/stocktakes',
  authorize('stocktakes:manage'),
  validate({ body: stocktakeCreateSchema }),
  asyncHandler(async (req, res) => {
    const input = req.body as StocktakeCreateInput;
    const branchId = resolveBranchId(req);
    const counted = new Map<string, number>();
    for (const item of input.items) {
      counted.set(item.ingredientId, (counted.get(item.ingredientId) ?? 0) + item.countedQty);
    }
    const ingredientIds = [...counted.keys()];
    const ingredients = await prisma.ingredient.findMany({
      where: { id: { in: ingredientIds }, isActive: true },
      select: { id: true },
    });
    if (ingredients.length !== ingredientIds.length) {
      throw new ValidationError('One or more ingredients are no longer available');
    }
    const stocks = await stockMapFor(branchId, ingredientIds);
    const reference = await uniqueReference('STK');

    const created = await prisma.$transaction(async (tx) => {
      const row = await tx.stocktake.create({
        data: {
          reference,
          branchId,
          status: 'DRAFT',
          notes: input.notes ?? null,
          createdById: req.user!.id,
          items: {
            create: ingredientIds.map((ingredientId) => {
              const expected = Number(stocks.get(ingredientId)?.currentStock ?? 0);
              const countedQty = counted.get(ingredientId)!;
              return {
                ingredientId,
                expectedQty: qty3(expected),
                countedQty: qty3(countedQty),
                variance: qty3(countedQty - expected),
              };
            }),
          },
        },
        include: stocktakeInclude,
      });
      await recordAudit(
        {
          action: 'inventory.stocktake.created',
          entityType: 'Stocktake',
          entityId: row.id,
          after: { reference, branchId, ingredients: ingredientIds.length },
          userId: req.user!.id,
        },
        tx,
      );
      return row;
    });
    res.status(201).json(toStocktakeDto(created));
  }),
);

inventoryRouter.post(
  '/stocktakes/:id/complete',
  authorize('stocktakes:manage'),
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    const stocktake = await prisma.stocktake.findUnique({
      where: { id: req.params.id! },
      include: { items: { include: { ingredient: true } } },
    });
    if (!stocktake) throw new NotFoundError('Stocktake not found');
    assertBranchAccess(req, stocktake.branchId);
    if (stocktake.status !== 'DRAFT') {
      throw new ConflictError('Only a draft stocktake can be completed');
    }

    const completed = await prisma.$transaction(async (tx) => {
      for (const item of stocktake.items) {
        const variance = Number(item.variance);
        if (variance !== 0) {
          await tx.inventoryMovement.create({
            data: {
              ingredientId: item.ingredientId,
              branchId: stocktake.branchId,
              stocktakeId: stocktake.id,
              type: 'STOCKTAKE',
              quantity: qty3(variance),
              unitCost: item.ingredient.costPerUnit,
              note: `Stocktake ${stocktake.reference}`,
              userId: req.user!.id,
            },
          });
        }
        await tx.ingredientStock.upsert({
          where: {
            ingredientId_branchId: {
              ingredientId: item.ingredientId,
              branchId: stocktake.branchId,
            },
          },
          create: {
            ingredientId: item.ingredientId,
            branchId: stocktake.branchId,
            currentStock: qty3(item.countedQty),
          },
          update: { currentStock: { increment: qty3(variance) } },
        });
        await syncStockAlerts(tx, item.ingredientId, stocktake.branchId);
      }
      const row = await tx.stocktake.update({
        where: { id: stocktake.id },
        data: {
          status: 'COMPLETED',
          completedById: req.user!.id,
          completedAt: new Date(),
        },
        include: stocktakeInclude,
      });
      await recordAudit(
        {
          action: 'inventory.stocktake.completed',
          entityType: 'Stocktake',
          entityId: stocktake.id,
          after: { reference: stocktake.reference, items: stocktake.items.length },
          userId: req.user!.id,
        },
        tx,
      );
      return row;
    });

    res.status(200).json(toStocktakeDto(completed));
  }),
);

inventoryRouter.post(
  '/stocktakes/:id/cancel',
  authorize('stocktakes:manage'),
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    const stocktake = await prisma.stocktake.findUnique({ where: { id: req.params.id! } });
    if (!stocktake) throw new NotFoundError('Stocktake not found');
    assertBranchAccess(req, stocktake.branchId);
    if (stocktake.status !== 'DRAFT') {
      throw new ConflictError('Only a draft stocktake can be cancelled');
    }
    const row = await prisma.$transaction(async (tx) => {
      const updated = await tx.stocktake.update({
        where: { id: stocktake.id },
        data: { status: 'CANCELLED' },
        include: stocktakeInclude,
      });
      await recordAudit(
        {
          action: 'inventory.stocktake.cancelled',
          entityType: 'Stocktake',
          entityId: stocktake.id,
          userId: req.user!.id,
        },
        tx,
      );
      return updated;
    });
    res.status(200).json(toStocktakeDto(row));
  }),
);

// ---------------------------------------------------------------------------
// Inter-branch stock transfers
// ---------------------------------------------------------------------------

inventoryRouter.get(
  '/transfers',
  authorize('transfers:manage'),
  validate({ query: transferQuerySchema }),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as TransferQuery;
    const requested =
      req.user!.role === 'ADMIN' ? query.branchId : (req.user!.branchId ?? undefined);
    const where: Prisma.StockTransferWhereInput = {
      ...(requested
        ? { OR: [{ fromBranchId: requested }, { toBranchId: requested }] }
        : {}),
      ...(query.status ? { status: query.status } : {}),
    };
    const [rows, total] = await Promise.all([
      prisma.stockTransfer.findMany({
        where,
        include: transferInclude,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      prisma.stockTransfer.count({ where }),
    ]);
    res
      .status(200)
      .json(buildPaginated(rows.map(toTransferDto), total, query.page, query.pageSize));
  }),
);

inventoryRouter.get(
  '/transfers/:id',
  authorize('transfers:manage'),
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    const row = await prisma.stockTransfer.findUnique({
      where: { id: req.params.id! },
      include: transferInclude,
    });
    if (!row) throw new NotFoundError('Transfer not found');
    if (
      req.user!.role !== 'ADMIN' &&
      req.user!.branchId &&
      req.user!.branchId !== row.fromBranchId &&
      req.user!.branchId !== row.toBranchId
    ) {
      throw new ForbiddenError('This transfer belongs to another branch');
    }
    res.status(200).json(toTransferDto(row));
  }),
);

inventoryRouter.post(
  '/transfers',
  authorize('transfers:manage'),
  validate({ body: transferCreateSchema }),
  asyncHandler(async (req, res) => {
    const input = req.body as TransferCreateInput;
    const branches = await prisma.branch.findMany({
      where: { id: { in: [input.fromBranchId, input.toBranchId] }, isActive: true },
      select: { id: true },
    });
    if (branches.length !== 2) throw new ValidationError('Select two active branches');
    const quantities = new Map<string, number>();
    for (const item of input.items) {
      quantities.set(item.ingredientId, (quantities.get(item.ingredientId) ?? 0) + item.quantity);
    }
    const ingredientIds = [...quantities.keys()];
    const ingredients = await prisma.ingredient.findMany({
      where: { id: { in: ingredientIds }, isActive: true },
      select: { id: true },
    });
    if (ingredients.length !== ingredientIds.length) {
      throw new ValidationError('One or more ingredients are no longer available');
    }
    const reference = await uniqueReference('TRF');

    const created = await prisma.$transaction(async (tx) => {
      const row = await tx.stockTransfer.create({
        data: {
          reference,
          fromBranchId: input.fromBranchId,
          toBranchId: input.toBranchId,
          status: 'DRAFT',
          notes: input.notes ?? null,
          createdById: req.user!.id,
          items: {
            create: ingredientIds.map((ingredientId) => ({
              ingredientId,
              quantity: qty3(quantities.get(ingredientId)!),
            })),
          },
        },
        include: transferInclude,
      });
      await recordAudit(
        {
          action: 'inventory.transfer.created',
          entityType: 'StockTransfer',
          entityId: row.id,
          after: {
            reference,
            fromBranchId: input.fromBranchId,
            toBranchId: input.toBranchId,
          },
          userId: req.user!.id,
        },
        tx,
      );
      return row;
    });
    res.status(201).json(toTransferDto(created));
  }),
);

inventoryRouter.patch(
  '/transfers/:id/status',
  authorize('transfers:manage'),
  validate({ params: idParams, body: transferStatusSchema }),
  asyncHandler(async (req, res) => {
    const input = req.body as TransferStatusInput;
    const transfer = await prisma.stockTransfer.findUnique({
      where: { id: req.params.id! },
      include: { items: { include: { ingredient: true } } },
    });
    if (!transfer) throw new NotFoundError('Transfer not found');
    if (
      req.user!.role !== 'ADMIN' &&
      req.user!.branchId &&
      req.user!.branchId !== transfer.fromBranchId &&
      req.user!.branchId !== transfer.toBranchId
    ) {
      throw new ForbiddenError('This transfer belongs to another branch');
    }

    if (input.status === 'DRAFT') {
      throw new ConflictError('A transfer cannot return to draft');
    }
    if (input.status === 'CANCELLED') {
      if (transfer.status !== 'DRAFT') {
        throw new ConflictError('Only a draft transfer can be cancelled');
      }
      const row = await prisma.$transaction(async (tx) => {
        const updated = await tx.stockTransfer.update({
          where: { id: transfer.id },
          data: { status: 'CANCELLED' },
          include: transferInclude,
        });
        await recordAudit(
          {
            action: 'inventory.transfer.cancelled',
            entityType: 'StockTransfer',
            entityId: transfer.id,
            userId: req.user!.id,
          },
          tx,
        );
        return updated;
      });
      res.status(200).json(toTransferDto(row));
      return;
    }

    if (input.status === 'IN_TRANSIT') {
      if (transfer.status !== 'DRAFT') {
        throw new ConflictError('Only a draft transfer can be dispatched');
      }
      if (req.user!.role !== 'ADMIN' && req.user!.branchId !== transfer.fromBranchId) {
        throw new ForbiddenError('Only the sending branch can dispatch this transfer');
      }
      const row = await prisma.$transaction(async (tx) => {
        for (const item of transfer.items) {
          const quantity = qty3(item.quantity);
          const claimed = await tx.ingredientStock.updateMany({
            where: {
              ingredientId: item.ingredientId,
              branchId: transfer.fromBranchId,
              currentStock: { gte: quantity },
            },
            data: { currentStock: { decrement: quantity } },
          });
          if (claimed.count === 0) {
            throw new InsufficientStockError(
              `Not enough ${item.ingredient.name} at the sending branch`,
            );
          }
          await tx.inventoryMovement.create({
            data: {
              ingredientId: item.ingredientId,
              branchId: transfer.fromBranchId,
              transferId: transfer.id,
              type: 'TRANSFER_OUT',
              quantity: qty3(-Number(item.quantity)),
              unitCost: item.ingredient.costPerUnit,
              note: `Transfer ${transfer.reference}`,
              userId: req.user!.id,
            },
          });
          await syncStockAlerts(tx, item.ingredientId, transfer.fromBranchId);
        }
        const updated = await tx.stockTransfer.update({
          where: { id: transfer.id },
          data: { status: 'IN_TRANSIT' },
          include: transferInclude,
        });
        await recordAudit(
          {
            action: 'inventory.transfer.dispatched',
            entityType: 'StockTransfer',
            entityId: transfer.id,
            userId: req.user!.id,
          },
          tx,
        );
        return updated;
      });
      res.status(200).json(toTransferDto(row));
      return;
    }

    // RECEIVED
    if (transfer.status !== 'IN_TRANSIT') {
      throw new ConflictError('Only a dispatched transfer can be received');
    }
    if (req.user!.role !== 'ADMIN' && req.user!.branchId !== transfer.toBranchId) {
      throw new ForbiddenError('Only the receiving branch can accept this transfer');
    }
    const row = await prisma.$transaction(async (tx) => {
      for (const item of transfer.items) {
        const quantity = qty3(item.quantity);
        await tx.ingredientStock.upsert({
          where: {
            ingredientId_branchId: {
              ingredientId: item.ingredientId,
              branchId: transfer.toBranchId,
            },
          },
          create: {
            ingredientId: item.ingredientId,
            branchId: transfer.toBranchId,
            currentStock: quantity,
          },
          update: { currentStock: { increment: quantity } },
        });
        await tx.inventoryMovement.create({
          data: {
            ingredientId: item.ingredientId,
            branchId: transfer.toBranchId,
            transferId: transfer.id,
            type: 'TRANSFER_IN',
            quantity,
            unitCost: item.ingredient.costPerUnit,
            note: `Transfer ${transfer.reference}`,
            userId: req.user!.id,
          },
        });
        await syncStockAlerts(tx, item.ingredientId, transfer.toBranchId);
      }
      const updated = await tx.stockTransfer.update({
        where: { id: transfer.id },
        data: {
          status: 'RECEIVED',
          receivedById: req.user!.id,
          receivedAt: new Date(),
        },
        include: transferInclude,
      });
      await recordAudit(
        {
          action: 'inventory.transfer.received',
          entityType: 'StockTransfer',
          entityId: transfer.id,
          userId: req.user!.id,
        },
        tx,
      );
      return updated;
    });
    res.status(200).json(toTransferDto(row));
  }),
);
