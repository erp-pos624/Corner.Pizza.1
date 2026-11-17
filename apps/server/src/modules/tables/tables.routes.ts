import { Router, type Request } from 'express';
import { z } from 'zod';
import {
  idSchema,
  tableCreateSchema,
  tableUpdateSchema,
  type DiningTableDto,
  type TableCreateInput,
  type TableUpdateInput,
} from '@posshope/shared';
import type { Prisma } from '@prisma/client';
import { asyncHandler } from '../../lib/asyncHandler.js';
import { recordAudit } from '../../lib/audit.js';
import { resolveBranchId } from '../../lib/branches.js';
import { ConflictError, ForbiddenError, NotFoundError } from '../../lib/errors.js';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { validate } from '../../middleware/validate.js';
import { prisma } from '../../prisma.js';

export const tablesRouter = Router();
tablesRouter.use(authenticate);

const idParams = z.object({ id: idSchema });

const tableInclude = {
  orders: {
    where: { paymentStatus: 'UNPAID' as const, status: { not: 'CANCELLED' as const } },
    orderBy: { createdAt: 'desc' as const },
    take: 1,
    select: { id: true, orderNumber: true, total: true, createdAt: true },
  },
} satisfies Prisma.DiningTableInclude;

type TableRow = Prisma.DiningTableGetPayload<{ include: typeof tableInclude }>;

function toTableDto(row: TableRow): DiningTableDto {
  const open = row.orders[0];
  return {
    id: row.id,
    branchId: row.branchId,
    name: row.name,
    seats: row.seats,
    status: row.status,
    isActive: row.isActive,
    openOrderId: open?.id ?? null,
    openOrderNumber: open?.orderNumber ?? null,
    openOrderTotal: open ? open.total.toFixed(2) : null,
    openOrderOpenedAt: open ? open.createdAt.toISOString() : null,
  };
}

function assertBranch(table: { branchId: string }, req: Request): void {
  if (req.user!.role !== 'ADMIN' && table.branchId !== resolveBranchId(req)) {
    throw new ForbiddenError('This table belongs to another branch');
  }
}

tablesRouter.get(
  '/',
  authorize('tables:view'),
  asyncHandler(async (req, res) => {
    const branchId = resolveBranchId(req);
    const rows = await prisma.diningTable.findMany({
      where: { branchId },
      include: tableInclude,
      orderBy: [{ name: 'asc' }],
    });
    res.status(200).json(rows.map(toTableDto));
  }),
);

tablesRouter.post(
  '/',
  authorize('tables:manage'),
  validate({ body: tableCreateSchema }),
  asyncHandler(async (req, res) => {
    const input = req.body as TableCreateInput;
    const branchId = resolveBranchId(req);
    const clash = await prisma.diningTable.findFirst({
      where: { branchId, name: input.name },
      select: { id: true },
    });
    if (clash) throw new ConflictError('A table with that name already exists in this branch');

    const created = await prisma.$transaction(async (tx) => {
      const row = await tx.diningTable.create({
        data: {
          branchId,
          name: input.name,
          seats: input.seats,
          isActive: input.isActive,
        },
        include: tableInclude,
      });
      await recordAudit(
        {
          action: 'table.created',
          entityType: 'DiningTable',
          entityId: row.id,
          after: { name: row.name, seats: row.seats, branchId },
          userId: req.user!.id,
        },
        tx,
      );
      return row;
    });
    res.status(201).json(toTableDto(created));
  }),
);

tablesRouter.patch(
  '/:id',
  authorize('tables:manage'),
  validate({ params: idParams, body: tableUpdateSchema }),
  asyncHandler(async (req, res) => {
    const input = req.body as TableUpdateInput;
    const existing = await prisma.diningTable.findUnique({
      where: { id: req.params.id! },
      include: tableInclude,
    });
    if (!existing) throw new NotFoundError('Table not found');
    assertBranch(existing, req);

    if (input.name && input.name !== existing.name) {
      const clash = await prisma.diningTable.findFirst({
        where: { branchId: existing.branchId, name: input.name, NOT: { id: existing.id } },
        select: { id: true },
      });
      if (clash) throw new ConflictError('A table with that name already exists in this branch');
    }
    if (input.status === 'AVAILABLE' && existing.orders.length > 0) {
      throw new ConflictError('Settle or cancel the open tab before freeing this table');
    }

    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.diningTable.update({
        where: { id: existing.id },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.seats !== undefined ? { seats: input.seats } : {}),
          ...(input.status !== undefined ? { status: input.status } : {}),
          ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        },
        include: tableInclude,
      });
      await recordAudit(
        {
          action: 'table.updated',
          entityType: 'DiningTable',
          entityId: row.id,
          before: { name: existing.name, status: existing.status, isActive: existing.isActive },
          after: { name: row.name, status: row.status, isActive: row.isActive },
          userId: req.user!.id,
        },
        tx,
      );
      return row;
    });
    res.status(200).json(toTableDto(updated));
  }),
);

tablesRouter.delete(
  '/:id',
  authorize('tables:manage'),
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    const existing = await prisma.diningTable.findUnique({
      where: { id: req.params.id! },
      include: { _count: { select: { orders: true } } },
    });
    if (!existing) throw new NotFoundError('Table not found');
    assertBranch(existing, req);
    if (existing._count.orders > 0) {
      throw new ConflictError('This table appears on past orders. Deactivate it instead of deleting.');
    }
    await prisma.$transaction(async (tx) => {
      await tx.diningTable.delete({ where: { id: existing.id } });
      await recordAudit(
        {
          action: 'table.deleted',
          entityType: 'DiningTable',
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
