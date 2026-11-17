import type { PublicZoneDto } from '@posshope/shared';
import L from 'leaflet';
import { LocateFixed } from 'lucide-react';
import { useEffect, useRef, useState, type ReactElement } from 'react';
import { useI18n } from '../i18n';
import type { DeliveryPoint } from '../store/cart';
import { Spinner } from './ui';

/**
 * Map for choosing the delivery point. Tap the map (or use the device's
 * location) to drop the pin; the restaurant's delivery zones are drawn so it
 * is obvious where delivery reaches.
 */
export function LocationPicker({
  center,
  zones,
  value,
  onChange,
}: {
  center: DeliveryPoint;
  zones: PublicZoneDto[];
  value: DeliveryPoint | null;
  onChange: (point: DeliveryPoint) => void;
}): ReactElement {
  const { t } = useI18n();
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const marker = useRef<L.CircleMarker | null>(null);
  const zoneLayer = useRef<L.LayerGroup | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);

  useEffect(() => {
    if (!container.current || map.current) return;
    const instance = L.map(container.current, {
      center: [center.lat, center.lng],
      zoom: 13,
      scrollWheelZoom: false,
    });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(instance);
    instance.on('click', (event: L.LeafletMouseEvent) =>
      onChangeRef.current({ lat: event.latlng.lat, lng: event.latlng.lng }),
    );
    zoneLayer.current = L.layerGroup().addTo(instance);
    map.current = instance;
    return () => {
      instance.remove();
      map.current = null;
      marker.current = null;
    };
    // The map is created once; later centre changes are handled by the pin.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const layer = zoneLayer.current;
    if (!layer) return;
    layer.clearLayers();
    for (const zone of zones) {
      L.circle([zone.centerLat, zone.centerLng], {
        radius: zone.radiusInMeters,
        color: '#a32026',
        weight: 1.5,
        fillColor: '#a32026',
        fillOpacity: 0.08,
        interactive: false,
      }).addTo(layer);
    }
  }, [zones]);

  useEffect(() => {
    const instance = map.current;
    if (!instance) return;
    if (!value) {
      marker.current?.remove();
      marker.current = null;
      return;
    }
    if (!marker.current) {
      marker.current = L.circleMarker([value.lat, value.lng], {
        radius: 10,
        color: '#15110e',
        weight: 3,
        fillColor: '#a32026',
        fillOpacity: 1,
        interactive: false,
      }).addTo(instance);
    } else {
      marker.current.setLatLng([value.lat, value.lng]);
    }
    instance.panTo([value.lat, value.lng]);
  }, [value]);

  const locate = (): void => {
    if (!('geolocation' in navigator)) {
      setGeoError(t('location.noGeo'));
      return;
    }
    setLocating(true);
    setGeoError(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false);
        onChange({ lat: position.coords.latitude, lng: position.coords.longitude });
        map.current?.setView([position.coords.latitude, position.coords.longitude], 16);
      },
      () => {
        setLocating(false);
        setGeoError(t('location.geoError'));
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  };

  return (
    <div>
      <div
        ref={container}
        className="h-64 w-full sm:h-72"
        role="application"
        aria-label={t('location.mapAria')}
      />
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button type="button" onClick={locate} disabled={locating} className="btn-ghost min-h-10 text-sm">
          {locating ? <Spinner /> : <LocateFixed className="h-4 w-4" />}
          {t('location.useMine')}
        </button>
        <p className="text-sm text-cream-faint">
          {value ? t('location.pinSet') : t('location.tapMap')}
        </p>
      </div>
      {geoError ? <p className="mt-2 text-sm text-tomato">{geoError}</p> : null}
    </div>
  );
}
