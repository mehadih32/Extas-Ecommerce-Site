// PR 123 — marketing opt-in at checkout (demo consentTicksHTML, Note 54 #11, B5.7): one tick for offers by SMS (its words
// say he can stop any time) and one for offers on WhatsApp, each stored separately — on the order, and as a dated
// ConsentRecord per channel (who, which order, from where). The ticks' starting state is the owner's
// (`checkout.consent.*.default`); with the ticks switched off nothing is asked and nothing is recorded (null, not "no").
import { z } from 'zod';
import { setting, type CheckoutDeps, type Tx } from './context';

export interface ConsentInput {
  sms: boolean;
  whatsapp: boolean;
}

export const consentInputSchema = z.object({ sms: z.boolean(), whatsapp: z.boolean() }).strict();

/** What the order keeps per channel: true / false as answered, null when nothing was asked. */
export interface ConsentAnswer {
  sms: boolean | null;
  whatsapp: boolean | null;
}

export interface ConsentSettings {
  enabled: boolean;
  defaults: ConsentInput;
}

export async function consentSettings(deps: Pick<CheckoutDeps, 'settings'>, storeId: number): Promise<ConsentSettings> {
  const [enabled, sms, whatsapp] = await Promise.all([
    setting(deps, storeId, 'checkout.consent.enabled'),
    setting(deps, storeId, 'checkout.consent.sms.default'),
    setting(deps, storeId, 'checkout.consent.whatsapp.default'),
  ]);
  return { enabled, defaults: { sms, whatsapp } };
}

/** The answer the order keeps: the ticks as sent (their starting state when the page sent none), or nothing asked. */
export function consentOf(s: ConsentSettings, input: ConsentInput | null | undefined): ConsentAnswer {
  if (!s.enabled) return { sms: null, whatsapp: null };
  const c = input ?? s.defaults;
  return { sms: c.sms, whatsapp: c.whatsapp };
}

/** One dated record per channel answered, inside the order's own transaction. */
export async function recordConsent(
  tx: Tx,
  r: { storeId: number; orderId: string; customerId: string | null; phone: string | null; ip: string | null; answer: ConsentAnswer; source: string },
): Promise<number> {
  const rows = (
    [
      ['SMS', r.answer.sms],
      ['WHATSAPP', r.answer.whatsapp],
    ] as const
  ).flatMap(([channel, granted]) => (granted === null ? [] : [{ storeId: r.storeId, orderId: r.orderId, customerId: r.customerId, phone: r.phone, ip: r.ip, channel, granted, source: r.source }]));
  if (rows.length) await tx.consentRecord.createMany({ data: rows });
  return rows.length;
}
