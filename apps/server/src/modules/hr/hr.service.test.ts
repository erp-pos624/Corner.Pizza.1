import { HR_DEFAULTS, type HrSettingsDto } from '@posshope/shared';
import { describe, expect, it } from 'vitest';
import {
  computeLateMinutes,
  minutesOfDay,
  monthRange,
  payrollMonthOf,
  scheduledDaysInMonth,
} from './hr.service.js';

const settings: HrSettingsDto = {
  workStart: '09:00',
  workEnd: '17:00',
  graceMinutes: 10,
  lateDeductionPerMinute: '5.00',
  absenceDeductionMultiplier: '1.00',
  weeklyDaysOff: [5, 6],
  updatedAt: '2026-11-01T00:00:00.000Z',
};

describe('HR payroll helpers', () => {
  it('derives the payroll month from a calendar date', () => {
    expect(payrollMonthOf('2026-11-17')).toBe('2026-11');
    expect(payrollMonthOf(new Date('2026-03-01T00:00:00.000Z'))).toBe('2026-03');
  });

  it('returns the full UTC month range and day count', () => {
    const { from, to, days } = monthRange('2026-11');
    expect(from.toISOString()).toBe('2026-11-01T00:00:00.000Z');
    expect(to.toISOString()).toBe('2026-12-01T00:00:00.000Z');
    expect(days).toBe(30);
  });

  it('excludes the configured weekly days off from scheduled days', () => {
    expect(scheduledDaysInMonth('2026-11', HR_DEFAULTS.weeklyDaysOff)).toBe(22);
    expect(scheduledDaysInMonth('2026-11', [])).toBe(30);
  });

  it('computes late minutes after the grace period only', () => {
    expect(computeLateMinutes('08:55', settings)).toBe(0);
    expect(computeLateMinutes('09:10', settings)).toBe(0);
    expect(computeLateMinutes('09:25', settings)).toBe(15);
    expect(computeLateMinutes(null, settings)).toBe(0);
  });

  it('parses clock times into minutes of day', () => {
    expect(minutesOfDay('00:00')).toBe(0);
    expect(minutesOfDay('09:25')).toBe(565);
    expect(minutesOfDay('17:10')).toBe(1030);
  });
});
