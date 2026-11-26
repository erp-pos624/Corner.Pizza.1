/**
 * Idempotent, non-destructive sync of the client-approved menu and store data
 * (corner_pizza_official_menu_and_store_data.json) into the database.
 *
 * What it changes:
 *   - categories and menu items (upsert by name / SKU, bilingual, prices,
 *     sizes, taxInclusive); existing images, recipes, food cost and featured
 *     flags are kept;
 *   - restaurant settings identity (name, tagline, phone, email, address);
 *   - the branch address, phone, coordinates and per-weekday online hours;
 *   - one Al Rehab delivery zone, created only if missing.
 *
 * What it never touches: orders, payments, invoices, shifts, users, stock,
 * inventory movements, the tax rate or the receipt footer. Nothing is ever
 * deleted except surplus size rows on the synced items themselves (so an old
 * size cannot be sold at an old price). Anything else not in the file is only
 * switched off, and only with `retireUnlisted`.
 */
import { Prisma, type MenuKind, type PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { WEEKDAY_KEYS, type WeeklyHours } from '@posshope/shared';

// ---------------------------------------------------------------------------
// Input file
// ---------------------------------------------------------------------------

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/u);
const price = z.number().positive().max(100_000);

const itemSchema = z
  .object({
    name_en: z.string().trim().min(2).max(120),
    name_ar: z.string().trim().min(1).max(120),
    description_en: z.string().trim().max(600).optional(),
    description_ar: z.string().trim().max(600).optional(),
    taxInclusive: z.boolean().default(true),
    price: price.optional(),
    sizes: z.array(z.object({ name: z.string().trim().min(1).max(40), price })).max(8).optional(),
  })
  .refine((item) => (item.price === undefined) !== (item.sizes === undefined), {
    message: 'Each item needs either "price" or "sizes", not both',
  });

export const officialDataSchema = z.object({
  store_info: z.object({
    name_en: z.string().trim().min(1),
    name_ar: z.string().trim().min(1),
    tagline_en: z.string().trim().optional(),
    tagline_ar: z.string().trim().optional(),
    phone: z.string().trim().min(5),
    email: z.string().trim().email(),
    short_address: z.string().trim().min(3),
    full_address: z.string().trim().min(3),
    coordinates: z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }),
    operating_hours: z.record(z.string(), z.object({ open: hhmm, close: hhmm })),
  }),
  categories: z
    .array(
      z.object({
        name_en: z.string().trim().min(2).max(80),
        name_ar: z.string().trim().min(1).max(80),
        items: z.array(itemSchema).min(1),
      }),
    )
    .min(1),
});
export type OfficialData = z.infer<typeof officialDataSchema>;

// ---------------------------------------------------------------------------
// Fixed choices for this restaurant (documented so they can be reviewed)
// ---------------------------------------------------------------------------

/** Al Rehab 1 + 2. Centred on the combined area, not the shop, so western Rehab 1 is covered. */
export const REHAB_ZONE = {
  name: 'Al Rehab (Rehab 1 & 2)',
  centerLat: 30.064,
  centerLng: 31.4975,
  radiusInMeters: 3300,
  deliveryFee: '25.00',
  minOrderAmount: '100.00',
} as const;

const SIZE_META: Record<string, { nameAr: string; multiplier: string; aliases: string[] }> = {
  S: { nameAr: 'صغير', multiplier: '0.800', aliases: ['small', 'sm'] },
  M: { nameAr: 'وسط', multiplier: '1.000', aliases: ['medium', 'med'] },
  L: { nameAr: 'كبير', multiplier: '1.250', aliases: ['large', 'lg'] },
  '6pc': { nameAr: '6 قطع', multiplier: '1.000', aliases: ['6 pcs', '6 pieces', '6'] },
  '12pc': { nameAr: '12 قطعة', multiplier: '2.000', aliases: ['12 pcs', '12 pieces', '12'] },
};

const DAY_NAMES: Record<string, (typeof WEEKDAY_KEYS)[number]> = {
  sunday: 'sun',
  monday: 'mon',
  tuesday: 'tue',
  wednesday: 'wed',
  thursday: 'thu',
  friday: 'fri',
  saturday: 'sat',
};

function categoryDefaults(name: string): { kind: MenuKind; prepMinutes: number } {
  const lower = name.toLowerCase();
  if (lower.includes('pizza') || lower.includes('calzone')) return { kind: 'PIZZA', prepMinutes: 15 };
  if (lower.includes('hoagie')) return { kind: 'SIDE', prepMinutes: 10 };
  if (lower.includes('wing') || lower.includes('appetizer')) return { kind: 'APPETIZER', prepMinutes: 12 };
  if (lower.includes('dessert')) return { kind: 'DESSERT', prepMinutes: 3 };
  if (lower.includes('beverage') || lower.includes('drink')) return { kind: 'DRINK', prepMinutes: 1 };
  return { kind: 'SIDE', prepMinutes: 10 };
}

export function skuFor(nameEn: string): string {
  const slug = nameEn
    .toUpperCase()
    .replace(/&/gu, ' AND ')
    .replace(/[^A-Z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '');
  return `CP-${slug}`.slice(0, 40).replace(/-+$/u, '');
}

export function weeklyHoursFrom(hours: OfficialData['store_info']['operating_hours']): WeeklyHours {
  const result: WeeklyHours = {};
  for (const [day, window] of Object.entries(hours)) {
    const key = DAY_NAMES[day.trim().toLowerCase()];
    if (!key) throw new Error(`Unknown weekday in operating_hours: "${day}"`);
    if (window.open === window.close) throw new Error(`${day}: opening and closing times are equal`);
    result[key] = { open: window.open, close: window.close };
  }
  const missing = WEEKDAY_KEYS.filter((key) => !(key in result));
  if (missing.length > 0) throw new Error(`operating_hours is missing: ${missing.join(', ')}`);
  return result;
}

function normalise(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/gu, ' ');
}

function sameMoney(a: Prisma.Decimal | string | number, b: string | number): boolean {
  return Number(a).toFixed(2) === Number(b).toFixed(2);
}

// ---------------------------------------------------------------------------
// Sync
// ---------------------------------------------------------------------------

export interface SyncOptions {
  apply: boolean;
  branchCode?: string;
  retireUnlisted: boolean;
  log: (line: string) => void;
}

export interface SyncSummary {
  categoriesCreated: number;
  categoriesUpdated: number;
  itemsCreated: number;
  itemsUpdated: number;
  itemsUnchanged: number;
  sizesRemoved: number;
  retiredItems: number;
  retiredCategories: number;
  retiredToppings: number;
  retiredZones: number;
  zoneCreated: boolean;
}

type Tx = Prisma.TransactionClient;

export async function syncOfficialMenu(
  prisma: PrismaClient,
  data: OfficialData,
  options: SyncOptions,
): Promise<SyncSummary> {
  const weekly = weeklyHoursFrom(data.store_info.operating_hours);
  return prisma.$transaction(
    async (tx) => {
      const summary = await runSync(tx, data, weekly, options);
      if (!options.apply) {
        // Dry run: everything above only read. Throwing is not needed because
        // no write was issued, but keep the transaction read-only by design.
        options.log('\nDRY RUN — nothing was written. Re-run with --apply to make these changes.');
      }
      return summary;
    },
    { timeout: 180_000, maxWait: 20_000 },
  );
}

async function runSync(
  tx: Tx,
  data: OfficialData,
  weekly: WeeklyHours,
  { apply, branchCode, retireUnlisted, log }: SyncOptions,
): Promise<SyncSummary> {
  const summary: SyncSummary = {
    categoriesCreated: 0,
    categoriesUpdated: 0,
    itemsCreated: 0,
    itemsUpdated: 0,
    itemsUnchanged: 0,
    sizesRemoved: 0,
    retiredItems: 0,
    retiredCategories: 0,
    retiredToppings: 0,
    retiredZones: 0,
    zoneCreated: false,
  };

  // --- Branch ---------------------------------------------------------------
  const branches = await tx.branch.findMany({ orderBy: { createdAt: 'asc' } });
  const branch = branchCode
    ? branches.find((row) => row.code.toLowerCase() === branchCode.toLowerCase())
    : branches.filter((row) => row.isActive).length === 1
      ? branches.find((row) => row.isActive)
      : undefined;
  if (!branch) {
    throw new Error(
      `Choose the branch with --branch <code>. Branches: ${branches.map((row) => `${row.code} (${row.name})`).join(', ') || 'none'}`,
    );
  }
  log(`Branch: ${branch.code} — ${branch.name}`);

  // --- Categories and items ------------------------------------------------
  const existingCategories = await tx.category.findMany();
  const existingItems = await tx.menuItem.findMany({ include: { sizes: true } });
  const claimedItemIds = new Set<string>();
  const syncedCategoryIds = new Set<string>();
  let itemCount = 0;

  for (const [categoryIndex, category] of data.categories.entries()) {
    const sortOrder = (categoryIndex + 1) * 10;
    const existing = existingCategories.find(
      (row) => normalise(row.name) === normalise(category.name_en),
    );
    let categoryId: string;
    if (!existing) {
      log(`\n+ Category "${category.name_en}" / ${category.name_ar}`);
      summary.categoriesCreated += 1;
      categoryId = apply
        ? (
            await tx.category.create({
              data: { name: category.name_en, nameAr: category.name_ar, sortOrder, isActive: true },
            })
          ).id
        : `(new:${category.name_en})`;
    } else {
      categoryId = existing.id;
      const changed =
        existing.name !== category.name_en ||
        existing.nameAr !== category.name_ar ||
        existing.sortOrder !== sortOrder ||
        !existing.isActive;
      log(`\n${changed ? '~' : '='} Category "${category.name_en}"`);
      if (changed) {
        summary.categoriesUpdated += 1;
        if (apply) {
          await tx.category.update({
            where: { id: existing.id },
            data: { name: category.name_en, nameAr: category.name_ar, sortOrder, isActive: true },
          });
        }
      }
    }
    syncedCategoryIds.add(categoryId);
    const defaults = categoryDefaults(category.name_en);

    for (const item of category.items) {
      itemCount += 1;
      const sku = skuFor(item.name_en);
      const match =
        existingItems.find((row) => row.sku === sku && !claimedItemIds.has(row.id)) ??
        existingItems.find(
          (row) => normalise(row.name) === normalise(item.name_en) && !claimedItemIds.has(row.id),
        );
      if (match) claimedItemIds.add(match.id);

      const sizes = (item.sizes ?? []).map((size, index) => {
        const meta = SIZE_META[size.name];
        return {
          name: size.name,
          nameAr: meta?.nameAr ?? size.name,
          price: size.price.toFixed(2),
          multiplier: meta?.multiplier ?? '1.000',
          aliases: [normalise(size.name), ...(meta?.aliases ?? [])],
          sortOrder: index,
        };
      });
      const hasSizes = sizes.length > 0;
      const defaultSizeName = hasSizes
        ? (sizes.find((size) => size.name === 'M') ?? sizes[0]!).name
        : null;
      const basePrice = hasSizes
        ? Math.min(...sizes.map((size) => Number(size.price))).toFixed(2)
        : item.price!.toFixed(2);

      const fields = {
        sku,
        name: item.name_en,
        nameAr: item.name_ar,
        description: item.description_en ?? null,
        descriptionAr: item.description_ar ?? null,
        categoryId,
        kind: defaults.kind,
        basePrice,
        hasSizes,
        taxInclusive: item.taxInclusive,
        isAvailable: true,
      };

      if (!match) {
        summary.itemsCreated += 1;
        log(
          `  + ${item.name_en}  ${hasSizes ? sizes.map((s) => `${s.name} ${s.price}`).join(' · ') : basePrice}`,
        );
        if (apply) {
          await tx.menuItem.create({
            data: {
              ...fields,
              prepMinutes: defaults.prepMinutes,
              sizes: hasSizes
                ? {
                    create: sizes.map((size) => ({
                      name: size.name,
                      nameAr: size.nameAr,
                      price: size.price,
                      ingredientMultiplier: size.multiplier,
                      isDefault: size.name === defaultSizeName,
                      sortOrder: size.sortOrder,
                    })),
                  }
                : undefined,
            },
          });
        }
        continue;
      }

      // Existing item: update fields, keep image/recipes/cost/featured/prep time.
      const changes: string[] = [];
      if (match.sku !== sku) changes.push(`sku ${match.sku}→${sku}`);
      if (match.name !== item.name_en) changes.push(`name "${match.name}"`);
      if (match.nameAr !== item.name_ar) changes.push('nameAr');
      if ((match.description ?? null) !== fields.description) changes.push('description');
      if ((match.descriptionAr ?? null) !== fields.descriptionAr) changes.push('descriptionAr');
      if (match.categoryId !== categoryId) changes.push('category');
      if (match.kind !== defaults.kind) changes.push(`kind ${match.kind}→${defaults.kind}`);
      if (!sameMoney(match.basePrice, basePrice)) changes.push(`base ${Number(match.basePrice).toFixed(2)}→${basePrice}`);
      if (match.hasSizes !== hasSizes) changes.push(hasSizes ? 'now sized' : 'now single price');
      if (match.taxInclusive !== item.taxInclusive) changes.push(`taxInclusive→${item.taxInclusive}`);
      if (!match.isAvailable) changes.push('available again');

      // Sizes: reuse rows by name or alias (keeps size-specific recipes), add
      // missing ones, remove surplus ones on this item only.
      const remaining = [...match.sizes];
      const sizeOps: Array<() => Promise<unknown>> = [];
      for (const size of sizes) {
        const index = remaining.findIndex((row) => size.aliases.includes(normalise(row.name)));
        const isDefault = size.name === defaultSizeName;
        if (index >= 0) {
          const row = remaining.splice(index, 1)[0]!;
          if (
            row.name !== size.name ||
            row.nameAr !== size.nameAr ||
            !sameMoney(row.price, size.price) ||
            row.isDefault !== isDefault ||
            row.sortOrder !== size.sortOrder
          ) {
            changes.push(
              sameMoney(row.price, size.price)
                ? `size ${row.name}→${size.name}`
                : `size ${size.name} ${Number(row.price).toFixed(2)}→${size.price}`,
            );
            sizeOps.push(() =>
              tx.menuItemSize.update({
                where: { id: row.id },
                data: {
                  name: size.name,
                  nameAr: size.nameAr,
                  price: size.price,
                  isDefault,
                  sortOrder: size.sortOrder,
                },
              }),
            );
          }
        } else {
          changes.push(`+size ${size.name} ${size.price}`);
          sizeOps.push(() =>
            tx.menuItemSize.create({
              data: {
                menuItemId: match.id,
                name: size.name,
                nameAr: size.nameAr,
                price: size.price,
                ingredientMultiplier: size.multiplier,
                isDefault,
                sortOrder: size.sortOrder,
              },
            }),
          );
        }
      }
      for (const row of remaining) {
        changes.push(`-size ${row.name}`);
        summary.sizesRemoved += 1;
        sizeOps.push(() => tx.menuItemSize.delete({ where: { id: row.id } }));
      }

      if (changes.length === 0) {
        summary.itemsUnchanged += 1;
        log(`  = ${item.name_en}`);
        continue;
      }
      summary.itemsUpdated += 1;
      log(`  ~ ${item.name_en}: ${changes.join(', ')}`);
      if (apply) {
        // Free up names first so renamed sizes never collide on (item, name).
        if (sizeOps.length > 0) {
          for (const row of match.sizes) {
            await tx.menuItemSize.update({
              where: { id: row.id },
              data: { name: `__sync_${row.id}` },
            });
          }
        }
        await tx.menuItem.update({ where: { id: match.id }, data: fields });
        for (const op of sizeOps) await op();
        // Rows that were renamed to a temporary name but kept unchanged need their name back.
        const leftover = await tx.menuItemSize.findMany({
          where: { menuItemId: match.id, name: { startsWith: '__sync_' } },
        });
        for (const row of leftover) {
          const original = match.sizes.find((size) => size.id === row.id);
          await tx.menuItemSize.update({
            where: { id: row.id },
            data: { name: original?.name ?? row.name },
          });
        }
      }
    }
  }
  log(`\nOfficial items in file: ${itemCount}`);

  // --- Retire anything not in the file (switch off, never delete) ----------
  const unlistedItems = existingItems.filter((row) => !claimedItemIds.has(row.id) && row.isAvailable);
  const unlistedCategories = existingCategories.filter(
    (row) => !syncedCategoryIds.has(row.id) && row.isActive,
  );
  const activeToppings = await tx.topping.findMany({ where: { isAvailable: true } });
  if (unlistedItems.length + unlistedCategories.length + activeToppings.length > 0) {
    log(
      `\n${retireUnlisted ? 'Switching off' : 'Not in the official file (left as is; use --retire-unlisted to switch off)'}:`,
    );
    for (const row of unlistedCategories) log(`  - category "${row.name}"`);
    for (const row of unlistedItems) log(`  - item "${row.name}" (${row.sku})`);
    for (const row of activeToppings) log(`  - topping "${row.name}" ${Number(row.price).toFixed(2)}`);
  }
  if (retireUnlisted) {
    summary.retiredItems = unlistedItems.length;
    summary.retiredCategories = unlistedCategories.length;
    summary.retiredToppings = activeToppings.length;
    if (apply) {
      await tx.menuItem.updateMany({
        where: { id: { in: unlistedItems.map((row) => row.id) } },
        data: { isAvailable: false },
      });
      await tx.category.updateMany({
        where: { id: { in: unlistedCategories.map((row) => row.id) } },
        data: { isActive: false },
      });
      await tx.topping.updateMany({
        where: { id: { in: activeToppings.map((row) => row.id) } },
        data: { isAvailable: false },
      });
    }
  }

  // --- Restaurant identity --------------------------------------------------
  const store = data.store_info;
  const settingsData = {
    name: store.name_en,
    nameAr: store.name_ar,
    tagline: store.tagline_en ?? null,
    taglineAr: store.tagline_ar ?? null,
    phone: store.phone,
    email: store.email,
    address: store.full_address,
    // No approved Arabic address yet; clear the old one so the English one shows.
    addressAr: null,
  };
  log(`\nSettings: ${store.name_en} · ${store.phone} · ${store.email} · ${store.full_address} (tax rate unchanged)`);
  if (apply) {
    await tx.restaurantSettings.upsert({
      where: { id: 'default' },
      update: settingsData,
      create: { id: 'default', ...settingsData },
    });
  }

  // --- Branch details and hours --------------------------------------------
  log(
    `Branch ${branch.code}: address "${store.short_address}", ${store.coordinates.lat}, ${store.coordinates.lng}; hours ${WEEKDAY_KEYS.map((key) => `${key} ${weekly[key]?.open}-${weekly[key]?.close}`).join(', ')}`,
  );
  if (!branch.onlineOrderingEnabled) {
    log('  note: online ordering is OFF for this branch (left unchanged; switch it on in Online Store).');
  }
  if (apply) {
    await tx.branch.update({
      where: { id: branch.id },
      data: {
        address: store.short_address,
        phone: store.phone,
        latitude: store.coordinates.lat,
        longitude: store.coordinates.lng,
        onlineWeeklyHours: weekly as Prisma.InputJsonValue,
        onlineOpenTime: null,
        onlineCloseTime: null,
      },
    });
  }

  // --- Delivery zone ---------------------------------------------------------
  const zones = await tx.deliveryZone.findMany({ where: { branchId: branch.id } });
  const rehab = zones.find((zone) => zone.name === REHAB_ZONE.name);
  if (rehab) {
    log(
      `Zone "${REHAB_ZONE.name}" exists (fee ${Number(rehab.deliveryFee).toFixed(2)}, min ${Number(rehab.minOrderAmount).toFixed(2)}, r=${rehab.radiusInMeters}m, ${rehab.isActive ? 'active' : 'INACTIVE'}) — left as configured.`,
    );
  } else {
    summary.zoneCreated = true;
    log(
      `+ Zone "${REHAB_ZONE.name}" centre ${REHAB_ZONE.centerLat}, ${REHAB_ZONE.centerLng}, r=${REHAB_ZONE.radiusInMeters}m, fee ${REHAB_ZONE.deliveryFee}, min ${REHAB_ZONE.minOrderAmount}`,
    );
    if (apply) {
      await tx.deliveryZone.create({
        data: { ...REHAB_ZONE, branchId: branch.id, isActive: true },
      });
    }
  }
  const otherActiveZones = zones.filter((zone) => zone.name !== REHAB_ZONE.name && zone.isActive);
  if (otherActiveZones.length > 0) {
    log(
      `${retireUnlisted ? 'Deactivating' : 'Other active zones (left on; --retire-unlisted turns them off)'}: ${otherActiveZones.map((zone) => zone.name).join(', ')}`,
    );
    if (retireUnlisted) {
      summary.retiredZones = otherActiveZones.length;
      if (apply) {
        await tx.deliveryZone.updateMany({
          where: { id: { in: otherActiveZones.map((zone) => zone.id) } },
          data: { isActive: false },
        });
      }
    }
  }

  if (apply) {
    await tx.auditLog.create({
      data: {
        action: 'menu.officialSync',
        entityType: 'Menu',
        entityId: branch.id,
        after: { ...summary, retireUnlisted } as unknown as Prisma.InputJsonValue,
      },
    });
  }
  return summary;
}
