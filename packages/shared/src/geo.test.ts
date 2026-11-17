import { describe, expect, it } from 'vitest';
import { evaluateDeliveryZone, haversineMeters, isPointInZone } from './geo.js';

/** ~1000 m of latitude at the equator, used to reach zone edges deterministically. */
const METERS_PER_DEGREE_LAT = 111_194.93;

const zone = (overrides: Partial<Parameters<typeof evaluateDeliveryZone>[1][number]> = {}) => ({
  centerLat: 30,
  centerLng: 31,
  radiusInMeters: 1000,
  ...overrides,
});

describe('haversineMeters', () => {
  it('returns zero for the same point', () => {
    expect(haversineMeters({ lat: 30, lng: 31 }, { lat: 30, lng: 31 })).toBe(0);
  });

  it('measures the Cairo–Alexandria leg within a sane tolerance', () => {
    const distance = haversineMeters(
      { lat: 30.0444, lng: 31.2357 },
      { lat: 31.2001, lng: 29.9187 },
    );
    expect(distance).toBeGreaterThan(175_000);
    expect(distance).toBeLessThan(185_000);
  });
});

describe('evaluateDeliveryZone', () => {
  it('treats branches without zones as unrestricted (legacy flat fee)', () => {
    const result = evaluateDeliveryZone({ lat: 30, lng: 31 }, []);
    expect(result.inside).toBe(true);
    expect(result.zone).toBeNull();
    expect(result.nearest).toBeNull();
  });

  it('matches a point inside the circle', () => {
    const result = evaluateDeliveryZone({ lat: 30.001, lng: 31.001 }, [zone()]);
    expect(result.inside).toBe(true);
    expect(result.zone).not.toBeNull();
    expect(result.distanceMeters).toBeGreaterThan(0);
    expect(result.distanceMeters).toBeLessThan(1000);
  });

  it('rejects a point outside every circle but reports the nearest zone', () => {
    const result = evaluateDeliveryZone(
      { lat: 30 + 0.02, lng: 31 },
      [zone({ radiusInMeters: 500 })],
    );
    expect(result.inside).toBe(false);
    expect(result.zone).toBeNull();
    expect(result.nearest).not.toBeNull();
    expect(result.nearest!.distanceMeters).toBeGreaterThan(500);
  });

  it('includes points sitting exactly on the radius', () => {
    const point = { lat: 30 + 1000 / METERS_PER_DEGREE_LAT, lng: 31 };
    const result = evaluateDeliveryZone(point, [zone()]);
    expect(result.inside).toBe(true);
    expect(isPointInZone(point, zone())).toBe(true);
  });

  it('picks the smallest radius when zones overlap', () => {
    const broad = { ...zone({ radiusInMeters: 5000 }), name: 'broad' };
    const tight = { ...zone({ radiusInMeters: 400 }), name: 'tight' };
    const result = evaluateDeliveryZone({ lat: 30.001, lng: 31 }, [broad, tight]);
    expect(result.zone?.name).toBe('tight');
  });

  it('keeps the first zone when radii tie', () => {
    const first = { ...zone(), name: 'first' };
    const second = { ...zone(), name: 'second' };
    expect(evaluateDeliveryZone({ lat: 30, lng: 31 }, [first, second]).zone?.name).toBe('first');
  });
});
