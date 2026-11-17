import { randomBytes } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import {
  buildPaginated,
  fromMinorUnits,
  toMinorUnits,
  type CashMovementDto,
  type CashMovementInput,
  type Paginated,
  type Role,
  type ShiftCloseInput,
  type ShiftDto,
  type ShiftOpenInput,
  type ShiftQuery,
  type ShiftTotals,
  type ZReportDto,
  type ZReportQuery,
} from '@posshope/shared';
import { recordAudit } from '../../lib/audit.js';
import type { PrismaLike } from '../../lib/audit.js';
import { businessDayStart, todayInBusinessTimezone } from '../../lib/dates.js';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../../lib/errors.js';
import { prisma } from '../../prisma.js';

export interface ShiftActor {
  id: string;
  role: Role;
  branchId?: string | null;
  terminalId?: string | null;
}

const shiftInclude = {
  branch: { select: { name: true } },
  openedBy: { select: { fullName: true } },
  closedBy: { select: { fullName: true } },
  cashMovements: {
    include: { user: { select: { fullName: true } } },
    orderBy: { createdAt: 'asc' },
  },
  zReport: true,
} satisfies Prisma.ShiftInclude;

type ShiftRow = Prisma.ShiftGetPayload<{ include: typeof shiftInclude }>;
type CashMovementRow = ShiftRow['cashMovements'][number];
type ZReportRow = Prisma.ZReportGetPayload<Record<string, never>>;

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/u;
const DAY_MS = 86_400_000;

function minor(value: Prisma.Decimal | string | number | null): number {
  return value === null ? 0 : toMinorUnits(value.toString());
}

function money(value: Prisma.Decimal | string | number | null): string {
  return fromMinorUnits(minor(value));
}

async function generateShiftNumber(client: PrismaLike = prisma): Promise<string> {
  const dayKey = todayInBusinessTimezone().replace(/-/gu, '');
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const shiftNumber = `SHF-${dayKey}-${randomBytes(3).toString('hex').toUpperCase()}`;
    const existing = await client.shift.findUnique({
      where: { shiftNumber },
      select: { id: true },
    });
    if (!existing) return shiftNumber;
  }
  throw new ConflictError('Could not allocate a shift number, please retry');
}

async function generateZReportNumber(client: PrismaLike): Promise<string> {
  const dayKey = todayInBusinessTimezone().replace(/-/gu, '');
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const reportNumber = `Z-${dayKey}-${randomBytes(3).toString('hex').toUpperCase()}`;
    const existing = await client.zReport.findUnique({
      where: { reportNumber },
      select: { id: true },
    });
    if (!existing) return reportNumber;
  }
  throw new ConflictError('Could not allocate a Z-report number, please retry');
}

interface TotalsAccumulator {
  ordersCount: number;
  grossSales: number;
  cashPayments: number;
  cardPayments: number;
  walletPayments: number;
  cashIn: number;
  cashOut: number;
  cashRefunds: number;
  refundsTotal: number;
  discounts: number;
  tax: number;
  deliveryFees: number;
}

function emptyAccumulator(): TotalsAccumulator {
  return {
    ordersCount: 0,
    grossSales: 0,
    cashPayments: 0,
    cardPayments: 0,
    walletPayments: 0,
    cashIn: 0,
    cashOut: 0,
    cashRefunds: 0,
    refundsTotal: 0,
    discounts: 0,
    tax: 0,
    deliveryFees: 0,
  };
}

interface ShiftTotalsSource {
  id: string;
  openingFloat: Prisma.Decimal;
  countedCash: Prisma.Decimal | null;
}

/**
 * Drawer maths for one or many shifts: payments taken through the shift, cash
 * in/out, refunds paid out, then expected = float + cash sales + cash in - cash
 * out - cash refunds. Card/wallet never affect the physical drawer.
 */
async function totalsForShifts(
  shifts: readonly ShiftTotalsSource[],
  client: PrismaLike = prisma,
): Promise<Map<string, ShiftTotals>> {
  const result = new Map<string, ShiftTotals>();
  if (shifts.length === 0) return result;

  const ids = shifts.map((shift) => shift.id);
  const accumulators = new Map(ids.map((id) => [id, emptyAccumulator()]));

  const [orders, payments, refunds, movements] = await Promise.all([
    client.order.findMany({
      where: {
        shiftId: { in: ids },
        status: { not: 'CANCELLED' },
        paymentStatus: { in: ['PAID', 'PARTIALLY_REFUNDED', 'REFUNDED'] },
      },
      select: { shiftId: true, total: true, discount: true, tax: true, deliveryFee: true },
    }),
    client.payment.findMany({
      where: { shiftId: { in: ids } },
      select: { shiftId: true, method: true, amount: true },
    }),
    client.refund.findMany({
      where: { shiftId: { in: ids } },
      select: { shiftId: true, method: true, amount: true },
    }),
    client.cashMovement.findMany({
      where: { shiftId: { in: ids } },
      select: { shiftId: true, type: true, amount: true },
    }),
  ]);

  for (const order of orders) {
    const acc = order.shiftId ? accumulators.get(order.shiftId) : undefined;
    if (!acc) continue;
    acc.ordersCount += 1;
    acc.grossSales += minor(order.total);
    acc.discounts += minor(order.discount);
    acc.tax += minor(order.tax);
    acc.deliveryFees += minor(order.deliveryFee);
  }
  for (const payment of payments) {
    const acc = payment.shiftId ? accumulators.get(payment.shiftId) : undefined;
    if (!acc) continue;
    const amount = minor(payment.amount);
    if (payment.method === 'CASH') acc.cashPayments += amount;
    else if (payment.method === 'CARD') acc.cardPayments += amount;
    else acc.walletPayments += amount;
  }
  for (const refund of refunds) {
    const acc = refund.shiftId ? accumulators.get(refund.shiftId) : undefined;
    if (!acc) continue;
    const amount = minor(refund.amount);
    acc.refundsTotal += amount;
    if (refund.method === 'CASH') acc.cashRefunds += amount;
  }
  for (const movement of movements) {
    const acc = movement.shiftId ? accumulators.get(movement.shiftId) : undefined;
    if (!acc) continue;
    if (movement.type === 'CASH_IN') acc.cashIn += minor(movement.amount);
    else acc.cashOut += minor(movement.amount);
  }

  for (const shift of shifts) {
    const acc = accumulators.get(shift.id)!;
    const openingMinor = minor(shift.openingFloat);
    const expectedMinor =
      openingMinor + acc.cashPayments + acc.cashIn - acc.cashOut - acc.cashRefunds;
    const countedMinor = shift.countedCash === null ? null : minor(shift.countedCash);
    result.set(shift.id, {
      ordersCount: acc.ordersCount,
      grossSales: fromMinorUnits(acc.grossSales),
      cashPayments: fromMinorUnits(acc.cashPayments),
      cardPayments: fromMinorUnits(acc.cardPayments),
      walletPayments: fromMinorUnits(acc.walletPayments),
      cashIn: fromMinorUnits(acc.cashIn),
      cashOut: fromMinorUnits(acc.cashOut),
      cashRefunds: fromMinorUnits(acc.cashRefunds),
      refundsTotal: fromMinorUnits(acc.refundsTotal),
      discounts: fromMinorUnits(acc.discounts),
      tax: fromMinorUnits(acc.tax),
      deliveryFees: fromMinorUnits(acc.deliveryFees),
      openingFloat: fromMinorUnits(openingMinor),
      expectedCash: fromMinorUnits(expectedMinor),
      countedCash: countedMinor === null ? null : fromMinorUnits(countedMinor),
      variance: countedMinor === null ? null : fromMinorUnits(countedMinor - expectedMinor),
    });
  }
  return result;
}

function toCashMovementDto(row: CashMovementRow): CashMovementDto {
  return {
    id: row.id,
    type: row.type,
    amount: money(row.amount),
    reason: row.reason,
    userId: row.userId,
    userName: row.user.fullName,
    createdAt: row.createdAt.toISOString(),
  };
}

function toZReportDto(row: ZReportRow): ZReportDto {
  return {
    id: row.id,
    reportNumber: row.reportNumber,
    shiftId: row.shiftId,
    branchId: row.branchId,
    terminalId: row.terminalId,
    businessDate: row.businessDate,
    totals: row.totals as unknown as ShiftTotals,
    lockedAt: row.lockedAt.toISOString(),
  };
}

function toShiftDto(row: ShiftRow, totals: ShiftTotals): ShiftDto {
  return {
    id: row.id,
    shiftNumber: row.shiftNumber,
    branchId: row.branchId,
    branchName: row.branch.name,
    terminalId: row.terminalId,
    openedById: row.openedById,
    openedByName: row.openedBy.fullName,
    closedById: row.closedById,
    closedByName: row.closedBy?.fullName ?? null,
    openingFloat: money(row.openingFloat),
    countedCash: row.countedCash === null ? null : money(row.countedCash),
    expectedCash: row.expectedCash === null ? null : money(row.expectedCash),
    variance: row.variance === null ? null : money(row.variance),
    status: row.status,
    notes: row.notes,
    openedAt: row.openedAt.toISOString(),
    closedAt: row.closedAt?.toISOString() ?? null,
    totals,
    cashMovements: row.cashMovements.map(toCashMovementDto),
    zReport: row.zReport ? toZReportDto(row.zReport) : null,
  };
}

function assertBranchAccess(shift: { branchId: string }, actor: ShiftActor): void {
  if (actor.role !== 'ADMIN' && actor.branchId && shift.branchId !== actor.branchId) {
    throw new ForbiddenError('This shift belongs to another branch');
  }
}

function assertCanClose(shift: { branchId: string; openedById: string }, actor: ShiftActor): void {
  assertBranchAccess(shift, actor);
  if (actor.role !== 'ADMIN' && shift.openedById !== actor.id) {
    throw new ForbiddenError('Only the operator who opened this shift can close it');
  }
}

function parseRangeDate(value: string): Date {
  if (!DATE_ONLY.test(value)) throw new ValidationError('Dates must use YYYY-MM-DD format');
  return businessDayStart(value);
}

export async function getCurrentShift(
  branchId: string,
  terminalId: string,
): Promise<ShiftDto | null> {
  const row = await prisma.shift.findFirst({
    where: { branchId, terminalId, status: 'OPEN' },
    include: shiftInclude,
    orderBy: { openedAt: 'desc' },
  });
  if (!row) return null;
  const totals = (await totalsForShifts([row])).get(row.id)!;
  return toShiftDto(row, totals);
}

export async function listShifts(
  query: ShiftQuery,
  branchId: string | undefined,
): Promise<Paginated<ShiftDto>> {
  const where: Prisma.ShiftWhereInput = {
    ...(branchId ? { branchId } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.from || query.to
      ? {
          openedAt: {
            ...(query.from ? { gte: parseRangeDate(query.from) } : {}),
            ...(query.to ? { lt: new Date(parseRangeDate(query.to).getTime() + DAY_MS) } : {}),
          },
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.shift.findMany({
      where,
      include: shiftInclude,
      orderBy: { openedAt: 'desc' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.shift.count({ where }),
  ]);

  const totals = await totalsForShifts(rows);
  return buildPaginated(
    rows.map((row) => toShiftDto(row, totals.get(row.id)!)),
    total,
    query.page,
    query.pageSize,
  );
}

export async function getShift(shiftId: string, actor: ShiftActor): Promise<ShiftDto> {
  const row = await prisma.shift.findUnique({ where: { id: shiftId }, include: shiftInclude });
  if (!row) throw new NotFoundError('Shift not found');
  assertBranchAccess(row, actor);
  const totals = (await totalsForShifts([row])).get(row.id)!;
  return toShiftDto(row, totals);
}

export async function openShift(
  input: ShiftOpenInput,
  actor: ShiftActor,
  context: { branchId: string; terminalId: string },
): Promise<ShiftDto> {
  const branch = await prisma.branch.findUnique({
    where: { id: context.branchId },
    select: { id: true, isActive: true },
  });
  if (!branch || !branch.isActive) throw new ValidationError('Select an active branch');

  const existing = await prisma.shift.findFirst({
    where: { branchId: context.branchId, terminalId: context.terminalId, status: 'OPEN' },
    select: { id: true },
  });
  if (existing) {
    throw new ConflictError('This terminal already has an open shift. Close it before opening a new one.');
  }

  const shiftNumber = await generateShiftNumber();
  const openingFloat = fromMinorUnits(toMinorUnits(input.openingFloat));

  const created = await prisma.$transaction(async (tx) => {
    const row = await tx.shift.create({
      data: {
        shiftNumber,
        branchId: context.branchId,
        terminalId: context.terminalId,
        openedById: actor.id,
        openingFloat,
        notes: input.notes ?? null,
      },
      include: shiftInclude,
    });
    await recordAudit(
      {
        action: 'shift.opened',
        entityType: 'Shift',
        entityId: row.id,
        after: {
          shiftNumber,
          branchId: context.branchId,
          terminalId: context.terminalId,
          openingFloat,
        },
        userId: actor.id,
        terminalId: context.terminalId,
      },
      tx,
    );
    return row;
  });

  const totals = (await totalsForShifts([created])).get(created.id)!;
  return toShiftDto(created, totals);
}

export async function recordCashMovement(
  shiftId: string,
  input: CashMovementInput,
  actor: ShiftActor,
): Promise<ShiftDto> {
  const shift = await prisma.shift.findUnique({ where: { id: shiftId }, include: shiftInclude });
  if (!shift) throw new NotFoundError('Shift not found');
  if (shift.status !== 'OPEN') {
    throw new ConflictError('Cash movements can only be recorded on an open shift');
  }
  assertBranchAccess(shift, actor);

  const amount = fromMinorUnits(toMinorUnits(input.amount));

  await prisma.$transaction(async (tx) => {
    await tx.cashMovement.create({
      data: {
        shiftId: shift.id,
        type: input.type,
        amount,
        reason: input.reason,
        userId: actor.id,
      },
    });
    await recordAudit(
      {
        action: input.type === 'CASH_IN' ? 'shift.cash.in' : 'shift.cash.out',
        entityType: 'Shift',
        entityId: shift.id,
        after: { type: input.type, amount, reason: input.reason },
        userId: actor.id,
        terminalId: shift.terminalId,
      },
      tx,
    );
  });

  const refreshed = await prisma.shift.findUniqueOrThrow({
    where: { id: shift.id },
    include: shiftInclude,
  });
  const totals = (await totalsForShifts([refreshed])).get(refreshed.id)!;
  return toShiftDto(refreshed, totals);
}

export async function closeShift(
  shiftId: string,
  input: ShiftCloseInput,
  actor: ShiftActor,
): Promise<ShiftDto> {
  const shift = await prisma.shift.findUnique({ where: { id: shiftId }, include: shiftInclude });
  if (!shift) throw new NotFoundError('Shift not found');
  assertCanClose(shift, actor);
  if (shift.status !== 'OPEN') throw new ConflictError('This shift is already closed');

  const totalsBefore = (await totalsForShifts([shift])).get(shift.id)!;
  const countedMinor = toMinorUnits(input.countedCash);
  const expectedMinor = toMinorUnits(totalsBefore.expectedCash);
  const varianceMinor = countedMinor - expectedMinor;
  const businessDate = todayInBusinessTimezone();
  const lockedTotals: ShiftTotals = {
    ...totalsBefore,
    countedCash: fromMinorUnits(countedMinor),
    expectedCash: fromMinorUnits(expectedMinor),
    variance: fromMinorUnits(varianceMinor),
  };

  const closed = await prisma.$transaction(async (tx) => {
    const claimed = await tx.shift.updateMany({
      where: { id: shift.id, status: 'OPEN' },
      data: {
        status: 'CLOSED',
        countedCash: fromMinorUnits(countedMinor),
        expectedCash: fromMinorUnits(expectedMinor),
        variance: fromMinorUnits(varianceMinor),
        closedById: actor.id,
        closedAt: new Date(),
        ...(input.notes
          ? { notes: [shift.notes, input.notes].filter(Boolean).join('\n') }
          : {}),
      },
    });
    if (claimed.count === 0) throw new ConflictError('This shift was already closed');

    const reportNumber = await generateZReportNumber(tx);
    const report = await tx.zReport.create({
      data: {
        reportNumber,
        shiftId: shift.id,
        branchId: shift.branchId,
        businessDate,
        terminalId: shift.terminalId,
        totals: lockedTotals as unknown as Prisma.InputJsonValue,
      },
    });

    await recordAudit(
      {
        action: 'shift.closed',
        entityType: 'Shift',
        entityId: shift.id,
        before: { status: 'OPEN', expectedCash: totalsBefore.expectedCash },
        after: {
          status: 'CLOSED',
          countedCash: fromMinorUnits(countedMinor),
          expectedCash: fromMinorUnits(expectedMinor),
          variance: fromMinorUnits(varianceMinor),
          zReport: report.reportNumber,
        },
        userId: actor.id,
        terminalId: shift.terminalId,
      },
      tx,
    );
    await recordAudit(
      {
        action: 'zreport.created',
        entityType: 'ZReport',
        entityId: report.id,
        after: { reportNumber, businessDate, totals: lockedTotals },
        userId: actor.id,
        terminalId: shift.terminalId,
      },
      tx,
    );

    return tx.shift.findUniqueOrThrow({ where: { id: shift.id }, include: shiftInclude });
  });

  const totals = (await totalsForShifts([closed])).get(closed.id)!;
  return toShiftDto(closed, totals);
}

export async function listZReports(
  query: ZReportQuery,
  branchId: string | undefined,
  actor: ShiftActor,
): Promise<ZReportDto[]> {
  const businessDate = query.date ?? todayInBusinessTimezone();
  if (!DATE_ONLY.test(businessDate)) {
    throw new ValidationError('Dates must use YYYY-MM-DD format');
  }
  const scope = actor.role === 'ADMIN' ? (query.branchId ?? branchId) : actor.branchId ?? branchId;
  const rows = await prisma.zReport.findMany({
    where: {
      businessDate,
      ...(scope && scope !== 'all' ? { branchId: scope } : {}),
    },
    orderBy: { lockedAt: 'desc' },
  });
  return rows.map(toZReportDto);
}

export async function getZReport(reportId: string, actor: ShiftActor): Promise<ZReportDto> {
  const row = await prisma.zReport.findUnique({ where: { id: reportId } });
  if (!row) throw new NotFoundError('Z-report not found');
  assertBranchAccess(row, actor);
  return toZReportDto(row);
}
