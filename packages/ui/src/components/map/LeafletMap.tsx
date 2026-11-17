import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect, useRef, type ReactElement } from 'react';

export interface GeoPoint {
  lat: number;
  lng: number;
}

/** Cairo city centre; used until a branch stores its own coordinates. */
export const DEFAULT_MAP_CENTER: GeoPoint = { lat: 30.0444, lng: 31.2357 };

export interface MapZoneCircle {
  id: string;
  name: string;
  centerLat: number;
  centerLng: number;
  radiusInMeters: number;
  badge: string;
  isActive?: boolean;
  highlighted?: boolean;
}

export interface LeafletMapProps {
  center: GeoPoint;
  zoom?: number;
  zones?: MapZoneCircle[];
  point?: GeoPoint | null;
  onPick?: (point: GeoPoint) => void;
  fitToZones?: boolean;
  /** Changing this value re-fits the map to all zones (e.g. on branch change). */
  fitKey?: string;
  className?: string;
  ariaLabel: string;
}

/** OpenStreetMap tile layer; theming happens through CSS on `.leaflet-tile-pane`. */
const TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors';

function offsetFromCenter(
  lat: number,
  lng: number,
  meters: number,
  bearingDegrees: number,
): GeoPoint {
  const bearing = (bearingDegrees * Math.PI) / 180;
  const dLat = (meters * Math.cos(bearing)) / 111_320;
  const dLng = (meters * Math.sin(bearing)) / (111_320 * Math.cos((lat * Math.PI) / 180));
  return { lat: lat + dLat, lng: lng + dLng };
}

function circleClassName(zone: MapZoneCircle): string {
  return [
    'zone-ring',
    zone.highlighted ? 'zone-ring--active' : '',
    zone.isActive === false ? 'zone-ring--inactive' : '',
  ]
    .filter(Boolean)
    .join(' ');
}

function badgeClassName(zone: MapZoneCircle): string {
  return [
    'zone-price-badge',
    zone.highlighted ? 'zone-price-badge--active' : '',
    zone.isActive === false ? 'zone-price-badge--inactive' : '',
  ]
    .filter(Boolean)
    .join(' ');
}

export function LeafletMap({
  center,
  zoom,
  zones = [],
  point = null,
  onPick,
  fitToZones = false,
  fitKey = '',
  className,
  ariaLabel,
}: LeafletMapProps): ReactElement {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const overlayRef = useRef<L.LayerGroup | null>(null);
  const onPickRef = useRef(onPick);
  const initialCenterRef = useRef(center);
  const initialZoomRef = useRef(zoom ?? 13);
  const firstCenterEffectRef = useRef(true);
  const zonesRef = useRef(zones);
  onPickRef.current = onPick;
  zonesRef.current = zones;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const map = L.map(container, {
      zoomControl: true,
      attributionControl: true,
      minZoom: 3,
    });
    mapRef.current = map;
    overlayRef.current = L.layerGroup().addTo(map);

    L.tileLayer(TILE_URL, {
      maxZoom: 19,
      attribution: TILE_ATTRIBUTION,
    }).addTo(map);

    map.setView(
      [initialCenterRef.current.lat, initialCenterRef.current.lng],
      initialZoomRef.current,
    );

    const handleClick = (event: L.LeafletMouseEvent): void => {
      onPickRef.current?.({ lat: event.latlng.lat, lng: event.latlng.lng });
    };
    map.on('click', handleClick);

    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(container);

    return () => {
      observer.disconnect();
      map.off('click', handleClick);
      map.remove();
      mapRef.current = null;
      overlayRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (firstCenterEffectRef.current) {
      firstCenterEffectRef.current = false;
      return;
    }
    const map = mapRef.current;
    if (!map) return;
    map.setView([center.lat, center.lng], zoom ?? map.getZoom(), { animate: false });
  }, [center.lat, center.lng, zoom]);

  useEffect(() => {
    const map = mapRef.current;
    const overlay = overlayRef.current;
    if (!map || !overlay) return;

    overlay.clearLayers();

    for (const zone of zones) {
      L.circle([zone.centerLat, zone.centerLng], {
        radius: zone.radiusInMeters,
        interactive: false,
        className: circleClassName(zone),
      }).addTo(overlay);

      const badge = document.createElement('span');
      badge.className = badgeClassName(zone);
      badge.textContent = zone.badge;
      badge.title = `${zone.name} · ${zone.badge}`;

      const anchor = offsetFromCenter(
        zone.centerLat,
        zone.centerLng,
        zone.radiusInMeters * 1.04,
        120,
      );
      L.marker([anchor.lat, anchor.lng], {
        icon: L.divIcon({ className: 'zone-price-icon', html: badge, iconSize: [0, 0] }),
        interactive: false,
        keyboard: false,
      }).addTo(overlay);
    }

    if (point) {
      const pin = document.createElement('span');
      pin.className = 'map-pin';
      L.marker([point.lat, point.lng], {
        icon: L.divIcon({ className: 'map-pin-icon', html: pin, iconSize: [0, 0] }),
        interactive: false,
        keyboard: false,
        zIndexOffset: 800,
      }).addTo(overlay);
    }
  }, [zones, point]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !fitToZones) return;
    const currentZones = zonesRef.current;
    if (currentZones.length === 0) return;

    const bounds = L.latLngBounds([]);
    for (const zone of currentZones) {
      bounds.extend(L.latLng(zone.centerLat, zone.centerLng).toBounds(zone.radiusInMeters * 2));
    }
    map.fitBounds(bounds, { padding: [28, 28], maxZoom: 16, animate: false });
  }, [fitKey, fitToZones]);

  return <div ref={containerRef} className={className} aria-label={ariaLabel} />;
}
