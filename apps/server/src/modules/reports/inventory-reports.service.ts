import type { Prisma } from '@prisma/client';
import type {
  InventoryConsumptionRowDto,
  InventoryPurchaseRowDto,
  InventoryReportsDto,
  InventoryReportQuery,
  InventorySummaryDto,
  InventoryValuationRowDto,
  InventoryWasteRowDto,
  RecipeCostRowDto,
} from '@posshope/shared';
import { prisma } from '../../prisma.js';
import { businessDayStart } from '../../lib/dates.js';
import { currentLanguage } from '../../lib/request-language.js';
import { pickLocalized } from '@posshope/shared';

function rangeBounds(from?: string, to?: string): { start: Date; end: Date } {
  const end = to ? new Date(businessDayStart(to).getTime() + 86_400_000) : new Date();
  const start = from
    ? businessDayStart(from)
    : new Date(end.getTime() - 30 * 86_400_000);
  return { start, end };
}

export async function getInventoryReports(
  query: InventoryReportQuery,
  branchId: string | undefined,
): Promise<InventoryReportsDto> {
  const language = currentLanguage();
  const { start, end } = rangeBounds(query.from, query.to);
  const scopedBranch = query.branchId ?? branchId;

  const ingredientWhere: Prisma.IngredientWhereInput = {
    ...(query.categoryId ? { categoryId: query.categoryId } : {}),
    ...(query.supplierId ? { supplierId: query.supplierId } : {}),
    ...(query.ingredientId ? { id: query.ingredientId } : {}),
  };
  const stockWhere: Prisma.IngredientStockWhereInput = {
    ...(scopedBranch ? { branchId: scopedBranch } : {}),
    ...(Object.keys(ingredientWhere).length > 0 ? { ingredient: ingredientWhere } : {}),
  };
  const movementWhere: Prisma.InventoryMovementWhereInput = {
    createdAt: { gte: start, lt: end },
    ...(scopedBranch ? { branchId: scopedBranch } : {}),
    ...(Object.keys(ingredientWhere).length > 0 ? { ingredient: ingredientWhere } : {}),
  };

  const [stocks, movements, purchaseOrders, openAlerts, activeRecipes] = await Promise.all([
    prisma.ingredientStock.findMany({
      where: stockWhere,
      include: { ingredient: { include: { category: true } }, branch: true },
      orderBy: { ingredient: { name: 'asc' } },
    }),
    prisma.inventoryMovement.findMany({
      where: movementWhere,
      include: { ingredient: true, user: { select: { fullName: true } } },
      orderBy: { createdAt: 'desc' },
      take: 5000,
    }),
    prisma.purchaseOrder.findMany({
      where: {
        createdAt: { gte: start, lt: end },
        status: { notIn: ['DRAFT', 'CANCELLED'] },
        ...(scopedBranch ? { branchId: scopedBranch } : {}),
        ...(query.supplierId ? { supplierId: query.supplierId } : {}),
      },
      include: { supplier: true },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.stockAlert.count({
      where: {
        status: 'OPEN',
        ...(scopedBranch ? { branchId: scopedBranch } : {}),
      },
    }),
    prisma.recipe.findMany({
      where: { isActive: true },
      include: {
        menuItem: true,
        size: true,
        items: { include: { ingredient: true } },
      },
    }),
  ]);

  const valuation = new Map<string, InventoryValuationRowDto>();
  let inventoryValue = 0;
  let lowCount = 0;
  let outCount = 0;
  for (const stock of stocks) {
    const current = Number(stock.currentStock);
    const cost =
      Number(stock.ingredient.averageCost) || Number(stock.ingredient.costPerUnit);
    const value = current * cost;
    inventoryValue += value;
    if (current <= 0) outCount += 1;
    else if (current <= Number(stock.minStock)) lowCount += 1;

    const key = stock.ingredientId;
    const existing = valuation.get(key);
    if (existing) {
      existing.currentStock = Number((existing.currentStock + current).toFixed(3));
      existing.stockValue = (Number(existing.stockValue) + value).toFixed(2);
    } else {
      valuation.set(key, {
        ingredientId: stock.ingredientId,
        ingredientName: pickLocalized(
          language,
          stock.ingredient.name,
          stock.ingredient.nameAr,
        ),
        categoryName: stock.ingredient.category
          ? pickLocalized(
              language,
              stock.ingredient.category.name,
              stock.ingredient.category.nameAr,
            )
          : null,
        unit: stock.ingredient.unit,
        currentStock: current,
        averageCost: cost.toFixed(2),
        stockValue: value.toFixed(2),
        lastCost: Number(stock.ingredient.costPerUnit).toFixed(2),
      });
    }
  }

  const consumption = new Map<string, InventoryConsumptionRowDto>();
  let consumptionValue = 0;
  let wasteValue = 0;
  const waste: InventoryWasteRowDto[] = [];
  for (const movement of movements) {
    const quantity = Number(movement.quantity);
    const unitCost = Number(movement.unitCost ?? 0);
    if (movement.type === 'SALE_DEDUCTION' || movement.type === 'CANCELLATION_RETURN') {
      const signed = movement.type === 'SALE_DEDUCTION' ? Math.abs(quantity) : -Math.abs(quantity);
      const entry = consumption.get(movement.ingredientId) ?? {
        ingredientId: movement.ingredientId,
        ingredientName: pickLocalized(
          language,
          movement.ingredient.name,
          movement.ingredient.nameAr,
        ),
        unit: movement.ingredient.unit,
        quantity: 0,
        cost: '0.00',
      };
      entry.quantity = Number((entry.quantity + signed).toFixed(3));
      entry.cost = (Number(entry.cost) + signed * unitCost).toFixed(2);
      consumption.set(movement.ingredientId, entry);
      consumptionValue += signed * unitCost;
    } else if (movement.type === 'WASTE') {
      const cost = Math.abs(quantity) * unitCost;
      wasteValue += cost;
      waste.push({
        id: movement.id,
        ingredientId: movement.ingredientId,
        ingredientName: pickLocalized(
          language,
          movement.ingredient.name,
          movement.ingredient.nameAr,
        ),
        unit: movement.ingredient.unit,
        quantity: Math.abs(quantity),
        cost: cost.toFixed(2),
        reason: movement.note,
        createdAt: movement.createdAt.toISOString(),
        userName: movement.user?.fullName ?? null,
      });
    }
  }

  const purchases: InventoryPurchaseRowDto[] = purchaseOrders.map((order) => {
    const received = order.status === 'RECEIVED';
    return {
      id: order.id,
      orderNumber: order.orderNumber,
      supplierName: pickLocalized(language, order.supplier.name, order.supplier.nameAr),
      status: order.status,
      total: Number(order.total).toFixed(2),
      createdAt: order.createdAt.toISOString(),
      receivedAt: received ? order.updatedAt.toISOString() : null,
    };
  });
  const purchasesValue = purchaseOrders.reduce((sum, order) => sum + Number(order.total), 0);

  const recipeCosts: RecipeCostRowDto[] = activeRecipes.map((recipe) => {
    const ingredientCost = recipe.items.reduce(
      (sum, line) =>
        sum +
        Number(line.quantity) *
          (Number(line.ingredient.averageCost) || Number(line.ingredient.costPerUnit)),
      0,
    );
    const sellingPrice = Number(recipe.size?.price ?? recipe.menuItem.basePrice);
    return {
      menuItemId: recipe.menuItemId,
      menuItemName: pickLocalized(
        language,
        recipe.menuItem.name,
        recipe.menuItem.nameAr,
      ),
      sizeId: recipe.sizeId,
      sizeName: recipe.size
        ? pickLocalized(language, recipe.size.name, recipe.size.nameAr)
        : null,
      version: recipe.version,
      ingredientCost: ingredientCost.toFixed(2),
      sellingPrice: sellingPrice.toFixed(2),
      marginPct:
        sellingPrice > 0
          ? Number((((sellingPrice - ingredientCost) / sellingPrice) * 100).toFixed(1))
          : 0,
    };
  });

  const summary: InventorySummaryDto = {
    itemCount: new Set(stocks.map((stock) => stock.ingredientId)).size,
    lowCount,
    outCount,
    inventoryValue: inventoryValue.toFixed(2),
    openAlerts,
    purchasesValue: purchasesValue.toFixed(2),
    purchasesCount: purchaseOrders.length,
    consumptionValue: consumptionValue.toFixed(2),
    wasteValue: wasteValue.toFixed(2),
  };

  return {
    summary,
    valuation: [...valuation.values()].sort((a, b) => a.ingredientName.localeCompare(b.ingredientName)),
    consumption: [...consumption.values()]
      .filter((row) => Math.abs(row.quantity) > 1e-9)
      .sort((a, b) => Number(b.cost) - Number(a.cost)),
    purchases,
    waste,
    recipeCosts,
  };
}
