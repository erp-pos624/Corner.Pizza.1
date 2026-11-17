import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MapPinned, Pencil, Plus, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactElement } from 'react';
import {
  deliveryZoneCreateSchema,
  deliveryZoneUpdateSchema,
  type BranchDto,
  type DeliveryZoneDto,
} from '@posshope/shared';
import { useI18n } from '../../i18n';
import { api } from '../../lib/api';
import { ALL_BRANCHES } from '../../lib/branch-scope';
import { formatMoney, formatNumber } from '../../lib/format';
import { cn } from '../../lib/utils';
import { useAuthStore } from '../../store/auth';
import { useBranchScopeStore } from '../../store/branch';
import { useLanguageStore } from '../../store/language';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { ConfirmDialog } from '../ui/confirm-dialog';
import { Input, Select } from '../ui/input';
import { Label } from '../ui/label';
import { Skeleton } from '../ui/skeleton';
import { EmptyPanel, ErrorState } from '../ui/states';
import { toast } from '../ui/toast';
import { Toggle } from '../ui/toggle';
import { DEFAULT_MAP_CENTER, LeafletMap, type MapZoneCircle } from '../map/LeafletMap';

interface ZoneDraft {
  id: string | null;
  name: string;
  centerLat: string;
  centerLng: string;
  radiusInMeters: string;
  deliveryFee: string;
  minOrderAmount: string;
  isActive: boolean;
}

function branchLabel(branch: BranchDto, language: 'en' | 'ar'): string {
  return language === 'ar' && branch.nameAr ? branch.nameAr : branch.name;
}

export function DeliveryZonesTab(): ReactElement {
  const { t } = useI18n();
  const language = useLanguageStore((state) => state.language);
  const queryClient = useQueryClient();
  const scope = useBranchScopeStore((state) => state.scope);
  const adminBranchId = useAuthStore((state) => state.user?.branchId ?? null);

  const [branchId, setBranchId] = useState('');
  const [draft, setDraft] = useState<ZoneDraft | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeliveryZoneDto | null>(null);

  const branchesQuery = useQuery({
    queryKey: ['branches'],
    queryFn: () => api.branches.list(),
    staleTime: 60_000,
  });
  const settingsQuery = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.settings.get(),
    staleTime: 60_000,
  });

  const branchList = useMemo(() => branchesQuery.data ?? [], [branchesQuery.data]);
  const selectedBranch = branchList.find((branch) => branch.id === branchId) ?? null;

  useEffect(() => {
    if (branchId && branchList.some((branch) => branch.id === branchId)) return;
    const preferred = scope !== ALL_BRANCHES ? scope : adminBranchId;
    const next =
      branchList.find((branch) => branch.id === preferred)?.id ?? branchList[0]?.id ?? '';
    if (next && next !== branchId) setBranchId(next);
  }, [branchList, branchId, scope, adminBranchId]);

  useEffect(() => {
    setDraft(null);
    setFormError(null);
    setHighlightedId(null);
  }, [branchId]);

  const zonesQuery = useQuery({
    queryKey: ['delivery-zones', branchId, 'admin'],
    queryFn: () => api.deliveryZones.list({ branchId, includeInactive: true }),
    enabled: Boolean(branchId),
  });

  const zones = useMemo(() => zonesQuery.data ?? [], [zonesQuery.data]);

  const invalidate = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['delivery-zones'] });
    void queryClient.invalidateQueries({ queryKey: ['delivery-check'] });
    void queryClient.invalidateQueries({ queryKey: ['delivery'] });
  };

  const save = useMutation({
    mutationFn: () => {
      if (!draft) throw new Error(t('delivery.zones.errors.save'));
      const base = {
        name: draft.name.trim(),
        centerLat: Number(draft.centerLat),
        centerLng: Number(draft.centerLng),
        radiusInMeters: Math.round(Number(draft.radiusInMeters)),
        deliveryFee: draft.deliveryFee.trim() || '0',
        minOrderAmount: draft.minOrderAmount.trim() || '0',
        isActive: draft.isActive,
      };
      if (draft.id) {
        const parsed = deliveryZoneUpdateSchema.safeParse(base);
        if (!parsed.success) {
          throw new Error(parsed.error.issues[0]?.message ?? t('delivery.zones.errors.save'));
        }
        return api.deliveryZones.update(draft.id, parsed.data);
      }
      const parsed = deliveryZoneCreateSchema.safeParse({ ...base, branchId });
      if (!parsed.success) {
        throw new Error(parsed.error.issues[0]?.message ?? t('delivery.zones.errors.save'));
      }
      return api.deliveryZones.create(parsed.data);
    },
    onSuccess: (zone) => {
      toast.success(
        draft?.id ? t('delivery.zones.toasts.updated') : t('delivery.zones.toasts.created'),
        zone.name,
      );
      setDraft(null);
      setFormError(null);
      setHighlightedId(zone.id);
      invalidate();
    },
    onError: (error) => {
      setFormError(error instanceof Error ? error.message : t('delivery.zones.errors.save'));
    },
  });

  const toggleActive = useMutation({
    mutationFn: (zone: DeliveryZoneDto) =>
      api.deliveryZones.update(zone.id, { isActive: !zone.isActive }),
    onSuccess: (zone) => {
      toast.success(t('delivery.zones.toasts.updated'), zone.name);
      invalidate();
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : t('delivery.zones.errors.save'));
    },
  });

  const remove = useMutation({
    mutationFn: (zone: DeliveryZoneDto) => api.deliveryZones.remove(zone.id),
    onSuccess: (_result, zone) => {
      toast.success(t('delivery.zones.delete.success'), zone.name);
      setDeleteTarget(null);
      if (highlightedId === zone.id) setHighlightedId(null);
      if (draft?.id === zone.id) setDraft(null);
      invalidate();
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : t('delivery.zones.errors.delete'));
      setDeleteTarget(null);
    },
  });

  const startCreate = (): void => {
    const center =
      selectedBranch?.latitude != null && selectedBranch.longitude != null
        ? { lat: selectedBranch.latitude, lng: selectedBranch.longitude }
        : DEFAULT_MAP_CENTER;
    setDraft({
      id: null,
      name: '',
      centerLat: center.lat.toFixed(6),
      centerLng: center.lng.toFixed(6),
      radiusInMeters: '1500',
      deliveryFee: settingsQuery.data?.deliveryFee ?? '0.00',
      minOrderAmount: '0.00',
      isActive: true,
    });
    setFormError(null);
    setHighlightedId(null);
  };

  const startEdit = (zone: DeliveryZoneDto): void => {
    setDraft({
      id: zone.id,
      name: zone.name,
      centerLat: String(zone.centerLat),
      centerLng: String(zone.centerLng),
      radiusInMeters: String(zone.radiusInMeters),
      deliveryFee: zone.deliveryFee,
      minOrderAmount: zone.minOrderAmount,
      isActive: zone.isActive,
    });
    setFormError(null);
    setHighlightedId(zone.id);
  };

  const updateDraft = (patch: Partial<ZoneDraft>): void => {
    setDraft((current) => (current ? { ...current, ...patch } : current));
  };

  const pickCenter = (point: { lat: number; lng: number }): void => {
    updateDraft({ centerLat: point.lat.toFixed(6), centerLng: point.lng.toFixed(6) });
  };

  const draftLatitude = Number(draft?.centerLat);
  const draftLongitude = Number(draft?.centerLng);
  const draftRadius = Number(draft?.radiusInMeters);
  const draftHasCenter =
    Number.isFinite(draftLatitude) &&
    Number.isFinite(draftLongitude) &&
    Math.abs(draftLatitude) <= 90 &&
    Math.abs(draftLongitude) <= 180;

  const mapZones = useMemo<MapZoneCircle[]>(() => {
    const mapped: MapZoneCircle[] = zones.map((zone) => ({
      id: zone.id,
      name: zone.name,
      centerLat: zone.centerLat,
      centerLng: zone.centerLng,
      radiusInMeters: zone.radiusInMeters,
      badge: formatMoney(zone.deliveryFee),
      isActive: zone.isActive,
      highlighted: zone.id === (draft?.id ?? highlightedId),
    }));
    if (!draft || !draftHasCenter) return mapped;
    return [
      ...mapped.filter((zone) => zone.id !== draft.id),
      {
        id: draft.id ?? 'draft',
        name: draft.name.trim() || t('delivery.zones.form.untitled'),
        centerLat: draftLatitude,
        centerLng: draftLongitude,
        radiusInMeters: Number.isFinite(draftRadius) && draftRadius > 0 ? draftRadius : 100,
        badge: formatMoney(draft.deliveryFee.trim() || '0'),
        isActive: draft.isActive,
        highlighted: true,
      },
    ];
  }, [zones, draft, highlightedId, draftHasCenter, draftLatitude, draftLongitude, draftRadius, t]);

  const mapCenter = useMemo(() => {
    if (draft && draftHasCenter) return { lat: draftLatitude, lng: draftLongitude };
    const highlighted = zones.find((zone) => zone.id === highlightedId);
    if (highlighted) return { lat: highlighted.centerLat, lng: highlighted.centerLng };
    if (selectedBranch?.latitude != null && selectedBranch.longitude != null) {
      return { lat: selectedBranch.latitude, lng: selectedBranch.longitude };
    }
    return DEFAULT_MAP_CENTER;
  }, [draft, draftHasCenter, draftLatitude, draftLongitude, zones, highlightedId, selectedBranch]);

  const flatFee = settingsQuery.data ? formatMoney(settingsQuery.data.deliveryFee) : '—';

  const formCard = draft ? (
    <form
      className="rounded-xl border border-border bg-card p-3 shadow-sm"
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate();
      }}
    >
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-secondary/10 text-secondary">
          <MapPinned className="h-4 w-4" />
        </span>
        <h3 className="text-sm font-semibold">
          {draft.id ? t('delivery.zones.form.editTitle') : t('delivery.zones.form.createTitle')}
        </h3>
      </div>

      <div className="mt-3 space-y-2.5">
        <div className="space-y-1">
          <Label htmlFor="zone-name" className="text-xs">
            {t('delivery.zones.form.name')}
          </Label>
          <Input
            id="zone-name"
            value={draft.name}
            onChange={(event) => updateDraft({ name: event.target.value })}
            placeholder={t('delivery.zones.form.namePlaceholder')}
            maxLength={80}
            autoFocus
            required
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label htmlFor="zone-lat" className="text-xs">
              {t('delivery.zones.form.lat')}
            </Label>
            <Input
              id="zone-lat"
              type="number"
              step="any"
              inputMode="decimal"
              value={draft.centerLat}
              onChange={(event) => updateDraft({ centerLat: event.target.value })}
              dir="ltr"
              required
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="zone-lng" className="text-xs">
              {t('delivery.zones.form.lng')}
            </Label>
            <Input
              id="zone-lng"
              type="number"
              step="any"
              inputMode="decimal"
              value={draft.centerLng}
              onChange={(event) => updateDraft({ centerLng: event.target.value })}
              dir="ltr"
              required
            />
          </div>
        </div>

        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <Label htmlFor="zone-radius" className="text-xs">
              {t('delivery.zones.form.radius')}
            </Label>
            <span className="numeric text-[11px] text-muted-foreground">
              {draftRadius > 0 ? formatNumber(draftRadius) : '—'}
            </span>
          </div>
          <Input
            id="zone-radius"
            type="number"
            min="100"
            max="50000"
            step="50"
            value={draft.radiusInMeters}
            onChange={(event) => updateDraft({ radiusInMeters: event.target.value })}
            dir="ltr"
            required
          />
          <input
            type="range"
            min="100"
            max="10000"
            step="100"
            value={draftRadius > 0 ? Math.min(draftRadius, 10000) : 1500}
            onChange={(event) => updateDraft({ radiusInMeters: event.target.value })}
            aria-label={t('delivery.zones.form.radius')}
            className="w-full accent-secondary"
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label htmlFor="zone-fee" className="text-xs">
              {t('delivery.zones.form.fee')}
            </Label>
            <Input
              id="zone-fee"
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={draft.deliveryFee}
              onChange={(event) => updateDraft({ deliveryFee: event.target.value })}
              dir="ltr"
              required
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="zone-min-order" className="text-xs">
              {t('delivery.zones.form.minOrder')}
            </Label>
            <Input
              id="zone-min-order"
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={draft.minOrderAmount}
              onChange={(event) => updateDraft({ minOrderAmount: event.target.value })}
              dir="ltr"
            />
          </div>
        </div>

        <label className="flex cursor-pointer items-start gap-2 rounded-md border border-border bg-muted/30 px-2 py-1.5 text-[11px]">
          <input
            type="checkbox"
            className="mt-0.5 h-3.5 w-3.5 rounded border-input"
            checked={draft.isActive}
            onChange={(event) => updateDraft({ isActive: event.target.checked })}
          />
          <span>
            <span className="font-semibold">{t('delivery.zones.form.active')}</span>
            <span className="mt-0.5 block text-muted-foreground">
              {t('delivery.zones.form.activeHint')}
            </span>
          </span>
        </label>

        <p className="rounded-md border border-dashed border-border bg-muted/20 px-2 py-1.5 text-[11px] text-muted-foreground">
          {t('delivery.zones.form.pickHint')}
        </p>

        {formError ? (
          <p
            className="rounded-md border border-destructive/30 bg-destructive/5 px-2 py-1.5 text-[11px] text-destructive"
            role="alert"
          >
            {formError}
          </p>
        ) : null}
      </div>

      <div className="mt-3 flex items-center justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            setDraft(null);
            setFormError(null);
          }}
          disabled={save.isPending}
        >
          {t('delivery.zones.form.cancel')}
        </Button>
        <Button type="submit" size="sm" disabled={save.isPending || draft.name.trim().length < 2}>
          {save.isPending
            ? t('actions.saving')
            : draft.id
              ? t('delivery.zones.form.save')
              : t('delivery.zones.form.create')}
        </Button>
      </div>
    </form>
  ) : null;

  const header = (
    <div className="rounded-xl border border-border bg-card shadow-sm">
      <div className="flex flex-wrap items-center gap-2 p-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-secondary/10 text-secondary">
          <MapPinned className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold">{t('delivery.zones.title')}</h2>
          <p className="text-[11px] text-muted-foreground">
            {zonesQuery.data
              ? t('delivery.zones.count', { count: formatNumber(zones.length) })
              : t('states.loading')}
          </p>
        </div>
        {branchList.length > 0 ? (
          <Select
            value={branchId}
            onChange={(event) => setBranchId(event.target.value)}
            aria-label={t('delivery.zones.branch')}
            className="h-9 w-48"
          >
            {branchList.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branchLabel(branch, language)}
              </option>
            ))}
          </Select>
        ) : null}
        <Button size="sm" onClick={startCreate} disabled={!branchId}>
          <Plus className="h-4 w-4" />
          {t('delivery.zones.new')}
        </Button>
      </div>
      {zonesQuery.data && zones.length === 0 ? (
        <p className="border-t border-border px-3 py-2 text-[11px] text-muted-foreground">
          {t('delivery.zones.flatFeeHint', { fee: flatFee })}
        </p>
      ) : null}
    </div>
  );

  const zonesPanel = zonesQuery.isLoading ? (
    <div className="space-y-2 p-3">
      {Array.from({ length: 3 }, (_, index) => (
        <Skeleton key={index} className="h-24 w-full" />
      ))}
    </div>
  ) : zonesQuery.isError ? (
    <div className="p-3">
      <ErrorState
        title={t('delivery.zones.errors.load')}
        message={zonesQuery.error instanceof Error ? zonesQuery.error.message : undefined}
        onRetry={() => void zonesQuery.refetch()}
      />
    </div>
  ) : zones.length === 0 ? (
    <EmptyPanel
      title={t('delivery.zones.emptyTitle')}
      message={t('delivery.zones.emptyMessage')}
      action={
        <Button size="sm" onClick={startCreate} disabled={!branchId}>
          <Plus className="h-4 w-4" />
          {t('delivery.zones.new')}
        </Button>
      }
    />
  ) : (
    <div className="max-h-[520px] space-y-2 overflow-y-auto p-3">
      {zones.map((zone) => {
        const selected = zone.id === (draft?.id ?? highlightedId);
        return (
          <article
            key={zone.id}
            onClick={() => setHighlightedId(zone.id)}
            className={cn(
              'cursor-pointer rounded-xl border border-border bg-card p-3 shadow-sm transition-colors',
              selected && 'border-secondary/60 bg-secondary/5',
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{zone.name}</p>
                <p className="numeric mt-0.5 text-[11px] text-muted-foreground">
                  {t('delivery.zones.card.radius', {
                    radius: formatNumber(zone.radiusInMeters),
                  })}{' '}
                  ·{' '}
                  {t('delivery.zones.card.minOrder', {
                    amount: formatMoney(zone.minOrderAmount),
                  })}
                </p>
              </div>
              <Badge variant={zone.isActive ? 'success' : 'outline'}>
                {zone.isActive
                  ? t('delivery.zones.card.active')
                  : t('delivery.zones.card.inactive')}
              </Badge>
            </div>
            <div className="mt-2 flex items-center justify-between gap-2">
              <span className="numeric text-sm font-bold text-secondary">
                {formatMoney(zone.deliveryFee)}
              </span>
              <div className="flex items-center gap-1">
                <Toggle
                  checked={zone.isActive}
                  onChange={() => toggleActive.mutate(zone)}
                  label={
                    zone.isActive
                      ? t('delivery.zones.card.active')
                      : t('delivery.zones.card.inactive')
                  }
                  disabled={toggleActive.isPending}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(event) => {
                    event.stopPropagation();
                    startEdit(zone);
                  }}
                  aria-label={t('delivery.zones.form.editTitle')}
                  title={t('delivery.zones.form.editTitle')}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(event) => {
                    event.stopPropagation();
                    setDeleteTarget(zone);
                  }}
                  aria-label={t('delivery.zones.delete.confirm')}
                  title={t('delivery.zones.delete.confirm')}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );

  return (
    <div className="space-y-4">
      {header}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <LeafletMap
            center={mapCenter}
            zoom={13}
            zones={mapZones}
            onPick={draft ? pickCenter : undefined}
            fitToZones={zones.length > 0}
            fitKey={`${branchId}:${zones.length}`}
            className="h-[420px] w-full xl:h-[560px]"
            ariaLabel={t('delivery.zones.mapAria')}
          />
        </div>

        <div className="space-y-3">
          {formCard}
          <div className="rounded-xl border border-border bg-card shadow-sm">
            <div className="flex items-center gap-2 border-b border-border p-3">
              <span className="text-sm font-semibold">{t('delivery.zones.title')}</span>
              {zonesQuery.data ? (
                <span className="numeric ms-auto text-xs text-muted-foreground">
                  {formatNumber(zones.length)}
                </span>
              ) : null}
            </div>
            {zonesPanel}
          </div>
          {branchesQuery.isError ? (
            <p className="rounded-lg border border-destructive/25 bg-destructive/5 px-3 py-2 text-[11px] text-destructive">
              {t('delivery.zones.errors.loadBranches')}
            </p>
          ) : null}
        </div>
      </div>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title={t('delivery.zones.delete.title')}
        description={t('delivery.zones.delete.message', {
          name: deleteTarget?.name ?? '',
        })}
        confirmLabel={t('delivery.zones.delete.confirm')}
        destructive
        busy={remove.isPending}
        onConfirm={() => {
          if (deleteTarget) remove.mutate(deleteTarget);
        }}
      />
    </div>
  );
}
