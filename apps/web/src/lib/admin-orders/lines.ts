// PR 127 follow-up 215 (CN-018) — the team's "Add a line" and "Remove" on one order's screen (demo V12.3 a2o items),
// on the existing order commands (`POST /api/admin/orders/:id/lines`, `…/lines/:lineId/remove`, permission
// `orders.lines`; packages/orders/src/addon.ts). Shown only while the machine allows them (before a courier is booked,
// no cancel pending), on a Cash on Delivery order, to a person holding `orders.lines`; the service checks all of it again.
//
// "Add a line": the person types the piece's SKU (what the customer read out on the call) and how many; the line is
// priced as its product page prices it now, nothing already on the order is priced again, and the amount due at the
// door grows by exactly that line (the same rule as the customer's own "Add to this parcel"). "Remove" is offered only
// on a line added after the order was placed; the line is marked taken out and stays on the order's record (never
// deleted), its pieces go back to stock and the amount due shrinks by it. A line that came with the order is changed
// through "Edit items & address".
import { ADD_LINE_MAX_QUANTITY, type OrderCommand } from '@extas/orders';
import type { AdminView } from '../admin-page';
import { t } from '../i18n';
import type { CommandSpec } from './spec';

export interface LineItem {
  id: string;
  status: string;
  isAddOn: boolean;
  productName: string;
  lineTotal: string;
}

const base = (orderId: string) => `/api/admin/orders/${orderId}/lines`;

/** The "Add a line" button and one "Remove" per added line, for what the person may do now. */
export function lineSpecs(
  view: AdminView,
  o: { id: string; number: string; version: number; paymentMethod: string | null },
  allowed: readonly OrderCommand[],
  perms: ReadonlySet<string>,
  items: readonly LineItem[],
): { add: CommandSpec | null; remove: Record<string, CommandSpec> } {
  if (!perms.has('orders.lines') || o.paymentMethod !== 'COD') return { add: null, remove: {} };
  const d = view.dict;
  const tt = (k: string, v?: Record<string, string>) => t(d, `orders.lines.${k}`, { n: o.number, ...v });
  const qty = Array.from({ length: ADD_LINE_MAX_QUANTITY }, (_, i) => String(i + 1));
  const add: CommandSpec | null = allowed.includes('addLine')
    ? {
        id: 'addLine',
        label: tt('add.label'),
        icon: 'plus',
        url: base(o.id),
        version: o.version,
        title: tt('add.title'),
        effects: [tt('eff.price'), tt('eff.due'), tt('eff.stock'), tt('eff.erp'), tt('eff.log')],
        fields: [
          { name: 'sku', kind: 'text', label: tt('add.sku'), placeholder: tt('add.skuPh'), required: true, maxLength: 80 },
          { name: 'quantity', kind: 'select', label: tt('add.quantity'), options: qty.map((q) => ({ value: q, label: q })), value: qty[0] },
        ],
        ok: tt('add.ok'),
        okTone: 'pri',
        done: tt('add.done'),
      }
    : null;
  const remove: Record<string, CommandSpec> = {};
  if (allowed.includes('removeLine'))
    for (const i of items)
      if (i.status === 'ACTIVE' && i.isAddOn)
        remove[i.id] = {
          id: `removeLine-${i.id}`,
          label: tt('remove.label'),
          tone: 'bad',
          url: `${base(o.id)}/${i.id}/remove`,
          version: o.version,
          title: tt('remove.title', { line: i.productName }),
          effects: [tt('eff.kept'), tt('eff.back'), tt('eff.less', { amount: i.lineTotal }), tt('eff.erp'), tt('eff.log')],
          fields: [],
          ok: tt('remove.ok'),
          okTone: 'badf',
          done: tt('remove.done'),
        };
  return { add, remove };
}

/** The dialog's flat form as the service's input: a SKU or a variant id, and a whole number of pieces. */
export function addLineBody(input: Record<string, unknown>): { sku: string | null; variantId: string | null; quantity: number | undefined } {
  const sku = typeof input.sku === 'string' && input.sku.trim() ? input.sku.trim() : null;
  const variantId = typeof input.variantId === 'string' ? input.variantId : null;
  const q = input.quantity;
  const quantity = typeof q === 'number' ? q : typeof q === 'string' && /^\d+$/.test(q.trim()) ? Number(q.trim()) : q === undefined ? undefined : NaN;
  return { sku, variantId, quantity };
}
