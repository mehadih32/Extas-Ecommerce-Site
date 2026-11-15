// PR 722 (prototype v5 parity, m-orders.js "All orders"): the three buttons at the right of the title — Export, New bulk
// order and Phone order (the primary one). Export is the order list's own CSV route with the page's own filters
// (`GET /api/admin/orders/export`, `orders.export`, checked again there), New bulk order opens Orders → Bulk. Phone order
// (PR 730) takes the order for real: the drawer of PhoneOrder.tsx places it with the website's own checkout (`orders.confirm`).
import Link from 'next/link';
import type { ListQuery } from '@/lib/admin-orders/model';
import type { AdminView } from '@/lib/admin-page';
import { t } from '@/lib/i18n';
import { ShellIcon } from '../shell/ShellIcon';
import { PhoneOrder, type PhoneOrderTexts } from './PhoneOrder';

const EXPORT_KEYS = ['view', 'status', 'q', 'payment', 'source'] as const;

/** The export address for the page's filters (only the keys the export route reads). */
export function exportHref(query: ListQuery): string {
  const p = new URLSearchParams();
  for (const k of EXPORT_KEYS) {
    const v = query[k];
    if (v) p.set(k, v);
  }
  const s = p.toString();
  return `/api/admin/orders/export${s ? `?${s}` : ''}`;
}

const PHONE_KEYS = ['button', 'title', 'sub', 'close', 'phone', 'name', 'address', 'known', 'newCaller', 'find', 'findPh', 'noProducts', 'soldOut', 'pieces', 'quantity', 'remove', 'noLines', 'check', 'create', 'back', 'items', 'delivery', 'deliveryFree', 'total', 'cod', 'needsPayment', 'created', 'open', 'again'] as const;
const PHONE_ERRORS = ['network', 'other', 'INVALID_INPUT', 'BAD_PHONE', 'OUT_OF_STOCK', 'NOT_FOUND', 'NEEDS_PAYMENT', 'PRICE_CHANGED', 'CHECKOUT', 'forbidden'] as const;

/** The Phone order drawer's words in the admin's language (`orders.phone.*`). */
function phoneTexts(view: AdminView): PhoneOrderTexts {
  const d = view.dict;
  const x = Object.fromEntries(PHONE_KEYS.map((k) => [k, t(d, `orders.phone.${k}`)])) as unknown as PhoneOrderTexts;
  x.err = Object.fromEntries(PHONE_ERRORS.map((k) => [k, t(d, `orders.phone.err.${k}`)]));
  return x;
}

export function OrderHeaderActions({ view, query, perms }: { view: AdminView; query: ListQuery; perms: ReadonlySet<string> }) {
  const d = view.dict;
  return (
    <div className="a2-gap8" data-testid="orders-actions">
      {perms.has('orders.export') ? (
        <a className="a2-btn" href={exportHref(query)} download data-testid="orders-export">
          <ShellIcon name="dl" size={15} />
          {t(d, 'orders.list.actions.export')}
        </a>
      ) : null}
      <Link className="a2-btn" href="/admin/orders/bulk" data-testid="orders-bulk-new">
        <ShellIcon name="plus" size={15} />
        {t(d, 'orders.list.actions.bulk')}
      </Link>
      {perms.has('orders.confirm') ? <PhoneOrder texts={phoneTexts(view)} lang={view.lang} locale={view.locale} /> : null}
    </div>
  );
}
