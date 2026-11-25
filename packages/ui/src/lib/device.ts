/**
 * Per-device identity: what this terminal is, where it stands and what it
 * does. Captured by the first-run setup wizard and kept on this machine only
 * (renderer localStorage, which Electron keeps in the app's user-data folder).
 */
import { useSyncExternalStore } from 'react';
import type { OrderType } from '@posshope/shared';
import { saveThermalPaper, type ThermalPaper } from './receipt-paper';

export const DEVICE_TYPES = ['POS', 'KDS', 'MANAGER', 'DISPATCH'] as const;
export type DeviceType = (typeof DEVICE_TYPES)[number];

export const DEVICE_LOCATIONS = [
  'MAIN_COUNTER',
  'DOWNSTAIRS',
  'UPSTAIRS',
  'KITCHEN',
  'DELIVERY_DESK',
  'CUSTOM',
] as const;
export type DeviceLocation = (typeof DEVICE_LOCATIONS)[number];

export const DEVICE_CAPABILITIES = [
  'ORDERS',
  'SHIFTS',
  'KDS',
  'AUTO_PRINT_RECEIPTS',
  'AUTO_PRINT_KITCHEN',
  'DELIVERY_TALABAT',
] as const;
export type DeviceCapability = (typeof DEVICE_CAPABILITIES)[number];

export const START_SCREENS = ['pos', 'kitchen', 'dashboard', 'delivery', 'orders'] as const;
export type StartScreen = (typeof START_SCREENS)[number];

export interface DeviceConfig {
  version: 1;
  deviceType: DeviceType;
  location: DeviceLocation;
  /** Free text for CUSTOM, or an optional refinement such as "Till 2". */
  locationLabel: string;
  capabilities: DeviceCapability[];
  startScreen: StartScreen;
  defaultOrderType: OrderType;
  defaultChannel: 'POS' | 'TALABAT';
  paper: ThermalPaper;
  configuredAt: string;
}

const STORAGE_KEY = 'corner-device-config';

/** Defaults offered by the wizard for each kind of device. */
export function presetFor(deviceType: DeviceType): Omit<DeviceConfig, 'configuredAt' | 'version'> {
  switch (deviceType) {
    case 'KDS':
      return {
        deviceType,
        location: 'KITCHEN',
        locationLabel: '',
        capabilities: ['KDS', 'AUTO_PRINT_KITCHEN'],
        startScreen: 'kitchen',
        defaultOrderType: 'TAKEAWAY',
        defaultChannel: 'POS',
        paper: '80',
      };
    case 'MANAGER':
      return {
        deviceType,
        location: 'UPSTAIRS',
        locationLabel: '',
        capabilities: ['ORDERS', 'SHIFTS'],
        startScreen: 'dashboard',
        defaultOrderType: 'DINE_IN',
        defaultChannel: 'POS',
        paper: '80',
      };
    case 'DISPATCH':
      return {
        deviceType,
        location: 'DELIVERY_DESK',
        locationLabel: '',
        capabilities: ['ORDERS', 'DELIVERY_TALABAT', 'AUTO_PRINT_RECEIPTS'],
        startScreen: 'pos',
        defaultOrderType: 'TAKEAWAY',
        defaultChannel: 'TALABAT',
        paper: '80',
      };
    case 'POS':
    default:
      return {
        deviceType: 'POS',
        location: 'MAIN_COUNTER',
        locationLabel: '',
        capabilities: ['ORDERS', 'SHIFTS', 'AUTO_PRINT_RECEIPTS', 'AUTO_PRINT_KITCHEN'],
        startScreen: 'pos',
        defaultOrderType: 'DINE_IN',
        defaultChannel: 'POS',
        paper: '80',
      };
  }
}

function isDeviceConfig(value: unknown): value is DeviceConfig {
  if (!value || typeof value !== 'object') return false;
  const config = value as Partial<DeviceConfig>;
  return (
    config.version === 1 &&
    DEVICE_TYPES.includes(config.deviceType as DeviceType) &&
    DEVICE_LOCATIONS.includes(config.location as DeviceLocation) &&
    Array.isArray(config.capabilities) &&
    START_SCREENS.includes(config.startScreen as StartScreen)
  );
}

let cached: DeviceConfig | null | undefined;
const listeners = new Set<() => void>();

export function readDeviceConfig(): DeviceConfig | null {
  if (cached !== undefined) return cached;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    cached = isDeviceConfig(parsed) ? parsed : null;
  } catch {
    cached = null;
  }
  return cached;
}

export function saveDeviceConfig(config: Omit<DeviceConfig, 'configuredAt' | 'version'>): DeviceConfig {
  const next: DeviceConfig = {
    ...config,
    capabilities: config.capabilities.filter((capability) =>
      DEVICE_CAPABILITIES.includes(capability),
    ),
    locationLabel: config.locationLabel.trim().slice(0, 60),
    version: 1,
    configuredAt: new Date().toISOString(),
  };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Still applies for this session.
  }
  saveThermalPaper(next.paper);
  cached = next;
  listeners.forEach((listener) => listener());
  return next;
}

/** Clears the identity so the wizard runs again ("Reconfigure this terminal"). */
export function resetDeviceConfig(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing stored.
  }
  cached = null;
  listeners.forEach((listener) => listener());
}

export function hasCapability(config: DeviceConfig | null, capability: DeviceCapability): boolean {
  return Boolean(config?.capabilities.includes(capability));
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useDeviceConfig(): DeviceConfig | null {
  return useSyncExternalStore(subscribe, readDeviceConfig, () => null);
}
