import { describe, expect, it } from 'vitest';
import { queryBoolean } from './common.js';
import { menuQuerySchema } from './menu.js';
import { orderQuerySchema } from './order.js';

describe('queryBoolean', () => {
  it('reads "false" as false (z.coerce.boolean() read it as true)', () => {
    expect(queryBoolean.parse('false')).toBe(false);
    expect(queryBoolean.parse('0')).toBe(false);
    expect(queryBoolean.parse(false)).toBe(false);
    expect(queryBoolean.parse('true')).toBe(true);
    expect(queryBoolean.parse('1')).toBe(true);
    expect(queryBoolean.parse(true)).toBe(true);
  });

  it('rejects anything that is not a boolean', () => {
    expect(queryBoolean.safeParse('yes').success).toBe(false);
    expect(queryBoolean.safeParse('').success).toBe(false);
  });

  it('makes the menu "Sold out" filter send isAvailable=false', () => {
    const query = menuQuerySchema.parse({ isAvailable: 'false', includeHidden: 'true' });
    expect(query.isAvailable).toBe(false);
    expect(query.includeHidden).toBe(true);
    expect(menuQuerySchema.parse({}).isAvailable).toBeUndefined();
  });

  it('keeps the order filters working', () => {
    expect(orderQuerySchema.parse({ openTabs: 'true', today: 'false' })).toMatchObject({
      openTabs: true,
      today: false,
    });
  });
});
