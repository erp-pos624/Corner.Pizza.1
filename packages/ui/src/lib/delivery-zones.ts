import type { DeliveryZoneCheckDto } from '@posshope/shared';
import { money } from './pos';

export type DeliveryZoneBlock = 'PIN_REQUIRED' | 'OUT_OF_RANGE' | 'MIN_ORDER' | null;

export interface DeliveryZonePreview {
  deliveryFeeMinor: number;
  block: DeliveryZoneBlock;
  zoneName: string | null;
  usesFallbackFee: boolean;
}

/**
 * Mirrors the server's delivery-zone resolution so the ticket totals and the
 * cashier warning stay in sync while the pin moves. The order endpoint remains
 * authoritative and re-runs the same checks before persisting.
 */
export function previewDeliveryZone(params: {
  zonesCount: number;
  check: DeliveryZoneCheckDto | null | undefined;
  subtotalMinor: number;
  fallbackFee: string;
}): DeliveryZonePreview {
  const { zonesCount, check, subtotalMinor, fallbackFee } = params;

  if (zonesCount === 0) {
    return {
      deliveryFeeMinor: money(Number(fallbackFee)),
      block: null,
      zoneName: null,
      usesFallbackFee: true,
    };
  }

  if (!check) {
    return {
      deliveryFeeMinor: 0,
      block: 'PIN_REQUIRED',
      zoneName: null,
      usesFallbackFee: false,
    };
  }

  const deliveryFeeMinor = money(Number(check.deliveryFee));

  if (!check.inside || !check.zone) {
    return {
      deliveryFeeMinor,
      block: 'OUT_OF_RANGE',
      zoneName: check.nearestZoneName,
      usesFallbackFee: false,
    };
  }

  return {
    deliveryFeeMinor,
    block: subtotalMinor < money(Number(check.minOrderAmount)) ? 'MIN_ORDER' : null,
    zoneName: check.zone.name,
    usesFallbackFee: false,
  };
}

export function formatDistanceMeters(meters: number): string {
  return meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(1)} km`;
}
