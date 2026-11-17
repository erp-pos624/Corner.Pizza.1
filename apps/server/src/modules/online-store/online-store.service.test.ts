import { describe, expect, it, vi } from 'vitest';

vi.mock('../../prisma.js', () => ({ prisma: {} }));

import {
  evaluateOnlineStatus,
  isWithinOnlineHours,
  timeInTimezone,
  toOnlineStoreSettingsDto,
} from './online-store.service.js';

const at = (utc: string): Date => new Date(`2026-11-13T${utc}:00Z`);

const branch = {
  id: 'branch-1',
  name: 'Corner Maadi',
  isActive: true,
  onlineOrderingEnabled: true,
  onlineOpenTime: null as string | null,
  onlineCloseTime: null as string | null,
  updatedAt: new Date('2026-11-13T09:00:00Z'),
};

describe('timeInTimezone', () => {
  it('formats the wall clock as HH:mm', () => {
    expect(timeInTimezone(at('21:30'), 'UTC')).toBe('21:30');
    expect(timeInTimezone(at('07:05'), 'UTC')).toBe('07:05');
  });
});

describe('isWithinOnlineHours', () => {
  it('treats branches without a window as always open', () => {
    expect(isWithinOnlineHours(null, null, at('03:00'), 'UTC')).toBe(true);
  });

  it('includes the opening minute and excludes the closing minute', () => {
    expect(isWithinOnlineHours('11:00', '23:00', at('11:00'), 'UTC')).toBe(true);
    expect(isWithinOnlineHours('11:00', '23:00', at('22:59'), 'UTC')).toBe(true);
    expect(isWithinOnlineHours('11:00', '23:00', at('23:00'), 'UTC')).toBe(false);
    expect(isWithinOnlineHours('11:00', '23:00', at('10:59'), 'UTC')).toBe(false);
  });

  it('supports windows that cross midnight', () => {
    const hours: [string, string] = ['18:00', '02:00'];
    expect(isWithinOnlineHours(...hours, at('18:00'), 'UTC')).toBe(true);
    expect(isWithinOnlineHours(...hours, at('23:30'), 'UTC')).toBe(true);
    expect(isWithinOnlineHours(...hours, at('01:59'), 'UTC')).toBe(true);
    expect(isWithinOnlineHours(...hours, at('02:00'), 'UTC')).toBe(false);
    expect(isWithinOnlineHours(...hours, at('17:59'), 'UTC')).toBe(false);
  });
});

describe('evaluateOnlineStatus', () => {
  it('closes inactive branches first', () => {
    expect(
      evaluateOnlineStatus(
        { ...branch, isActive: false, onlineOrderingEnabled: false },
        at('12:00'),
      ),
    ).toEqual({ isOpenNow: false, acceptingOrders: false, closedReason: 'BRANCH_INACTIVE' });
  });

  it('reports DISABLED while ordering is switched off, even inside hours', () => {
    expect(
      evaluateOnlineStatus(
        {
          ...branch,
          onlineOrderingEnabled: false,
          onlineOpenTime: '11:00',
          onlineCloseTime: '23:00',
        },
        at('12:00'),
      ),
    ).toEqual({ isOpenNow: true, acceptingOrders: false, closedReason: 'DISABLED' });
  });

  it('reports OUTSIDE_HOURS when enabled but closed', () => {
    expect(
      evaluateOnlineStatus(
        {
          ...branch,
          onlineOpenTime: '11:00',
          onlineCloseTime: '23:00',
        },
        at('03:00'),
      ),
    ).toEqual({ isOpenNow: false, acceptingOrders: false, closedReason: 'OUTSIDE_HOURS' });
  });

  it('accepts orders when enabled and open', () => {
    expect(evaluateOnlineStatus(branch, at('12:00'))).toEqual({
      isOpenNow: true,
      acceptingOrders: true,
      closedReason: null,
    });
  });
});

describe('toOnlineStoreSettingsDto', () => {
  it('maps the branch row and timestamp', () => {
    const dto = toOnlineStoreSettingsDto(
      { ...branch, onlineOpenTime: '11:00', onlineCloseTime: '23:00' },
      at('12:00'),
    );
    expect(dto).toMatchObject({
      branchId: 'branch-1',
      branchName: 'Corner Maadi',
      enabled: true,
      openTime: '11:00',
      closeTime: '23:00',
      isOpenNow: true,
      acceptingOrders: true,
      closedReason: null,
      updatedAt: '2026-11-13T09:00:00.000Z',
    });
  });
});
