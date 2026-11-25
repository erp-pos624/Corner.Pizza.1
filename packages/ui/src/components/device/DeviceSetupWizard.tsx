import { ChefHat, LayoutDashboard, MonitorSmartphone, Settings2, Truck } from 'lucide-react';
import { useState, type ReactElement } from 'react';
import { ORDER_TYPES, type OrderType } from '@posshope/shared';
import { useI18n, type TranslationKey } from '../../i18n';
import {
  DEVICE_CAPABILITIES,
  DEVICE_LOCATIONS,
  DEVICE_TYPES,
  START_SCREENS,
  presetFor,
  saveDeviceConfig,
  useDeviceConfig,
  type DeviceConfig,
  type DeviceType,
} from '../../lib/device';
import { orderTypeLabel } from '../../lib/format';
import { cn } from '../../lib/utils';
import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Dialog, DialogContent } from '../ui/dialog';
import { Input, Select } from '../ui/input';
import { Label } from '../ui/label';

type Draft = Omit<DeviceConfig, 'configuredAt' | 'version'>;

const TYPE_ICONS: Record<DeviceType, typeof MonitorSmartphone> = {
  POS: MonitorSmartphone,
  KDS: ChefHat,
  MANAGER: LayoutDashboard,
  DISPATCH: Truck,
};

/** "Counter POS • Main Counter • Checkout + Receipts" */
export function useDeviceSummary(config: DeviceConfig | null): string | null {
  const { t } = useI18n();
  if (!config) return null;
  const location =
    config.location === 'CUSTOM'
      ? config.locationLabel || t('device.locations.CUSTOM')
      : `${t(`device.locations.${config.location}` as TranslationKey)}${config.locationLabel ? ` (${config.locationLabel})` : ''}`;
  const caps = config.capabilities
    .map((capability) => t(`device.capabilitiesShort.${capability}` as TranslationKey))
    .join(' + ');
  return [t(`device.typesShort.${config.deviceType}` as TranslationKey), location, caps]
    .filter(Boolean)
    .join(' • ');
}

export function DeviceSetupWizard({
  initial,
  onDone,
  onCancel,
}: {
  initial?: DeviceConfig | null;
  onDone: (config: DeviceConfig) => void;
  onCancel?: () => void;
}): ReactElement {
  const { t } = useI18n();
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<Draft>(() =>
    initial ? { ...initial } : presetFor('POS'),
  );
  const update = <K extends keyof Draft>(key: K, value: Draft[K]): void =>
    setDraft((current) => ({ ...current, [key]: value }));
  const summary = useDeviceSummary({ ...draft, version: 1, configuredAt: '' });

  const steps = [t('device.steps.type'), t('device.steps.location'), t('device.steps.workflows'), t('device.steps.review')];
  const canNext = step !== 1 || draft.location !== 'CUSTOM' || draft.locationLabel.trim().length > 0;

  return (
    <div className="space-y-5">
      <ol className="flex flex-wrap gap-2 text-xs" aria-label={t('device.title')}>
        {steps.map((label, index) => (
          <li
            key={label}
            aria-current={index === step ? 'step' : undefined}
            className={cn(
              'rounded-full border px-3 py-1',
              index === step
                ? 'border-primary bg-primary/10 font-semibold'
                : index < step
                  ? 'border-success/40 text-success'
                  : 'border-border text-muted-foreground',
            )}
          >
            {index + 1}. {label}
          </li>
        ))}
      </ol>

      {step === 0 ? (
        <section className="space-y-3">
          <h2 className="text-base font-semibold">{t('device.questions.type')}</h2>
          <div role="radiogroup" className="grid gap-3 sm:grid-cols-2">
            {DEVICE_TYPES.map((type) => {
              const Icon = TYPE_ICONS[type];
              const selected = draft.deviceType === type;
              return (
                <button
                  key={type}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setDraft({ ...presetFor(type), locationLabel: draft.locationLabel })}
                  className={cn(
                    'flex items-start gap-3 rounded-lg border p-3 text-start transition-colors',
                    selected ? 'border-primary bg-primary/10 ring-1 ring-primary' : 'border-border hover:bg-muted/40',
                  )}
                >
                  <Icon className="mt-0.5 h-5 w-5 shrink-0" />
                  <span>
                    <span className="block text-sm font-semibold">{t(`device.types.${type}` as TranslationKey)}</span>
                    <span className="block text-xs text-muted-foreground">
                      {t(`device.typeHints.${type}` as TranslationKey)}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      ) : null}

      {step === 1 ? (
        <section className="space-y-3">
          <h2 className="text-base font-semibold">{t('device.questions.location')}</h2>
          <div role="radiogroup" className="grid gap-2 sm:grid-cols-3">
            {DEVICE_LOCATIONS.map((location) => (
              <button
                key={location}
                type="button"
                role="radio"
                aria-checked={draft.location === location}
                onClick={() => update('location', location)}
                className={cn(
                  'rounded-lg border px-3 py-2 text-sm',
                  draft.location === location
                    ? 'border-primary bg-primary/10 font-semibold ring-1 ring-primary'
                    : 'border-border hover:bg-muted/40',
                )}
              >
                {t(`device.locations.${location}` as TranslationKey)}
              </button>
            ))}
          </div>
          <div className="space-y-1">
            <Label htmlFor="device-location-label" className="text-xs">
              {draft.location === 'CUSTOM' ? t('device.locationCustom') : t('device.locationExtra')}
            </Label>
            <Input
              id="device-location-label"
              value={draft.locationLabel}
              onChange={(event) => update('locationLabel', event.target.value)}
              maxLength={60}
              placeholder={t('device.locationPlaceholder')}
            />
          </div>
        </section>
      ) : null}

      {step === 2 ? (
        <section className="space-y-4">
          <h2 className="text-base font-semibold">{t('device.questions.workflows')}</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {DEVICE_CAPABILITIES.map((capability) => (
              <label key={capability} className="flex items-start gap-2 rounded-lg border border-border p-2.5 text-sm">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 rounded border-input"
                  checked={draft.capabilities.includes(capability)}
                  onChange={() =>
                    update(
                      'capabilities',
                      draft.capabilities.includes(capability)
                        ? draft.capabilities.filter((entry) => entry !== capability)
                        : [...draft.capabilities, capability],
                    )
                  }
                />
                <span>
                  <span className="block font-medium">{t(`device.capabilities.${capability}` as TranslationKey)}</span>
                  <span className="block text-xs text-muted-foreground">
                    {t(`device.capabilityHints.${capability}` as TranslationKey)}
                  </span>
                </span>
              </label>
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1">
              <Label className="text-xs">{t('device.startScreen')}</Label>
              <Select value={draft.startScreen} onChange={(event) => update('startScreen', event.target.value as Draft['startScreen'])}>
                {START_SCREENS.map((screen) => (
                  <option key={screen} value={screen}>
                    {t(`device.screens.${screen}` as TranslationKey)}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t('device.defaultOrderType')}</Label>
              <Select value={draft.defaultOrderType} onChange={(event) => update('defaultOrderType', event.target.value as OrderType)}>
                {ORDER_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {orderTypeLabel(type)}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t('device.defaultChannel')}</Label>
              <Select value={draft.defaultChannel} onChange={(event) => update('defaultChannel', event.target.value as Draft['defaultChannel'])}>
                <option value="POS">{t('labels.orderChannel.POS')}</option>
                <option value="TALABAT">{t('labels.orderChannel.TALABAT')}</option>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t('device.paper')}</Label>
              <Select value={draft.paper} onChange={(event) => update('paper', event.target.value as Draft['paper'])}>
                <option value="80">80 mm</option>
                <option value="58">58 mm</option>
              </Select>
            </div>
          </div>
        </section>
      ) : null}

      {step === 3 ? (
        <section className="space-y-3">
          <h2 className="text-base font-semibold">{t('device.questions.review')}</h2>
          <p className="rounded-lg border border-primary/40 bg-primary/5 px-3 py-3 text-sm font-semibold">{summary}</p>
          <dl className="grid gap-1 text-sm sm:grid-cols-2">
            <dt className="text-muted-foreground">{t('device.startScreen')}</dt>
            <dd>{t(`device.screens.${draft.startScreen}` as TranslationKey)}</dd>
            <dt className="text-muted-foreground">{t('device.defaultOrderType')}</dt>
            <dd>{orderTypeLabel(draft.defaultOrderType)}</dd>
            <dt className="text-muted-foreground">{t('device.defaultChannel')}</dt>
            <dd>{t(`labels.orderChannel.${draft.defaultChannel}` as TranslationKey)}</dd>
            <dt className="text-muted-foreground">{t('device.paper')}</dt>
            <dd>{draft.paper} mm</dd>
          </dl>
          <p className="text-xs text-muted-foreground">{t('device.reviewHint')}</p>
        </section>
      ) : null}

      <div className="flex flex-wrap justify-between gap-2">
        <div>
          {onCancel ? (
            <Button variant="ghost" onClick={onCancel}>
              {t('actions.cancel')}
            </Button>
          ) : null}
        </div>
        <div className="flex gap-2">
          {step > 0 ? (
            <Button variant="outline" onClick={() => setStep(step - 1)}>
              {t('device.back')}
            </Button>
          ) : null}
          {step < steps.length - 1 ? (
            <Button onClick={() => setStep(step + 1)} disabled={!canNext}>
              {t('device.next')}
            </Button>
          ) : (
            <Button onClick={() => onDone(saveDeviceConfig(draft))}>{t('device.finish')}</Button>
          )}
        </div>
      </div>
    </div>
  );
}

/** Full-screen first run, shown on a new terminal before anyone signs in. */
export function DeviceSetupScreen({ onDone }: { onDone: (config: DeviceConfig) => void }): ReactElement {
  const { t } = useI18n();
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-3xl rounded-2xl border border-border bg-card p-6 shadow-card">
        <h1 className="text-xl font-bold">{t('device.title')}</h1>
        <p className="mb-5 mt-1 text-sm text-muted-foreground">{t('device.subtitle')}</p>
        <DeviceSetupWizard onDone={onDone} />
      </div>
    </div>
  );
}

/** Settings / Printers card: what this terminal is, with "Reconfigure". */
export function DeviceSummaryCard(): ReactElement {
  const { t } = useI18n();
  const device = useDeviceConfig();
  const summary = useDeviceSummary(device);
  const [open, setOpen] = useState(false);
  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
        <div>
          <CardTitle>{t('device.cardTitle')}</CardTitle>
          <CardDescription>{t('device.cardDescription')}</CardDescription>
        </div>
        <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
          <Settings2 className="h-3.5 w-3.5" />
          {t('device.reconfigure')}
        </Button>
      </CardHeader>
      <CardContent>
        <p className="text-sm font-semibold">{summary ?? t('device.notConfigured')}</p>
      </CardContent>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title={t('device.title')} description={t('device.subtitle')} className="max-w-3xl">
          <DeviceSetupWizard initial={device} onDone={() => setOpen(false)} onCancel={() => setOpen(false)} />
        </DialogContent>
      </Dialog>
    </Card>
  );
}

/** Compact badge for the top bar. */
export function DeviceBadge(): ReactElement | null {
  const device = useDeviceConfig();
  const summary = useDeviceSummary(device);
  if (!summary) return null;
  const Icon = TYPE_ICONS[device!.deviceType];
  return (
    <span
      className="hidden max-w-[22rem] items-center gap-1.5 truncate rounded-full border border-border bg-muted/40 px-2.5 py-1 text-[11px] font-medium md:inline-flex"
      title={summary}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">{summary}</span>
    </span>
  );
}
