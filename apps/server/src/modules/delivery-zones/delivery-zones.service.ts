import type { Prisma } from '@prisma/client';
import {
  evaluateDeliveryZone,
  fromMinorUnits,
  toMinorUnits,
  type DeliveryZoneCheckDto,
  type DeliveryZoneCheckInput,
  type DeliveryZoneCreateInput,
  type DeliveryZoneDto,
  type DeliveryZoneUpdateInput,
  type Role,
} from '@posshope/shared';
import { recordAudit } from '../../lib/audit.js';
import { NotFoundError, ValidationError } from '../../lib/errors.js';
import { getSettings } from '../../lib/settings.js';
import { prisma } from '../../prisma.js';

export interface ZoneActor {
  id: string;
  role: Role;
  branchId?: string | null;
}

const zoneInclude = {
  branch: { select: { name: true } },
} satisfies Prisma.DeliveryZoneInclude;

type ZoneRow = Prisma.DeliveryZoneGetPayload<{ include: typeof zoneInclude }>;

function minor(value: Prisma.Decimal | string | number): number {
  return toMinorUnits(value.toString());
}

function money(value: Prisma.Decimal | string | number): string {
  return fromMinorUnits(minor(value));
}

function formatDistance(meters: number): string {
  return meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(1)} km`;
}

export function toDeliveryZoneDto(row: ZoneRow): DeliveryZoneDto {
  return {
    id: row.id,
    name: row.name,
    branchId: row.branchId,
    branchName: row.branch.name,
    centerLat: row.centerLat,
    centerLng: row.centerLng,
    radiusInMeters: row.radiusInMeters,
    deliveryFee: money(row.deliveryFee),
    minOrderAmount: money(row.minOrderAmount),
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * `scope` is a branch id for branch-bound users, or `all` for a consolidated
 * administrator view. Inactive zones are only ever returned to administrators.
 */
export async function listDeliveryZones(
  scope: string | 'all',
  includeInactive: boolean,
): Promise<DeliveryZoneDto[]> {
  const rows = await prisma.deliveryZone.findMany({
    where: {
      ...(scope === 'all' ? {} : { branchId: scope }),
      ...(includeInactive ? {} : { isActive: true }),
    },
    include: zoneInclude,
    orderBy: [{ branchId: 'asc' }, { radiusInMeters: 'asc' }, { name: 'asc' }],
  });
  return rows.map(toDeliveryZoneDto);
}

export async function createDeliveryZone(
  input: DeliveryZoneCreateInput,
  actor: ZoneActor,
): Promise<DeliveryZoneDto> {
  const branch = await prisma.branch.findUnique({
    where: { id: input.branchId },
    select: { id: true, name: true },
  });
  if (!branch) throw new ValidationError('Select a valid branch for the zone');

  const created = await prisma.$transaction(async (tx) => {
    const row = await tx.deliveryZone.create({
      data: {
        branchId: input.branchId,
        name: input.name,
        centerLat: input.centerLat,
        centerLng: input.centerLng,
        radiusInMeters: input.radiusInMeters,
        deliveryFee: input.deliveryFee,
        minOrderAmount: input.minOrderAmount,
        isActive: input.isActive,
      },
      include: zoneInclude,
    });
    await recordAudit(
      {
        action: 'deliveryZone.created',
        entityType: 'DeliveryZone',
        entityId: row.id,
        after: {
          name: row.name,
          branchId: row.branchId,
          center: [row.centerLat, row.centerLng],
          radiusInMeters: row.radiusInMeters,
          deliveryFee: row.deliveryFee.toString(),
          minOrderAmount: row.minOrderAmount.toString(),
          isActive: row.isActive,
        },
        userId: actor.id,
      },
      tx,
    );
    return row;
  });

  return toDeliveryZoneDto(created);
}

export async function updateDeliveryZone(
  id: string,
  input: DeliveryZoneUpdateInput,
  actor: ZoneActor,
): Promise<DeliveryZoneDto> {
  const existing = await prisma.deliveryZone.findUnique({ where: { id }, include: zoneInclude });
  if (!existing) throw new NotFoundError('Delivery zone not found');

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.deliveryZone.update({
      where: { id: existing.id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.centerLat !== undefined ? { centerLat: input.centerLat } : {}),
        ...(input.centerLng !== undefined ? { centerLng: input.centerLng } : {}),
        ...(input.radiusInMeters !== undefined ? { radiusInMeters: input.radiusInMeters } : {}),
        ...(input.deliveryFee !== undefined ? { deliveryFee: input.deliveryFee } : {}),
        ...(input.minOrderAmount !== undefined ? { minOrderAmount: input.minOrderAmount } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
      include: zoneInclude,
    });
    await recordAudit(
      {
        action: 'deliveryZone.updated',
        entityType: 'DeliveryZone',
        entityId: row.id,
        before: {
          name: existing.name,
          center: [existing.centerLat, existing.centerLng],
          radiusInMeters: existing.radiusInMeters,
          deliveryFee: existing.deliveryFee.toString(),
          minOrderAmount: existing.minOrderAmount.toString(),
          isActive: existing.isActive,
        },
        after: {
          name: row.name,
          center: [row.centerLat, row.centerLng],
          radiusInMeters: row.radiusInMeters,
          deliveryFee: row.deliveryFee.toString(),
          minOrderAmount: row.minOrderAmount.toString(),
          isActive: row.isActive,
        },
        userId: actor.id,
      },
      tx,
    );
    return row;
  });

  return toDeliveryZoneDto(updated);
}

export async function deleteDeliveryZone(id: string, actor: ZoneActor): Promise<void> {
  const existing = await prisma.deliveryZone.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError('Delivery zone not found');

  await prisma.$transaction(async (tx) => {
    await tx.deliveryZone.delete({ where: { id } });
    await recordAudit(
      {
        action: 'deliveryZone.deleted',
        entityType: 'DeliveryZone',
        entityId: existing.id,
        before: {
          name: existing.name,
          branchId: existing.branchId,
          center: [existing.centerLat, existing.centerLng],
          radiusInMeters: existing.radiusInMeters,
          deliveryFee: existing.deliveryFee.toString(),
          minOrderAmount: existing.minOrderAmount.toString(),
          isActive: existing.isActive,
        },
        userId: actor.id,
      },
      tx,
    );
  });
}

export async function checkDeliveryZone(
  input: DeliveryZoneCheckInput,
  branchId: string,
): Promise<DeliveryZoneCheckDto> {
  const [branch, settings, zones] = await Promise.all([
    prisma.branch.findUnique({ where: { id: branchId }, select: { id: true } }),
    getSettings(),
    prisma.deliveryZone.findMany({
      where: { branchId, isActive: true },
      include: zoneInclude,
      orderBy: { radiusInMeters: 'asc' },
    }),
  ]);
  if (!branch) throw new ValidationError('Select a valid branch');

  if (zones.length === 0) {
    return {
      branchId,
      inside: true,
      zone: null,
      distanceMeters: null,
      nearestZoneName: null,
      nearestDistanceMeters: null,
      deliveryFee: money(settings.deliveryFee),
      minOrderAmount: '0.00',
      activeZones: 0,
      usesFallbackFee: true,
    };
  }

  const evaluation = evaluateDeliveryZone({ lat: input.lat, lng: input.lng }, zones);
  return {
    branchId,
    inside: evaluation.inside,
    zone: evaluation.zone ? toDeliveryZoneDto(evaluation.zone) : null,
    distanceMeters: evaluation.distanceMeters,
    nearestZoneName: evaluation.nearest?.zone.name ?? null,
    nearestDistanceMeters: evaluation.nearest?.distanceMeters ?? null,
    deliveryFee: evaluation.zone ? money(evaluation.zone.deliveryFee) : '0.00',
    minOrderAmount: evaluation.zone ? money(evaluation.zone.minOrderAmount) : '0.00',
    activeZones: zones.length,
    usesFallbackFee: false,
  };
}

export interface ResolvedDeliveryFee {
  deliveryFeeMinor: number;
  zoneId: string | null;
}

/**
 * Resolves the delivery fee for a new order.
 *
 * Branches without active zones keep the legacy flat fee and do not require a
 * map pin. Once a branch draws zones, the point must fall inside one, the
 * subtotal must meet that zone's minimum, and the zone's fee replaces the flat
 * fee. The chosen zone id is snapshotted on the order.
 */
export async function resolveDeliveryFee(params: {
  branchId: string;
  point: { lat: number; lng: number } | null;
  subtotalMinor: number;
  fallbackFee: Prisma.Decimal | string | number;
}): Promise<ResolvedDeliveryFee> {
  const zones = await prisma.deliveryZone.findMany({
    where: { branchId: params.branchId, isActive: true },
  });
  if (zones.length === 0) {
    return { deliveryFeeMinor: minor(params.fallbackFee), zoneId: null };
  }
  if (!params.point) {
    throw new ValidationError(
      'Pin the delivery location on the map so we can match a delivery zone',
    );
  }

  const evaluation = evaluateDeliveryZone(params.point, zones);
  if (!evaluation.inside || !evaluation.zone) {
    throw new ValidationError(
      evaluation.nearest
        ? `This address is outside the delivery zones (nearest zone "${evaluation.nearest.zone.name}" is ${formatDistance(evaluation.nearest.distanceMeters)} away)`
        : 'This address is outside the delivery zones',
    );
  }

  const zone = evaluation.zone;
  if (params.subtotalMinor < minor(zone.minOrderAmount)) {
    throw new ValidationError(
      `The minimum order for the "${zone.name}" zone is ${money(zone.minOrderAmount)}`,
    );
  }

  return { deliveryFeeMinor: minor(zone.deliveryFee), zoneId: zone.id };
}
