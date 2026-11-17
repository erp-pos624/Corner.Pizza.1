import type { ReactElement } from 'react';
import type { KitchenOrderDto } from '@posshope/shared';
import cornerLogo from '../../assets/corner-logo.svg';
import { formatDateTime, formatNumber, formatTime, orderTypeLabel } from '../../lib/format';
import type { ThermalPaper } from '../../lib/receipt-paper';
import { useI18n } from '../../i18n';

const FALLBACK_PREP_MINUTES = 15;

export type KitchenTicketOrder = Pick<
  KitchenOrderDto,
  'orderNumber' | 'type' | 'tableNumber' | 'createdAt' | 'notes'
> & {
  items: ReadonlyArray<
    Pick<
      KitchenOrderDto['items'][number],
      'id' | 'name' | 'quantity' | 'sizeName' | 'specialInstructions' | 'toppings' | 'prepMinutes'
    >
  >;
};

/** Thermal kitchen docket: items, notes and ready time only — never prices. */
export function KitchenTicket({
  order,
  paper,
  standalone = false,
}: {
  order: KitchenTicketOrder;
  paper: ThermalPaper;
  standalone?: boolean;
}): ReactElement {
  const { t } = useI18n();
  const longest = order.items.reduce((max, item) => Math.max(max, item.prepMinutes), 0);
  const minutes = longest > 0 ? longest : FALLBACK_PREP_MINUTES;
  const readyAt = new Date(new Date(order.createdAt).getTime() + minutes * 60_000);
  const printedAt = new Date();
  const tableLabel = order.tableNumber
    ? t('invoices.document.table', { number: order.tableNumber })
    : '';
  const orderType = orderTypeLabel(order.type);
  const readyIn = t('invoices.document.readyIn', { minutes: formatNumber(minutes) });

  const narrow = paper === '58';

  return (
    <div
      className={`receipt-sheet kitchen-copy${narrow ? ' receipt-sheet--58' : ''}${
        standalone ? ' kitchen-copy-page' : ''
      }`}
    >
      {/* The docket can be the root of its own print job (POS, kitchen board)
          or a second copy under an A4 invoice, where the page size is fixed. */}
      {standalone ? null : (
        <style>{`@media print { @page { size: ${paper}mm auto; margin: 0; } }`}</style>
      )}
      <div style={{ textAlign: 'center' }}>
        <img
          src={cornerLogo}
          alt=""
          style={{
            display: 'block',
            width: narrow ? '11mm' : '15mm',
            height: narrow ? '11mm' : '15mm',
            objectFit: 'contain',
            margin: '0 auto 1.5mm',
          }}
        />
        <p style={{ fontSize: narrow ? 13 : 14, fontWeight: 800, letterSpacing: '0.12em', margin: 0 }}>
          {t('app.name').toUpperCase()}
        </p>
        <p style={{ margin: '1px 0 0', fontSize: 11, fontWeight: 800, letterSpacing: '0.08em' }}>
          {t('invoices.document.kitchenCopy')}
        </p>
      </div>

      <div className="divider" />

      <div className="row"><span>{t('invoices.document.order')}</span><strong>{order.orderNumber}</strong></div>
      <div className="row"><span>{t('invoices.document.orderReceived')}</span><span>{formatTime(order.createdAt)}</span></div>
      <div className="row"><span>{t('invoices.document.service')}</span><span>{orderType}{tableLabel ? ` · ${tableLabel}` : ''}</span></div>

      <div className="divider" />

      <div style={{ textAlign: 'center', margin: '1mm 0' }}>
        <p style={{ margin: 0, fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          {t('invoices.document.estimatedReady')}
        </p>
        <p style={{ margin: '0.5mm 0 0', fontSize: 16, fontWeight: 800 }}>{formatTime(readyAt)}</p>
        <p style={{ margin: 0, fontSize: 9.5 }}>{readyIn}</p>
      </div>

      <div className="divider" />

      {order.items.map((item) => (
        <div key={item.id} style={{ marginBottom: '2mm' }}>
          <div style={{ fontWeight: 700 }}>
            {formatNumber(item.quantity)}× {item.name}
            {item.sizeName ? ` (${item.sizeName})` : ''}
          </div>
          {item.toppings.length > 0 ? (
            <div style={{ paddingInlineStart: '3mm', fontSize: 9.5 }}>
              + {item.toppings.join(', ')}
            </div>
          ) : null}
          {item.specialInstructions ? (
            <div style={{ paddingInlineStart: '3mm', fontSize: 9, fontStyle: 'italic' }}>
              “{item.specialInstructions}”
            </div>
          ) : null}
        </div>
      ))}

      {order.notes ? (
        <>
          <div className="divider" />
          <p style={{ margin: 0, fontSize: 9, fontWeight: 700, textTransform: 'uppercase' }}>
            {t('invoices.document.notes')}
          </p>
          <p style={{ margin: '0.5mm 0 0', whiteSpace: 'pre-wrap' }}>{order.notes}</p>
        </>
      ) : null}

      <div className="divider" />

      <p style={{ margin: 0, textAlign: 'center', fontSize: 11, fontWeight: 800, letterSpacing: '0.08em' }}>
        {t('invoices.document.startPreparation')}
      </p>
      <p style={{ margin: '1mm 0 0', textAlign: 'center', fontSize: 8.5, color: '#555' }}>
        {t('invoices.document.printed', { date: formatDateTime(printedAt) })}
      </p>
    </div>
  );
}
