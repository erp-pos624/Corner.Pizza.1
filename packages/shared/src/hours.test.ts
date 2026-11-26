import { describe, expect, it } from 'vitest';
import { hoursForDay, isOpenAt, parseWeeklyHours, type WeeklyHours } from './hours.js';

// Corner Pizza: Sun–Thu 10:00–00:00, Fri–Sat 10:00–01:00.
const CORNER: WeeklyHours = {
  sun: { open: '10:00', close: '00:00' },
  mon: { open: '10:00', close: '00:00' },
  tue: { open: '10:00', close: '00:00' },
  wed: { open: '10:00', close: '00:00' },
  thu: { open: '10:00', close: '00:00' },
  fri: { open: '10:00', close: '01:00' },
  sat: { open: '10:00', close: '01:00' },
};
const SUN = 0;
const MON = 1;
const THU = 4;
const FRI = 5;
const SAT = 6;

describe('isOpenAt with per-day hours', () => {
  it('opens at 10:00 and stays open until midnight on weekdays', () => {
    expect(isOpenAt(CORNER, null, null, MON, '09:59')).toBe(false);
    expect(isOpenAt(CORNER, null, null, MON, '10:00')).toBe(true);
    expect(isOpenAt(CORNER, null, null, MON, '23:59')).toBe(true);
  });

  it('is closed just after midnight following a weekday', () => {
    // 00:30 on Friday belongs to Thursday, which closed at 00:00.
    expect(isOpenAt(CORNER, null, null, FRI, '00:30')).toBe(false);
    // 00:30 on Monday belongs to Sunday, which closed at 00:00.
    expect(isOpenAt(CORNER, null, null, MON, '00:30')).toBe(false);
  });

  it('carries Friday and Saturday nights past midnight until 01:00', () => {
    expect(isOpenAt(CORNER, null, null, SAT, '00:00')).toBe(true);
    expect(isOpenAt(CORNER, null, null, SAT, '00:59')).toBe(true);
    expect(isOpenAt(CORNER, null, null, SAT, '01:00')).toBe(false);
    expect(isOpenAt(CORNER, null, null, SUN, '00:45')).toBe(true);
    expect(isOpenAt(CORNER, null, null, SUN, '01:30')).toBe(false);
  });

  it('does not let Thursday borrow Friday hours', () => {
    expect(isOpenAt(CORNER, null, null, THU, '23:30')).toBe(true);
    expect(isOpenAt(CORNER, null, null, FRI, '00:15')).toBe(false);
  });

  it('treats a null day as closed', () => {
    const hours: WeeklyHours = { ...CORNER, mon: null };
    expect(isOpenAt(hours, null, null, MON, '12:00')).toBe(false);
  });
});

describe('fallback window', () => {
  it('keeps the single-window behaviour when no per-day hours exist', () => {
    expect(isOpenAt(null, '18:00', '02:00', MON, '19:00')).toBe(true);
    expect(isOpenAt(null, '18:00', '02:00', MON, '01:00')).toBe(true);
    expect(isOpenAt(null, '18:00', '02:00', MON, '03:00')).toBe(false);
    expect(isOpenAt(null, '10:00', '23:30', MON, '23:45')).toBe(false);
  });

  it('is always open with no schedule at all', () => {
    expect(isOpenAt(null, null, null, MON, '04:00')).toBe(true);
    expect(hoursForDay(null, MON, null, null)).toBeUndefined();
  });

  it('uses the fallback for days missing from a partial schedule', () => {
    const hours: WeeklyHours = { fri: { open: '12:00', close: '01:00' } };
    expect(hoursForDay(hours, MON, '10:00', '22:00')).toEqual({ open: '10:00', close: '22:00' });
    expect(hoursForDay(hours, FRI, '10:00', '22:00')).toEqual({ open: '12:00', close: '01:00' });
  });
});

describe('parseWeeklyHours', () => {
  it('keeps valid days and drops malformed ones', () => {
    expect(
      parseWeeklyHours({ mon: { open: '10:00', close: '00:00' }, tue: { open: '25:00' }, wed: null }),
    ).toEqual({ mon: { open: '10:00', close: '00:00' }, wed: null });
  });

  it('returns null for empty or invalid input', () => {
    expect(parseWeeklyHours(null)).toBeNull();
    expect(parseWeeklyHours([])).toBeNull();
    expect(parseWeeklyHours({ foo: 1 })).toBeNull();
  });
});
