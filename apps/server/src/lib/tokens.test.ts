import { describe, expect, it } from 'vitest';
import {
  signAccessToken,
  signCustomerToken,
  verifyAccessToken,
  verifyCustomerToken,
} from './tokens.js';

/**
 * Staff and customers are different kinds of principal. A token minted for one
 * must never be accepted where the other is expected.
 */
describe('staff and customer tokens are not interchangeable', () => {
  const staff = signAccessToken({ sub: 'u1', username: 'admin', role: 'ADMIN', sid: 's1' }).token;
  const customer = signCustomerToken({ sub: 'c1', sid: 'cs1' }).token;

  it('accepts each token for its own audience', () => {
    expect(verifyAccessToken(staff)).toMatchObject({ sub: 'u1', role: 'ADMIN', sid: 's1' });
    expect(verifyCustomerToken(customer)).toEqual({ sub: 'c1', sid: 'cs1' });
  });

  it('rejects a customer token on the staff side', () => {
    expect(() => verifyAccessToken(customer)).toThrow('Invalid access token');
  });

  it('rejects a staff token on the customer side', () => {
    expect(() => verifyCustomerToken(staff)).toThrow('Invalid access token');
  });

  it('rejects garbage', () => {
    expect(() => verifyCustomerToken('not-a-token')).toThrow('Invalid access token');
  });
});
