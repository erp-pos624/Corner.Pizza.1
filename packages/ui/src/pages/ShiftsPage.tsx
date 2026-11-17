import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Banknote,
  CircleDollarSign,
  FileLock2,
  History,
  Lock,
  Wallet,
} from 'lucide-react';
import { useState, type ReactElement } from 'react';
import type { ShiftDto, ShiftStatus, ShiftTotals, ZReportDto } from '@posshope/shared';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Dialog, DialogContent, DialogFooter } from '../components/ui/dialog';
import { Input, Select } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { ExportActions } from '../components/ui/export-actions';
import { Pagination } from '../components/ui/pagination';
import { EmptyPanel, ErrorState } from '../components/ui/states';
import { Skeleton, SkeletonTable } from '../components/ui/skeleton';
import { toast } from '../components/ui/toast';
import { useI18n } from '../i18n';
import { api } from '../lib/api';
import { downloadCsv, downloadExcel, downloadPdf, type ExportValue } from '../lib/export';
import { formatDateTime, formatMoney, formatNumber, todayIso } from '../lib/format';
import { cn } from '../lib/utils';

const HISTORY_PAGE_SIZE = 10;

function varianceTone(value: string | null): 'success' | 'warning' | 'destructive' {
  const amount = Number(value ?? 0);
  if (amount === 0) return 'success';
  return amount > 0 ? 'warning' : 'destructive';
}

function TotalsGrid({ totals }: { totals: ShiftTotals }): ReactElement {
  const { t } = useI18n();
  const rows: Array<[string, string]> = [
    [t('shifts.totals.orders'), formatNumber(totals.ordersCount)],
    [t('shifts.totals.grossSales'), formatMoney(totals.grossSales)],
    [t('shifts.totals.cashPayments'), formatMoney(totals.cashPayments)],
    [t('shifts.totals.cardPayments'), formatMoney(totals.cardPayments)],
    [t('shifts.totals.walletPayments'), formatMoney(totals.walletPayments)],
    [t('shifts.totals.cashIn'), formatMoney(totals.cashIn)],
    [t('shifts.totals.cashOut'), formatMoney(totals.cashOut)],
    [t('shifts.totals.cashRefunds'), formatMoney(totals.cashRefunds)],
    [t('shifts.totals.refunds'), formatMoney(totals.refundsTotal)],
    [t('shifts.totals.discounts'), formatMoney(totals.discounts)],
    [t('shifts.totals.tax'), formatMoney(totals.tax)],
    [t('shifts.totals.deliveryFees'), formatMoney(totals.deliveryFees)],
    [t('shifts.totals.openingFloat'), formatMoney(totals.openingFloat)],
    [t('shifts.totals.expectedCash'), formatMoney(totals.expectedCash)],
    [t('shifts.totals.countedCash'), totals.countedCash ? formatMoney(totals.countedCash) : '—'],
    [t('shifts.totals.variance'), totals.variance ? formatMoney(totals.variance) : '—'],
  ];
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
      {rows.map(([label, value]) => (
        <div key={label} className="min-w-0">
          <dt className="truncate text-[11px] uppercase tracking-wide text-muted-foreground">
            {label}
          </dt>
          <dd className="numeric truncate font-semibold">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function ShiftsPage(): ReactElement {
  const { t } = useI18n();
  const queryClient = useQueryClient();

  const [openingFloat, setOpeningFloat] = useState('0.00');
  const [openNotes, setOpenNotes] = useState('');
  const [openError, setOpenError] = useState<string | null>(null);

  const [movementOpen, setMovementOpen] = useState(false);
  const [movementType, setMovementType] = useState<'CASH_IN' | 'CASH_OUT'>('CASH_IN');
  const [movementAmount, setMovementAmount] = useState('');
  const [movementReason, setMovementReason] = useState('');
  const [movementError, setMovementError] = useState<string | null>(null);

  const [closeOpen, setCloseOpen] = useState(false);
  const [countedCash, setCountedCash] = useState('');
  const [closeNotes, setCloseNotes] = useState('');
  const [closeError, setCloseError] = useState<string | null>(null);

  const [historyPage, setHistoryPage] = useState(1);
  const [historyStatus, setHistoryStatus] = useState<ShiftStatus | ''>('');
  const [detailTarget, setDetailTarget] = useState<ShiftDto | null>(null);
  const [zDate, setZDate] = useState(todayIso());
  const [zDetail, setZDetail] = useState<ZReportDto | null>(null);

  const current = useQuery({
    queryKey: ['shifts', 'current'],
    queryFn: () => api.shifts.current(),
    refetchInterval: 20_000,
  });

  const history = useQuery({
    queryKey: ['shifts', 'history', { page: historyPage, status: historyStatus }],
    queryFn: () =>
      api.shifts.list({
        page: historyPage,
        pageSize: HISTORY_PAGE_SIZE,
        ...(historyStatus ? { status: historyStatus } : {}),
      }),
    placeholderData: (previous) => previous,
  });

  const zReports = useQuery({
    queryKey: ['shifts', 'z-reports', zDate],
    queryFn: () => api.shifts.zReports({ date: zDate || undefined }),
  });

  const invalidateShifts = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['shifts'] });
  };

  const openShift = useMutation({
    mutationFn: () =>
      api.shifts.open({
        openingFloat: openingFloat.trim(),
        ...(openNotes.trim() ? { notes: openNotes.trim() } : {}),
      }),
    onSuccess: (shift) => {
      invalidateShifts();
      toast.success(t('shifts.current.openedToast'), shift.shiftNumber);
      setOpeningFloat('0.00');
      setOpenNotes('');
      setOpenError(null);
    },
    onError: (error) => {
      setOpenError(error instanceof Error ? error.message : t('shifts.errors.open'));
    },
  });

  const recordMovement = useMutation({
    mutationFn: (args: { shiftId: string }) =>
      api.shifts.recordMovement(args.shiftId, {
        type: movementType,
        amount: movementAmount.trim(),
        reason: movementReason.trim(),
      }),
    onSuccess: () => {
      invalidateShifts();
      toast.success(t('shifts.movement.savedToast'));
      setMovementOpen(false);
      setMovementAmount('');
      setMovementReason('');
      setMovementError(null);
    },
    onError: (error) => {
      setMovementError(error instanceof Error ? error.message : t('shifts.errors.movement'));
    },
  });

  const closeShift = useMutation({
    mutationFn: (args: { shiftId: string }) =>
      api.shifts.close(args.shiftId, {
        countedCash: countedCash.trim(),
        ...(closeNotes.trim() ? { notes: closeNotes.trim() } : {}),
      }),
    onSuccess: () => {
      invalidateShifts();
      toast.success(t('shifts.close.closedToast'), t('shifts.close.zReportToast'));
      setCloseOpen(false);
      setCountedCash('');
      setCloseNotes('');
      setCloseError(null);
    },
    onError: (error) => {
      setCloseError(error instanceof Error ? error.message : t('shifts.errors.close'));
    },
  });

  const shift = current.data ?? null;
  const expectedMinor = Math.round(Number(shift?.totals.expectedCash ?? 0) * 100);
  const countedMinor = Math.round(Number(countedCash || 0) * 100);
  const varianceMinor = countedMinor - expectedMinor;

  const zTotalsRows = (totals: ShiftTotals): ExportValue[][] => [
    [t('shifts.totals.orders'), totals.ordersCount],
    [t('shifts.totals.grossSales'), Number(totals.grossSales)],
    [t('shifts.totals.cashPayments'), Number(totals.cashPayments)],
    [t('shifts.totals.cardPayments'), Number(totals.cardPayments)],
    [t('shifts.totals.walletPayments'), Number(totals.walletPayments)],
    [t('shifts.totals.cashIn'), Number(totals.cashIn)],
    [t('shifts.totals.cashOut'), Number(totals.cashOut)],
    [t('shifts.totals.cashRefunds'), Number(totals.cashRefunds)],
    [t('shifts.totals.refunds'), Number(totals.refundsTotal)],
    [t('shifts.totals.discounts'), Number(totals.discounts)],
    [t('shifts.totals.tax'), Number(totals.tax)],
    [t('shifts.totals.deliveryFees'), Number(totals.deliveryFees)],
    [t('shifts.totals.openingFloat'), Number(totals.openingFloat)],
    [t('shifts.totals.expectedCash'), Number(totals.expectedCash)],
    [t('shifts.totals.countedCash'), totals.countedCash ? Number(totals.countedCash) : ''],
    [t('shifts.totals.variance'), totals.variance ? Number(totals.variance) : ''],
  ];

  const zExportBaseName = (report: ZReportDto): string =>
    `forno-z-report-${report.reportNumber}`;

  const exportZCsv = (): void => {
    if (!zDetail) return;
    downloadCsv(zExportBaseName(zDetail), [
      [`${t('app.fullName')} — ${t('shifts.zReports.detailTitle', { number: zDetail.reportNumber })}`],
      [t('shifts.zReports.date'), zDetail.businessDate.slice(0, 10)],
      [t('shifts.zReports.terminal'), zDetail.terminalId],
      [t('shifts.zReports.lockedAt'), formatDateTime(zDetail.lockedAt)],
      [],
      [t('reports.export.type'), t('reports.export.amount')],
      ...zTotalsRows(zDetail.totals),
    ]);
  };

  const exportZExcel = async (): Promise<void> => {
    if (!zDetail) return;
    await downloadExcel(zExportBaseName(zDetail), [
      {
        name: t('shifts.zReports.title'),
        rows: [
          [t('reports.export.type'), t('reports.export.amount')],
          ...zTotalsRows(zDetail.totals),
        ],
        widths: [28, 18],
      },
    ]);
  };

  const exportZPdf = async (): Promise<void> => {
    if (!zDetail) return;
    await downloadPdf(zExportBaseName(zDetail), {
      title: t('shifts.zReports.detailTitle', { number: zDetail.reportNumber }),
      subtitle: t('shifts.zReports.detailDescription', {
        date: zDetail.businessDate.slice(0, 10),
        terminal: zDetail.terminalId,
      }),
      meta: [
        { label: t('shifts.zReports.number'), value: zDetail.reportNumber },
        { label: t('shifts.zReports.lockedAt'), value: formatDateTime(zDetail.lockedAt) },
      ],
      sections: [
        {
          heading: t('shifts.zReports.title'),
          headers: [t('reports.export.type'), t('reports.export.amount')],
          rows: zTotalsRows(zDetail.totals),
          columnAlign: ['left', 'right'],
        },
      ],
    });
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card shadow-sm">
        <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Wallet className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold">{t('shifts.current.title')}</h2>
          </div>
          {shift ? (
            <>
              <Badge variant="outline" className="numeric">
                {shift.shiftNumber}
              </Badge>
              <Badge variant={shift.status === 'OPEN' ? 'success' : 'outline'}>
                {t(`shifts.status.${shift.status}`)}
              </Badge>
            </>
          ) : null}
        </div>

        {current.isLoading ? (
          <div className="space-y-3 p-4">
            <Skeleton className="h-4 w-48" />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Skeleton className="h-14" />
              <Skeleton className="h-14" />
              <Skeleton className="h-14" />
              <Skeleton className="h-14" />
            </div>
          </div>
        ) : current.isError ? (
          <div className="p-4">
            <ErrorState
              title={t('shifts.errors.load')}
              message={current.error instanceof Error ? current.error.message : undefined}
              onRetry={() => void current.refetch()}
            />
          </div>
        ) : !shift ? (
          <div className="p-4">
            <div className="flex flex-col items-start gap-2 rounded-lg border border-dashed border-border bg-muted/30 p-4">
              <p className="font-semibold">{t('shifts.current.closedTitle')}</p>
              <p className="text-sm text-muted-foreground">{t('shifts.current.closedMessage')}</p>
            </div>
            <form
              className="mt-4 grid items-end gap-3 sm:grid-cols-[180px_1fr_auto]"
              onSubmit={(event) => {
                event.preventDefault();
                openShift.mutate();
              }}
            >
              <div className="space-y-1.5">
                <Label htmlFor="opening-float">{t('shifts.current.openingFloat')}</Label>
                <Input
                  id="opening-float"
                  inputMode="decimal"
                  className="numeric"
                  value={openingFloat}
                  onChange={(event) => setOpeningFloat(event.target.value)}
                  placeholder="0.00"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="open-notes">{t('shifts.current.notes')}</Label>
                <Input
                  id="open-notes"
                  value={openNotes}
                  onChange={(event) => setOpenNotes(event.target.value)}
                  placeholder={t('shifts.current.notesPlaceholder')}
                  maxLength={300}
                />
              </div>
              <Button type="submit" disabled={openShift.isPending}>
                <Banknote className="h-4 w-4" />
                {t('shifts.current.openAction')}
              </Button>
            </form>
            {openError ? <p className="mt-2 text-sm text-destructive">{openError}</p> : null}
          </div>
        ) : (
          <div className="space-y-4 p-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-lg border border-border bg-muted/30 p-3">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  {t('shifts.current.openedLine', {
                    when: formatDateTime(shift.openedAt),
                    name: shift.openedByName,
                  })}
                </p>
                <p className="mt-1 text-sm font-semibold">{shift.openedByName}</p>
              </div>
              <div className="rounded-lg border border-border bg-muted/30 p-3">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  {t('shifts.current.terminal')}
                </p>
                <p className="numeric mt-1 text-sm font-semibold">{shift.terminalId}</p>
              </div>
              <div className="rounded-lg border border-border bg-muted/30 p-3">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  {t('shifts.totals.openingFloat')}
                </p>
                <p className="numeric mt-1 text-sm font-semibold">
                  {formatMoney(shift.totals.openingFloat)}
                </p>
              </div>
              <div className="rounded-lg border border-brand-gold/30 bg-brand-gold/10 p-3">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  {t('shifts.totals.expectedCash')}
                </p>
                <p className="numeric mt-1 text-sm font-bold text-brand-gold">
                  {formatMoney(shift.totals.expectedCash)}
                </p>
              </div>
            </div>

            <TotalsGrid totals={shift.totals} />

            <div className="flex flex-wrap gap-2 border-t border-border pt-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setMovementType('CASH_IN');
                  setMovementError(null);
                  setMovementOpen(true);
                }}
              >
                <ArrowDownToLine className="h-4 w-4" />
                {t('shifts.current.cashIn')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setMovementType('CASH_OUT');
                  setMovementError(null);
                  setMovementOpen(true);
                }}
              >
                <ArrowUpFromLine className="h-4 w-4" />
                {t('shifts.current.cashOut')}
              </Button>
              <Button
                variant="destructive"
                size="sm"
                className="ms-auto"
                onClick={() => {
                  setCountedCash(shift.totals.expectedCash);
                  setCloseError(null);
                  setCloseOpen(true);
                }}
              >
                <Lock className="h-4 w-4" />
                {t('shifts.current.close')}
              </Button>
            </div>

            <div>
              <h3 className="mb-2 text-sm font-semibold">{t('shifts.current.movementsTitle')}</h3>
              {shift.cashMovements.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border p-3 text-sm text-muted-foreground">
                  {t('shifts.current.noMovements')}
                </p>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-border">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground">
                        <th className="px-3 py-2 font-semibold">{t('actions.type')}</th>
                        <th className="px-3 py-2 text-end font-semibold">{t('actions.total')}</th>
                        <th className="px-3 py-2 font-semibold">{t('shifts.movement.reason')}</th>
                        <th className="px-3 py-2 font-semibold">{t('shifts.current.operator')}</th>
                        <th className="px-3 py-2 font-semibold">{t('actions.time')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {shift.cashMovements.map((movement) => (
                        <tr key={movement.id} className="border-b border-border/70 last:border-0">
                          <td className="px-3 py-2">
                            <Badge
                              variant={movement.type === 'CASH_IN' ? 'success' : 'warning'}
                            >
                              {movement.type === 'CASH_IN'
                                ? t('shifts.current.cashIn')
                                : t('shifts.current.cashOut')}
                            </Badge>
                          </td>
                          <td className="numeric px-3 py-2 text-end font-semibold">
                            {formatMoney(movement.amount)}
                          </td>
                          <td className="px-3 py-2 text-muted-foreground">{movement.reason}</td>
                          <td className="px-3 py-2 text-muted-foreground">{movement.userName}</td>
                          <td className="px-3 py-2 text-muted-foreground">
                            {formatDateTime(movement.createdAt)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-border bg-card shadow-sm">
        <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <History className="h-4 w-4" />
          </span>
          <h2 className="min-w-0 flex-1 font-semibold">{t('shifts.history.title')}</h2>
          <Select
            aria-label={t('shifts.columns.status')}
            className="h-9 w-[150px]"
            value={historyStatus}
            onChange={(event) => {
              setHistoryStatus(event.target.value as ShiftStatus | '');
              setHistoryPage(1);
            }}
          >
            <option value="">{t('actions.all')}</option>
            <option value="OPEN">{t('shifts.status.OPEN')}</option>
            <option value="CLOSED">{t('shifts.status.CLOSED')}</option>
          </Select>
          <Button variant="ghost" size="sm" onClick={() => void history.refetch()}>
            {t('actions.refresh')}
          </Button>
        </div>

        {history.isLoading ? (
          <SkeletonTable
            label={t('shifts.history.loading')}
            rows={5}
            columns={[
              { kind: 'text', label: t('shifts.columns.shift') },
              { kind: 'muted', label: t('shifts.columns.terminal') },
              { kind: 'muted', label: t('shifts.columns.operator') },
              { kind: 'muted', label: t('shifts.columns.opened') },
              { kind: 'muted', label: t('shifts.columns.closed') },
              { kind: 'badge', label: t('shifts.columns.status') },
              { kind: 'amount', label: t('shifts.columns.drawer') },
              { kind: 'actions' },
            ]}
          />
        ) : history.isError ? (
          <div className="p-4">
            <ErrorState
              title={t('shifts.errors.load')}
              message={history.error instanceof Error ? history.error.message : undefined}
              onRetry={() => void history.refetch()}
            />
          </div>
        ) : history.data && history.data.items.length === 0 ? (
          <EmptyPanel
            title={historyStatus ? t('shifts.history.filteredEmpty') : t('shifts.history.emptyTitle')}
            message={t('shifts.history.emptyMessage')}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2.5 font-semibold">{t('shifts.columns.shift')}</th>
                  <th className="px-3 py-2.5 font-semibold">{t('shifts.columns.terminal')}</th>
                  <th className="px-3 py-2.5 font-semibold">{t('shifts.columns.operator')}</th>
                  <th className="px-3 py-2.5 font-semibold">{t('shifts.columns.opened')}</th>
                  <th className="px-3 py-2.5 font-semibold">{t('shifts.columns.closed')}</th>
                  <th className="px-3 py-2.5 font-semibold">{t('shifts.columns.status')}</th>
                  <th className="px-3 py-2.5 text-end font-semibold">{t('shifts.columns.drawer')}</th>
                  <th className="px-3 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {history.data!.items.map((row) => (
                  <tr key={row.id} className="border-b border-border/70 last:border-0 hover:bg-muted/40">
                    <td className="numeric px-3 py-2.5 font-semibold">{row.shiftNumber}</td>
                    <td className="numeric px-3 py-2.5 text-muted-foreground">{row.terminalId}</td>
                    <td className="px-3 py-2.5 text-muted-foreground">{row.openedByName}</td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground">
                      {formatDateTime(row.openedAt)}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground">
                      {row.closedAt ? formatDateTime(row.closedAt) : '—'}
                    </td>
                    <td className="px-3 py-2.5">
                      <Badge variant={row.status === 'OPEN' ? 'success' : 'outline'}>
                        {t(`shifts.status.${row.status}`)}
                      </Badge>
                    </td>
                    <td className="numeric px-3 py-2.5 text-end">
                      {formatMoney(row.countedCash ?? row.totals.expectedCash)}
                      {row.variance ? (
                        <span
                          className={cn(
                            'ms-1 text-[11px]',
                            Number(row.variance) === 0
                              ? 'text-muted-foreground'
                              : Number(row.variance) > 0
                                ? 'text-warning'
                                : 'text-destructive',
                          )}
                        >
                          ({formatMoney(row.variance)})
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2.5 text-end">
                      <Button variant="ghost" size="sm" onClick={() => setDetailTarget(row)}>
                        {t('actions.details')}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {history.data && history.data.total > 0 ? (
          <Pagination
            page={history.data.page}
            pageSize={history.data.pageSize}
            total={history.data.total}
            totalPages={history.data.totalPages}
            onPageChange={setHistoryPage}
          />
        ) : null}
      </div>

      <div className="rounded-xl border border-border bg-card shadow-sm">
        <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <FileLock2 className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold">{t('shifts.zReports.title')}</h2>
            <p className="text-xs text-muted-foreground">{t('shifts.zReports.description')}</p>
          </div>
          <Input
            type="date"
            className="h-9 w-[160px]"
            aria-label={t('shifts.zReports.date')}
            value={zDate}
            onChange={(event) => setZDate(event.target.value)}
          />
        </div>

        {zReports.isLoading ? (
          <div className="space-y-2 p-4">
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
          </div>
        ) : zReports.isError ? (
          <div className="p-4">
            <ErrorState
              title={t('shifts.errors.loadZReports')}
              message={zReports.error instanceof Error ? zReports.error.message : undefined}
              onRetry={() => void zReports.refetch()}
            />
          </div>
        ) : !zReports.data || zReports.data.length === 0 ? (
          <EmptyPanel
            title={t('shifts.zReports.emptyTitle')}
            message={t('shifts.zReports.emptyMessage')}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2.5 font-semibold">{t('shifts.zReports.number')}</th>
                  <th className="px-3 py-2.5 font-semibold">{t('shifts.columns.terminal')}</th>
                  <th className="px-3 py-2.5 font-semibold">{t('shifts.zReports.date')}</th>
                  <th className="px-3 py-2.5 text-end font-semibold">{t('shifts.totals.grossSales')}</th>
                  <th className="px-3 py-2.5 text-end font-semibold">{t('shifts.totals.variance')}</th>
                  <th className="px-3 py-2.5 font-semibold">{t('shifts.zReports.lockedAt')}</th>
                  <th className="px-3 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {zReports.data.map((report) => (
                  <tr key={report.id} className="border-b border-border/70 last:border-0 hover:bg-muted/40">
                    <td className="numeric px-3 py-2.5 font-semibold">{report.reportNumber}</td>
                    <td className="numeric px-3 py-2.5 text-muted-foreground">
                      {report.terminalId}
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground">
                      {report.businessDate.slice(0, 10)}
                    </td>
                    <td className="numeric px-3 py-2.5 text-end">
                      {formatMoney(report.totals.grossSales)}
                    </td>
                    <td className="px-3 py-2.5 text-end">
                      {report.totals.variance ? (
                        <Badge variant={varianceTone(report.totals.variance)}>
                          {formatMoney(report.totals.variance)}
                        </Badge>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground">
                      {formatDateTime(report.lockedAt)}
                    </td>
                    <td className="px-3 py-2.5 text-end">
                      <Button variant="ghost" size="sm" onClick={() => setZDetail(report)}>
                        {t('shifts.zReports.view')}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Dialog
        open={movementOpen}
        onOpenChange={(open) => {
          setMovementOpen(open);
          if (!open) setMovementError(null);
        }}
      >
        <DialogContent
          title={t('shifts.movement.title')}
          description={t('shifts.movement.description')}
          className="max-w-md"
        >
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              if (shift) recordMovement.mutate({ shiftId: shift.id });
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="movement-type">{t('shifts.movement.type')}</Label>
              <Select
                id="movement-type"
                value={movementType}
                onChange={(event) => setMovementType(event.target.value as 'CASH_IN' | 'CASH_OUT')}
              >
                <option value="CASH_IN">{t('shifts.movement.in')}</option>
                <option value="CASH_OUT">{t('shifts.movement.out')}</option>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="movement-amount">{t('shifts.movement.amount')}</Label>
              <Input
                id="movement-amount"
                inputMode="decimal"
                className="numeric"
                value={movementAmount}
                onChange={(event) => setMovementAmount(event.target.value)}
                placeholder="0.00"
                required
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="movement-reason">{t('shifts.movement.reason')}</Label>
              <Input
                id="movement-reason"
                value={movementReason}
                onChange={(event) => setMovementReason(event.target.value)}
                placeholder={t('shifts.movement.reasonPlaceholder')}
                minLength={3}
                maxLength={300}
                required
              />
            </div>
            {movementError ? <p className="text-sm text-destructive">{movementError}</p> : null}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setMovementOpen(false)}>
                {t('actions.cancel')}
              </Button>
              <Button type="submit" disabled={recordMovement.isPending}>
                {t('shifts.movement.save')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={closeOpen}
        onOpenChange={(open) => {
          setCloseOpen(open);
          if (!open) setCloseError(null);
        }}
      >
        <DialogContent
          title={t('shifts.close.title')}
          description={t('shifts.close.description')}
          className="max-w-md"
        >
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              if (shift) closeShift.mutate({ shiftId: shift.id });
            }}
          >
            <div className="grid grid-cols-3 gap-2 rounded-lg border border-border bg-muted/30 p-3 text-sm">
              <div>
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  {t('shifts.close.expected')}
                </p>
                <p className="numeric font-semibold">{formatMoney(shift?.totals.expectedCash)}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  {t('shifts.close.countedCash')}
                </p>
                <p className="numeric font-semibold">
                  {countedCash ? formatMoney(countedCash) : '—'}
                </p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  {t('shifts.close.variance')}
                </p>
                <p className="numeric font-semibold">
                  {countedCash ? formatMoney(varianceMinor / 100) : '—'}
                </p>
              </div>
            </div>
            {countedCash ? (
              <p className="text-xs text-muted-foreground">
                <Badge
                  variant={
                    varianceMinor === 0 ? 'success' : varianceMinor > 0 ? 'warning' : 'destructive'
                  }
                >
                  {varianceMinor === 0
                    ? t('shifts.close.balanced')
                    : varianceMinor > 0
                      ? t('shifts.close.over')
                      : t('shifts.close.short')}
                </Badge>{' '}
                {t('shifts.close.varianceHint')}
              </p>
            ) : null}
            <div className="space-y-1.5">
              <Label htmlFor="counted-cash">{t('shifts.close.countedCash')}</Label>
              <Input
                id="counted-cash"
                inputMode="decimal"
                className="numeric"
                value={countedCash}
                onChange={(event) => setCountedCash(event.target.value)}
                placeholder="0.00"
                required
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="close-notes">{t('shifts.close.notes')}</Label>
              <Input
                id="close-notes"
                value={closeNotes}
                onChange={(event) => setCloseNotes(event.target.value)}
                placeholder={t('shifts.close.notesPlaceholder')}
                maxLength={300}
              />
            </div>
            {closeError ? <p className="text-sm text-destructive">{closeError}</p> : null}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCloseOpen(false)}>
                {t('actions.cancel')}
              </Button>
              <Button type="submit" variant="destructive" disabled={closeShift.isPending}>
                <Lock className="h-4 w-4" />
                {t('shifts.close.confirm')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={detailTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDetailTarget(null);
        }}
      >
        <DialogContent
          title={
            detailTarget
              ? t('shifts.detail.title', { number: detailTarget.shiftNumber })
              : undefined
          }
          description={t('shifts.detail.description')}
        >
          {detailTarget ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={detailTarget.status === 'OPEN' ? 'success' : 'outline'}>
                  {t(`shifts.status.${detailTarget.status}`)}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {t('shifts.current.openedLine', {
                    when: formatDateTime(detailTarget.openedAt),
                    name: detailTarget.openedByName,
                  })}
                </span>
                <span className="numeric text-xs text-muted-foreground">
                  {detailTarget.terminalId}
                </span>
              </div>
              <TotalsGrid totals={detailTarget.totals} />
              {detailTarget.cashMovements.length > 0 ? (
                <div className="overflow-x-auto rounded-lg border border-border">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground">
                        <th className="px-3 py-2 font-semibold">{t('actions.type')}</th>
                        <th className="px-3 py-2 text-end font-semibold">{t('actions.total')}</th>
                        <th className="px-3 py-2 font-semibold">{t('shifts.movement.reason')}</th>
                        <th className="px-3 py-2 font-semibold">{t('shifts.current.operator')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detailTarget.cashMovements.map((movement) => (
                        <tr key={movement.id} className="border-b border-border/70 last:border-0">
                          <td className="px-3 py-2">
                            <Badge variant={movement.type === 'CASH_IN' ? 'success' : 'warning'}>
                              {movement.type === 'CASH_IN'
                                ? t('shifts.current.cashIn')
                                : t('shifts.current.cashOut')}
                            </Badge>
                          </td>
                          <td className="numeric px-3 py-2 text-end">
                            {formatMoney(movement.amount)}
                          </td>
                          <td className="px-3 py-2 text-muted-foreground">{movement.reason}</td>
                          <td className="px-3 py-2 text-muted-foreground">{movement.userName}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
              {detailTarget.zReport ? (
                <div className="flex items-center gap-3 rounded-lg border border-success/30 bg-success/10 p-3 text-sm">
                  <Lock className="h-4 w-4 text-success" />
                  <div className="min-w-0 flex-1">
                    <p className="numeric font-semibold">
                      {detailTarget.zReport.reportNumber} ·{' '}
                      {detailTarget.zReport.businessDate.slice(0, 10)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatDateTime(detailTarget.zReport.lockedAt)}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setZDetail(detailTarget.zReport);
                      setDetailTarget(null);
                    }}
                  >
                    {t('shifts.zReports.viewAction')}
                  </Button>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">{t('shifts.detail.noZReport')}</p>
              )}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={zDetail !== null}
        onOpenChange={(open) => {
          if (!open) setZDetail(null);
        }}
      >
        <DialogContent
          title={
            zDetail
              ? t('shifts.zReports.detailTitle', { number: zDetail.reportNumber })
              : undefined
          }
          description={
            zDetail
              ? t('shifts.zReports.detailDescription', {
                  date: zDetail.businessDate.slice(0, 10),
                  terminal: zDetail.terminalId,
                })
              : undefined
          }
        >
          {zDetail ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="success">
                  <CircleDollarSign className="me-1 h-3 w-3" />
                  {formatMoney(zDetail.totals.grossSales)}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {formatDateTime(zDetail.lockedAt)}
                </span>
              </div>
              <TotalsGrid totals={zDetail.totals} />
            </div>
          ) : null}
          <DialogFooter>
            <ExportActions
              csv={exportZCsv}
              excel={exportZExcel}
              pdf={exportZPdf}
              disabled={!zDetail}
            />
            <Button variant="outline" onClick={() => setZDetail(null)}>
              {t('actions.close')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
