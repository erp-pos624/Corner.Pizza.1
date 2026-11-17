import type { Prisma } from '@prisma/client';
import {
  pickLocalized,
  pickLocalizedNullable,
  type PublicBranchDto,
  type PublicCategoryDto,
  type PublicDeliveryCheckDto,
  type PublicDeliveryCheckInput,
  type PublicMenuDto,
  type PublicMenuItemDto,
  type PublicToppingDto,
  type PublicZoneDto,
} from '@posshope/shared';
import { env } from '../../env.js';
import { NotFoundError } from '../../lib/errors.js';
import { currentLanguage } from '../../lib/request-language.js';
import { getSettings } from '../../lib/settings.js';
import { logger } from '../../logger.js';
import { prisma } from '../../prisma.js';
import { checkDeliveryZone } from '../delivery-zones/delivery-zones.service.js';
import { evaluateOnlineStatus } from '../online-store/online-store.service.js';

type PublicBranchRow = Prisma.BranchGetPayload<object>;

function money(value: Prisma.Decimal | number | string): string {
  return Number(value).toFixed(2);
}

export function toPublicBranchDto(branch: PublicBranchRow, now = new Date()): PublicBranchDto {
  const language = currentLanguage();
  const status = evaluateOnlineStatus(branch, now);
  return {
    id: branch.id,
    code: branch.code,
    name: pickLocalized(language, branch.name, branch.nameAr),
    nameEn: branch.name,
    nameAr: branch.nameAr,
    address: branch.address,
    phone: branch.phone,
    latitude: branch.latitude,
    longitude: branch.longitude,
    onlineOrderingEnabled: branch.onlineOrderingEnabled,
    onlineOpenTime: branch.onlineOpenTime,
    onlineCloseTime: branch.onlineCloseTime,
    isOpenNow: status.isOpenNow,
    acceptingOrders: status.acceptingOrders,
    closedReason: status.closedReason,
  };
}

/** Active branches only; inactive or closed branches never surface on the site. */
export async function listPublicBranches(now = new Date()): Promise<PublicBranchDto[]> {
  const branches = await prisma.branch.findMany({
    where: { isActive: true },
    orderBy: { name: 'asc' },
  });
  return branches.map((branch) => toPublicBranchDto(branch, now));
}

async function loadPublicBranch(branchId: string): Promise<PublicBranchRow> {
  const branch = await prisma.branch.findUnique({ where: { id: branchId } });
  if (!branch || !branch.isActive) throw new NotFoundError('This branch is not available');
  return branch;
}

async function branchStockMap(branchId: string): Promise<Map<string, number>> {
  const stocks = await prisma.ingredientStock.findMany({
    where: { branchId },
    select: { ingredientId: true, currentStock: true },
  });
  return new Map(stocks.map((stock) => [stock.ingredientId, Number(stock.currentStock)]));
}

const publicMenuItemInclude = {
  sizes: { orderBy: { sortOrder: 'asc' } },
  recipes: {
    where: { isActive: true, sizeId: null },
    include: {
      items: { include: { ingredient: { select: { name: true, nameAr: true } } } },
    },
  },
} satisfies Prisma.MenuItemInclude;

type PublicMenuItemRow = Prisma.MenuItemGetPayload<{ include: typeof publicMenuItemInclude }>;

/**
 * Inventory-based availability mirrors the POS catalogue: an item is sold out
 * when its recipe cannot be fulfilled from this branch's stock.
 */
function soldOutReason(
  item: PublicMenuItemRow,
  stockByIngredient: Map<string, number>,
): string | null {
  const language = currentLanguage();
  if (!item.isAvailable) {
    return language === 'ar' ? 'غير متوفر حاليًا' : 'Sold out';
  }
  const shortage = (item.recipes[0]?.items ?? []).find((line) => {
    const available = stockByIngredient.get(line.ingredientId) ?? 0;
    return available + 1e-9 < Number(line.quantity);
  });
  if (!shortage) return null;
  return language === 'ar'
    ? `نفد المخزون: ${shortage.ingredient.nameAr ?? shortage.ingredient.name}`
    : `Out of stock: ${shortage.ingredient.name}`;
}

function toPublicMenuItemDto(
  item: PublicMenuItemRow,
  stockByIngredient: Map<string, number>,
): PublicMenuItemDto {
  const language = currentLanguage();
  const reason = soldOutReason(item, stockByIngredient);
  return {
    id: item.id,
    sku: item.sku,
    name: pickLocalized(language, item.name, item.nameAr),
    nameEn: item.name,
    nameAr: item.nameAr,
    description: pickLocalizedNullable(language, item.description, item.descriptionAr),
    descriptionEn: item.description,
    descriptionAr: item.descriptionAr,
    imageUrl: item.imageUrl,
    categoryId: item.categoryId,
    kind: item.kind,
    basePrice: money(item.basePrice),
    prepMinutes: item.prepMinutes,
    isFeatured: item.isFeatured,
    hasSizes: item.hasSizes,
    sizes: item.sizes.map((size) => ({
      id: size.id,
      name: pickLocalized(language, size.name, size.nameAr),
      nameEn: size.name,
      nameAr: size.nameAr,
      price: money(size.price),
      isDefault: size.isDefault,
      sortOrder: size.sortOrder,
    })),
    isSoldOut: reason !== null,
    soldOutReason: reason,
    ingredients: (item.recipes[0]?.items ?? []).map((line) =>
      pickLocalized(language, line.ingredient.name, line.ingredient.nameAr),
    ),
  };
}

function toPublicCategoryDto(category: Prisma.CategoryGetPayload<object>): PublicCategoryDto {
  const language = currentLanguage();
  return {
    id: category.id,
    name: pickLocalized(language, category.name, category.nameAr),
    nameEn: category.name,
    nameAr: category.nameAr,
    description: pickLocalizedNullable(language, category.description, category.descriptionAr),
    descriptionEn: category.description,
    descriptionAr: category.descriptionAr,
    sortOrder: category.sortOrder,
  };
}

const POPULAR_WINDOW_DAYS = 30;
const POPULAR_LIMIT = 8;

/** Best sellers from real, non-cancelled orders at this branch. */
async function popularItemIds(branchId: string, now: Date): Promise<string[]> {
  const since = new Date(now.getTime() - POPULAR_WINDOW_DAYS * 86_400_000);
  const rows = await prisma.orderItem.groupBy({
    by: ['menuItemId'],
    where: { order: { branchId, status: { not: 'CANCELLED' }, createdAt: { gte: since } } },
    _sum: { quantity: true },
    orderBy: { _sum: { quantity: 'desc' } },
    take: POPULAR_LIMIT,
  });
  return rows.map((row) => row.menuItemId);
}

export async function getPublicMenu(branchId: string, now = new Date()): Promise<PublicMenuDto> {
  const branch = await loadPublicBranch(branchId);
  const status = evaluateOnlineStatus(branch, now);

  const [settings, categories, items, toppings, stockByIngredient, popular] = await Promise.all([
    getSettings(),
    prisma.category.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    }),
    prisma.menuItem.findMany({
      where: { category: { isActive: true } },
      include: publicMenuItemInclude,
      orderBy: [{ category: { sortOrder: 'asc' } }, { name: 'asc' }],
    }),
    prisma.topping.findMany({
      where: { isAvailable: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    }),
    branchStockMap(branchId),
    popularItemIds(branchId, now),
  ]);

  const language = currentLanguage();
  const currency = settings.currency;

  return {
    generatedAt: now.toISOString(),
    branch: toPublicBranchDto(branch, now),
    currency,
    acceptingOrders: status.acceptingOrders,
    closedReason: status.closedReason,
    categories: categories.map(toPublicCategoryDto),
    items: items.map((item) => toPublicMenuItemDto(item, stockByIngredient)),
    toppings: toppings.map((topping): PublicToppingDto => ({
      id: topping.id,
      name: pickLocalized(language, topping.name, topping.nameAr),
      nameEn: topping.name,
      nameAr: topping.nameAr,
      price: money(topping.price),
    })),
    taxRate: Number(settings.taxRate).toFixed(2),
    popularItemIds: popular,
  };
}

function toPublicZoneDto(zone: Prisma.DeliveryZoneGetPayload<object>): PublicZoneDto {
  return {
    id: zone.id,
    name: zone.name,
    centerLat: zone.centerLat,
    centerLng: zone.centerLng,
    radiusInMeters: zone.radiusInMeters,
    deliveryFee: money(zone.deliveryFee),
    minOrderAmount: money(zone.minOrderAmount),
  };
}

interface GeocodeResult {
  lat: number;
  lng: number;
  displayName: string | null;
}

/** Nominatim-compatible lookup; address-only checks degrade to a map-pin request. */
async function geocodeAddress(address: string): Promise<GeocodeResult | null> {
  if (!env.GEOCODER_URL) return null;
  try {
    const url = new URL(env.GEOCODER_URL);
    url.searchParams.set('q', address);
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('limit', '1');
    const response = await fetch(url, {
      headers: {
        accept: 'application/json',
        'user-agent': 'CornerPizzaStorefront/1.0',
      },
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as unknown;
    const first = Array.isArray(payload)
      ? (payload[0] as Record<string, unknown> | undefined)
      : undefined;
    if (!first) return null;
    const lat = Number(first.lat);
    const lng = Number(first.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return {
      lat,
      lng,
      displayName: typeof first.display_name === 'string' ? first.display_name : null,
    };
  } catch (error) {
    logger.warn({ err: error }, 'storefront address lookup failed');
    return null;
  }
}

/**
 * Public zone quote. Coordinates are authoritative; an address is geocoded when
 * the server is configured with a geocoder. Without a point the response asks
 * the storefront for a map pin instead of guessing a zone.
 */
export async function checkPublicDelivery(
  input: PublicDeliveryCheckInput,
): Promise<PublicDeliveryCheckDto> {
  const branch = await loadPublicBranch(input.branchId);
  const settings = await getSettings();
  const zones = await prisma.deliveryZone.findMany({
    where: { branchId: branch.id, isActive: true },
    orderBy: [{ radiusInMeters: 'asc' }, { name: 'asc' }],
  });
  const zoneDtos = zones.map(toPublicZoneDto);

  let point: { lat: number; lng: number } | null =
    input.lat != null && input.lng != null ? { lat: input.lat, lng: input.lng } : null;
  let resolvedAddress: string | null = null;
  if (!point && input.address) {
    const geocoded = await geocodeAddress(input.address);
    if (geocoded) {
      point = { lat: geocoded.lat, lng: geocoded.lng };
      resolvedAddress = geocoded.displayName;
    }
  }

  if (!point) {
    return {
      branchId: branch.id,
      inside: true,
      zone: null,
      distanceMeters: null,
      nearestZoneName: null,
      nearestDistanceMeters: null,
      deliveryFee: zones.length === 0 ? money(settings.deliveryFee) : '0.00',
      minOrderAmount: '0.00',
      activeZones: zones.length,
      usesFallbackFee: zones.length === 0,
      lat: null,
      lng: null,
      resolvedAddress,
      requiresGeolocation: zones.length > 0,
      zones: zoneDtos,
    };
  }

  const quote = await checkDeliveryZone({ lat: point.lat, lng: point.lng }, branch.id);
  return {
    ...quote,
    lat: point.lat,
    lng: point.lng,
    resolvedAddress,
    requiresGeolocation: false,
    zones: zoneDtos,
  };
}
