import { describe, expect, it } from 'vitest';
import {
  deliveryZoneCheckSchema,
  deliveryZoneCreateSchema,
  deliveryZoneUpdateSchema,
  menuItemCreateSchema,
  orderCreateSchema,
  stockAdjustSchema,
} from '../index.js';

describe('restaurant schemas', () => {
  it('accepts a pizza with sizes', () => {
    const parsed = menuItemCreateSchema.parse({
      name: 'Margherita',
      nameAr: 'مارجريتا',
      categoryId: 'cat_1',
      basePrice: '180.00',
      kind: 'PIZZA',
      hasSizes: true,
      sizes: [
        {
          name: 'Medium',
          nameAr: 'وسط',
          price: '180.00',
          ingredientMultiplier: 1,
          isDefault: true,
          sortOrder: 1,
        },
      ],
    });
    expect(parsed.sizes).toHaveLength(1);
  });

  it('rejects a delivery order without an address', () => {
    const result = orderCreateSchema.safeParse({
      type: 'DELIVERY',
      items: [{ menuItemId: 'item_1', quantity: 1 }],
      payments: [{ method: 'CASH', amount: '200.00' }],
    });
    expect(result.success).toBe(false);
  });

  it('accepts a split payment with references', () => {
    const result = orderCreateSchema.safeParse({
      type: 'DINE_IN',
      items: [{ menuItemId: 'item_1', quantity: 1 }],
      payments: [
        { method: 'CASH', amount: '50.00', reference: 'CASH-12' },
        { method: 'WALLET', amount: '75.50', reference: 'TXN-9931' },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('rejects duplicate payment methods', () => {
    const result = orderCreateSchema.safeParse({
      type: 'DINE_IN',
      items: [{ menuItemId: 'item_1', quantity: 1 }],
      payments: [
        { method: 'CARD', amount: '50.00' },
        { method: 'CARD', amount: '25.00' },
      ],
    });
    expect(result.success).toBe(false);
  });

  it('rejects a zero stock adjustment', () => {
    expect(stockAdjustSchema.safeParse({ quantity: 0, reason: 'test' }).success).toBe(false);
  });

  it('accepts a delivery order pinned on the map', () => {
    const result = orderCreateSchema.safeParse({
      type: 'DELIVERY',
      customerAddress: '12 Nile Street',
      customerLat: 30.0444,
      customerLng: 31.2357,
      items: [{ menuItemId: 'item_1', quantity: 1 }],
      payments: [{ method: 'CASH', amount: '200.00' }],
    });
    expect(result.success).toBe(true);
  });

  it('rejects half a coordinate pair', () => {
    const result = orderCreateSchema.safeParse({
      type: 'DELIVERY',
      customerAddress: '12 Nile Street',
      customerLat: 30.0444,
      items: [{ menuItemId: 'item_1', quantity: 1 }],
      payments: [{ method: 'CASH', amount: '200.00' }],
    });
    expect(result.success).toBe(false);
  });

  it('validates circular zone definitions', () => {
    const valid = deliveryZoneCreateSchema.safeParse({
      branchId: 'branch-main',
      name: 'Maadi',
      centerLat: 29.9602,
      centerLng: 31.2569,
      radiusInMeters: 3000,
      deliveryFee: '25.00',
      minOrderAmount: '100.00',
    });
    expect(valid.success).toBe(true);

    expect(
      deliveryZoneCreateSchema.safeParse({
        branchId: 'branch-main',
        name: 'Tiny',
        centerLat: 29.96,
        centerLng: 31.25,
        radiusInMeters: 10,
        deliveryFee: '25.00',
        minOrderAmount: '0',
      }).success,
    ).toBe(false);

    expect(
      deliveryZoneCreateSchema.safeParse({
        branchId: 'branch-main',
        name: 'Off planet',
        centerLat: 100,
        centerLng: 31.25,
        radiusInMeters: 3000,
        deliveryFee: '25.00',
        minOrderAmount: '0',
      }).success,
    ).toBe(false);
  });

  it('rejects an empty zone update payload', () => {
    expect(deliveryZoneUpdateSchema.safeParse({}).success).toBe(false);
    expect(
      deliveryZoneUpdateSchema.safeParse({ deliveryFee: '30.00', isActive: false }).success,
    ).toBe(true);
  });

  it('requires finite coordinates for a zone check', () => {
    expect(deliveryZoneCheckSchema.safeParse({ lat: 30.1, lng: 31.3 }).success).toBe(true);
    expect(deliveryZoneCheckSchema.safeParse({ lat: '30.1' }).success).toBe(false);
  });
});
