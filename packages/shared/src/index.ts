/**
 * @posshope/shared
 *
 * Single source of truth for the restaurant domain constants, permission
 * matrix, DTO types, monetary helpers and Zod validation schemas used by both
 * the API server and the Electron desktop client.
 */

export * from './permissions.js';
export * from './constants.js';
export * from './i18n.js';
export * from './money.js';
export * from './geo.js';
export * from './types.js';
export * from './client.js';

export * from './schemas/common.js';
export * from './schemas/auth.js';
export * from './schemas/user.js';
export * from './schemas/menu.js';
export * from './schemas/order.js';
export * from './schemas/online.js';
export * from './schemas/kitchen.js';
export * from './schemas/inventory.js';
export * from './schemas/customer.js';
export * from './schemas/customer-account.js';
export * from './schemas/report.js';
export * from './schemas/settings.js';
export * from './schemas/operations.js';
export * from './schemas/hr.js';
export * from './schemas/expenses.js';
export * from './schemas/uploads.js';
