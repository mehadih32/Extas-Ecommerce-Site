// PR 789 — Settings › Store details: which setting each box of each card edits, in the prototype's card order
// (docs/demo/admin-proto-v5/js/m-settings.js `renderStore`). A box edits either a setting of its own (`key`) or one
// field of the `store.details` setting (`d`). Pure: no React, no database. Words: messages/admin-store.<lang>.json `stp.c.*`.
import type { Key, StoreDetails } from '@extas/settings';

export type StoreCardId = 'legal' | 'addresses' | 'contact' | 'brand' | 'social' | 'print' | 'numbers' | 'tax' | 'targets';
export const STORE_CARD_IDS: readonly StoreCardId[] = ['legal', 'addresses', 'contact', 'brand', 'social', 'print', 'numbers', 'tax', 'targets'];

export type StoreBoxKind = 'text' | 'pair' | 'date' | 'select' | 'switch' | 'number' | 'colour' | 'time' | 'pin';

export interface StoreBox {
  /** The box's name inside its card (also its label words: `stp.c.<card>.<id>`). */
  id: string;
  kind: StoreBoxKind;
  /** A setting of its own … */
  key?: Key;
  /** … or a field of `store.details`. */
  d?: keyof StoreDetails;
  options?: readonly string[];
  /** PR 991: a box of the holiday mode setting (`delivery.holiday`): its switch, banner words or last day. */
  h?: 'enabled' | 'msg' | 'until';
  /** PR 991: shown only while this switch of the same card is on. */
  whenOn?: string;
  /** A number box: lowest and highest value. */
  min?: number;
  max?: number;
}

/** The four numbers the shop prints only when set (they count for "needed before go-live"). */
export const LEGAL_BOXES = ['registeredName', 'tradeLicence', 'dbid', 'bin'] as const;

export const STORE_CARDS: Readonly<Record<StoreCardId, readonly StoreBox[]>> = {
  legal: [
    { id: 'shopName', kind: 'text', key: 'store.name' },
    { id: 'registeredName', kind: 'text', key: 'legal.registeredName' },
    { id: 'ownerName', kind: 'text', d: 'ownerName' },
    { id: 'tradeLicence', kind: 'text', key: 'legal.tradeLicence' },
    { id: 'tlExpiry', kind: 'date', d: 'tlExpiry' },
    { id: 'dbid', kind: 'text', key: 'legal.dbid' },
    { id: 'tin', kind: 'text', d: 'tin' },
    { id: 'ecab', kind: 'text', d: 'ecab' },
    { id: 'complaintOfficer', kind: 'text', d: 'complaintOfficer' },
    { id: 'dpo', kind: 'text', d: 'dpo' },
  ],
  addresses: [
    { id: 'officeAddr', kind: 'pair', key: 'contact.address' },
    { id: 'warehouseAddr', kind: 'text', d: 'warehouseAddr' },
    { id: 'returnsAddr', kind: 'text', d: 'returnsAddr' },
    { id: 'warehousePin', kind: 'pin', d: 'warehousePin' },
  ],
  contact: [
    { id: 'phone', kind: 'text', key: 'contact.phone' },
    { id: 'whatsapp', kind: 'text', key: 'contact.whatsapp' },
    { id: 'supportEmail', kind: 'text', d: 'supportEmail' },
    { id: 'ordersEmail', kind: 'text', d: 'ordersEmail' },
    { id: 'accountsEmail', kind: 'text', d: 'accountsEmail' },
    { id: 'email', kind: 'text', key: 'contact.email' },
    { id: 'supportOpens', kind: 'time', d: 'supportOpens' },
    { id: 'supportCloses', kind: 'time', d: 'supportCloses' },
    { id: 'closedDay', kind: 'select', d: 'closedDay', options: ['none', 'friday', 'saturday'] },
  ],
  brand: [
    { id: 'colorMain', kind: 'colour', d: 'colorMain' },
    { id: 'colorSecond', kind: 'colour', d: 'colorSecond' },
  ],
  social: [
    { id: 'facebook', kind: 'text', key: 'social.facebook' },
    { id: 'instagram', kind: 'text', key: 'social.instagram' },
    { id: 'tiktok', kind: 'text', key: 'social.tiktok' },
    { id: 'youtube', kind: 'text', key: 'social.youtube' },
  ],
  print: [
    { id: 'invHead', kind: 'text', d: 'invHead' },
    { id: 'invFoot', kind: 'text', d: 'invFoot' },
    { id: 'stHead', kind: 'text', d: 'stHead' },
    { id: 'stFoot', kind: 'text', d: 'stFoot' },
    { id: 'stSize', kind: 'select', d: 'stSize', options: ['4x3', '4x6', 'a6', '75x50'] },
  ],
  numbers: [
    { id: 'orderPrefix', kind: 'text', key: 'checkout.order.numberPrefix' },
    { id: 'moneyFmt', kind: 'select', d: 'moneyFmt', options: ['bd', 'intl'] },
    { id: 'custLang', kind: 'select', d: 'custLang', options: ['both', 'bn', 'en'] },
    { id: 'holidayOn', kind: 'switch', h: 'enabled' },
    { id: 'holidayMsg', kind: 'text', h: 'msg', whenOn: 'holidayOn' },
    { id: 'holidayUntil', kind: 'date', h: 'until', whenOn: 'holidayOn' },
  ],
  tax: [
    { id: 'showVat', kind: 'switch', d: 'showVat' },
    { id: 'bin', kind: 'text', key: 'legal.bin', whenOn: 'showVat' },
  ],
  targets: [
    { id: 'targetSales', kind: 'number', d: 'targetSales', min: 0, max: 1_000_000_000 },
    { id: 'targetProfit', kind: 'number', d: 'targetProfit', min: 0, max: 1_000_000_000 },
    { id: 'targetAdPct', kind: 'number', d: 'targetAdPct', min: 0, max: 100 },
  ],
};

/** Every box with its card, in the card order. */
export function allBoxes(): { card: StoreCardId; box: StoreBox }[] {
  return STORE_CARD_IDS.flatMap((card) => STORE_CARDS[card].map((box) => ({ card, box })));
}

/** The box that holds a number the shop prints only when set. */
export function legalBox(id: (typeof LEGAL_BOXES)[number]): { card: StoreCardId; box: StoreBox } {
  const f = allBoxes().find((x) => x.box.id === id);
  if (!f) throw new Error(`no box ${id}`);
  return f;
}
