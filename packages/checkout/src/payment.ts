// PR 120 — the payment step (demo 51-checkout.js co_pay, Note 54 #13, CN-012): Cash on Delivery, mobile banking (the
// owner's list of wallets), card and bank (the owner's list of cards) and one "Pay online" page. Which methods show is
// the owner's: `payment.cod.enabled` and the Smart Rules' COD rule for Cash on Delivery (with the delivery band's own COD
// limit, S06), and `checkout.pay.*` for the rest. A choice the page sends that is not open any more falls back to the
// first open method, never to an error. No money moves here: a prepaid order's payment runs on the mock until the
// gateways of S07 (PR 167–169) are connected.
//
// The prepaid reward (CN-018 (1), SIM-F-042): when the owner switches it on, any method but Cash on Delivery earns it —
// free delivery, an amount or a percentage off the items; on an order whose delivery is already free, a free-delivery
// reward falls back to the amount or the percentage. The page shows it next to each prepaid option; switching back to
// Cash on Delivery takes it away.
import type { CARD_TYPES, MOBILE_WALLETS, Value } from '@extas/settings';
import { z } from 'zod';
import { setting, type CheckoutDeps } from './context';
import { PAY_METHODS, type PayMethod } from './pure';

export type Wallet = (typeof MOBILE_WALLETS)[number];
export type CardType = (typeof CARD_TYPES)[number];

/** What the page sends: the method, and the wallet or card inside it. */
export interface PaymentInput {
  method: PayMethod;
  option?: string | null;
}

export const paymentInputSchema = z
  .object({ method: z.enum(PAY_METHODS), option: z.string().trim().max(20).nullable().optional() })
  .strict();

/** The method the order is placed with (a wallet or a card type inside mobile and card). */
export interface PaymentChoice {
  method: PayMethod;
  option: string | null;
}

/** Why Cash on Delivery is not offered on this order (PR 605 GIFT: a gift is paid ahead in full, `checkout.gift`). */
export type CodOff = 'OFF' | 'RULE' | 'BAND_LIMIT' | 'GIFT';

/** What paying now earns (shown on each prepaid option). */
export type RewardOffer = { kind: 'freeDelivery'; amountMinor: number | null } | { kind: 'amount' | 'percent'; amountMinor: number };

export interface PaymentView {
  cod: boolean;
  /** Why Cash on Delivery is not on the list (null while it is). */
  codOff: CodOff | null;
  mobile: Wallet[];
  card: CardType[];
  online: boolean;
  chosen: PaymentChoice | null;
  reward: RewardOffer | null;
}

export interface PaySettings {
  cod: boolean;
  mobile: Wallet[];
  card: CardType[];
  online: boolean;
  reward: {
    enabled: boolean;
    type: Value<'checkout.prepaidReward.type'>;
    fallback: Value<'checkout.prepaidReward.fallback'>;
    amountMinor: number | null;
    percent: number | null;
    maxMinor: number | null;
  };
}

export async function paySettings(deps: Pick<CheckoutDeps, 'settings'>, storeId: number): Promise<PaySettings> {
  const s = <K extends Parameters<typeof setting>[2]>(k: K) => setting(deps, storeId, k);
  const [cod, mobileOn, mobile, cardOn, card, online, enabled, type, fallback, amountMinor, percent, maxMinor] = await Promise.all([
    s('payment.cod.enabled'),
    s('checkout.pay.mobile.enabled'),
    s('checkout.pay.mobile.list'),
    s('checkout.pay.card.enabled'),
    s('checkout.pay.card.list'),
    s('checkout.pay.online.enabled'),
    s('checkout.prepaidReward.enabled'),
    s('checkout.prepaidReward.type'),
    s('checkout.prepaidReward.fallback'),
    s('checkout.prepaidReward.amountMinor'),
    s('checkout.prepaidReward.percent'),
    s('checkout.prepaidReward.maxMinor'),
  ]);
  return {
    cod: cod === true,
    mobile: mobileOn ? [...mobile] : [],
    card: cardOn ? [...card] : [],
    online,
    reward: { enabled: enabled === true, type, fallback, amountMinor, percent, maxMinor },
  };
}

/** The methods open on this order, in the page's order. */
function openMethods(p: Pick<PaySettings, 'mobile' | 'card' | 'online'>, cod: boolean): PayMethod[] {
  return PAY_METHODS.filter((m) => (m === 'cod' ? cod : m === 'mobile' ? p.mobile.length > 0 : m === 'card' ? p.card.length > 0 : p.online));
}

/** The choice the order uses: the customer's when it is open, else the first open method (demo co_payCur). */
export function choosePayment(input: PaymentInput | null | undefined, p: Pick<PaySettings, 'mobile' | 'card' | 'online'>, cod: boolean): PaymentChoice | null {
  const open = openMethods(p, cod);
  const method = input && open.includes(input.method) ? input.method : open[0];
  if (!method) return null;
  const list: readonly string[] = method === 'mobile' ? p.mobile : method === 'card' ? p.card : [];
  const option = list.length ? (input?.method === method && input.option && list.includes(input.option) ? input.option : list[0]!) : null;
  return { method, option };
}

/** The value the Smart Rules' `payment.method` condition sees: cod, a wallet (bkash, nagad …), card or online. */
export const rulesPaymentMethod = (c: PaymentChoice | null): string | null => (c ? (c.method === 'mobile' ? c.option : c.method) : null);

export const isPrepaid = (c: PaymentChoice | null): boolean => c !== null && c.method !== 'cod';

/** What paying now earns on this order (null: the reward is off, or the owner has not set the amount it needs). */
export function rewardOf(r: PaySettings['reward'], o: { itemsMinor: number; deliveryFree: boolean; chargeMinor: number | null }): RewardOffer | null {
  if (!r.enabled || !r.type || o.itemsMinor <= 0) return null;
  const kind = r.type === 'freeDelivery' && o.deliveryFree ? r.fallback : r.type;
  if (kind === 'freeDelivery') return { kind, amountMinor: o.chargeMinor };
  if (kind === 'amount') return r.amountMinor ? { kind, amountMinor: Math.min(r.amountMinor, o.itemsMinor) } : null;
  if (kind === 'percent') {
    if (!r.percent) return null;
    const off = Math.floor((o.itemsMinor * r.percent) / 100);
    const capped = r.maxMinor ? Math.min(off, r.maxMinor) : off;
    return capped > 0 ? { kind, amountMinor: capped } : null;
  }
  return null;
}
