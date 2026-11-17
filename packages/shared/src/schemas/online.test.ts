import { describe, expect, it } from 'vitest';
import {
  basataSimulateSchema,
  onlineStoreSettingsUpdateSchema,
  orderChannelSchema,
  publicDeliveryCheckSchema,
  publicOrderCreateSchema,
} from '../index.js';

const deliveryOrder = {
  branchId: 'branch-1',
  customerName: 'Mona Ali',
  customerPhone: '01012345678',
  fulfillment: 'DELIVERY' as const,
  customerAddress: '12 Nile Street, Maadi',
  customerLat: 30.04,
  customerLng: 31.24,
  items: [{ menuItemId: 'menu-1', quantity: 2, toppingIds: [] }],
  paymentMethod: 'CARD' as const,
  expectedDeliveryFee: '25.00',
};

describe('onlineStoreSettingsUpdateSchema', () => {
  it('accepts an enable-only patch', () => {
    expect(onlineStoreSettingsUpdateSchema.parse({ enabled: true })).toEqual({ enabled: true });
  });

  it('accepts a full opening window', () => {
    const parsed = onlineStoreSettingsUpdateSchema.parse({
      openTime: '11:00',
      closeTime: '23:30',
    });
    expect(parsed).toEqual({ openTime: '11:00', closeTime: '23:30' });
  });

  it('accepts clearing the window with explicit nulls', () => {
    const parsed = onlineStoreSettingsUpdateSchema.parse({ openTime: null, closeTime: null });
    expect(parsed).toEqual({ openTime: null, closeTime: null });
  });

  it('accepts windows that cross midnight', () => {
    const result = onlineStoreSettingsUpdateSchema.safeParse({
      openTime: '18:00',
      closeTime: '02:00',
    });
    expect(result.success).toBe(true);
  });

  it('rejects setting only one side of the window', () => {
    const result = onlineStoreSettingsUpdateSchema.safeParse({ openTime: '11:00' });
    expect(result.success).toBe(false);
  });

  it('rejects equal opening and closing times', () => {
    const result = onlineStoreSettingsUpdateSchema.safeParse({
      openTime: '11:00',
      closeTime: '11:00',
    });
    expect(result.success).toBe(false);
  });

  it('rejects times outside 24-hour HH:mm format', () => {
    for (const openTime of ['24:00', '9:00', '11:60', '11:00 PM']) {
      const result = onlineStoreSettingsUpdateSchema.safeParse({
        openTime,
        closeTime: '23:00',
      });
      expect(result.success, openTime).toBe(false);
    }
  });

  it('rejects unknown fields', () => {
    const result = onlineStoreSettingsUpdateSchema.safeParse({ enabled: true, extra: 1 });
    expect(result.success).toBe(false);
  });
});

describe('publicOrderCreateSchema', () => {
  it('accepts a delivery order with a map pin and expected fee', () => {
    const result = publicOrderCreateSchema.safeParse(deliveryOrder);
    expect(result.success).toBe(true);
  });

  it('accepts cash on delivery without a map pin', () => {
    const result = publicOrderCreateSchema.safeParse({
      ...deliveryOrder,
      paymentMethod: 'CASH',
      customerLat: undefined,
      customerLng: undefined,
      expectedDeliveryFee: undefined,
    });
    expect(result.success).toBe(true);
  });

  it('rejects delivery orders without an address', () => {
    const result = publicOrderCreateSchema.safeParse({
      ...deliveryOrder,
      customerAddress: undefined,
    });
    expect(result.success).toBe(false);
  });

  it('rejects cash orders that are not delivered', () => {
    const result = publicOrderCreateSchema.safeParse({
      ...deliveryOrder,
      fulfillment: 'TAKEAWAY',
      customerAddress: undefined,
      paymentMethod: 'CASH',
    });
    expect(result.success).toBe(false);
  });

  it('rejects half a coordinate pair', () => {
    const result = publicOrderCreateSchema.safeParse({
      ...deliveryOrder,
      customerLat: 30.04,
      customerLng: undefined,
    });
    expect(result.success).toBe(false);
  });

  it('rejects an empty basket', () => {
    const result = publicOrderCreateSchema.safeParse({ ...deliveryOrder, items: [] });
    expect(result.success).toBe(false);
  });

  it('rejects malformed expected fees', () => {
    const result = publicOrderCreateSchema.safeParse({
      ...deliveryOrder,
      expectedDeliveryFee: '25.999',
    });
    expect(result.success).toBe(false);
  });

  it('rejects unknown checkout fields', () => {
    const result = publicOrderCreateSchema.safeParse({ ...deliveryOrder, discountCode: 'FREE' });
    expect(result.success).toBe(false);
  });
});

describe('publicDeliveryCheckSchema', () => {
  it('accepts a coordinate lookup', () => {
    const result = publicDeliveryCheckSchema.safeParse({
      branchId: 'branch-1',
      lat: 30.04,
      lng: 31.24,
    });
    expect(result.success).toBe(true);
  });

  it('accepts an address-only lookup', () => {
    const result = publicDeliveryCheckSchema.safeParse({
      branchId: 'branch-1',
      address: '12 Nile Street',
    });
    expect(result.success).toBe(true);
  });

  it('rejects lookups without a target', () => {
    const result = publicDeliveryCheckSchema.safeParse({ branchId: 'branch-1' });
    expect(result.success).toBe(false);
  });

  it('rejects half a coordinate pair', () => {
    const result = publicDeliveryCheckSchema.safeParse({ branchId: 'branch-1', lat: 30.04 });
    expect(result.success).toBe(false);
  });
});

describe('basataSimulateSchema', () => {
  it('defaults the simulated status to PAID', () => {
    expect(basataSimulateSchema.parse({ reference: 'ONL-1234' }).status).toBe('PAID');
  });

  it('accepts failure and expiry simulations', () => {
    for (const status of ['FAILED', 'EXPIRED'] as const) {
      expect(basataSimulateSchema.safeParse({ reference: 'ONL-1234', status }).success).toBe(true);
    }
  });

  it('rejects unsupported simulated statuses', () => {
    expect(
      basataSimulateSchema.safeParse({ reference: 'ONL-1234', status: 'CANCELLED' }).success,
    ).toBe(false);
  });

  it('rejects short references', () => {
    expect(basataSimulateSchema.safeParse({ reference: 'abc' }).success).toBe(false);
  });
});

describe('orderChannelSchema', () => {
  it('accepts the two sales channels', () => {
    for (const channel of ['POS', 'ONLINE'] as const) {
      expect(orderChannelSchema.parse(channel)).toBe(channel);
    }
  });

  it('rejects unknown channels', () => {
    expect(orderChannelSchema.safeParse('WEBSITE').success).toBe(false);
  });
});
