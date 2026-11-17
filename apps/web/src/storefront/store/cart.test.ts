import type { PublicMenuItemDto, PublicOrderDto } from '@posshope/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Translate } from '../i18n/messages';
import { translate as translateMessage } from '../i18n/messages';
import { orderProgress, slugify, startingPrice } from '../lib/format';
import { cartCount, toOrderItems, useCart } from './cart';

const translate: Translate = (key) => translateMessage('en', key);

const margherita = {
  menuItemId: 'item-1',
  sizeId: 'size-l',
  toppingIds: ['t-olives', 't-cheese'],
  quantity: 1,
  specialInstructions: '',
  name: 'Margherita',
  sizeName: 'Large',
  toppingNames: ['Olives', 'Cheese'],
  imageUrl: null,
};

describe('cart', () => {
  beforeEach(() => {
    useCart.setState({ lines: [], fulfillment: 'DELIVERY', point: null });
  });

  it('merges the same item, size and toppings into one line', () => {
    useCart.getState().add(margherita);
    // Same toppings in a different order is still the same pizza.
    useCart.getState().add({ ...margherita, toppingIds: ['t-cheese', 't-olives'], quantity: 2 });

    const { lines } = useCart.getState();
    expect(lines).toHaveLength(1);
    expect(lines[0]?.quantity).toBe(3);
  });

  it('keeps different sizes, toppings or notes as separate lines', () => {
    useCart.getState().add(margherita);
    useCart.getState().add({ ...margherita, sizeId: 'size-m' });
    useCart.getState().add({ ...margherita, toppingIds: [] });
    useCart.getState().add({ ...margherita, specialInstructions: 'Well done' });

    expect(useCart.getState().lines).toHaveLength(4);
    expect(cartCount(useCart.getState().lines)).toBe(4);
  });

  it('removes a line when its quantity reaches zero and caps large quantities', () => {
    useCart.getState().add(margherita);
    const key = useCart.getState().lines[0]!.key;

    useCart.getState().setQuantity(key, 500);
    expect(useCart.getState().lines[0]?.quantity).toBe(20);

    useCart.getState().setQuantity(key, 0);
    expect(useCart.getState().lines).toHaveLength(0);
  });

  it('changes the checkout attempt key whenever the order changes', () => {
    const first = useCart.getState().attemptKey;
    useCart.getState().add(margherita);
    const second = useCart.getState().attemptKey;
    useCart.getState().setFulfillment('TAKEAWAY');
    const third = useCart.getState().attemptKey;

    expect(new Set([first, second, third]).size).toBe(3);
  });

  it('sends ids and quantities to the server, never names or prices', () => {
    useCart.getState().add({ ...margherita, specialInstructions: '  No basil ' });

    expect(toOrderItems(useCart.getState().lines)).toEqual([
      {
        menuItemId: 'item-1',
        sizeId: 'size-l',
        quantity: 1,
        toppingIds: ['t-olives', 't-cheese'],
        specialInstructions: 'No basil',
      },
    ]);
  });

  it('drops lines that are no longer on the menu', () => {
    useCart.getState().add(margherita);
    useCart.getState().add({ ...margherita, menuItemId: 'gone' });

    const removed = useCart.getState().reconcile((line) => line.menuItemId !== 'gone');

    expect(removed).toBe(1);
    expect(useCart.getState().lines.map((line) => line.menuItemId)).toEqual(['item-1']);
  });
});

function order(patch: Partial<PublicOrderDto>): PublicOrderDto {
  return {
    orderNumber: 'ORD-1',
    type: 'DELIVERY',
    channel: 'ONLINE',
    status: 'pending',
    paymentStatus: 'UNPAID',
    paymentMethod: 'CASH',
    currency: 'EGP',
    subtotal: '100.00',
    tax: '14.00',
    deliveryFee: '20.00',
    total: '134.00',
    customerName: 'Test',
    customerPhone: '0100',
    customerAddress: null,
    notes: null,
    estimatedPrepMinutes: 12,
    items: [],
    payment: null,
    deliveryStatus: 'PENDING',
    createdAt: new Date(0).toISOString(),
    ...patch,
  };
}

const currentStep = (value: PublicOrderDto): string | undefined =>
  orderProgress(value, translate).find((step) => step.current)?.label;

describe('order progress', () => {
  it('follows the kitchen status', () => {
    expect(currentStep(order({ status: 'pending' }))).toBe('Order received');
    expect(currentStep(order({ status: 'preparing' }))).toBe('In the oven');
    expect(currentStep(order({ status: 'ready' }))).toBe('Ready');
  });

  it('shows out for delivery only once the driver has picked the order up', () => {
    expect(currentStep(order({ status: 'ready', deliveryStatus: 'ASSIGNED' }))).toBe('Ready');
    expect(currentStep(order({ status: 'ready', deliveryStatus: 'PICKED_UP' }))).toBe(
      'Out for delivery',
    );
  });

  it('marks every stage done when delivered', () => {
    const steps = orderProgress(order({ status: 'completed', deliveryStatus: 'DELIVERED' }), translate);
    expect(steps.every((step) => step.done)).toBe(true);
    expect(steps.some((step) => step.current)).toBe(false);
  });

  it('uses pickup wording for takeaway orders', () => {
    const steps = orderProgress(
      order({ type: 'TAKEAWAY', status: 'ready', deliveryStatus: null }),
      translate,
    );
    expect(steps.map((step) => step.label)).toContain('Ready for pickup');
    expect(steps.map((step) => step.label)).not.toContain('Out for delivery');
  });
});

describe('formatting helpers', () => {
  it('builds stable category slugs', () => {
    expect(slugify('Classic Pizzas')).toBe('classic-pizzas');
    expect(slugify('Sides & Dips')).toBe('sides-and-dips');
  });

  it('shows the cheapest size as the starting price', () => {
    const item = {
      hasSizes: true,
      basePrice: '0.00',
      sizes: [
        { id: 'm', price: '135.00' },
        { id: 's', price: '95.00' },
      ],
    } as unknown as PublicMenuItemDto;
    expect(startingPrice(item)).toEqual({ amount: '95.00', from: true });
    expect(
      startingPrice({ hasSizes: false, basePrice: '45.00', sizes: [] } as unknown as PublicMenuItemDto),
    ).toEqual({ amount: '45.00', from: false });
  });
});
