import { Router } from 'express';
import { z } from 'zod';
import {
  buildPaginated,
  expenseCreateSchema,
  expenseQuerySchema,
  expenseUpdateSchema,
  idSchema,
  pickLocalized,
  type ExpenseCategory,
  type ExpenseCreateInput,
  type ExpenseDto,
  type ExpenseQuery,
  type ExpenseSummaryDto,
} from '@posshope/shared';
import type { Expense, Prisma } from '@prisma/client';
import { asyncHandler } from '../../lib/asyncHandler.js';
import { recordAudit } from '../../lib/audit.js';
import { resolveBranchId, resolveReportBranchId } from '../../lib/branches.js';
import { parseDateOnly, toDateOnly } from '../../lib/dates.js';
import { NotFoundError } from '../../lib/errors.js';
import { currentLanguage } from '../../lib/request-language.js';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { validate } from '../../middleware/validate.js';
import { prisma } from '../../prisma.js';

export const expensesRouter = Router();
expensesRouter.use(authenticate);

const idParams = z.object({ id: idSchema });

const expenseInclude = {
  branch: { select: { name: true, nameAr: true } },
} satisfies Prisma.ExpenseInclude;

type ExpenseRow = Expense & Prisma.ExpenseGetPayload<{ include: typeof expenseInclude }>;

function toExpenseDto(row: ExpenseRow): ExpenseDto {
  const language = currentLanguage();
  return {
    id: row.id,
    category: row.category,
    description: row.description,
    amount: Number(row.amount).toFixed(2),
    expenseDate: toDateOnly(row.expenseDate),
    branchId: row.branchId,
    branchName: row.branch
      ? pickLocalized(language, row.branch.name, row.branch.nameAr)
      : null,
    notes: row.notes,
    createdByName: row.createdByName,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Converts the query window into a DATE-column filter. */
function dateFilter(query: ExpenseQuery): Prisma.ExpenseWhereInput {
  if (!query.from && !query.to) return {};
  return {
    expenseDate: {
      ...(query.from ? { gte: parseDateOnly(query.from) } : {}),
      ...(query.to ? { lte: parseDateOnly(query.to) } : {}),
    },
  };
}

function scopedBranchId(req: Parameters<typeof resolveReportBranchId>[0]): string | undefined {
  const branch = resolveReportBranchId(req);
  return branch === 'all' ? undefined : branch;
}

function whereFor(req: Parameters<typeof resolveReportBranchId>[0], query: ExpenseQuery) {
  const branchId = query.branchId ?? scopedBranchId(req);
  return {
    ...dateFilter(query),
    ...(query.category ? { category: query.category } : {}),
    ...(branchId ? { branchId } : {}),
  } satisfies Prisma.ExpenseWhereInput;
}

function branchForWrite(
  req: Parameters<typeof resolveReportBranchId>[0],
  requested: string | null | undefined,
): string {
  if (req.user!.role !== 'ADMIN') return resolveBranchId(req);
  return requested ?? resolveBranchId(req);
}

async function assertBranchExists(branchId: string): Promise<void> {
  const branch = await prisma.branch.findUnique({ where: { id: branchId }, select: { id: true } });
  if (!branch) throw new NotFoundError('Branch not found');
}

expensesRouter.get(
  '/',
  authorize('expenses:read'),
  validate({ query: expenseQuerySchema }),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as ExpenseQuery;
    const where = whereFor(req, query);
    const [rows, total] = await Promise.all([
      prisma.expense.findMany({
        where,
        include: expenseInclude,
        orderBy: [{ expenseDate: 'desc' }, { createdAt: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      prisma.expense.count({ where }),
    ]);
    res
      .status(200)
      .json(buildPaginated(rows.map(toExpenseDto), total, query.page, query.pageSize));
  }),
);

expensesRouter.get(
  '/summary',
  authorize('expenses:read'),
  validate({ query: expenseQuerySchema }),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as ExpenseQuery;
    const where = whereFor(req, query);
    const groups = await prisma.expense.groupBy({
      by: ['category'],
      where,
      _sum: { amount: true },
      _count: { _all: true },
    });
    const byCategory = groups
      .map((group) => ({
        category: group.category as ExpenseCategory,
        amount: Number(group._sum.amount ?? 0).toFixed(2),
        count: group._count._all,
      }))
      .sort((a, b) => Number(b.amount) - Number(a.amount));
    const total = byCategory.reduce((sum, row) => sum + Number(row.amount), 0);
    const count = byCategory.reduce((sum, row) => sum + row.count, 0);
    const summary: ExpenseSummaryDto = { total: total.toFixed(2), count, byCategory };
    res.status(200).json(summary);
  }),
);

expensesRouter.post(
  '/',
  authorize('expenses:write'),
  validate({ body: expenseCreateSchema }),
  asyncHandler(async (req, res) => {
    const input = req.body as ExpenseCreateInput;
    const branchId = branchForWrite(req, input.branchId);
    await assertBranchExists(branchId);
    const created = await prisma.$transaction(async (tx) => {
      const row = await tx.expense.create({
        data: {
          category: input.category,
          description: input.description,
          amount: input.amount,
          expenseDate: parseDateOnly(input.expenseDate),
          branchId,
          notes: input.notes ?? null,
          createdByName: req.user!.fullName,
        },
        include: expenseInclude,
      });
      await recordAudit(
        {
          action: 'expense.created',
          entityType: 'Expense',
          entityId: row.id,
          after: { category: row.category, amount: String(row.amount) },
          userId: req.user!.id,
        },
        tx,
      );
      return row;
    });
    res.status(201).json(toExpenseDto(created));
  }),
);

expensesRouter.patch(
  '/:id',
  authorize('expenses:write'),
  validate({ params: idParams, body: expenseUpdateSchema }),
  asyncHandler(async (req, res) => {
    const input = req.body as Partial<ExpenseCreateInput>;
    const existing = await prisma.expense.findUnique({ where: { id: req.params.id! } });
    if (!existing) throw new NotFoundError('Expense not found');
    const branchId =
      req.user!.role === 'ADMIN' && input.branchId !== undefined
        ? (input.branchId ?? resolveBranchId(req))
        : req.user!.role === 'ADMIN'
          ? undefined
          : resolveBranchId(req);
    if (branchId) await assertBranchExists(branchId);
    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.expense.update({
        where: { id: existing.id },
        data: {
          ...(input.category !== undefined ? { category: input.category } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
          ...(input.amount !== undefined ? { amount: input.amount } : {}),
          ...(input.expenseDate !== undefined
            ? { expenseDate: parseDateOnly(input.expenseDate) }
            : {}),
          ...(branchId !== undefined ? { branchId } : {}),
          ...(input.notes !== undefined ? { notes: input.notes ?? null } : {}),
        },
        include: expenseInclude,
      });
      await recordAudit(
        {
          action: 'expense.updated',
          entityType: 'Expense',
          entityId: row.id,
          userId: req.user!.id,
        },
        tx,
      );
      return row;
    });
    res.status(200).json(toExpenseDto(updated));
  }),
);

expensesRouter.delete(
  '/:id',
  authorize('expenses:write'),
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    const existing = await prisma.expense.findUnique({ where: { id: req.params.id! } });
    if (!existing) throw new NotFoundError('Expense not found');
    await prisma.$transaction(async (tx) => {
      await tx.expense.delete({ where: { id: existing.id } });
      await recordAudit(
        {
          action: 'expense.deleted',
          entityType: 'Expense',
          entityId: existing.id,
          before: { category: existing.category, amount: String(existing.amount) },
          userId: req.user!.id,
        },
        tx,
      );
    });
    res.status(200).json({ ok: true });
  }),
);
