import { describe, expect, it } from 'vitest';
import { classifyOrigin, parseOrigins } from './origin.js';
import { readCookie } from './webSession.js';

describe('parseOrigins', () => {
  it('trims entries, drops blanks and trailing slashes', () => {
    expect(parseOrigins(' https://a.test/ , ,https://b.test')).toEqual([
      'https://a.test',
      'https://b.test',
    ]);
  });
});

describe('classifyOrigin', () => {
  const self = 'https://pos.forno.test';
  const production = { allowed: ['https://app.forno.test'], isProduction: true };

  it('trusts the API own origin', () => {
    expect(classifyOrigin(self, self, production)).toBe('trusted');
  });

  it('trusts listed origins', () => {
    expect(classifyOrigin('https://app.forno.test', self, production)).toBe('trusted');
  });

  it('denies unlisted origins in production', () => {
    expect(classifyOrigin('https://evil.test', self, production)).toBe('denied');
  });

  it('never grants credentials through a production wildcard', () => {
    expect(classifyOrigin('https://evil.test', self, { allowed: ['*'], isProduction: true })).toBe(
      'public',
    );
  });

  it('trusts any origin outside production', () => {
    expect(
      classifyOrigin('http://localhost:5174', self, { allowed: [], isProduction: false }),
    ).toBe('trusted');
  });
});

describe('readCookie', () => {
  it('finds a cookie among several', () => {
    expect(readCookie('a=1; forno_rt=abc%2Fdef; b=2', 'forno_rt')).toBe('abc/def');
  });

  it('does not match a name that merely ends with the cookie name', () => {
    expect(readCookie('x_forno_rt=evil', 'forno_rt')).toBeNull();
  });

  it('returns null when absent, empty or malformed', () => {
    expect(readCookie(undefined, 'forno_rt')).toBeNull();
    expect(readCookie('forno_rt=', 'forno_rt')).toBeNull();
    expect(readCookie('forno_rt=%E0%A4%A', 'forno_rt')).toBeNull();
  });
});
