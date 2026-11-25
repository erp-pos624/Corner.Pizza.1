/**
 * Order tax calculation shared by the API, the POS cart and the storefront.
 *
 * Each line is either tax-inclusive (the entered price already contains VAT,
 * so the customer pays exactly that price and the VAT is extracted from it) or
 * tax-exclusive (VAT is added on top). An order-level discount is spread over
 * the two groups in proportion to their gross amounts before tax is worked
 * out, so the same cart always produces the same figures everywhere.
 *
 * All amounts are integer minor units (piasters). The tax rate is a
 * percentage such as 14 or "14.00".
 */

export interface TaxLineInput {
  /** Line amount as entered (unit price + toppings) × quantity, in minor units. */
  amountMinor: number;
  taxInclusive: boolean;
}

export interface OrderTaxInput {
  lines: readonly TaxLineInput[];
  /** Order-level discount in minor units; capped at the subtotal. */
  discountMinor?: number;
  /** Percentage, e.g. 14 or "14.00". */
  taxRate: number | string;
  deliveryFeeMinor?: number;
}

export interface OrderTaxBreakdown {
  /** Sum of entered line amounts. */
  subtotalMinor: number;
  /** Discount actually applied (never more than the subtotal). */
  discountMinor: number;
  /** Subtotal after discount, as entered prices (VAT included for inclusive lines). */
  taxableMinor: number;
  /** VAT already contained in the inclusive lines' prices. */
  includedTaxMinor: number;
  /** VAT added on top of the exclusive lines. */
  addedTaxMinor: number;
  /** includedTaxMinor + addedTaxMinor, the VAT figure for reporting. */
  taxMinor: number;
  /** taxableMinor minus the included VAT: what the sale is worth before tax. */
  netMinor: number;
  deliveryFeeMinor: number;
  /** What the customer pays: taxable + added tax + delivery. */
  totalMinor: number;
}

/** Rate as integer basis points (14.00% → 1400) so all maths stays integral. */
function rateBasisPoints(taxRate: number | string): number {
  const rate = Number(taxRate);
  if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
    throw new RangeError(`Invalid tax rate: ${String(taxRate)}`);
  }
  return Math.round(rate * 100);
}

/** VAT contained in a tax-inclusive gross amount: gross − gross / (1 + rate). */
export function extractInclusiveTaxMinor(grossMinor: number, taxRate: number | string): number {
  const bp = rateBasisPoints(taxRate);
  if (bp === 0 || grossMinor <= 0) return 0;
  return Math.round((grossMinor * bp) / (10_000 + bp));
}

/** VAT added on top of a tax-exclusive base amount: base × rate. */
export function exclusiveTaxMinor(baseMinor: number, taxRate: number | string): number {
  const bp = rateBasisPoints(taxRate);
  if (bp === 0 || baseMinor <= 0) return 0;
  return Math.round((baseMinor * bp) / 10_000);
}

export function computeOrderTax(input: OrderTaxInput): OrderTaxBreakdown {
  let inclusiveGross = 0;
  let exclusiveGross = 0;
  for (const line of input.lines) {
    if (line.taxInclusive) inclusiveGross += line.amountMinor;
    else exclusiveGross += line.amountMinor;
  }
  const subtotalMinor = inclusiveGross + exclusiveGross;
  const discountMinor = Math.min(Math.max(input.discountMinor ?? 0, 0), subtotalMinor);

  // Spread the discount proportionally; the inclusive group takes the
  // rounding remainder so the two shares always add up to the discount.
  const exclusiveDiscount =
    subtotalMinor === 0 ? 0 : Math.round((discountMinor * exclusiveGross) / subtotalMinor);
  const inclusiveDiscount = discountMinor - exclusiveDiscount;

  const inclusiveTaxable = inclusiveGross - inclusiveDiscount;
  const exclusiveTaxable = exclusiveGross - exclusiveDiscount;

  const includedTaxMinor = extractInclusiveTaxMinor(inclusiveTaxable, input.taxRate);
  const addedTaxMinor = exclusiveTaxMinor(exclusiveTaxable, input.taxRate);
  const taxableMinor = subtotalMinor - discountMinor;
  const deliveryFeeMinor = input.deliveryFeeMinor ?? 0;

  return {
    subtotalMinor,
    discountMinor,
    taxableMinor,
    includedTaxMinor,
    addedTaxMinor,
    taxMinor: includedTaxMinor + addedTaxMinor,
    netMinor: taxableMinor - includedTaxMinor,
    deliveryFeeMinor,
    totalMinor: taxableMinor + addedTaxMinor + deliveryFeeMinor,
  };
}

/**
 * Price breakdown for a single entered price, used by the menu editor preview.
 * Inclusive: the entered price is final. Exclusive: VAT is added on top.
 */
export function describeEnteredPrice(
  priceMinor: number,
  taxInclusive: boolean,
  taxRate: number | string,
): { netMinor: number; taxMinor: number; finalMinor: number } {
  if (taxInclusive) {
    const taxMinor = extractInclusiveTaxMinor(priceMinor, taxRate);
    return { netMinor: priceMinor - taxMinor, taxMinor, finalMinor: priceMinor };
  }
  const taxMinor = exclusiveTaxMinor(priceMinor, taxRate);
  return { netMinor: priceMinor, taxMinor, finalMinor: priceMinor + taxMinor };
}
