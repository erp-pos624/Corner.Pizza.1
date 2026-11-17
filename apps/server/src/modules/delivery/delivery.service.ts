import { randomBytes } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import {
  buildPaginated,
  fromMinorUnits,
  toMinorUnits,
  type DeliveryAssignInput,
  type DeliveryOrderDto,
  type DeliveryQuery,
  type DeliveryStatus,
  type DeliveryStatusInput,
  type DriverSettlementDto,
  type DriverSettlementInput,
  type DriverSettlementQuery,
  type DriverSettlementSettleInput,
  type Paginated,
  type Role,
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

export interface DeliveryActor {
  id: string;
  role: Role;
  branchId?: string | null;
}

const DAY_MS = 86_400_000;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/u;

const deliveryInclude = {
  deliveryDriver: { select: { fullName: true } },
  _count: { select: { items: true } },
} satisfies Prisma.OrderInclude;

type DeliveryOrderRow = Prisma.OrderGetPayload<{ include: typeof deliveryInclude }>;

const settlementInclude = {
  driver: { select: { fullName: true } },
} satisfies Prisma.DriverSettlementInclude;

type SettlementRow = Prisma.DriverSettlementGetPayload<{ include: typeof settlementInclude }>;

const TRANSITIONS: Record<DeliveryStatus, readonly DeliveryStatus[]> = {
  PENDING: ['ASSIGNED'],
  ASSIGNED: ['PICKED_UP', 'FAILED', 'CANCELLED'],
  PICKED_UP: ['DELIVERED', 'FAILED'],
  DELIVERED: [],
  FAILED: [],
  CANCELLED: [],
};

const DRIVER_ALLOWED: readonly DeliveryStatus[] = ['PICKED_UP', 'DELIVERED', 'FAILED'];

function minor(value: Prisma.Decimal | string | number): number {
  return toMinorUnits(value.toString());
}

function money(value: Prisma.Decimal | string | number): string {
  return fromMinorUnits(minor(value));
}

function toDeliveryOrderDto(row: DeliveryOrderRow): DeliveryOrderDto {
  return {
    id: row.id,
    orderNumber: row.orderNumber,
    customerName: row.customerName,
    customerPhone: row.customerPhone,
    customerAddress: row.customerAddress,
    total: money(row.total),
    paymentMethod: row.paymentMethod,
    paymentStatus: row.paymentStatus,
    isCod: row.isCod,
    deliveryStatus: row.deliveryStatus,
    driverId: row.deliveryDriverId,
    driverName: row.deliveryDriver?.fullName ?? null,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
    itemsCount: row._count.items,
  };
}

function toSettlementDto(row: SettlementRow): DriverSettlementDto {
  return {
    id: row.id,
    settlementNumber: row.settlementNumber,
    driverId: row.driverId,
    driverName: row.driver.fullName,
    branchId: row.branchId,
    periodStart: row.periodStart.toISOString(),
    periodEnd: row.periodEnd.toISOString(),
    ordersCount: row.ordersCount,
    grossSales: money(row.grossSales),
    cashCollected: money(row.cashCollected),
    cardCollected: money(row.cardCollected),
    deliveryFees: money(row.deliveryFees),
    amountHandedOver: money(row.amountHandedOver),
    variance: money(row.variance),
    status: row.status,
    notes: row.notes,
    settledAt: row.settledAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

function assertBranchAccess(branchId: string, actor: DeliveryActor): void {
  if (actor.role !== 'ADMIN' && actor.branchId && branchId !== actor.branchId) {
    throw new ForbiddenError('This record belongs to another branch');
  }
}

async function generateSettlementNumber(client: PrismaLike = prisma): Promise<string> {
  const dayKey = todayInBusinessTimezone().replace(/-/gu, '');
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const settlementNumber = `DS-${dayKey}-${randomBytes(3).toString('hex').toUpperCase()}`;
    const existing = await client.driverSettlement.findUnique({
      where: { settlementNumber },
      select: { id: true },
    });
    if (!existing) return settlementNumber;
  }
  throw new ConflictError('Could not allocate a settlement number, please retry');
}

function parseDate(value: string, label: string): Date {
  if (!DATE_ONLY.test(value)) throw new ValidationError(`${label} must use YYYY-MM-DD format`);
  return businessDayStart(value);
}

export async function listDeliveryOrders(
  query: DeliveryQuery,
  actor: DeliveryActor,
  branchScope: string | undefined,
): Promise<Paginated<DeliveryOrderDto>> {
  const where: Prisma.OrderWhereInput = {
    type: 'DELIVERY',
    ...(actor.role === 'DRIVER'
      ? { deliveryDriverId: actor.id }
      : branchScope
        ? { branchId: branchScope }
        : {}),
    ...(query.status ? { deliveryStatus: query.status } : {}),
    ...(query.driverId && actor.role !== 'DRIVER' ? { deliveryDriverId: query.driverId } : {}),
    ...(query.from || query.to
      ? {
          createdAt: {
            ...(query.from ? { gte: parseDate(query.from, 'From date') } : {}),
            ...(query.to
              ? { lt: new Date(parseDate(query.to, 'To date').getTime() + DAY_MS) }
              : {}),
          },
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.order.findMany({
      where,
      include: deliveryInclude,
      orderBy: { createdAt: 'desc' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.order.count({ where }),
  ]);

  return buildPaginated(
    rows.map(toDeliveryOrderDto),
    total,
    query.page,
    query.pageSize,
  );
}

export async function listDrivers(branchId: string): Promise<
  Array<{ id: string; fullName: string; username: string }>
> {
  return prisma.user.findMany({
    where: { role: 'DRIVER', isActive: true, ...(branchId ? { branchId } : {}) },
    select: { id: true, fullName: true, username: true },
    orderBy: { fullName: 'asc' },
  });
}

export async function assignDriver(
  orderId: string,
  input: DeliveryAssignInput,
  actor: DeliveryActor,
): Promise<DeliveryOrderDto> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      orderNumber: true,
      type: true,
      status: true,
      branchId: true,
      deliveryStatus: true,
      deliveryDriverId: true,
    },
  });
  if (!order) throw new NotFoundError('Order not found');
  if (order.type !== 'DELIVERY') throw new ValidationError('Only delivery orders can be dispatched');
  if (order.status === 'CANCELLED') throw new ConflictError('This order is cancelled');
  if (order.deliveryStatus === 'DELIVERED' || order.deliveryStatus === 'CANCELLED') {
    throw new ConflictError('This delivery is already closed');
  }
  assertBranchAccess(order.branchId, actor);

  const driver = await prisma.user.findUnique({
    where: { id: input.driverId },
    select: { id: true, role: true, isActive: true, branchId: true, fullName: true },
  });
  if (!driver || driver.role !== 'DRIVER' || !driver.isActive) {
    throw new ValidationError('Select an active driver account');
  }
  if (driver.branchId && driver.branchId !== order.branchId) {
    throw new ValidationError('The driver belongs to another branch');
  }

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.order.update({
      where: { id: order.id },
      data: { deliveryDriverId: driver.id, deliveryStatus: 'ASSIGNED' },
      include: deliveryInclude,
    });
    await recordAudit(
      {
        action: 'delivery.assigned',
        entityType: 'Order',
        entityId: order.id,
        before: { deliveryDriverId: order.deliveryDriverId, deliveryStatus: order.deliveryStatus },
        after: { deliveryDriverId: driver.id, deliveryStatus: 'ASSIGNED', driverName: driver.fullName },
        userId: actor.id,
      },
      tx,
    );
    return row;
  });

  return toDeliveryOrderDto(updated);
}

export async function updateDeliveryStatus(
  orderId: string,
  input: DeliveryStatusInput,
  actor: DeliveryActor,
): Promise<DeliveryOrderDto> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      type: true,
      status: true,
      branchId: true,
      deliveryStatus: true,
      deliveryDriverId: true,
    },
  });
  if (!order) throw new NotFoundError('Order not found');
  if (order.type !== 'DELIVERY') throw new ValidationError('Only delivery orders have a dispatch status');
  assertBranchAccess(order.branchId, actor);
  if (actor.role === 'DRIVER' && order.deliveryDriverId !== actor.id) {
    throw new ForbiddenError('This delivery is assigned to another driver');
  }

  const current: DeliveryStatus = order.deliveryStatus ?? 'PENDING';
  const target = input.status;
  if (target === 'ASSIGNED') {
    throw new ValidationError('Use the assign action to choose a driver');
  }
  if (!TRANSITIONS[current].includes(target)) {
    throw new ConflictError(`A ${current.toLowerCase().replace(/_/gu, ' ')} delivery cannot move to ${target.toLowerCase().replace(/_/gu, ' ')}`);
  }
  if (actor.role === 'DRIVER' && !DRIVER_ALLOWED.includes(target)) {
    throw new ForbiddenError('Drivers can only start, complete or fail their deliveries');
  }

  const now = new Date();
  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.order.update({
      where: { id: order.id },
      data: {
        deliveryStatus: target,
        ...(target === 'PICKED_UP' ? { dispatchedAt: now } : {}),
        ...(target === 'DELIVERED' ? { deliveredAt: now } : {}),
      },
      include: deliveryInclude,
    });
    await recordAudit(
      {
        action: 'delivery.status.updated',
        entityType: 'Order',
        entityId: order.id,
        before: { deliveryStatus: current },
        after: { deliveryStatus: target },
        userId: actor.id,
      },
      tx,
    );
    return row;
  });

  return toDeliveryOrderDto(updated);
}

export async function listSettlements(
  query: DriverSettlementQuery,
  actor: DeliveryActor,
  branchScope: string | undefined,
): Promise<Paginated<DriverSettlementDto>> {
  const where: Prisma.DriverSettlementWhereInput = {
    ...(actor.role === 'DRIVER'
      ? { driverId: actor.id }
      : {
          ...(branchScope ? { branchId: branchScope } : {}),
          ...(query.driverId ? { driverId: query.driverId } : {}),
        }),
    ...(query.status ? { status: query.status } : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.driverSettlement.findMany({
      where,
      include: settlementInclude,
      orderBy: { createdAt: 'desc' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.driverSettlement.count({ where }),
  ]);

  return buildPaginated(
    rows.map(toSettlementDto),
    total,
    query.page,
    query.pageSize,
  );
}

export async function getSettlement(id: string, actor: DeliveryActor): Promise<DriverSettlementDto> {
  const row = await prisma.driverSettlement.findUnique({
    where: { id },
    include: settlementInclude,
  });
  if (!row) throw new NotFoundError('Driver settlement not found');
  if (actor.role === 'DRIVER' && row.driverId !== actor.id) {
    throw new ForbiddenError('This settlement belongs to another driver');
  }
  assertBranchAccess(row.branchId, actor);
  return toSettlementDto(row);
}

export async function createSettlement(
  input: DriverSettlementInput,
  actor: DeliveryActor,
): Promise<DriverSettlementDto> {
  const driver = await prisma.user.findUnique({
    where: { id: input.driverId },
    select: { id: true, role: true, isActive: true, branchId: true, fullName: true },
  });
  if (!driver || driver.role !== 'DRIVER') throw new ValidationError('Select a driver account');
  const branchId = driver.branchId ?? actor.branchId;
  if (!branchId) throw new ValidationError('The driver has no assigned branch');
  assertBranchAccess(branchId, actor);

  const today = todayInBusinessTimezone();
  const periodStart = input.periodStart ?? today;
  const periodEnd = input.periodEnd ?? today;
  if (periodEnd < periodStart) {
    throw new ValidationError('The period end must be on or after the period start');
  }

  const open = await prisma.driverSettlement.findFirst({
    where: { driverId: driver.id, status: 'OPEN' },
    select: { id: true, settlementNumber: true },
  });
  if (open) {
    throw new ConflictError(
      `Settlement ${open.settlementNumber} is still open. Settle it before creating another.`,
    );
  }

  const rangeStart = parseDate(periodStart, 'Period start');
  const rangeEnd = new Date(parseDate(periodEnd, 'Period end').getTime() + DAY_MS);
  const orders = await prisma.order.findMany({
    where: {
      type: 'DELIVERY',
      deliveryDriverId: driver.id,
      status: { not: 'CANCELLED' },
      deliveryStatus: 'DELIVERED',
      deliveredAt: { gte: rangeStart, lt: rangeEnd },
    },
    select: { total: true, deliveryFee: true, isCod: true },
  });

  let grossMinor = 0;
  let cashMinor = 0;
  let cardMinor = 0;
  let feesMinor = 0;
  for (const order of orders) {
    const total = minor(order.total);
    grossMinor += total;
    feesMinor += minor(order.deliveryFee);
    if (order.isCod) cashMinor += total;
    else cardMinor += total;
  }

  const settlementNumber = await generateSettlementNumber();
  const created = await prisma.$transaction(async (tx) => {
    const row = await tx.driverSettlement.create({
      data: {
        settlementNumber,
        driverId: driver.id,
        branchId,
        periodStart: rangeStart,
        periodEnd: new Date(rangeEnd.getTime() - 1),
        ordersCount: orders.length,
        grossSales: fromMinorUnits(grossMinor),
        cashCollected: fromMinorUnits(cashMinor),
        cardCollected: fromMinorUnits(cardMinor),
        deliveryFees: fromMinorUnits(feesMinor),
        amountHandedOver: '0.00',
        variance: fromMinorUnits(-cashMinor),
        status: 'OPEN',
      },
      include: settlementInclude,
    });
    await recordAudit(
      {
        action: 'driver.settlement.created',
        entityType: 'DriverSettlement',
        entityId: row.id,
        after: {
          settlementNumber,
          driverId: driver.id,
          periodStart,
          periodEnd,
          orders: orders.length,
          cashCollected: fromMinorUnits(cashMinor),
        },
        userId: actor.id,
      },
      tx,
    );
    return row;
  });

  return toSettlementDto(created);
}

export async function settleSettlement(
  settlementId: string,
  input: DriverSettlementSettleInput,
  actor: DeliveryActor,
): Promise<DriverSettlementDto> {
  const settlement = await prisma.driverSettlement.findUnique({
    where: { id: settlementId },
    include: settlementInclude,
  });
  if (!settlement) throw new NotFoundError('Driver settlement not found');
  assertBranchAccess(settlement.branchId, actor);
  if (settlement.status === 'SETTLED') throw new ConflictError('This settlement is already settled');

  const handedMinor = toMinorUnits(input.amountHandedOver);
  const cashMinor = minor(settlement.cashCollected);
  const varianceMinor = handedMinor - cashMinor;

  const updated = await prisma.$transaction(async (tx) => {
    const claimed = await tx.driverSettlement.updateMany({
      where: { id: settlement.id, status: 'OPEN' },
      data: {
        status: 'SETTLED',
        amountHandedOver: fromMinorUnits(handedMinor),
        variance: fromMinorUnits(varianceMinor),
        settledAt: new Date(),
        settledById: actor.id,
        ...(input.notes
          ? { notes: [settlement.notes, input.notes].filter(Boolean).join('\n') }
          : {}),
      },
    });
    if (claimed.count === 0) throw new ConflictError('This settlement was already settled');
    await recordAudit(
      {
        action: 'driver.settlement.settled',
        entityType: 'DriverSettlement',
        entityId: settlement.id,
        before: { status: 'OPEN', cashCollected: settlement.cashCollected.toString() },
        after: {
          status: 'SETTLED',
          amountHandedOver: fromMinorUnits(handedMinor),
          variance: fromMinorUnits(varianceMinor),
        },
        userId: actor.id,
      },
      tx,
    );
    return tx.driverSettlement.findUniqueOrThrow({
      where: { id: settlement.id },
      include: settlementInclude,
    });
  });

  return toSettlementDto(updated);
}
