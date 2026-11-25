import { describe, expect, it } from 'vitest';
import {
  computeOrderTax,
  describeEnteredPrice,
  exclusiveTaxMinor,
  extractInclusiveTaxMinor,
} from './tax.js';

describe('tax helpers', () => {
  it('extracts VAT from an inclusive price without adding to it', () => {
    // 210.00 incl. 14% → net 184.21, VAT 25.79
    expect(extractInclusiveTaxMinor(21_000, 14)).toBe(2_579);
    expect(extractInclusiveTaxMinor(11_400, '14.00')).toBe(1_400);
    expect(extractInclusiveTaxMinor(0, 14)).toBe(0);
    expect(extractInclusiveTaxMinor(5_000, 0)).toBe(0);
  });

  it('adds VAT on top of an exclusive price', () => {
    expect(exclusiveTaxMinor(13_500, 14)).toBe(1_890);
    expect(exclusiveTaxMinor(10_000, '0')).toBe(0);
  });

  it('rejects impossible rates', () => {
    expect(() => extractInclusiveTaxMinor(100, -1)).toThrow(RangeError);
    expect(() => exclusiveTaxMinor(100, 'abc')).toThrow(RangeError);
  });
});

describe('computeOrderTax', () => {
  it('charges exactly the menu price for an all-inclusive cart', () => {
    const result = computeOrderTax({
      lines: [
        { amountMinor: 21_000, taxInclusive: true },
        { amountMinor: 4_000, taxInclusive: true },
      ],
      taxRate: 14,
      deliveryFeeMinor: 2_500,
    });
    expect(result.subtotalMinor).toBe(25_000);
    expect(result.addedTaxMinor).toBe(0);
    expect(result.includedTaxMinor).toBe(3_070); // 250 × 14/114 = 30.70
    expect(result.taxMinor).toBe(3_070);
    expect(result.netMinor).toBe(21_930);
    expect(result.totalMinor).toBe(27_500); // 250 + 25 delivery, nothing added
  });

  it('keeps the existing exclusive behaviour', () => {
    // README example: Margherita M 135.00 + 14% = 153.90
    const result = computeOrderTax({
      lines: [{ amountMinor: 13_500, taxInclusive: false }],
      taxRate: '14.00',
    });
    expect(result.taxMinor).toBe(1_890);
    expect(result.includedTaxMinor).toBe(0);
    expect(result.totalMinor).toBe(15_390);
  });

  it('extracts VAT after the discount on inclusive lines', () => {
    const result = computeOrderTax({
      lines: [{ amountMinor: 20_000, taxInclusive: true }],
      discountMinor: 2_000,
      taxRate: 14,
    });
    expect(result.taxableMinor).toBe(18_000);
    expect(result.includedTaxMinor).toBe(2_211); // 180 × 14/114 = 22.105 → 22.11
    expect(result.totalMinor).toBe(18_000);
  });

  it('splits a discount proportionally across a mixed cart', () => {
    const result = computeOrderTax({
      lines: [
        { amountMinor: 30_000, taxInclusive: true },
        { amountMinor: 10_000, taxInclusive: false },
      ],
      discountMinor: 4_000,
      taxRate: 14,
      deliveryFeeMinor: 2_500,
    });
    // exclusive share 1,000 → base 9,000, +1,260 VAT
    // inclusive share 3,000 → gross 27,000, VAT inside 3,316
    expect(result.addedTaxMinor).toBe(1_260);
    expect(result.includedTaxMinor).toBe(3_316);
    expect(result.taxMinor).toBe(4_576);
    expect(result.totalMinor).toBe(36_000 + 1_260 + 2_500);
  });

  it('caps the discount at the subtotal', () => {
    const result = computeOrderTax({
      lines: [{ amountMinor: 1_000, taxInclusive: true }],
      discountMinor: 5_000,
      taxRate: 14,
    });
    expect(result.discountMinor).toBe(1_000);
    expect(result.taxMinor).toBe(0);
    expect(result.totalMinor).toBe(0);
  });
});

describe('describeEnteredPrice', () => {
  it('breaks down an inclusive price', () => {
    expect(describeEnteredPrice(21_000, true, 14)).toEqual({
      netMinor: 18_421,
      taxMinor: 2_579,
      finalMinor: 21_000,
    });
  });

  it('breaks down an exclusive price', () => {
    expect(describeEnteredPrice(10_000, false, 14)).toEqual({
      netMinor: 10_000,
      taxMinor: 1_400,
      finalMinor: 11_400,
    });
  });
});
