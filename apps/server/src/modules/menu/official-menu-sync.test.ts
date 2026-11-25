import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { haversineMeters, isOpenAt } from '@posshope/shared';
import { REHAB_ZONE, officialDataSchema, skuFor, weeklyHoursFrom } from './official-menu-sync.js';

// Vitest runs from apps/server; the approved data file lives at the repo root.
const file = resolve(process.cwd(), '../../corner_pizza_official_menu_and_store_data.json');
const data = officialDataSchema.parse(JSON.parse(readFileSync(file, 'utf8')));

describe('official menu file', () => {
  it('has the 9 approved categories and 41 items', () => {
    expect(data.categories).toHaveLength(9);
    expect(data.categories.flatMap((category) => category.items)).toHaveLength(41);
  });

  it('marks every item tax-inclusive with positive prices', () => {
    for (const item of data.categories.flatMap((category) => category.items)) {
      expect(item.taxInclusive).toBe(true);
      const prices = item.sizes ? item.sizes.map((size) => size.price) : [item.price!];
      for (const price of prices) expect(price).toBeGreaterThan(0);
    }
  });

  it('gives every item a unique SKU within the 40-character limit', () => {
    const skus = data.categories.flatMap((category) => category.items.map((item) => skuFor(item.name_en)));
    expect(new Set(skus).size).toBe(skus.length);
    for (const sku of skus) {
      expect(sku.length).toBeLessThanOrEqual(40);
      expect(sku).toMatch(/^CP-[A-Z0-9-]+[A-Z0-9]$/u);
    }
    expect(skuFor('Pepperoni / BBQ Chicken')).toBe('CP-PEPPERONI-BBQ-CHICKEN');
    expect(skuFor('Steak & Cheese Hoagie')).toBe('CP-STEAK-AND-CHEESE-HOAGIE');
  });

  it('carries the approved store details', () => {
    expect(data.store_info).toMatchObject({
      phone: '01557075252',
      email: 'order@eatcornerpizza.com',
      short_address: 'EASTERN COURT, REHAB 2',
      full_address: 'Eastern Court G63, Second New Cairo, Cairo Governorate 4752280',
      coordinates: { lat: 30.070328, lng: 31.517899 },
    });
  });
});

describe('operating hours', () => {
  const weekly = weeklyHoursFrom(data.store_info.operating_hours);

  it('maps Sun–Thu to 10:00–00:00 and Fri–Sat to 10:00–01:00', () => {
    for (const key of ['sun', 'mon', 'tue', 'wed', 'thu'] as const) {
      expect(weekly[key]).toEqual({ open: '10:00', close: '00:00' });
    }
    expect(weekly.fri).toEqual({ open: '10:00', close: '01:00' });
    expect(weekly.sat).toEqual({ open: '10:00', close: '01:00' });
  });

  it('is open at 00:30 after Friday but not after Thursday', () => {
    expect(isOpenAt(weekly, null, null, 6, '00:30')).toBe(true); // Saturday early hours
    expect(isOpenAt(weekly, null, null, 5, '00:30')).toBe(false); // Friday early hours
  });

  it('rejects a schedule with a missing day', () => {
    const { Friday: _friday, ...partial } = data.store_info.operating_hours;
    expect(() => weeklyHoursFrom(partial)).toThrow(/missing: fri/u);
  });
});

describe('Al Rehab delivery zone', () => {
  const centre = { lat: REHAB_ZONE.centerLat, lng: REHAB_ZONE.centerLng };
  // Reference points from OpenStreetMap (Nominatim), checked 2026-11-25.
  const inside: Record<string, { lat: number; lng: number }> = {
    'Corner Pizza, Eastern Court G63': { lat: 30.070328, lng: 31.517899 },
    'Gateway Mall (western Rehab 1)': { lat: 30.0641217, lng: 31.4797916 },
    'Al Rehab Mall 1': { lat: 30.0589716, lng: 31.4958204 },
    'Avenue Mall (Rehab 2)': { lat: 30.0583253, lng: 31.5095224 },
    'Rehab 2 south-east corner': { lat: 30.0512629, lng: 31.5207276 },
    'Rehab 2 north-east corner': { lat: 30.0748718, lng: 31.5207276 },
  };

  for (const [name, point] of Object.entries(inside)) {
    it(`covers ${name}`, () => {
      expect(haversineMeters(point, centre)).toBeLessThan(REHAB_ZONE.radiusInMeters);
    });
  }

  it('does not reach KODE Sports Club on the Abbas El-Akkad axis (outside Rehab)', () => {
    expect(haversineMeters({ lat: 30.0714914, lng: 31.4615426 }, centre)).toBeGreaterThan(
      REHAB_ZONE.radiusInMeters,
    );
  });
});
