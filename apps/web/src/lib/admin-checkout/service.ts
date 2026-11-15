// PR 748 + 749 — Settings › Checkout at /admin/settings/checkout: how the shop takes the customer's details and money, in two
// cards, each saved whole with its own version (a card changed by someone else in between answers STALE and is read again).
//   • Payments (PR 748) — which payment ways the checkout offers (mobile wallets and card types in the owner's order, online
//     payment), Cash on Delivery (the owner's own decision: only an owner changes it, and it has no value until he sets one),
//     and the numbers and bank accounts customers send money to (owner data).
//   • Delivery details (PR 749) — the order of the three fields, the shortest name and address, the help line, the try-on line,
//     the note box and its length, what the Confirm button does while the form is not finished, and the "many of one size" nudge.
// Seeing needs `settings.read`; saving `settings.write` (checked here again). Nothing here moves money, changes a price or
// sends anything to a customer. The audit row names the card and the settings changed, never a number or an account.
import { createHash } from 'node:crypto';
import { audit, isOwner, requirePermission, type Actor, type RequestContext } from '@extas/auth';
import { MOTHER_STORE_ID, type PrismaClient } from '@extas/db/client';
import { bankAccountsSchema, CARD_TYPES, CONFIRM_STYLES, MOBILE_WALLETS, registry, storeTarget, walletNumbersSchema } from '@extas/settings';
import { phoneOf } from '../admin-brand/service';
import type { AppResolver } from '../settings';

export interface CheckoutDeps {
  db: PrismaClient;
  resolver: AppResolver;
}
export interface CheckoutWho {
  actor: Actor;
  ctx: RequestContext;
}

export const FIELD_IDS = ['name', 'phone', 'address'] as const;
export type WalletKind = 'merchant' | 'personal' | 'agent';
export interface Tick {
  id: string;
  on: boolean;
}
export interface PaymentsValue {
  mobile: { on: boolean; list: Tick[] };
  card: { on: boolean; list: Tick[] };
  online: boolean;
  /** `unset`: the owner has not decided yet (the shop does not offer Cash on Delivery). */
  cod: 'unset' | 'on' | 'off';
  wallets: { id: string; provider: string; number: string; kind: WalletKind }[];
  banks: { id: string; bankName: string; accountName: string; accountNumber: string; branch: string; routingNumber: string }[];
}
export interface FormValue {
  order: { id: string }[];
  help: boolean;
  tryOn: boolean;
  nameMin: number;
  addressMin: number;
  note: boolean;
  noteMax: number;
  confirm: (typeof CONFIRM_STYLES)[number];
  many: boolean;
  manyMin: number;
}
export interface CheckoutCards {
  payments: { key: 'payments'; value: PaymentsValue; version: string };
  form: { key: 'form'; value: FormValue; version: string };
}

export class CheckoutPageError extends Error {
  constructor(
    readonly code: 'INVALID_INPUT' | 'STALE' | 'FORBIDDEN',
    readonly status: number,
    readonly details: string[] = [],
    readonly data: Record<string, unknown> = {},
  ) {
    super(code);
  }
}
export const isCheckoutPageError = (e: unknown): e is CheckoutPageError => e instanceof CheckoutPageError;

const S = MOTHER_STORE_ID;
const at = { storeId: S };
export const versionOf = (v: unknown): string => createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0, 16);
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const invalid = (...d: string[]) => new CheckoutPageError('INVALID_INPUT', 400, d);
const str = (v: unknown, max: number): string => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/** The ways of one list, those the owner switched on first in his order, then the others. */
const ticks = (all: readonly string[], on: readonly string[]): Tick[] => [...on.filter((k) => all.includes(k)).map((id) => ({ id, on: true })), ...all.filter((k) => !on.includes(k)).map((id) => ({ id, on: false }))];

export async function paymentsRead(d: CheckoutDeps): Promise<PaymentsValue> {
  const r = d.resolver;
  const [mOn, mList, cOn, cList, online, cod, wallets, banks] = await Promise.all([
    r.value('checkout.pay.mobile.enabled', at),
    r.value('checkout.pay.mobile.list', at),
    r.value('checkout.pay.card.enabled', at),
    r.value('checkout.pay.card.list', at),
    r.value('checkout.pay.online.enabled', at),
    r.value('payment.cod.enabled', at),
    r.value('payment.wallet.numbers', at),
    r.value('payment.bank.accounts', at),
  ]);
  return {
    mobile: { on: mOn, list: ticks(MOBILE_WALLETS, mList) },
    card: { on: cOn, list: ticks(CARD_TYPES, cList) },
    online,
    cod: cod === null || cod === undefined ? 'unset' : cod ? 'on' : 'off',
    wallets: (wallets ?? []).map((w, i) => ({ id: `w${i + 1}`, provider: w.provider, number: w.number, kind: w.kind })),
    banks: (banks ?? []).map((b, i) => ({ id: `b${i + 1}`, bankName: b.bankName, accountName: b.accountName, accountNumber: b.accountNumber, branch: b.branch ?? '', routingNumber: b.routingNumber ?? '' })),
  };
}

export async function formRead(d: CheckoutDeps): Promise<FormValue> {
  const r = d.resolver;
  const [order, help, tryOn, nameMin, addressMin, note, noteMax, confirm, many, manyMin] = await Promise.all([
    r.value('checkout.fieldOrder', at),
    r.value('checkout.help.enabled', at),
    r.value('checkout.tryOn.enabled', at),
    r.value('checkout.form.nameMin', at),
    r.value('checkout.form.addressMin', at),
    r.value('checkout.note.enabled', at),
    r.value('checkout.note.maxChars', at),
    r.value('checkout.confirm.style', at),
    r.value('checkout.manyOfOne.enabled', at),
    r.value('checkout.manyOfOne.min', at),
  ]);
  // the three fields are all always asked: a field the owner left out of the setting follows the others
  const ids = [...order.filter((f, i) => order.indexOf(f) === i), ...FIELD_IDS.filter((f) => !order.includes(f))];
  return { order: ids.map((id) => ({ id })), help, tryOn, nameMin, addressMin, note, noteMax, confirm, many, manyMin };
}

export interface CheckoutView {
  cards: CheckoutCards;
  /** Only an owner changes Cash on Delivery. */
  owner: boolean;
}

export async function checkoutView(d: CheckoutDeps, who: CheckoutWho): Promise<CheckoutView> {
  const [payments, form, owner] = await Promise.all([paymentsRead(d), formRead(d), who.actor.staffUserId ? isOwner(d.db, who.actor.staffUserId) : Promise.resolve(false)]);
  return { cards: { payments: { key: 'payments', value: payments, version: versionOf(payments) }, form: { key: 'form', value: form, version: versionOf(form) } }, owner };
}

type Key = keyof typeof registry;

/** One setting written when its checked value differs from the stored one; returns its key when it changed. */
async function put(d: CheckoutDeps, who: CheckoutWho, key: Key, value: unknown, reason: string, ownerApproved = false): Promise<string[]> {
  const parsed = registry[key].schema.safeParse(value);
  if (!parsed.success) throw invalid(key);
  const cur = await d.resolver.value(key as never, at);
  if (JSON.stringify(cur) === JSON.stringify(parsed.data)) return [];
  await d.resolver.set(key as never, parsed.data as never, storeTarget(S), { actorId: who.actor.staffUserId ?? null, reason: `Settings › Checkout: ${reason}`, ...(ownerApproved ? { ownerApproved: true } : {}) });
  return [key];
}

function tickList(v: unknown, all: readonly string[], what: string): { on: boolean; ids: string[] } {
  if (!isObj(v) || typeof v.on !== 'boolean' || !Array.isArray(v.list)) throw invalid(what);
  const list = v.list.filter(isObj).map((r) => ({ id: str(r.id, 20), on: r.on === true }));
  if (list.length !== all.length || new Set(list.map((r) => r.id)).size !== all.length || !list.every((r) => all.includes(r.id))) throw invalid(what);
  return { on: v.on, ids: list.filter((r) => r.on).map((r) => r.id) };
}

async function savePayments(d: CheckoutDeps, who: CheckoutWho, before: PaymentsValue, sent: Record<string, unknown>): Promise<string[]> {
  // everything is checked first, so a refused card writes nothing
  const mobile = tickList(sent.mobile, MOBILE_WALLETS, 'mobile');
  const card = tickList(sent.card, CARD_TYPES, 'card');
  // a way that is on must have at least one choice; a way that is off keeps its last list
  if (mobile.on && !mobile.ids.length) throw invalid('mobile');
  if (card.on && !card.ids.length) throw invalid('card');
  if (typeof sent.online !== 'boolean') throw invalid('online');
  // Cash on Delivery is the owner's own decision (CLAUDE.md rule 6): only an owner changes it, with his OK
  const codChange = sent.cod !== before.cod;
  if (codChange) {
    if (sent.cod !== 'on' && sent.cod !== 'off') throw invalid('cod');
    if (!who.actor.staffUserId || !(await isOwner(d.db, who.actor.staffUserId))) throw new CheckoutPageError('FORBIDDEN', 403, ['cod']);
  }
  if (!Array.isArray(sent.wallets) || !Array.isArray(sent.banks)) throw invalid('wallets', 'banks');
  const wallets = sent.wallets.filter(isObj).map((w) => ({ provider: str(w.provider, 40), number: phoneOf(w.number), kind: w.kind }));
  if (wallets.some((w) => !w.number)) throw invalid('wallets');
  const walletsOk = walletNumbersSchema.safeParse(wallets);
  if (!walletsOk.success) throw invalid('wallets');
  const banks = sent.banks.filter(isObj).map((b) => ({
    bankName: str(b.bankName, 120),
    accountName: str(b.accountName, 120),
    accountNumber: str(b.accountNumber, 40),
    ...(str(b.branch, 120) ? { branch: str(b.branch, 120) } : {}),
    ...(str(b.routingNumber, 20) ? { routingNumber: str(b.routingNumber, 20) } : {}),
  }));
  const banksOk = bankAccountsSchema.safeParse(banks);
  if (!banksOk.success) throw invalid('banks');

  const out: string[] = [];
  out.push(...(await put(d, who, 'checkout.pay.mobile.enabled', mobile.on, 'mobile payments')));
  if (mobile.ids.length) out.push(...(await put(d, who, 'checkout.pay.mobile.list', mobile.ids, 'mobile wallets')));
  out.push(...(await put(d, who, 'checkout.pay.card.enabled', card.on, 'card payments')));
  if (card.ids.length) out.push(...(await put(d, who, 'checkout.pay.card.list', card.ids, 'card types')));
  out.push(...(await put(d, who, 'checkout.pay.online.enabled', sent.online, 'online payment')));
  if (codChange) out.push(...(await put(d, who, 'payment.cod.enabled', sent.cod === 'on', 'Cash on Delivery', true)));
  out.push(...(await put(d, who, 'payment.wallet.numbers', walletsOk.data.length ? walletsOk.data : null, 'receiving numbers')));
  out.push(...(await put(d, who, 'payment.bank.accounts', banksOk.data.length ? banksOk.data : null, 'bank accounts')));
  return out;
}

async function saveForm(d: CheckoutDeps, who: CheckoutWho, sent: Record<string, unknown>): Promise<string[]> {
  const out: string[] = [];
  const order = Array.isArray(sent.order) ? sent.order.filter(isObj).map((r) => str(r.id, 20)) : [];
  if (order.length !== FIELD_IDS.length || !FIELD_IDS.every((f) => order.includes(f))) throw invalid('order');
  const flag = (k: string) => {
    if (typeof sent[k] !== 'boolean') throw invalid(k);
    return sent[k] as boolean;
  };
  const num = (k: string) => {
    if (typeof sent[k] !== 'number' || !Number.isInteger(sent[k])) throw invalid(k);
    return sent[k] as number;
  };
  const confirm = (CONFIRM_STYLES as readonly string[]).includes(sent.confirm as string) ? sent.confirm : null;
  if (!confirm) throw invalid('confirm');
  out.push(...(await put(d, who, 'checkout.fieldOrder', order, 'the order of the fields')));
  out.push(...(await put(d, who, 'checkout.help.enabled', flag('help'), 'the help line')));
  out.push(...(await put(d, who, 'checkout.tryOn.enabled', flag('tryOn'), 'the try-on line')));
  out.push(...(await put(d, who, 'checkout.form.nameMin', num('nameMin'), 'the shortest name')));
  out.push(...(await put(d, who, 'checkout.form.addressMin', num('addressMin'), 'the shortest address')));
  out.push(...(await put(d, who, 'checkout.note.enabled', flag('note'), 'the note box')));
  out.push(...(await put(d, who, 'checkout.note.maxChars', num('noteMax'), 'the note length')));
  out.push(...(await put(d, who, 'checkout.confirm.style', confirm, 'the Confirm button')));
  out.push(...(await put(d, who, 'checkout.manyOfOne.enabled', flag('many'), 'the many of one size line')));
  out.push(...(await put(d, who, 'checkout.manyOfOne.min', num('manyMin'), 'the many of one size count')));
  return out;
}

export async function saveCheckoutCard(d: CheckoutDeps, who: CheckoutWho, input: unknown): Promise<CheckoutView> {
  await requirePermission(d.db, who.actor, 'settings.write', { storeId: S });
  if (!isObj(input) || !isObj(input.value)) throw invalid('key', 'value');
  const key = input.key;
  if (key !== 'payments' && key !== 'form') throw invalid('key');
  const before = await checkoutView(d, who);
  const was = before.cards[key].version;
  if (input.version !== undefined && input.version !== was) throw new CheckoutPageError('STALE', 409, ['version'], { version: was });
  const changed = key === 'payments' ? await savePayments(d, who, before.cards.payments.value, input.value) : await saveForm(d, who, input.value);
  if (changed.length) await audit(d.db, who.actor, { storeId: S, action: `settings.checkout.${key}.save`, entityType: 'Setting', entityId: key, before: undefined, after: { changed } }, who.ctx);
  return checkoutView(d, who);
}
