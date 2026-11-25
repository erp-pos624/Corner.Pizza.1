import { useQuery } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import type { KitchenOrderDto, OrderDto, SettingsDto, ShiftDto } from '@posshope/shared';
import { toast } from '../components/ui/toast';
import { useI18n } from '../i18n';
import { api } from '../lib/api';
import { hasCapability, useDeviceConfig } from '../lib/device';
import {
  dispatchPrint,
  printableFromKitchen,
  printableFromOrder,
  type DispatchResult,
} from '../lib/print-service';

/**
 * Automatic printing for this terminal, driven by its device setup and the
 * printers configured in the dashboard. Every function reports whether any
 * configured printer took the job, so callers can fall back to the dialog.
 */
export function useStationPrinting(options: {
  settings: SettingsDto | null | undefined;
  categoryOf?: (menuItemId: string) => string | null;
}) {
  const { t } = useI18n();
  const device = useDeviceConfig();
  const printersQuery = useQuery({
    queryKey: ['printers'],
    queryFn: () => api.printers.list(),
    staleTime: 60_000,
  });
  const printers = useMemo(() => printersQuery.data ?? [], [printersQuery.data]);
  const { settings, categoryOf } = options;

  // Without a device setup (e.g. the browser dashboard) nothing prints automatically.
  const autoReceipts = hasCapability(device, 'AUTO_PRINT_RECEIPTS');
  const autoKitchen = hasCapability(device, 'AUTO_PRINT_KITCHEN');

  const report = useCallback(
    (result: DispatchResult): void => {
      for (const failure of result.failed) {
        toast.error(failure.error, t('printing.failedTitle', { printer: failure.printer }));
      }
    },
    [t],
  );

  /**
   * After checkout: kitchen ticket, customer receipt and (for delivery) the
   * dispatch slip. `addedItems` is set when items were added to an open tab;
   * then only the kitchen gets the new lines.
   */
  const printNewOrder = useCallback(
    async (
      order: OrderDto,
      addedItems: OrderDto['items'] | null,
    ): Promise<{ kitchenRouted: boolean }> => {
      if (printers.length === 0) return { kitchenRouted: false };
      const taxRate = settings?.taxRate ?? null;
      let kitchenRouted = false;
      if (autoKitchen) {
        const kitchenOrder = printableFromOrder(
          addedItems ? { ...order, items: addedItems } : order,
          categoryOf,
          taxRate,
        );
        const result = await dispatchPrint({ job: 'KITCHEN', printers, settings, order: kitchenOrder });
        report(result);
        kitchenRouted = !result.noRoute;
      }
      if (!addedItems) {
        const full = printableFromOrder(order, categoryOf, taxRate);
        if (autoReceipts) {
          report(await dispatchPrint({ job: 'CUSTOMER_RECEIPT', printers, settings, order: full }));
        }
        if (autoReceipts && order.type === 'DELIVERY') {
          report(await dispatchPrint({ job: 'DELIVERY_DISPATCH', printers, settings, order: full }));
        }
      }
      return { kitchenRouted };
    },
    [printers, settings, categoryOf, autoKitchen, autoReceipts, report],
  );

  /** KDS: a ticket that just arrived (online, Talabat or another till). */
  const printKitchenTicket = useCallback(
    async (order: KitchenOrderDto): Promise<boolean> => {
      if (!autoKitchen || printers.length === 0) return false;
      const result = await dispatchPrint({
        job: 'KITCHEN',
        printers,
        settings,
        order: printableFromKitchen(order),
      });
      report(result);
      return !result.noRoute;
    },
    [autoKitchen, printers, settings, report],
  );

  /** Manual reprint of one job for an existing order. */
  const reprint = useCallback(
    async (job: 'CUSTOMER_RECEIPT' | 'KITCHEN' | 'DELIVERY_DISPATCH', order: OrderDto) => {
      const result = await dispatchPrint({
        job,
        printers,
        settings,
        order: printableFromOrder(order, categoryOf, settings?.taxRate ?? null),
      });
      report(result);
      return result;
    },
    [printers, settings, categoryOf, report],
  );

  const printZReport = useCallback(
    async (shift: ShiftDto) => {
      const result = await dispatchPrint({ job: 'SHIFT_Z_REPORT', printers, settings, shift });
      report(result);
      return result;
    },
    [printers, settings, report],
  );

  return { printers, device, printNewOrder, printKitchenTicket, reprint, printZReport };
}
