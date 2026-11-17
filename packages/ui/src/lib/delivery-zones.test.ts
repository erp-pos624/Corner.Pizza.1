import { describe, expect, it } from 'vitest';
import type { DeliveryZoneCheckDto, DeliveryZoneDto } from '@posshope/shared';
import { formatDistanceMeters, previewDeliveryZone } from './delivery-zones';

function zone(overrides: Partial<DeliveryZoneDto> = {}): DeliveryZoneDto {
  return {
    id: 'zone-1',
    name: 'Downtown',
    branchId: 'branch-main',
    branchName: 'Main',
    centerLat: 30.0444,
    centerLng: 31.2357,
    radiusInMeters: 1500,
    deliveryFee: '25.00',
    minOrderAmount: '0.00',
    isActive: true,
    createdAt: '2026-11-12T00:00:00.000Z',
    updatedAt: '2026-11-12T00:00:00.000Z',
    ...overrides,
  };
}

function check(overrides: Partial<DeliveryZoneCheckDto> = {}): DeliveryZoneCheckDto {
  return {
    branchId: 'branch-main',
    inside: true,
    zone: zone(),
    distanceMeters: 400,
    nearestZoneName: null,
    nearestDistanceMeters: null,
    deliveryFee: '25.00',
    minOrderAmount: '0.00',
    activeZones: 1,
    usesFallbackFee: false,
    ...overrides,
  };
}

describe('previewDeliveryZone', () => {
  it('uses the legacy flat fee when the branch has no zones', () => {
    const preview = previewDeliveryZone({
      zonesCount: 0,
      check: null,
      subtotalMinor: 5000,
      fallbackFee: '15.00',
    });
    expect(preview).toEqual({
      deliveryFeeMinor: 1500,
      block: null,
      zoneName: null,
      usesFallbackFee: true,
    });
  });

  it('asks for a pin when zones exist but no location was chosen', () => {
    const preview = previewDeliveryZone({
      zonesCount: 2,
      check: null,
      subtotalMinor: 5000,
      fallbackFee: '15.00',
    });
    expect(preview.block).toBe('PIN_REQUIRED');
    expect(preview.deliveryFeeMinor).toBe(0);
  });

  it('applies the matched zone fee when the point is inside', () => {
    const preview = previewDeliveryZone({
      zonesCount: 1,
      check: check(),
      subtotalMinor: 5000,
      fallbackFee: '15.00',
    });
    expect(preview.block).toBeNull();
    expect(preview.deliveryFeeMinor).toBe(2500);
    expect(preview.zoneName).toBe('Downtown');
  });

  it('blocks the order when the subtotal is below the zone minimum', () => {
    const preview = previewDeliveryZone({
      zonesCount: 1,
      check: check({ minOrderAmount: '80.00' }),
      subtotalMinor: 5000,
      fallbackFee: '15.00',
    });
    expect(preview.block).toBe('MIN_ORDER');
    expect(preview.zoneName).toBe('Downtown');
  });

  it('blocks out-of-range points and keeps the nearest zone name', () => {
    const preview = previewDeliveryZone({
      zonesCount: 1,
      check: check({
        inside: false,
        zone: null,
        distanceMeters: null,
        nearestZoneName: 'Downtown',
        nearestDistanceMeters: 2400,
        deliveryFee: '0.00',
      }),
      subtotalMinor: 5000,
      fallbackFee: '15.00',
    });
    expect(preview.block).toBe('OUT_OF_RANGE');
    expect(preview.zoneName).toBe('Downtown');
  });
});

describe('formatDistanceMeters', () => {
  it('renders metres below a kilometre and kilometres above it', () => {
    expect(formatDistanceMeters(240)).toBe('240 m');
    expect(formatDistanceMeters(1240)).toBe('1.2 km');
  });
});
