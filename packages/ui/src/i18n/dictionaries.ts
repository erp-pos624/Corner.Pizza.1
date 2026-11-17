import type { Language } from '@posshope/shared';
import enAuth from './locales/en/auth.json';
import enBranches from './locales/en/branches.json';
import enCommon from './locales/en/common.json';
import enCustomers from './locales/en/customers.json';
import enDashboard from './locales/en/dashboard.json';
import enDelivery from './locales/en/delivery.json';
import enHr from './locales/en/hr.json';
import enInventory from './locales/en/inventory.json';
import enInvoices from './locales/en/invoices.json';
import enKitchen from './locales/en/kitchen.json';
import enMenu from './locales/en/menu.json';
import enNav from './locales/en/nav.json';
import enOnlineStore from './locales/en/online.json';
import enOrders from './locales/en/orders.json';
import enPos from './locales/en/pos.json';
import enReports from './locales/en/reports.json';
import enSettings from './locales/en/settings.json';
import enShifts from './locales/en/shifts.json';
import enTables from './locales/en/tables.json';
import enUsers from './locales/en/users.json';
import arAuth from './locales/ar/auth.json';
import arBranches from './locales/ar/branches.json';
import arCommon from './locales/ar/common.json';
import arCustomers from './locales/ar/customers.json';
import arDashboard from './locales/ar/dashboard.json';
import arDelivery from './locales/ar/delivery.json';
import arHr from './locales/ar/hr.json';
import arInventory from './locales/ar/inventory.json';
import arInvoices from './locales/ar/invoices.json';
import arKitchen from './locales/ar/kitchen.json';
import arMenu from './locales/ar/menu.json';
import arNav from './locales/ar/nav.json';
import arOnlineStore from './locales/ar/online.json';
import arOrders from './locales/ar/orders.json';
import arPos from './locales/ar/pos.json';
import arReports from './locales/ar/reports.json';
import arSettings from './locales/ar/settings.json';
import arShifts from './locales/ar/shifts.json';
import arTables from './locales/ar/tables.json';
import arUsers from './locales/ar/users.json';

/**
 * `common.json` is merged at the root so shared keys stay short (`actions.save`)
 * while page namespaces remain explicit (`menu.items.title`).
 */
const en = {
  ...enCommon,
  auth: enAuth,
  nav: enNav,
  orders: enOrders,
  invoices: enInvoices,
  menu: enMenu,
  pos: enPos,
  inventory: enInventory,
  onlineStore: enOnlineStore,
  kitchen: enKitchen,
  dashboard: enDashboard,
  delivery: enDelivery,
  reports: enReports,
  customers: enCustomers,
  users: enUsers,
  settings: enSettings,
  shifts: enShifts,
  tables: enTables,
  branches: enBranches,
  hr: enHr,
};
const ar = {
  ...arCommon,
  auth: arAuth,
  nav: arNav,
  orders: arOrders,
  invoices: arInvoices,
  menu: arMenu,
  pos: arPos,
  inventory: arInventory,
  onlineStore: arOnlineStore,
  kitchen: arKitchen,
  dashboard: arDashboard,
  delivery: arDelivery,
  reports: arReports,
  customers: arCustomers,
  users: arUsers,
  settings: arSettings,
  shifts: arShifts,
  tables: arTables,
  branches: arBranches,
  hr: arHr,
};

export const dictionaries = { en, ar };

export type Dictionary = typeof en;

type LeafPaths<T> = {
  [K in keyof T & string]: T[K] extends string ? K : `${K}.${LeafPaths<T[K]>}`;
}[keyof T & string];

/** Dot path of every English dictionary leaf, e.g. `nav.items.orders`. */
export type TranslationKey = LeafPaths<Dictionary>;

export type TranslationVars = Record<string, string | number | null | undefined>;

function lookup(dictionary: unknown, key: string): string | undefined {
  let cursor: unknown = dictionary;
  for (const segment of key.split('.')) {
    if (cursor === null || typeof cursor !== 'object') return undefined;
    cursor = (cursor as Record<string, unknown>)[segment];
  }
  return typeof cursor === 'string' ? cursor : undefined;
}

function interpolate(template: string, vars?: TranslationVars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, token: string) => {
    const value = vars[token];
    return value === undefined || value === null ? match : String(value);
  });
}

/**
 * Looks the key up in the active language, then English. Unknown keys return
 * the key itself so a missing translation is obvious in the UI instead of blank.
 */
export function translate(
  language: Language,
  key: TranslationKey,
  vars?: TranslationVars,
): string {
  const localized = lookup(dictionaries[language], key) ?? lookup(dictionaries.en, key);
  return interpolate(localized ?? key, vars);
}

export type Translate = (key: TranslationKey, vars?: TranslationVars) => string;
