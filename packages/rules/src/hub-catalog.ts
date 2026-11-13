// S28 · PR 676, 678, 679 (CN-048, admin prototype v5, Rules) — what the Rules page lists: the groups on the left, the rows with their
// setting and editable fields, and the twelve system pop-ups of the hub. No React, no database: shared by the server pages and the
// browser editor. A row names the setting it edits (the setting itself checks every value again on save); a `link` row is a rule
// that lives on its own page ("Managed in …"). Rows of settings that only exist once another S28 PR has landed are `optional`
// (the page skips them while the setting is not in the registry). Words are in messages/admin-rules-hub.<lang>.json (`rulesHub.*`).

export const HUB_GROUPS = ['delivery', 'payment', 'checkout', 'flow', 'courier', 'couriermsg', 'exchange', 'customers', 'discounts', 'messages'] as const;
export type HubGroupId = (typeof HUB_GROUPS)[number];

/** Where Rules › Courier messages are edited (Couriers › Messages, PR 674); the Rules page only links to it. */
export const COURIER_MESSAGES_HREF = '/admin/couriers';

export interface HubField {
  /** The field inside the setting's value (dots for a nested one); '' is the whole value (a single number or amount). */
  path: string;
  type: 'bool' | 'int' | 'money' | 'choice' | 'text' | 'roleLimits' | 'roster';
  min?: number;
  max?: number;
  /** For `choice`: the allowed values. */
  options?: readonly (string | number)[];
  /** An empty box means "not set" (null). */
  nullable?: boolean;
}

export interface HubSettingRow {
  type: 'setting';
  id: string;
  group: HubGroupId;
  key: string;
  fields: readonly HubField[];
  /** The bool field that is the rule's On / Off; or `whenSet` — the rule is On while the single value is set. */
  onPath?: string;
  whenSet?: boolean;
  /** Changes what customers pay or receive: needs the owner's OK and PIN. */
  money: boolean;
  /** The setting arrives with another S28 PR: skip the row while it is not in the registry. */
  optional?: boolean;
  /** A fuller screen for the rest of this rule. */
  more?: string;
}

export interface HubLinkRow {
  type: 'link';
  id: string;
  group: HubGroupId;
  href: string;
  /** Skip the row while this setting is not in the registry. */
  needs?: string;
  /** The rule is On when this setting's `enabled` (or the setting itself, a bool) is on; no pill when absent. */
  onKey?: string;
}

export type HubRow = HubSettingRow | HubLinkRow;

export const HUB_ROWS: readonly HubRow[] = [
  // Delivery
  { type: 'setting', id: 'free', group: 'delivery', key: 'delivery.freeOverMinor', fields: [{ path: '', type: 'money', min: 1, nullable: true }], whenSet: true, money: true },
  { type: 'link', id: 'eid', group: 'delivery', href: '/admin/rules/eid', onKey: 'rules.eid.enabled' },
  {
    type: 'setting',
    id: 'peak',
    group: 'delivery',
    key: 'orders.peak',
    fields: [
      { path: 'enabled', type: 'bool' },
      { path: 'dailyCap', type: 'int', min: 1, max: 100000, nullable: true },
      { path: 'fullTextEn', type: 'text', max: 200 },
      { path: 'fullTextBn', type: 'text', max: 200 },
      { path: 'partSize', type: 'int', min: 1, max: 5000, nullable: true },
      { path: 'roster', type: 'roster' },
    ],
    onPath: 'enabled',
    money: false,
  },
  // Payment & COD
  { type: 'link', id: 'advance', group: 'payment', href: '/admin/orders/risk-rules/checkout', onKey: 'checkout.advance' },
  { type: 'link', id: 'cod', group: 'payment', href: '/admin/delivery/settings' },
  // Checkout & payments: the reward for paying online is an offer now
  { type: 'link', id: 'prepaid', group: 'checkout', href: '/admin/rules/offers', onKey: 'checkout.prepaidReward.enabled' },
  // Order flow
  {
    type: 'setting',
    id: 'autoconfirm',
    group: 'flow',
    key: 'orders.autoConfirm',
    fields: [
      { path: 'enabled', type: 'bool' },
      { path: 'trustedMinDelivered', type: 'int', min: 1, max: 100 },
      { path: 'trustedMaxRefused', type: 'int', min: 0, max: 20 },
    ],
    onPath: 'enabled',
    money: false,
    optional: true,
    more: '/admin/orders/risk-rules',
  },
  { type: 'link', id: 'score', group: 'flow', href: '/admin/orders/risk-rules', needs: 'risk.courierScore' },
  {
    type: 'setting',
    id: 'dup',
    group: 'flow',
    key: 'orders.duplicates',
    fields: [
      { path: 'enabled', type: 'bool' },
      { path: 'lookbackDays', type: 'int', min: 1, max: 60 },
      { path: 'autoHold', type: 'bool' },
    ],
    onPath: 'enabled',
    money: false,
  },
  {
    type: 'setting',
    id: 'merge',
    group: 'flow',
    key: 'orders.mergeOrders',
    fields: [
      { path: 'enabled', type: 'bool' },
      { path: 'lookBackDays', type: 'int', min: 1, max: 60 },
      { path: 'autoMerge', type: 'bool' },
      { path: 'differentAddress', type: 'choice', options: ['ask', 'refuse'] },
    ],
    onPath: 'enabled',
    money: false,
    optional: true,
  },
  {
    type: 'setting',
    id: 'adjust',
    group: 'flow',
    key: 'orders.priceAdjust',
    fields: [
      { path: 'enabled', type: 'bool' },
      { path: 'roleLimits', type: 'roleLimits' },
    ],
    onPath: 'enabled',
    money: true,
    optional: true,
  },
  { type: 'setting', id: 'advwait', group: 'flow', key: 'orders.advance.waitHours', fields: [{ path: '', type: 'int', min: 0, max: 1440 }], money: false },
  // Courier
  { type: 'link', id: 'courier', group: 'courier', href: '/admin/delivery/couriers', onKey: 'delivery.courier.selection' },
  // Courier messages: edited under Couriers (PR 674), only linked here
  { type: 'link', id: 'couriermsg', group: 'couriermsg', href: COURIER_MESSAGES_HREF },
  // Exchange
  { type: 'setting', id: 'erpcheck', group: 'exchange', key: 'returns.erpCheck.days', fields: [{ path: '', type: 'choice', options: [7, 10, 15] }], money: false },
  {
    type: 'setting',
    id: 'replace',
    group: 'exchange',
    key: 'returns.replacement',
    fields: [
      { path: 'enabled', type: 'bool' },
      { path: 'hours', type: 'int', min: 1, max: 8760 },
      { path: 'oldPieceDays', type: 'int', min: 1, max: 90 },
    ],
    onPath: 'enabled',
    money: false,
    optional: true,
  },
  // Customers
  { type: 'link', id: 'grades', group: 'customers', href: '/admin/customers/settings', onKey: 'customers.grades' },
  // Discounts: the smart rules are listed from the database; Offers & discounts is its own page
  { type: 'link', id: 'offers', group: 'discounts', href: '/admin/rules/offers' },
  // Messages
  { type: 'link', id: 'popups', group: 'messages', href: '/admin/rules/notices' },
];

/** Which group a Smart Rule of this kind is listed under. */
export const SMART_KIND_GROUP: Readonly<Record<string, HubGroupId>> = { delivery: 'delivery', festive: 'delivery', cod: 'payment', exchange: 'exchange', discount: 'discounts', setTier: 'discounts' };
export const smartGroupOf = (kind: string): HubGroupId => SMART_KIND_GROUP[kind] ?? 'discounts';

// ------------------------------------------------------------------------------------------------ the twelve pop-ups and notices

export const POPUP_GROUPS = ['shop', 'checkout', 'product', 'after'] as const;
export type PopupGroupId = (typeof POPUP_GROUPS)[number];
export type PopupPage = 'home' | 'product' | 'checkout' | 'thanks';
export type PopupShape = 'bar' | 'banner' | 'modal' | 'toast' | 'inline';

export interface PopupSpec {
  n: number;
  key: string;
  group: PopupGroupId;
  /** The page of the small picture and the kind of mark drawn on it. */
  page: PopupPage;
  shape: PopupShape;
  /** The details the owner may put in the text: `{amount}` and so on (filled by the shop). */
  tokens: readonly string[];
  /** Has the one number (low stock: show when this many are left or fewer). */
  hasN?: boolean;
  /** The engine behind it: its own switch lives there ("Managed in"), and this row follows it. */
  managed?: { href: string; onKey?: string; onField?: string };
  /** The notice engine (PR 216) carries it: Notices below on the same page. */
  notice?: 'bar' | 'popup';
  /** Shown only while this other feature is on (a note says which, and links to it). */
  needs?: { href: string; onKey: string; onField?: string };
  /** The placement waits for a later S28 PR (demo products, PR 684). */
  waiting?: boolean;
}

export const POPUPS: readonly PopupSpec[] = [
  { n: 1, key: 'notice', group: 'shop', page: 'home', shape: 'bar', tokens: [], notice: 'bar' },
  { n: 2, key: 'popup', group: 'shop', page: 'home', shape: 'modal', tokens: [], notice: 'popup' },
  { n: 3, key: 'holiday', group: 'shop', page: 'home', shape: 'banner', tokens: ['date'], managed: { href: '/admin/rules/eid', onKey: 'rules.eid.enabled' } },
  { n: 4, key: 'freebar', group: 'shop', page: 'home', shape: 'toast', tokens: ['amount'], needs: { href: '/admin/rules', onKey: 'delivery.freeOverMinor' } },
  { n: 5, key: 'dup', group: 'checkout', page: 'checkout', shape: 'modal', tokens: ['days', 'order'], managed: { href: '/admin/rules?rule=dup', onKey: 'orders.duplicates', onField: 'enabled' } },
  {
    n: 6,
    key: 'advance',
    group: 'checkout',
    page: 'checkout',
    shape: 'inline',
    tokens: ['amount'],
    needs: { href: '/admin/orders/risk-rules/checkout', onKey: 'checkout.advance', onField: 'enabled' },
  },
  { n: 7, key: 'stockhold', group: 'checkout', page: 'checkout', shape: 'inline', tokens: ['minutes'] },
  { n: 8, key: 'oos', group: 'checkout', page: 'checkout', shape: 'inline', tokens: ['size'] },
  { n: 9, key: 'demo', group: 'product', page: 'product', shape: 'modal', tokens: [], waiting: true },
  { n: 10, key: 'lowstock', group: 'product', page: 'product', shape: 'inline', tokens: ['n'], hasN: true },
  { n: 11, key: 'thanks', group: 'after', page: 'thanks', shape: 'inline', tokens: ['name', 'order'] },
  { n: 12, key: 'promise', group: 'after', page: 'thanks', shape: 'inline', tokens: ['date', 'days'] },
];
