import { AlertTriangle, BadgeCheck, Info, MapPin } from 'lucide-react';
import { useMemo, type ReactElement } from 'react';
import type { DeliveryZoneCheckDto, DeliveryZoneDto } from '@posshope/shared';
import { useI18n } from '../../i18n';
import type { DeliveryZonePreview } from '../../lib/delivery-zones';
import { formatDistanceMeters } from '../../lib/delivery-zones';
import { formatMoney } from '../../lib/format';
import { fromMinor } from '../../lib/pos';
import { cn } from '../../lib/utils';
import {
  DEFAULT_MAP_CENTER,
  LeafletMap,
  type GeoPoint,
  type MapZoneCircle,
} from '../map/LeafletMap';

interface DeliveryZonePickerProps {
  branchCenter: GeoPoint | null;
  zones: DeliveryZoneDto[];
  point: GeoPoint | null;
  onPick: (point: GeoPoint) => void;
  preview: DeliveryZonePreview;
  check: DeliveryZoneCheckDto | null;
  checking: boolean;
}

function feeLabel(minor: number): string {
  return formatMoney(fromMinor(minor));
}

export function DeliveryZonePicker({
  branchCenter,
  zones,
  point,
  onPick,
  preview,
  check,
  checking,
}: DeliveryZonePickerProps): ReactElement {
  const { t } = useI18n();

  const mapZones = useMemo<MapZoneCircle[]>(
    () =>
      zones.map((zone) => ({
        id: zone.id,
        name: zone.name,
        centerLat: zone.centerLat,
        centerLng: zone.centerLng,
        radiusInMeters: zone.radiusInMeters,
        badge: formatMoney(zone.deliveryFee),
        highlighted: zone.id === check?.zone?.id,
      })),
    [zones, check?.zone?.id],
  );

  const center = point ?? branchCenter ?? DEFAULT_MAP_CENTER;
  const fitKey = zones.map((zone) => zone.id).join(',');

  let status: ReactElement;
  if (checking && !check) {
    status = (
      <p className="rounded-md border border-dashed border-border bg-muted/20 px-2 py-1.5 text-[11px] text-muted-foreground">
        {t('pos.zonePicker.checking')}
      </p>
    );
  } else if (preview.usesFallbackFee) {
    status = (
      <div className="flex items-start gap-1.5 rounded-md border border-border bg-muted/30 px-2 py-1.5 text-[11px]">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="text-muted-foreground">
          {t('pos.zonePicker.fallback', { fee: feeLabel(preview.deliveryFeeMinor) })}
        </span>
      </div>
    );
  } else if (preview.block === 'PIN_REQUIRED') {
    status = (
      <div className="flex items-start gap-1.5 rounded-md border border-warning/40 bg-warning/10 px-2 py-1.5 text-[11px]">
        <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
        <span className="text-warning">{t('pos.zonePicker.pinRequired')}</span>
      </div>
    );
  } else if (preview.block === 'OUT_OF_RANGE') {
    status = (
      <div className="space-y-0.5 rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1.5 text-[11px]">
        <p className="flex items-center gap-1.5 font-semibold text-destructive">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          {t('pos.zonePicker.outOfRange')}
        </p>
        {check?.nearestZoneName && check.nearestDistanceMeters != null ? (
          <p className="text-muted-foreground">
            {t('pos.zonePicker.nearest', {
              zone: check.nearestZoneName,
              distance: formatDistanceMeters(check.nearestDistanceMeters),
            })}
          </p>
        ) : null}
      </div>
    );
  } else if (preview.block === 'MIN_ORDER') {
    status = (
      <div className="space-y-0.5 rounded-md border border-warning/40 bg-warning/10 px-2 py-1.5 text-[11px]">
        <p className="flex items-center gap-1.5 font-semibold text-warning">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          {t('pos.zonePicker.minOrder', {
            zone: preview.zoneName ?? '',
            amount: formatMoney(check?.minOrderAmount ?? '0'),
          })}
        </p>
      </div>
    );
  } else {
    status = (
      <div className="flex items-center justify-between gap-2 rounded-md border border-success/40 bg-success/10 px-2 py-1.5 text-[11px]">
        <span className="flex items-center gap-1.5 font-semibold text-success">
          <BadgeCheck className="h-3.5 w-3.5 shrink-0" />
          {t('pos.zonePicker.matched', {
            zone: preview.zoneName ?? '',
            fee: feeLabel(preview.deliveryFeeMinor),
          })}
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <div className="overflow-hidden rounded-lg border border-border">
        <LeafletMap
          center={center}
          zoom={13}
          zones={mapZones}
          point={point}
          onPick={onPick}
          fitToZones={zones.length > 0}
          fitKey={fitKey}
          className={cn('h-40 w-full')}
          ariaLabel={t('pos.zonePicker.mapAria')}
        />
      </div>
      <p className="text-[10px] text-muted-foreground">{t('pos.zonePicker.pickHint')}</p>
      {status}
    </div>
  );
}
