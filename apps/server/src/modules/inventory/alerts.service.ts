import type { Prisma } from '@prisma/client';

type Tx = Prisma.TransactionClient;

const qty = (value: number | Prisma.Decimal | string): string => Number(value).toFixed(3);

/**
 * Reconciles the persisted alert state for one ingredient at one store after a
 * stock mutation. A condition produces at most one OPEN alert; repeat sales
 * only refresh its figures, and resolving/restocking closes it.
 */
export async function syncStockAlerts(
  tx: Tx,
  ingredientId: string,
  branchId: string,
): Promise<void> {
  const stock = await tx.ingredientStock.findUnique({
    where: { ingredientId_branchId: { ingredientId, branchId } },
    select: { currentStock: true, minStock: true },
  });
  const current = Number(stock?.currentStock ?? 0);
  const min = Number(stock?.minStock ?? 0);
  const type = current <= 0 ? ('OUT' as const) : current <= min ? ('LOW' as const) : null;
  const threshold = type === 'OUT' ? 0 : min;

  await tx.stockAlert.updateMany({
    where: {
      ingredientId,
      branchId,
      status: 'OPEN',
      ...(type ? { type: { not: type } } : {}),
    },
    data: { status: 'RESOLVED', resolvedAt: new Date() },
  });

  if (!type) return;

  const existing = await tx.stockAlert.findFirst({
    where: { ingredientId, branchId, type, status: 'OPEN' },
    select: { id: true },
  });
  if (existing) {
    await tx.stockAlert.update({
      where: { id: existing.id },
      data: { currentStock: qty(current), threshold: qty(threshold) },
    });
    return;
  }
  await tx.stockAlert.create({
    data: {
      ingredientId,
      branchId,
      type,
      currentStock: qty(current),
      threshold: qty(threshold),
    },
  });
}

/** Alert sync that must not fail a stock mutation (best-effort within a tx). */
export async function syncStockAlertsMany(
  tx: Tx,
  pairs: ReadonlyArray<{ ingredientId: string; branchId: string }>,
): Promise<void> {
  const unique = new Map<string, { ingredientId: string; branchId: string }>();
  for (const pair of pairs) {
    const key = `${pair.branchId}:${pair.ingredientId}`;
    if (!unique.has(key)) unique.set(key, pair);
  }
  // Deterministic order matches the stock-row lock order used by order flow.
  const ordered = [...unique.values()].sort(
    (a, b) =>
      a.branchId.localeCompare(b.branchId) || a.ingredientId.localeCompare(b.ingredientId),
  );
  for (const pair of ordered) {
    await syncStockAlerts(tx, pair.ingredientId, pair.branchId);
  }
}
