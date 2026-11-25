import {
  BadgePercent,
  ChevronRight,
  Minus,
  Plus,
  ShoppingBag,
  Trash2,
  UserRound,
  X,
} from 'lucide-react';
import { useState, type ReactElement } from 'react';
import { PAYMENT_METHODS, type DiscountDto, type OrderType } from '@posshope/shared';
import type { PageKey } from '../layout/AppShell';
import { Button } from '../ui/button';
import { Input, Select, Textarea } from '../ui/input';
import { Label } from '../ui/label';
import { Spinner } from '../ui/badge';
import { EmptyPanel } from '../ui/states';
import { toast } from '../ui/toast';
import { DeliveryZonePicker } from './DeliveryZonePicker';
import {
  formatDecimal,
  formatMoney,
  formatMoneyShort,
  formatNumber,
  orderTypeLabel,
  paymentMethodLabel,
} from '../../lib/format';
import { fromMinor, lineTotal, lineUnitPrice, type CartLine } from '../../lib/pos';
import { api } from '../../lib/api';
import { cn } from '../../lib/utils';
import type { PosCart } from '../../hooks/usePosCart';
import { useI18n } from '../../i18n';

interface OrderPanelProps {
  cart: PosCart;
  discounts: DiscountDto[];
  isAdmin: boolean;
  onNavigate: (page: PageKey) => void;
  onEditLine: (line: CartLine) => void;
  onRemoveLine: (key: string) => void;
  onOpenCustomerPicker: () => void;
}

export function OrderPanel({
  cart,
  discounts,
  isAdmin,
  onNavigate,
  onEditLine,
  onRemoveLine,
  onOpenCustomerPicker,
}: OrderPanelProps): ReactElement {
  const { t } = useI18n();
  const [attaching, setAttaching] = useState(false);
  const {
    cart: lines,
    tables,
    orderType,
    tableId,
    payLater,
    isCod,
    tab,
    customer,
    discountId,
    notes,
    paymentLines,
    paymentSummary,
    validationError,
    createOrder,
  } = cart;

  const selectedTable = tables.find((table) => table.id === tableId) ?? null;
  const paymentDeferred = Boolean(tab) || payLater || isCod;
  const deliveryBranchCenter =
    cart.deliveryBranch?.latitude != null && cart.deliveryBranch.longitude != null
      ? { lat: cart.deliveryBranch.latitude, lng: cart.deliveryBranch.longitude }
      : null;

  const continueTab = async (): Promise<void> => {
    if (!selectedTable?.openOrderId) return;
    setAttaching(true);
    try {
      const order = await api.orders.get(selectedTable.openOrderId);
      cart.attachTab(order);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('pos.errors.loadTab'));
    } finally {
      setAttaching(false);
    }
  };

  return (
    <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold">{t('pos.currentOrder')}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {t('pos.orderSummary', {
              count: formatNumber(lines.reduce((sum, line) => sum + line.quantity, 0)),
              type: orderTypeLabel(orderType),
            })}
          </p>
        </div>
        {lines.length > 0 ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => cart.setCart([])}
            className="text-xs text-muted-foreground"
          >
            <Trash2 className="h-3.5 w-3.5" />
            {t('pos.clear')}
          </Button>
        ) : null}
      </header>

      <div className="flex gap-1 border-b border-border p-2">
        {(['DINE_IN', 'TAKEAWAY', 'DELIVERY'] as OrderType[]).map((type) => (
          <button
            key={type}
            type="button"
            onClick={() => cart.setOrderType(type)}
            className={cn(
              'flex-1 rounded-md px-2 py-1.5 text-[11px] font-semibold transition-colors',
              orderType === type
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-muted',
            )}
          >
            {orderTypeLabel(type)}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="space-y-3 border-b border-border p-3">
          {orderType === 'DINE_IN' ? (
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <Label
                  htmlFor="table-select"
                  className="w-16 shrink-0 text-xs text-muted-foreground"
                >
                  {t('pos.table')}
                </Label>
                <Select
                  id="table-select"
                  value={tableId ?? ''}
                  onChange={(event) => cart.chooseTable(event.target.value || null)}
                  className="h-8"
                >
                  <option value="">{t('pos.tableSelect')}</option>
                  {tables
                    .filter((table) => table.isActive)
                    .map((table) => (
                      <option key={table.id} value={table.id}>
                        {table.name}
                        {table.openOrderId ? ` · ${formatMoney(table.openOrderTotal ?? 0)}` : ''}
                      </option>
                    ))}
                </Select>
              </div>
              {selectedTable?.openOrderId && !tab ? (
                <div className="flex items-center justify-between gap-2 rounded-md border border-warning/40 bg-warning/10 px-2 py-1 text-[11px]">
                  <span className="numeric">
                    {t('pos.tableOpenHint', {
                      number: selectedTable.openOrderNumber ?? '',
                      total: formatMoney(selectedTable.openOrderTotal ?? 0),
                    })}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void continueTab()}
                    disabled={attaching}
                  >
                    {t('pos.continueTab')}
                  </Button>
                </div>
              ) : null}
              {!tab ? (
                <label className="flex items-start gap-2 rounded-md border border-border bg-muted/30 px-2 py-1.5 text-[11px]">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-3.5 w-3.5 rounded border-input"
                    checked={payLater}
                    onChange={(event) => cart.setPayLater(event.target.checked)}
                  />
                  <span>
                    <span className="font-semibold">{t('pos.payLater')}</span>
                    <span className="mt-0.5 block text-muted-foreground">
                      {t('pos.payLaterHint')}
                    </span>
                  </span>
                </label>
              ) : null}
              {tab ? (
                <div className="flex items-center justify-between gap-2 rounded-md border border-primary/30 bg-primary/10 px-2 py-1.5 text-[11px]">
                  <div className="min-w-0">
                    <p className="font-semibold">
                      {t('pos.tabBanner', { number: tab.orderNumber })}
                    </p>
                    <p className="numeric text-muted-foreground">
                      {t('pos.tabTotal', { total: formatMoney(tab.total) })}
                    </p>
                  </div>
                  <Button size="sm" variant="ghost" onClick={cart.leaveTab}>
                    {t('pos.leaveTab')}
                  </Button>
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="flex items-center justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {t('pos.guest.title')}
            </p>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={onOpenCustomerPicker}
                className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-[11px] font-medium text-secondary hover:bg-secondary/10"
              >
                <UserRound className="h-3 w-3" /> {t('pos.guest.saved')}
              </button>
              {customer.id || customer.name ? (
                <button
                  type="button"
                  onClick={cart.clearCustomer}
                  className="rounded px-1.5 py-1 text-[11px] text-muted-foreground hover:bg-muted"
                >
                  {t('pos.guest.clear')}
                </button>
              ) : null}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Input
              value={customer.name}
              onChange={(event) =>
                cart.setCustomer((current) => ({
                  ...current,
                  id: null,
                  name: event.target.value,
                }))
              }
              placeholder={t('pos.guest.name')}
              aria-label={t('pos.guest.name')}
              className="h-8"
            />
            <Input
              value={customer.phone}
              onChange={(event) =>
                cart.setCustomer((current) => ({
                  ...current,
                  id: null,
                  phone: event.target.value,
                }))
              }
              placeholder={t('pos.guest.phone')}
              aria-label={t('pos.guest.phone')}
              className="h-8"
              dir="ltr"
            />
          </div>
          {orderType === 'DELIVERY' ? (
            <>
              <Input
                value={customer.address}
                onChange={(event) =>
                  cart.setCustomer((current) => ({
                    ...current,
                    id: null,
                    address: event.target.value,
                  }))
                }
                placeholder={t('pos.guest.address')}
                aria-label={t('pos.guest.address')}
                className="h-8"
              />
              <DeliveryZonePicker
                branchCenter={deliveryBranchCenter}
                zones={cart.deliveryZones}
                point={cart.deliveryPoint}
                onPick={cart.setDeliveryPoint}
                preview={cart.deliveryPreview}
                check={cart.zoneCheck}
                checking={cart.deliveryPending}
              />
              <label className="flex items-start gap-2 rounded-md border border-border bg-muted/30 px-2 py-1.5 text-[11px]">
                <input
                  type="checkbox"
                  className="mt-0.5 h-3.5 w-3.5 rounded border-input"
                  checked={isCod}
                  onChange={(event) => cart.setIsCod(event.target.checked)}
                />
                <span>
                  <span className="font-semibold">{t('pos.cod')}</span>
                  <span className="mt-0.5 block text-muted-foreground">{t('pos.codHint')}</span>
                </span>
              </label>
            </>
          ) : null}
        </div>

        <div className="divide-y divide-border">
          {lines.length === 0 ? (
            <EmptyPanel title={t('pos.cartEmpty.title')} message={t('pos.cartEmpty.message')} />
          ) : (
            lines.map((line) => (
              <div key={line.key} className="px-3 py-3">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">
                      {line.name}
                      {line.sizeName ? (
                        <span className="ms-1 text-[11px] font-normal text-muted-foreground">
                          · {line.sizeName}
                        </span>
                      ) : null}
                    </p>
                    {line.toppings.length > 0 ? (
                      <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">
                        + {line.toppings.map((topping) => topping.name).join(', ')}
                      </p>
                    ) : null}
                    {line.specialInstructions ? (
                      <p className="mt-0.5 line-clamp-1 text-[11px] italic text-muted-foreground">
                        “{line.specialInstructions}”
                      </p>
                    ) : null}
                    <div className="mt-1.5 flex items-center gap-2">
                      <div className="inline-flex items-center rounded-md border border-border">
                        <button
                          type="button"
                          onClick={() => cart.changeQuantity(line.key, -1)}
                          className="flex h-6 w-6 items-center justify-center text-muted-foreground hover:bg-muted disabled:opacity-40"
                          disabled={line.quantity <= 1}
                          aria-label={t('pos.line.decrease', { name: line.name })}
                        >
                          <Minus className="h-3 w-3" />
                        </button>
                        <span className="numeric w-6 text-center text-[11px] font-bold">
                          {formatNumber(line.quantity)}
                        </span>
                        <button
                          type="button"
                          onClick={() => cart.changeQuantity(line.key, 1)}
                          className="flex h-6 w-6 items-center justify-center text-muted-foreground hover:bg-muted"
                          aria-label={t('pos.line.increase', { name: line.name })}
                        >
                          <Plus className="h-3 w-3" />
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => onEditLine(line)}
                        className="text-[11px] font-medium text-secondary hover:underline"
                      >
                        {t('pos.line.edit')}
                      </button>
                      <button
                        type="button"
                        onClick={() => onRemoveLine(line.key)}
                        className="text-[11px] font-medium text-muted-foreground hover:text-destructive"
                      >
                        {t('pos.line.remove')}
                      </button>
                    </div>
                  </div>
                  <div className="text-end">
                    <p className="numeric text-sm font-bold">{formatMoney(lineTotal(line))}</p>
                    <p className="numeric text-[10px] text-muted-foreground">
                      {t('pos.line.each', { price: formatMoney(lineUnitPrice(line)) })}
                    </p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="space-y-2 border-t border-border p-3">
          <div className="flex items-center gap-2">
            <BadgePercent className="h-3.5 w-3.5 text-muted-foreground" />
            <Select
              value={discountId}
              onChange={(event) => cart.setDiscountId(event.target.value)}
              aria-label={t('pos.summary.discount')}
              className="h-8 flex-1 text-xs"
              disabled={Boolean(tab)}
            >
              <option value="">{t('pos.discount.none')}</option>
              {discounts.map((discount: DiscountDto) => (
                <option key={discount.id} value={discount.id}>
                  {discount.name} ·{' '}
                  {discount.type === 'PERCENT'
                    ? `${formatDecimal(Number(discount.value))}%`
                    : formatMoney(discount.value)}
                </option>
              ))}
            </Select>
          </div>
          {!isAdmin ? (
            <p
              className={cn(
                'text-[10px]',
                cart.overCashierCap ? 'text-destructive' : 'text-muted-foreground',
              )}
            >
              {t('pos.discount.limit', {
                percent: formatDecimal(cart.capPct, 0),
                amount: formatMoney(fromMinor(cart.capMinor)),
              })}
            </p>
          ) : null}
          {!cart.tab ? (
            <div className="rounded-md border border-border bg-card p-2">
              <label className="flex items-center gap-2 text-xs font-semibold">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-input"
                  checked={cart.channel === 'TALABAT'}
                  onChange={(event) => cart.setChannel(event.target.checked ? 'TALABAT' : 'POS')}
                />
                {t('pos.talabat.toggle')}
              </label>
              {cart.channel === 'TALABAT' ? (
                <div className="mt-2 space-y-1">
                  <Input
                    value={cart.externalRef}
                    onChange={(event) => cart.setExternalRef(event.target.value)}
                    placeholder={t('pos.talabat.refPlaceholder')}
                    aria-label={t('pos.talabat.ref')}
                    maxLength={60}
                    className="h-8 text-xs"
                    dir="ltr"
                  />
                  <p className="text-[10px] text-muted-foreground">{t('pos.talabat.hint')}</p>
                </div>
              ) : null}
            </div>
          ) : null}
          <Textarea
            value={notes}
            onChange={(event) => cart.setNotes(event.target.value)}
            placeholder={t('pos.orderNotes')}
            aria-label={t('pos.orderNotes')}
            maxLength={600}
            className="min-h-[50px] text-xs"
          />
        </div>
      </div>

      <div className="border-t border-border bg-muted/30 p-3">
        <div className="space-y-1 text-xs">
          <SummaryRow
            label={t('pos.summary.subtotal')}
            value={formatMoney(fromMinor(cart.subtotalMinor))}
          />
          {cart.discountMinor > 0 ? (
            <SummaryRow
              label={`${t('pos.summary.discount')}${cart.selectedDiscount ? ` · ${cart.selectedDiscount.name}` : ''}`}
              value={`−${formatMoney(fromMinor(cart.discountMinor))}`}
              tone="success"
            />
          ) : null}
          {cart.addedTaxMinor > 0 || cart.includedTaxMinor === 0 ? (
            <SummaryRow
              label={t('pos.summary.tax', { rate: formatDecimal(cart.taxRate, 2) })}
              value={formatMoney(fromMinor(cart.addedTaxMinor))}
            />
          ) : null}
          {cart.includedTaxMinor > 0 ? (
            <SummaryRow
              label={t('pos.summary.taxIncluded', { rate: formatDecimal(cart.taxRate, 2) })}
              value={formatMoney(fromMinor(cart.includedTaxMinor))}
              tone="muted"
            />
          ) : null}
          {cart.deliveryMinor > 0 ? (
            <SummaryRow
              label={t('pos.summary.delivery')}
              value={formatMoney(fromMinor(cart.deliveryMinor))}
            />
          ) : null}
          <div className="flex items-center justify-between border-t border-border pt-1.5 text-base font-bold">
            <span>{t('pos.summary.total')}</span>
            <span className="numeric">{formatMoney(fromMinor(cart.totalMinor))}</span>
          </div>
        </div>

        <div className="mt-3 space-y-2">
          {paymentDeferred ? (
            <p className="rounded-md border border-dashed border-border bg-card px-2 py-2 text-[11px] text-muted-foreground">
              {t('pos.deferredNote')}
            </p>
          ) : (
            <>
              {paymentLines.map((line, index) => {
                const usedByOthers = new Set(
                  paymentLines
                    .filter((entry) => entry.key !== line.key)
                    .map((entry) => entry.method),
                );
                const otherMinor = paymentLines
                  .filter((entry) => entry.key !== line.key)
                  .reduce((sum, entry) => sum + Math.round(Number(entry.amount || '0') * 100), 0);
                const exactMinor = Math.max(cart.totalMinor - otherMinor, 0);
                return (
                  <div
                    key={line.key}
                    className="space-y-1.5 rounded-lg border border-border bg-card p-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
                        {t('pos.payment.line', { number: formatNumber(index + 1) })}
                      </span>
                      {paymentLines.length > 1 ? (
                        <button
                          type="button"
                          onClick={() => cart.removePaymentLine(line.key)}
                          aria-label={t('pos.payment.remove')}
                          className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-destructive focus-ring"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      ) : null}
                    </div>

                    <div className="grid grid-cols-3 gap-1">
                      {PAYMENT_METHODS.map((method) => {
                        const active = line.method === method;
                        const blocked = !active && usedByOthers.has(method);
                        return (
                          <button
                            key={method}
                            type="button"
                            aria-pressed={active}
                            disabled={blocked}
                            onClick={() => cart.changePaymentMethod(line.key, method)}
                            className={cn(
                              'rounded-md border px-2 py-1.5 text-[11px] font-semibold transition-colors',
                              active
                                ? 'border-primary bg-primary text-primary-foreground'
                                : 'border-border bg-card text-muted-foreground hover:bg-muted',
                              blocked && 'cursor-not-allowed opacity-40 hover:bg-card',
                            )}
                          >
                            {paymentMethodLabel(method)}
                          </button>
                        );
                      })}
                    </div>

                    <div className="flex items-center gap-2">
                      <Label
                        htmlFor={`payment-amount-${line.key}`}
                        className="min-w-20 shrink-0 text-[11px] text-muted-foreground"
                      >
                        {line.method === 'CASH'
                          ? t('pos.payment.cashReceived')
                          : t('pos.payment.amount')}
                      </Label>
                      <Input
                        id={`payment-amount-${line.key}`}
                        type="number"
                        min="0"
                        step="0.01"
                        inputMode="decimal"
                        value={line.amount}
                        onChange={(event) =>
                          cart.updatePaymentLine(line.key, { amount: event.target.value })
                        }
                        placeholder={fromMinor(exactMinor)}
                        className="h-8 text-end font-semibold"
                        dir="ltr"
                      />
                    </div>

                    {line.method === 'CASH' ? (
                      <div className="flex flex-wrap gap-1">
                        <button
                          type="button"
                          onClick={() =>
                            cart.updatePaymentLine(line.key, { amount: fromMinor(exactMinor) })
                          }
                          className="rounded border border-border bg-card px-1.5 py-0.5 text-[10px] font-medium hover:bg-muted"
                        >
                          {t('pos.payment.exact')}
                        </button>
                        {[100, 200, 500, 1000].map((note) => (
                          <button
                            key={note}
                            type="button"
                            onClick={() =>
                              cart.updatePaymentLine(line.key, { amount: note.toFixed(2) })
                            }
                            className="rounded border border-border bg-card px-1.5 py-0.5 text-[10px] font-medium hover:bg-muted"
                          >
                            {formatMoneyShort(note)}
                          </button>
                        ))}
                      </div>
                    ) : null}

                    <div className="flex items-center gap-2">
                      <Label
                        htmlFor={`payment-reference-${line.key}`}
                        className="min-w-20 shrink-0 text-[11px] text-muted-foreground"
                      >
                        {t('pos.payment.reference')}
                      </Label>
                      <Input
                        id={`payment-reference-${line.key}`}
                        value={line.reference}
                        onChange={(event) =>
                          cart.updatePaymentLine(line.key, { reference: event.target.value })
                        }
                        placeholder={t('pos.payment.referencePlaceholder')}
                        maxLength={60}
                        className="h-8 text-xs"
                      />
                    </div>
                  </div>
                );
              })}

              <div className="flex items-center justify-between gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={cart.addPaymentLine}
                  disabled={paymentLines.length >= PAYMENT_METHODS.length}
                >
                  <Plus className="h-3.5 w-3.5" />
                  {t('pos.payment.add')}
                </Button>
                {paymentSummary.remainingMinor > 0 ? (
                  <span className="numeric text-[11px] text-muted-foreground">
                    {t('pos.payment.remaining', {
                      amount: formatMoney(fromMinor(paymentSummary.remainingMinor)),
                    })}
                  </span>
                ) : paymentSummary.changeMinor > 0 ? (
                  <span className="numeric text-[11px] font-semibold text-success">
                    {t('pos.payment.changeDue')}:{' '}
                    {formatMoney(fromMinor(paymentSummary.changeMinor))}
                  </span>
                ) : null}
              </div>

              {paymentSummary.cashShort ? (
                <p className="text-[10px] font-medium text-destructive">
                  {t('pos.payment.shortfall')}
                </p>
              ) : null}
            </>
          )}
        </div>

        {validationError && lines.length > 0 ? (
          <p className="mt-2 text-[11px] font-medium text-destructive">{validationError}</p>
        ) : null}

        <Button
          className="mt-3 w-full"
          size="lg"
          onClick={cart.placeOrder}
          disabled={createOrder.isPending || lines.length === 0}
        >
          {createOrder.isPending ? (
            <>
              <Spinner className="border-white/40 border-t-white" /> {t('pos.placing')}
            </>
          ) : (
            <>
              <ShoppingBag className="h-4 w-4" />
              {tab
                ? t('pos.addToTab', { amount: formatMoney(fromMinor(cart.totalMinor)) })
                : paymentDeferred
                  ? t('pos.confirmOrder')
                  : t('pos.charge', { amount: formatMoney(fromMinor(cart.totalMinor)) })}
            </>
          )}
        </Button>
        <button
          type="button"
          onClick={() => onNavigate('orders')}
          className="mt-2 flex w-full items-center justify-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground"
        >
          {t('pos.viewKitchen')} <ChevronRight className="h-3 w-3 rtl:-scale-x-100" />
        </button>
      </div>
    </section>
  );
}

function SummaryRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'success' | 'muted';
}): ReactElement {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={cn(
          'numeric font-medium',
          tone === 'success' && 'text-success',
          tone === 'muted' && 'text-muted-foreground',
        )}
      >
        {value}
      </span>
    </div>
  );
}
