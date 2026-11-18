import { prisma } from '../../src/prisma.js';

async function main(): Promise<void> {
const start = new Date(Date.now() - 30 * 86_400_000);
const where = {
  status: { not: 'CANCELLED' as const },
  paymentStatus: { in: ['PAID', 'PAID_ONLINE', 'PARTIALLY_REFUNDED', 'REFUNDED'] as const },
  createdAt: { gte: start },
};

console.time('count');
const count = await prisma.order.count({ where });
console.timeEnd('count');
console.log('orders in range:', count);

console.time('fetch-minimal');
const minimal = await prisma.order.findMany({
  where,
  select: { id: true, total: true, subtotal: true, tax: true, discount: true, deliveryFee: true, createdAt: true },
});
console.timeEnd('fetch-minimal');

console.time('fetch-full');
const orders = await prisma.order.findMany({
  where,
  include: {
    items: true,
    payments: true,
    refunds: { select: { method: true, amount: true } },
    cashier: { select: { id: true, fullName: true } },
  },
  orderBy: { createdAt: 'asc' },
});
console.timeEnd('fetch-full');

console.time('scan');
let sum = 0;
for (const order of orders) {
  sum += Number(order.total);
  for (const item of order.items) sum += Number(item.lineTotal);
  for (const payment of order.payments) sum += Number(payment.amount);
  for (const refund of order.refunds) sum += Number(refund.amount);
}
console.timeEnd('scan');
console.log('sanity sum:', sum.toFixed(2), 'minimal rows:', minimal.length);

await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
