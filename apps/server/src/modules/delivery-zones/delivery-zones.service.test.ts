import { Prisma } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DeliveryZoneCreateInput } from '@posshope/shared';

const mocks = vi.hoisted(() => ({
  zoneFindMany: vi.fn(),
  zoneFindUnique: vi.fn(),
  zoneCreate: vi.fn(),
  zoneUpdate: vi.fn(),
  zoneDelete: vi.fn(),
  branchFindUnique: vi.fn(),
  transaction: vi.fn(),
  getSettings: vi.fn(),
  recordAudit: vi.fn(),
}));

vi.mock('../../prisma.js', () => ({
  prisma: {
    deliveryZone: {
      findMany: mocks.zoneFindMany,
      findUnique: mocks.zoneFindUnique,
      create: mocks.zoneCreate,
      update: mocks.zoneUpdate,
      delete: mocks.zoneDelete,
    },
    branch: { findUnique: mocks.branchFindUnique },
    $transaction: mocks.transaction,
  },
}));

vi.mock('../../lib/settings.js', () => ({ getSettings: mocks.getSettings }));
vi.mock('../../lib/audit.js', () => ({ recordAudit: mocks.recordAudit }));

import {
  checkDeliveryZone,
  createDeliveryZone,
  listDeliveryZones,
  resolveDeliveryFee,
} from './delivery-zones.service.js';

const actor = { id: 'admin-1', role: 'ADMIN' as const, branchId: null };

function zoneRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'zone-1',
    name: 'Maadi',
    branchId: 'branch-main',
    centerLat: 30,
    centerLng: 31,
    radiusInMeters: 1000,
    deliveryFee: new Prisma.Decimal('25.00'),
    minOrderAmount: new Prisma.Decimal('100.00'),
    isActive: true,
    createdAt: new Date('2026-11-12T10:00:00Z'),
    updatedAt: new Date('2026-11-12T10:00:00Z'),
    branch: { name: 'Corner Maadi' },
    ...overrides,
  };
}

const createInput: DeliveryZoneCreateInput = {
  branchId: 'branch-main',
  name: 'Maadi',
  centerLat: 30,
  centerLng: 31,
  radiusInMeters: 1000,
  deliveryFee: '25.00',
  minOrderAmount: '100.00',
  isActive: true,
};

describe('delivery zones service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.branchFindUnique.mockResolvedValue({ id: 'branch-main', name: 'Corner Maadi' });
    mocks.getSettings.mockResolvedValue({
      deliveryFee: new Prisma.Decimal('40.00'),
    } as never);
    mocks.zoneFindMany.mockResolvedValue([]);
    mocks.transaction.mockImplementation(
      (callback: (client: Record<string, unknown>) => Promise<unknown>) =>
        callback({
          deliveryZone: {
            create: mocks.zoneCreate,
            update: mocks.zoneUpdate,
            delete: mocks.zoneDelete,
          },
        }),
    );
  });

  it('falls back to the flat fee when a branch has no active zones', async () => {
    const result = await checkDeliveryZone({ lat: 30, lng: 31 }, 'branch-main');

    expect(result.usesFallbackFee).toBe(true);
    expect(result.inside).toBe(true);
    expect(result.zone).toBeNull();
    expect(result.deliveryFee).toBe('40.00');
    expect(result.activeZones).toBe(0);
  });

  it('returns the matched zone fee for a point inside a circle', async () => {
    mocks.zoneFindMany.mockResolvedValue([zoneRow()]);

    const result = await checkDeliveryZone({ lat: 30.001, lng: 31 }, 'branch-main');

    expect(result.usesFallbackFee).toBe(false);
    expect(result.inside).toBe(true);
    expect(result.zone?.id).toBe('zone-1');
    expect(result.deliveryFee).toBe('25.00');
    expect(result.minOrderAmount).toBe('100.00');
    expect(result.distanceMeters).toBeGreaterThan(0);
  });

  it('reports the nearest zone when the point is out of range', async () => {
    mocks.zoneFindMany.mockResolvedValue([zoneRow()]);

    const result = await checkDeliveryZone({ lat: 30.05, lng: 31 }, 'branch-main');

    expect(result.inside).toBe(false);
    expect(result.zone).toBeNull();
    expect(result.deliveryFee).toBe('0.00');
    expect(result.nearestZoneName).toBe('Maadi');
    expect(result.nearestDistanceMeters).toBeGreaterThan(1000);
  });

  it('requires a map pin once zones are configured', async () => {
    mocks.zoneFindMany.mockResolvedValue([zoneRow()]);

    await expect(
      resolveDeliveryFee({
        branchId: 'branch-main',
        point: null,
        subtotalMinor: 20_000,
        fallbackFee: '40.00',
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR', statusCode: 400 });
  });

  it('blocks out-of-range points and minimum-order shortfalls', async () => {
    mocks.zoneFindMany.mockResolvedValue([zoneRow()]);

    await expect(
      resolveDeliveryFee({
        branchId: 'branch-main',
        point: { lat: 30.05, lng: 31 },
        subtotalMinor: 20_000,
        fallbackFee: '40.00',
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });

    await expect(
      resolveDeliveryFee({
        branchId: 'branch-main',
        point: { lat: 30.001, lng: 31 },
        subtotalMinor: 5_000,
        fallbackFee: '40.00',
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('uses the legacy fee with no zone and the zone fee with a match', async () => {
    const fallback = await resolveDeliveryFee({
      branchId: 'branch-main',
      point: null,
      subtotalMinor: 20_000,
      fallbackFee: '40.00',
    });
    expect(fallback).toEqual({ deliveryFeeMinor: 4000, zoneId: null });

    mocks.zoneFindMany.mockResolvedValue([zoneRow()]);
    const matched = await resolveDeliveryFee({
      branchId: 'branch-main',
      point: { lat: 30.001, lng: 31 },
      subtotalMinor: 20_000,
      fallbackFee: '40.00',
    });
    expect(matched).toEqual({ deliveryFeeMinor: 2500, zoneId: 'zone-1' });
  });

  it('lists only active zones unless an administrator asks otherwise', async () => {
    mocks.zoneFindMany.mockResolvedValue([zoneRow()]);

    await listDeliveryZones('branch-main', false);
    expect(mocks.zoneFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { branchId: 'branch-main', isActive: true },
      }),
    );

    await listDeliveryZones('all', true);
    expect(mocks.zoneFindMany).toHaveBeenLastCalledWith(expect.objectContaining({ where: {} }));
  });

  it('audits zone creation', async () => {
    mocks.zoneCreate.mockResolvedValue(zoneRow());

    const created = await createDeliveryZone(createInput, actor);

    expect(created.id).toBe('zone-1');
    expect(mocks.zoneCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          branchId: 'branch-main',
          name: 'Maadi',
          radiusInMeters: 1000,
        }),
      }),
    );
    expect(mocks.recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'deliveryZone.created', entityId: 'zone-1' }),
      expect.anything(),
    );
  });
});
