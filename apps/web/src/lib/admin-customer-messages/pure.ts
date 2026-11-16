// PR 1011 (admin prototype v5 m-settings.js `renderMsgs`) — the pure part of Settings › Customer messages: the five order steps the page lists,
// which real journey step and template each one is, and how the prototype's two switches (SMS, WhatsApp) read and change a journey step.
// The shop's engine sends a step on ONE channel, with an optional second one tried only when the first cannot reach the customer. So:
//   SMS only            → the step is on, channel SMS, no fallback
//   WhatsApp only       → the step is on, channel WhatsApp, no fallback
//   both                → on, WhatsApp first, SMS only when WhatsApp cannot reach the customer
//   neither             → the step is off (its channel, fallback and words are kept)
// No React, no database.

/** The prototype's five rows, in its order: the page's id, the journey step that sends it. */
export const MESSAGE_STEPS = [
  { id: 'confirmed', step: 'confirmed' },
  { id: 'advance', step: 'advanceRequested' },
  { id: 'shipped', step: 'booked' },
  { id: 'delivered', step: 'delivered' },
  { id: 'cancelled', step: 'cancelled' },
] as const;
export type MessageStepId = (typeof MESSAGE_STEPS)[number]['id'];
export type JourneyStepName = (typeof MESSAGE_STEPS)[number]['step'];

export type Chan = 'SMS' | 'WHATSAPP' | 'EMAIL';
export interface StepLike {
  on: boolean;
  channel: Chan;
  fallback: 'NONE' | Chan;
  template: string;
}

/** What the two switches show for a step. */
export function switchesOf(s: Pick<StepLike, 'on' | 'channel' | 'fallback'>): { sms: boolean; wa: boolean } {
  if (!s.on) return { sms: false, wa: false };
  const has = (c: Chan) => s.channel === c || s.fallback === c;
  return { sms: has('SMS'), wa: has('WHATSAPP') };
}

/** The step after a press on one switch (or both): see the file header. Everything else about the step is kept. */
export function withSwitches<T extends StepLike>(s: T, sms: boolean, wa: boolean): T {
  if (!sms && !wa) return { ...s, on: false };
  if (sms && wa) return { ...s, on: true, channel: 'WHATSAPP', fallback: 'SMS' };
  return { ...s, on: true, channel: sms ? 'SMS' : 'WHATSAPP', fallback: 'NONE' };
}

/** SMS in a month at the current orders: the orders of the last 30 days times the steps whose SMS switch is on (an upper figure: a cancelled order sends one step fewer). */
export function smsPerMonth(orders30: number, smsSteps: number): number {
  return Math.max(0, Math.round(orders30)) * Math.max(0, smsSteps);
}

/**
 * The words of a template as the page draws them: each `{token}` split out, so the page can show it as a chip with the token's own name.
 * Returns the pieces in order: plain text, or a token name.
 */
export function pieces(body: string): { text: string; token: boolean }[] {
  const out: { text: string; token: boolean }[] = [];
  const re = /\{([A-Za-z][A-Za-z0-9]*)\}/g;
  let at = 0;
  for (let m = re.exec(body); m; m = re.exec(body)) {
    if (m.index > at) out.push({ text: body.slice(at, m.index), token: false });
    out.push({ text: m[1]!, token: true });
    at = m.index + m[0].length;
  }
  if (at < body.length) out.push({ text: body.slice(at), token: false });
  return out;
}

/** The row of a template the page shows and edits first: the step's own channel, else SMS, else WhatsApp; the page's language first (Bengali by default), else the other. */
export function pickRow<T extends { channel: string; locale: string }>(rows: readonly T[], channel: string, locale: 'bn' | 'en' = 'bn'): T | null {
  const order = [channel, 'SMS', 'WHATSAPP', 'EMAIL'];
  for (const c of order) {
    const here = rows.filter((r) => r.channel === c);
    const row = here.find((r) => r.locale === locale) ?? here[0];
    if (row) return row;
  }
  return null;
}
