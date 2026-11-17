/** Great-circle helpers used for circular delivery-zone matching. */

export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface GeoZone {
  centerLat: number;
  centerLng: number;
  radiusInMeters: number;
}

export interface DeliveryZoneEvaluation<TZone extends GeoZone> {
  /** True when the point falls inside a zone, or when no zones are configured. */
  inside: boolean;
  /** Winning zone: the smallest radius that contains the point. */
  zone: TZone | null;
  /** Distance from the point to the winning zone centre, in metres. */
  distanceMeters: number | null;
  /** Closest configured zone even when the point falls outside it. */
  nearest: { zone: TZone; distanceMeters: number } | null;
}

const EARTH_RADIUS_METERS = 6_371_000;

const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;

export function haversineMeters(from: GeoPoint, to: GeoPoint): number {
  const dLat = toRadians(to.lat - from.lat);
  const dLng = toRadians(to.lng - from.lng);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(from.lat)) * Math.cos(toRadians(to.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(a)));
}

export function isPointInZone(point: GeoPoint, zone: GeoZone): boolean {
  return (
    haversineMeters(point, { lat: zone.centerLat, lng: zone.centerLng }) <= zone.radiusInMeters
  );
}

/**
 * Matches a point against a branch's active zones.
 *
 * Overlapping zones resolve to the smallest radius (the most specific
 * catchment). An empty zone list means "no zone rules configured" and reports
 * `inside: true` with `zone: null`, so the legacy flat delivery fee keeps
 * working for branches that have not drawn any zones yet.
 */
export function evaluateDeliveryZone<TZone extends GeoZone>(
  point: GeoPoint,
  zones: readonly TZone[],
): DeliveryZoneEvaluation<TZone> {
  if (zones.length === 0) {
    return { inside: true, zone: null, distanceMeters: null, nearest: null };
  }

  let match: { zone: TZone; distanceMeters: number } | null = null;
  let nearest: { zone: TZone; distanceMeters: number } | null = null;

  for (const zone of zones) {
    const distanceMeters = haversineMeters(point, { lat: zone.centerLat, lng: zone.centerLng });
    if (!nearest || distanceMeters < nearest.distanceMeters) {
      nearest = { zone, distanceMeters };
    }
    if (distanceMeters > zone.radiusInMeters) continue;
    if (!match || zone.radiusInMeters < match.zone.radiusInMeters) {
      match = { zone, distanceMeters };
    }
  }

  return {
    inside: match !== null,
    zone: match?.zone ?? null,
    distanceMeters: match?.distanceMeters ?? null,
    nearest,
  };
}
