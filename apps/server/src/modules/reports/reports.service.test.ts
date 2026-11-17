import { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../prisma.js', () => ({ prisma: {} }));

import { buildChannelRows, recordedOrderFilter } from './reports.service.js';

function order(channel: 'POS' | 'ONLINE', total: string, quantities: number[], refund?: string) {
  return {
    channel,
    total: new Prisma.Decimal(total),
    items: quantities.map((quantity) => ({ quantity })),
    refunds: refund ? [{ method: 'CASH', amount: new Prisma.Decimal(refund) }] : [],
  } as never;
}

describe('recordedOrderFilter', () => {
  const start = new Date('2026-11-01T00:00:00Z');
  const end = new Date('2026-11-02T00:00:00Z');

  it('only counts captured orders', () => {
    const where = recordedOrderFilter(start, end);
    expect(where.status).toEqual({ not: 'CANCELLED' });
    expect(where.paymentStatus).toEqual({
      in: ['PAID', 'PAID_ONLINE', 'PARTIALLY_REFUNDED', 'REFUNDED'],
    });
    expect(where.channel).toBeUndefined();
    expect(where.branchId).toBeUndefined();
  });

  it('narrows to a branch and channel when requested', () => {
    expect(recordedOrderFilter(start, end, 'branch-1', 'ONLINE')).toMatchObject({
      branchId: 'branch-1',
      channel: 'ONLINE',
    });
  });
});

describe('buildChannelRows', () => {
  it('returns no rows for an empty report', () => {
    expect(buildChannelRows([])).toEqual([]);
  });

  it('separates in-store and website sales, net of refunds', () => {
    const rows = buildChannelRows([
      order('POS', '100.00', [1, 2]),
      order('ONLINE', '200.00', [3], '20.00'),
      order('POS', '50.00', [1]),
    ]);

    expect(rows).toEqual([
      { key: 'ONLINE', label: 'Online', orders: 1, units: 3, revenue: '180.00' },
      { key: 'POS', label: 'In-store', orders: 2, units: 4, revenue: '150.00' },
    ]);
  });

  it('keeps a channel visible when refunds zero out its revenue', () => {
    const rows = buildChannelRows([order('ONLINE', '75.00', [1], '75.00')]);
    expect(rows).toEqual([
      { key: 'ONLINE', label: 'Online', orders: 1, units: 1, revenue: '0.00' },
    ]);
  });
});
