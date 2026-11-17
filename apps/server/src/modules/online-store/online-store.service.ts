import {
  type OnlineClosedReason,
  type OnlineStoreOverviewDto,
  type OnlineStoreSettingsDto,
  type OnlineStoreSettingsUpdateInput,
  type OnlineStoreTodayStatsDto,
} from '@posshope/shared';
import { env } from '../../env.js';
import { recordAudit } from '../../lib/audit.js';
import { businessDayStart, todayInBusinessTimezone } from '../../lib/dates.js';
import { NotFoundError } from '../../lib/errors.js';
import { orderInclude, toOrderDto } from '../../lib/mappers.js';
import { prisma } from '../../prisma.js';

export interface BranchOnlineState {
  id: string;
  name: string;
  isActive: boolean;
  onlineOrderingEnabled: boolean;
  onlineOpenTime: string | null;
  onlineCloseTime: string | null;
}

export interface OnlineStatus {
  isOpenNow: boolean;
  acceptingOrders: boolean;
  closedReason: OnlineClosedReason | null;
}

/** Wall-clock `HH:mm` in the branch timezone. */
export function timeInTimezone(date: Date, timeZone = env.BUSINESS_TIMEZONE): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const hour = parts.find((part) => part.type === 'hour')?.value ?? '00';
  const minute = parts.find((part) => part.type === 'minute')?.value ?? '00';
  return `${hour === '24' ? '00' : hour}:${minute}`;
}

/** Supports windows that cross midnight (e.g. 18:00–02:00). */
export function isWithinOnlineHours(
  openTime: string | null,
  closeTime: string | null,
  now = new Date(),
  timeZone = env.BUSINESS_TIMEZONE,
): boolean {
  if (!openTime || !closeTime) return true;
  const current = timeInTimezone(now, timeZone);
  if (openTime <= closeTime) return current >= openTime && current < closeTime;
  return current >= openTime || current < closeTime;
}

export function evaluateOnlineStatus(branch: BranchOnlineState, now = new Date()): OnlineStatus {
  if (!branch.isActive) {
    return { isOpenNow: false, acceptingOrders: false, closedReason: 'BRANCH_INACTIVE' };
  }
  const isOpenNow = isWithinOnlineHours(branch.onlineOpenTime, branch.onlineCloseTime, now);
  if (!branch.onlineOrderingEnabled) {
    return { isOpenNow, acceptingOrders: false, closedReason: 'DISABLED' };
  }
  if (!isOpenNow) {
    return { isOpenNow: false, acceptingOrders: false, closedReason: 'OUTSIDE_HOURS' };
  }
  return { isOpenNow: true, acceptingOrders: true, closedReason: null };
}

export function toOnlineStoreSettingsDto(
  branch: BranchOnlineState & { updatedAt: Date },
  now = new Date(),
): OnlineStoreSettingsDto {
  return {
    branchId: branch.id,
    branchName: branch.name,
    enabled: branch.onlineOrderingEnabled,
    openTime: branch.onlineOpenTime,
    closeTime: branch.onlineCloseTime,
    timezone: env.BUSINESS_TIMEZONE,
    ...evaluateOnlineStatus(branch, now),
    updatedAt: branch.updatedAt.toISOString(),
  };
}

export async function getOnlineStoreOverview(branchId: string): Promise<OnlineStoreOverviewDto> {
  const branch = await prisma.branch.findUnique({ where: { id: branchId } });
  if (!branch) throw new NotFoundError('Branch not found');

  const dayStart = businessDayStart(todayInBusinessTimezone());
  const [aggregate, pendingPayment, recentOrders] = await Promise.all([
    prisma.order.aggregate({
      where: {
        branchId,
        channel: 'ONLINE',
        status: { not: 'CANCELLED' },
        paymentStatus: { in: ['PAID_ONLINE', 'PAID', 'PARTIALLY_REFUNDED', 'REFUNDED'] },
        createdAt: { gte: dayStart },
      },
      _sum: { total: true },
      _count: { _all: true },
    }),
    prisma.order.count({
      where: {
        branchId,
        channel: 'ONLINE',
        paymentStatus: 'PENDING_PAYMENT',
        status: { not: 'CANCELLED' },
      },
    }),
    prisma.order.findMany({
      where: { branchId, channel: 'ONLINE' },
      include: orderInclude,
      orderBy: { createdAt: 'desc' },
      take: 8,
    }),
  ]);

  const today: OnlineStoreTodayStatsDto = {
    orders: aggregate._count._all,
    revenue: Number(aggregate._sum.total ?? 0).toFixed(2),
    pendingPayment,
  };

  return {
    settings: toOnlineStoreSettingsDto(branch),
    today,
    recentOrders: recentOrders.map(toOrderDto),
  };
}

export async function updateOnlineStoreSettings(
  branchId: string,
  input: OnlineStoreSettingsUpdateInput,
  actorId: string,
): Promise<OnlineStoreSettingsDto> {
  const branch = await prisma.branch.findUnique({ where: { id: branchId } });
  if (!branch) throw new NotFoundError('Branch not found');

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.branch.update({
      where: { id: branch.id },
      data: {
        ...(input.enabled !== undefined ? { onlineOrderingEnabled: input.enabled } : {}),
        ...(input.openTime !== undefined ? { onlineOpenTime: input.openTime } : {}),
        ...(input.closeTime !== undefined ? { onlineCloseTime: input.closeTime } : {}),
      },
    });
    await recordAudit(
      {
        action: 'onlineStore.settings.updated',
        entityType: 'Branch',
        entityId: row.id,
        before: {
          enabled: branch.onlineOrderingEnabled,
          openTime: branch.onlineOpenTime,
          closeTime: branch.onlineCloseTime,
        },
        after: {
          enabled: row.onlineOrderingEnabled,
          openTime: row.onlineOpenTime,
          closeTime: row.onlineCloseTime,
        },
        userId: actorId,
      },
      tx,
    );
    return row;
  });

  return toOnlineStoreSettingsDto(updated);
}
