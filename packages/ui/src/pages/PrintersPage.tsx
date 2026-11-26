import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Pencil, Plus, Printer, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactElement, type ReactNode } from 'react';
import {
  FONT_SCALES,
  ORDER_CHANNELS,
  PRINTER_ROLES,
  defaultTemplateFor,
  type CategoryDto,
  type FontScale,
  type OrderChannel,
  type PaperWidth,
  type PrinterConnection,
  type PrinterDto,
  type PrinterRole,
  type ReceiptTemplate,
} from '@posshope/shared';
import { DeviceSummaryCard } from '../components/device/DeviceSetupWizard';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { ConfirmDialog } from '../components/ui/confirm-dialog';
import { Dialog, DialogContent, DialogFooter } from '../components/ui/dialog';
import { Input, Select, Textarea } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { EmptyPanel, ErrorState } from '../components/ui/states';
import { StatusBadge } from '../components/ui/status-badge';
import { toast } from '../components/ui/toast';
import { useI18n, type TranslationKey } from '../i18n';
import { api } from '../lib/api';
import { orderChannelLabel } from '../lib/format';
import { canPrintSilently, listLocalPrinters, previewHtml, testPrint } from '../lib/print-service';

interface FormState {
  name: string;
  connection: PrinterConnection;
  deviceName: string;
  host: string;
  port: string;
  paperWidth: PaperWidth;
  role: PrinterRole;
  categoryIds: string[];
  channels: OrderChannel[];
  copies: string;
  isActive: boolean;
  template: ReceiptTemplate;
}

function emptyForm(): FormState {
  return {
    name: '',
    connection: 'SPOOLER',
    deviceName: '',
    host: '',
    port: '9100',
    paperWidth: 80,
    role: 'CUSTOMER_RECEIPT',
    categoryIds: [],
    channels: [],
    copies: '1',
    isActive: true,
    template: defaultTemplateFor('CUSTOMER_RECEIPT'),
  };
}

function fromPrinter(printer: PrinterDto): FormState {
  return {
    name: printer.name,
    connection: printer.connection,
    deviceName: printer.deviceName ?? '',
    host: printer.host ?? '',
    port: String(printer.port),
    paperWidth: printer.paperWidth,
    role: printer.role,
    categoryIds: printer.categoryIds,
    channels: printer.channels,
    copies: String(printer.copies),
    isActive: printer.isActive,
    template: printer.template,
  };
}

/** The editor state as a printer, so the preview uses the real renderer. */
function previewPrinter(form: FormState): PrinterDto {
  return {
    id: 'preview',
    branchId: '',
    name: form.name,
    connection: form.connection,
    deviceName: form.deviceName || null,
    host: form.host || null,
    port: Number(form.port) || 9100,
    paperWidth: form.paperWidth,
    role: form.role,
    categoryIds: form.categoryIds,
    channels: form.channels,
    copies: Number(form.copies) || 1,
    isActive: form.isActive,
    sortOrder: 0,
    template: form.template,
    updatedAt: new Date().toISOString(),
  };
}

export function PrintersPage(): ReactElement {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<PrinterDto | null>(null);
  const [creating, setCreating] = useState(false);
  const [removing, setRemoving] = useState<PrinterDto | null>(null);
  const [testing, setTesting] = useState<string | null>(null);

  const printersQuery = useQuery({ queryKey: ['printers'], queryFn: () => api.printers.list() });
  const settingsQuery = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.settings.get(),
    staleTime: 60_000,
  });
  const categoriesQuery = useQuery({
    queryKey: ['categories'],
    queryFn: () => api.categories.list(),
    staleTime: 60_000,
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.printers.remove(id),
    onSuccess: () => {
      toast.success(t('printers.toast.deleted'));
      setRemoving(null);
      void queryClient.invalidateQueries({ queryKey: ['printers'] });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : t('printers.toast.saveFailed')),
  });

  const runTest = async (printer: PrinterDto): Promise<void> => {
    setTesting(printer.id);
    try {
      const result = await testPrint(printer, settingsQuery.data);
      if (result.ok) {
        toast.success(
          result.usedDialog ? t('printers.toast.testDialog') : t('printers.toast.testSent'),
          printer.name,
        );
      } else {
        toast.error(result.error ?? t('printers.toast.testFailed'), printer.name);
      }
    } finally {
      setTesting(null);
    }
  };

  if (printersQuery.isError) {
    return (
      <ErrorState
        title={t('printers.error')}
        message={printersQuery.error instanceof Error ? printersQuery.error.message : ''}
        onRetry={() => void printersQuery.refetch()}
      />
    );
  }

  const printers = printersQuery.data ?? [];
  return (
    <div className="space-y-4">
      <DeviceSummaryCard />

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>{t('printers.title')}</CardTitle>
            <CardDescription>{t('printers.description')}</CardDescription>
          </div>
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="h-3.5 w-3.5" />
            {t('printers.add')}
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {!canPrintSilently() ? (
            <p className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning-strong">
              {t('printers.browserNote')}
            </p>
          ) : null}
          {printersQuery.isLoading ? (
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          ) : printers.length === 0 ? (
            <EmptyPanel title={t('printers.empty.title')} message={t('printers.empty.message')} />
          ) : (
            <ul className="grid gap-3 lg:grid-cols-2">
              {printers.map((printer) => (
                <li key={printer.id} className="rounded-lg border border-border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 text-sm font-semibold">
                        <Printer className="h-4 w-4 shrink-0" />
                        <span className="truncate">{printer.name}</span>
                      </p>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground" dir="ltr">
                        {printer.connection === 'NETWORK'
                          ? `${printer.host}:${printer.port}`
                          : printer.deviceName}
                        {' · '}
                        {printer.paperWidth} mm
                      </p>
                    </div>
                    <StatusBadge
                      tone={printer.isActive ? 'green' : 'neutral'}
                      label={printer.isActive ? t('printers.active') : t('printers.inactive')}
                    />
                  </div>
                  <p className="mt-2 text-xs">
                    <span className="font-medium">{t(`printers.roles.${printer.role}` as TranslationKey)}</span>
                    {printer.channels.length > 0
                      ? ` · ${printer.channels.map((channel) => orderChannelLabel(channel)).join(', ')}`
                      : ''}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={testing === printer.id}
                      onClick={() => void runTest(printer)}
                    >
                      {testing === printer.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Printer className="h-3.5 w-3.5" />
                      )}
                      {t('printers.test')}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setEditing(printer)}>
                      <Pencil className="h-3.5 w-3.5" />
                      {t('printers.edit')}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setRemoving(printer)}>
                      <Trash2 className="h-3.5 w-3.5" />
                      {t('printers.delete')}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <PrinterEditor
        open={creating || editing !== null}
        printer={editing}
        categories={categoriesQuery.data ?? []}
        onOpenChange={(open) => {
          if (!open) {
            setCreating(false);
            setEditing(null);
          }
        }}
      />

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => (open ? null : setRemoving(null))}
        title={t('printers.deleteTitle')}
        description={t('printers.deleteMessage', { name: removing?.name ?? '' })}
        destructive
        busy={remove.isPending}
        onConfirm={() => removing && remove.mutate(removing.id)}
      />
    </div>
  );
}

function PrinterEditor({
  open,
  printer,
  categories,
  onOpenChange,
}: {
  open: boolean;
  printer: PrinterDto | null;
  categories: CategoryDto[];
  onOpenChange: (open: boolean) => void;
}): ReactElement {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState>(emptyForm);
  const [localPrinters, setLocalPrinters] = useState<string[]>([]);
  const settingsQuery = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.settings.get(),
    staleTime: 60_000,
    enabled: open,
  });

  useEffect(() => {
    if (!open) return;
    setForm(printer ? fromPrinter(printer) : emptyForm());
    void listLocalPrinters().then(setLocalPrinters);
  }, [open, printer]);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]): void =>
    setForm((current) => ({ ...current, [key]: value }));
  const updateTemplate = <K extends keyof ReceiptTemplate>(key: K, value: ReceiptTemplate[K]): void =>
    setForm((current) => ({ ...current, template: { ...current.template, [key]: value } }));

  const html = useMemo(
    () => previewHtml(previewPrinter(form), settingsQuery.data),
    [form, settingsQuery.data],
  );

  const save = useMutation({
    mutationFn: () => {
      const body = {
        name: form.name.trim(),
        connection: form.connection,
        deviceName: form.connection === 'SPOOLER' ? form.deviceName.trim() || undefined : undefined,
        host: form.connection === 'NETWORK' ? form.host.trim() || null : null,
        port: Number(form.port) || 9100,
        paperWidth: form.paperWidth,
        role: form.role,
        categoryIds: form.role === 'KITCHEN_BY_CATEGORY' ? form.categoryIds : [],
        channels: form.channels,
        copies: Number(form.copies) || 1,
        isActive: form.isActive,
        sortOrder: printer?.sortOrder ?? 0,
        template: form.template,
      };
      return printer ? api.printers.update(printer.id, body) : api.printers.create(body);
    },
    onSuccess: () => {
      toast.success(printer ? t('printers.toast.updated') : t('printers.toast.created'));
      void queryClient.invalidateQueries({ queryKey: ['printers'] });
      onOpenChange(false);
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : t('printers.toast.saveFailed')),
  });

  const changeRole = (role: PrinterRole): void => {
    // Switching role resets the template to that role's sensible default.
    setForm((current) => ({ ...current, role, template: defaultTemplateFor(role) }));
  };

  const toggleIn = <T,>(list: T[], value: T): T[] =>
    list.includes(value) ? list.filter((entry) => entry !== value) : [...list, value];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={printer ? t('printers.editTitle', { name: printer.name }) : t('printers.newTitle')}
        description={t('printers.editorDescription')}
        className="max-w-5xl"
      >
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t('printers.fields.name')}>
                <Input
                  value={form.name}
                  onChange={(event) => update('name', event.target.value)}
                  placeholder={t('printers.fields.namePlaceholder')}
                />
              </Field>
              <Field label={t('printers.fields.role')}>
                <Select value={form.role} onChange={(event) => changeRole(event.target.value as PrinterRole)}>
                  {PRINTER_ROLES.map((role) => (
                    <option key={role} value={role}>
                      {t(`printers.roles.${role}` as TranslationKey)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={t('printers.fields.connection')}>
                <Select
                  value={form.connection}
                  onChange={(event) => update('connection', event.target.value as PrinterConnection)}
                >
                  <option value="SPOOLER">{t('printers.connection.SPOOLER')}</option>
                  <option value="NETWORK">{t('printers.connection.NETWORK')}</option>
                </Select>
              </Field>
              {form.connection === 'SPOOLER' ? (
                <Field label={t('printers.fields.deviceName')} hint={t('printers.fields.deviceNameHint')}>
                  <>
                    <Input
                      value={form.deviceName}
                      onChange={(event) => update('deviceName', event.target.value)}
                      list="local-printers"
                      placeholder="Deli S580P"
                      dir="ltr"
                    />
                    <datalist id="local-printers">
                      {localPrinters.map((name) => (
                        <option key={name} value={name} />
                      ))}
                    </datalist>
                  </>
                </Field>
              ) : (
                <div className="grid grid-cols-[minmax(0,1fr)_90px] gap-2">
                  <Field label={t('printers.fields.host')} hint={t('printers.fields.hostHint')}>
                    <Input
                      value={form.host}
                      onChange={(event) => update('host', event.target.value)}
                      placeholder="192.168.1.50"
                      dir="ltr"
                    />
                  </Field>
                  <Field label={t('printers.fields.port')}>
                    <Input
                      type="number"
                      value={form.port}
                      onChange={(event) => update('port', event.target.value)}
                      dir="ltr"
                    />
                  </Field>
                </div>
              )}
              <Field label={t('printers.fields.paper')}>
                <Select
                  value={String(form.paperWidth)}
                  onChange={(event) => update('paperWidth', Number(event.target.value) as PaperWidth)}
                >
                  <option value="80">80 mm</option>
                  <option value="58">58 mm</option>
                </Select>
              </Field>
              <Field label={t('printers.fields.copies')}>
                <Input
                  type="number"
                  min={1}
                  max={5}
                  value={form.copies}
                  onChange={(event) => update('copies', event.target.value)}
                  dir="ltr"
                />
              </Field>
            </div>

            {form.role === 'KITCHEN_BY_CATEGORY' ? (
              <Fieldset legend={t('printers.fields.categories')} hint={t('printers.fields.categoriesHint')}>
                {categories.map((category) => (
                  <Check
                    key={category.id}
                    label={category.name}
                    checked={form.categoryIds.includes(category.id)}
                    onChange={() => update('categoryIds', toggleIn(form.categoryIds, category.id))}
                  />
                ))}
              </Fieldset>
            ) : null}

            <Fieldset legend={t('printers.fields.channels')} hint={t('printers.fields.channelsHint')}>
              {ORDER_CHANNELS.map((channel) => (
                <Check
                  key={channel}
                  label={orderChannelLabel(channel)}
                  checked={form.channels.includes(channel)}
                  onChange={() => update('channels', toggleIn(form.channels, channel))}
                />
              ))}
            </Fieldset>

            <Check
              label={t('printers.fields.active')}
              checked={form.isActive}
              onChange={() => update('isActive', !form.isActive)}
            />

            <div className="space-y-3 rounded-lg border border-border p-3">
              <div>
                <p className="text-sm font-semibold">{t('printers.template.title')}</p>
                <p className="text-xs text-muted-foreground">{t('printers.template.description')}</p>
              </div>
              <Field label={t('printers.template.fontScale')}>
                <Select
                  value={form.template.fontScale}
                  onChange={(event) => updateTemplate('fontScale', event.target.value as FontScale)}
                >
                  {FONT_SCALES.map((scale) => (
                    <option key={scale} value={scale}>
                      {t(`printers.template.scales.${scale}` as TranslationKey)}
                    </option>
                  ))}
                </Select>
              </Field>
              <div className="grid gap-2 sm:grid-cols-2">
                {(
                  [
                    'showLogo',
                    'showStoreDetails',
                    'showOrderMeta',
                    'showCustomer',
                    'showPrices',
                    'showVatLine',
                    'showPayments',
                    'showItemNotes',
                    'showQr',
                  ] as const
                ).map((key) => (
                  <Check
                    key={key}
                    label={t(`printers.template.${key}` as TranslationKey)}
                    checked={form.template[key]}
                    onChange={() => updateTemplate(key, !form.template[key])}
                  />
                ))}
              </div>
              {form.template.showQr ? (
                <Field label={t('printers.template.qrUrl')}>
                  <Input
                    value={form.template.qrUrl}
                    onChange={(event) => updateTemplate('qrUrl', event.target.value)}
                    placeholder="https://eatcornerpizza.com"
                    dir="ltr"
                  />
                </Field>
              ) : null}
              <Field label={t('printers.template.headerNote')}>
                <Input
                  value={form.template.headerNote}
                  onChange={(event) => updateTemplate('headerNote', event.target.value)}
                  maxLength={200}
                />
              </Field>
              <div className="grid gap-2 sm:grid-cols-2">
                <Field label={t('printers.template.footerEn')}>
                  <Textarea
                    value={form.template.footerEn}
                    onChange={(event) => updateTemplate('footerEn', event.target.value)}
                    maxLength={300}
                    dir="ltr"
                  />
                </Field>
                <Field label={t('printers.template.footerAr')}>
                  <Textarea
                    value={form.template.footerAr}
                    onChange={(event) => updateTemplate('footerAr', event.target.value)}
                    maxLength={300}
                    dir="rtl"
                    lang="ar"
                  />
                </Field>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground">
              {t('printers.preview', { width: form.paperWidth })}
            </p>
            <div className="flex justify-center rounded-lg border border-border bg-muted/40 p-3">
              <iframe
                title={t('printers.preview', { width: form.paperWidth })}
                srcDoc={html}
                sandbox=""
                className="h-[560px] rounded bg-white shadow-sm"
                style={{ width: form.paperWidth === 58 ? 230 : 310 }}
              />
            </div>
            {form.connection === 'NETWORK' ? (
              <p className="text-[11px] text-muted-foreground">{t('printers.networkNote')}</p>
            ) : null}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={save.isPending}>
            {t('actions.cancel')}
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending || form.name.trim().length < 2}>
            {save.isPending ? t('actions.saving') : t('actions.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}): ReactElement {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      {children}
      {hint ? <p className="text-[10px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function Fieldset({
  legend,
  hint,
  children,
}: {
  legend: string;
  hint?: string;
  children: ReactNode;
}): ReactElement {
  return (
    <fieldset className="rounded-lg border border-border p-3">
      <legend className="px-1 text-xs font-semibold">{legend}</legend>
      {hint ? <p className="mb-2 text-[10px] text-muted-foreground">{hint}</p> : null}
      <div className="flex flex-wrap gap-x-4 gap-y-2">{children}</div>
    </fieldset>
  );
}

function Check({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: () => void;
}): ReactElement {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input
        type="checkbox"
        className="h-4 w-4 rounded border-input"
        checked={checked}
        onChange={onChange}
      />
      {label}
    </label>
  );
}
