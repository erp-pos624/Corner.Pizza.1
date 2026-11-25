/**
 * Per-weekday online opening hours.
 *
 * A day's window opens at `open` and closes at `close`. When `close` is at or
 * before `open` the window runs past midnight into the next calendar day, so
 * Friday 10:00 → 01:00 is still open at 00:30 on Saturday, and 10:00 → 00:00
 * means "until midnight".
 *
 * Times are local wall-clock `HH:mm` (24h) in the business timezone.
 */

export const WEEKDAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
export type WeekdayKey = (typeof WEEKDAY_KEYS)[number];

export interface DayHours {
  open: string;
  close: string;
}

/** A day set to null is closed all day; a missing day uses the fallback window. */
export type WeeklyHours = Partial<Record<WeekdayKey, DayHours | null>>;

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/u;

function isDayHours(value: unknown): value is DayHours {
  if (!value || typeof value !== 'object') return false;
  const { open, close } = value as Record<string, unknown>;
  return typeof open === 'string' && typeof close === 'string' && HHMM.test(open) && HHMM.test(close);
}

/** Reads a stored JSON value; anything malformed is dropped rather than trusted. */
export function parseWeeklyHours(value: unknown): WeeklyHours | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  const result: WeeklyHours = {};
  let found = false;
  for (const key of WEEKDAY_KEYS) {
    if (!(key in source)) continue;
    const day = source[key];
    if (day === null) {
      result[key] = null;
      found = true;
    } else if (isDayHours(day)) {
      result[key] = { open: day.open, close: day.close };
      found = true;
    }
  }
  return found ? result : null;
}

/**
 * The window for one weekday: the per-day entry when present, otherwise the
 * single fallback window. Null means closed that day. `undefined` (no
 * schedule at all) means open around the clock.
 */
export function hoursForDay(
  weekly: WeeklyHours | null,
  weekday: number,
  fallbackOpen: string | null,
  fallbackClose: string | null,
): DayHours | null | undefined {
  const key = WEEKDAY_KEYS[((weekday % 7) + 7) % 7]!;
  if (weekly && key in weekly) return weekly[key] ?? null;
  if (fallbackOpen && fallbackClose) return { open: fallbackOpen, close: fallbackClose };
  return weekly ? null : undefined;
}

function crossesMidnight(day: DayHours): boolean {
  return day.close <= day.open;
}

/**
 * Whether ordering is open at a local weekday (0 = Sunday) and `HH:mm` time.
 * Returns the window that makes it open (today's, or yesterday's spill-over),
 * or null when closed.
 */
export function activeWindow(
  weekly: WeeklyHours | null,
  fallbackOpen: string | null,
  fallbackClose: string | null,
  weekday: number,
  time: string,
): { open: boolean; window: DayHours | null } {
  const today = hoursForDay(weekly, weekday, fallbackOpen, fallbackClose);
  if (today === undefined) return { open: true, window: null };

  if (today) {
    const inside = crossesMidnight(today)
      ? time >= today.open
      : time >= today.open && time < today.close;
    if (inside) return { open: true, window: today };
  }

  const yesterday = hoursForDay(weekly, weekday - 1, fallbackOpen, fallbackClose);
  if (yesterday && crossesMidnight(yesterday) && time < yesterday.close) {
    return { open: true, window: yesterday };
  }
  return { open: false, window: null };
}

export function isOpenAt(
  weekly: WeeklyHours | null,
  fallbackOpen: string | null,
  fallbackClose: string | null,
  weekday: number,
  time: string,
): boolean {
  return activeWindow(weekly, fallbackOpen, fallbackClose, weekday, time).open;
}
