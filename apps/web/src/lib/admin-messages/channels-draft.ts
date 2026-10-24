// S14 · PR 291 — the Channels & limits form's fields as typed (text boxes) and back to the settings: money typed in taka
// and kept in paisa, an empty box is "not set" (null), and only what differs from the screen is sent (the API checks every
// value again). No React here, so the rules are tested on their own.
import type { ChannelsConfig } from '@extas/messages';

export const MASK_STATES = ['none', 'requested', 'approved', 'rejected'] as const;
export const CAP_FIELDS = ['SMS', 'WHATSAPP', 'EMAIL', 'total'] as const;

export interface ChannelsDraft {
  enabled: boolean;
  maskName: string;
  maskState: (typeof MASK_STATES)[number];
  maskUse: boolean;
  rateMasked: string;
  rateNonMasked: string;
  caps: Record<(typeof CAP_FIELDS)[number], string>;
  quietOn: boolean;
  quietFrom: string;
  quietTo: string;
}

const taka = (minor: number | null | undefined) => (minor === null || minor === undefined ? '' : String(minor / 100));
const paisa = (s: string): number | null => (s.trim() === '' ? null : Math.round(Number(s) * 100));
const whole = (s: string): number | null => (s.trim() === '' ? null : Number(s));
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export function channelsDraft(c: ChannelsConfig): ChannelsDraft {
  return {
    enabled: c.enabled,
    maskName: c.masking?.senderName ?? '',
    maskState: c.masking?.state ?? 'none',
    maskUse: c.masking?.useWhenApproved ?? true,
    rateMasked: taka(c.smsRates?.maskedMinor),
    rateNonMasked: taka(c.smsRates?.nonMaskedMinor),
    caps: { SMS: c.caps.SMS?.toString() ?? '', WHATSAPP: c.caps.WHATSAPP?.toString() ?? '', EMAIL: c.caps.EMAIL?.toString() ?? '', total: c.caps.total?.toString() ?? '' },
    quietOn: c.quietHours.on,
    quietFrom: String(c.quietHours.fromHour),
    quietTo: String(c.quietHours.toHour),
  };
}

/** The changed settings of a draft, by the screen's field names. */
export function channelsChanges(d: ChannelsDraft, c: ChannelsConfig): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (d.enabled !== c.enabled) out.enabled = d.enabled;
  const masking = d.maskName.trim() === '' && d.maskState === 'none' ? null : { senderName: d.maskName.trim(), state: d.maskState, useWhenApproved: d.maskUse };
  if (!same(masking, c.masking ?? null)) out.masking = masking;
  const rates = d.rateMasked.trim() === '' && d.rateNonMasked.trim() === '' ? null : { maskedMinor: paisa(d.rateMasked), nonMaskedMinor: paisa(d.rateNonMasked) };
  if (!same(rates, c.smsRates ?? null)) out.smsRates = rates;
  const caps = { SMS: whole(d.caps.SMS), WHATSAPP: whole(d.caps.WHATSAPP), EMAIL: whole(d.caps.EMAIL), total: whole(d.caps.total) };
  if (!same(caps, c.caps)) out.caps = caps;
  const quietHours = { on: d.quietOn, fromHour: Number(d.quietFrom), toHour: Number(d.quietTo) };
  if (!same(quietHours, c.quietHours)) out.quietHours = quietHours;
  return out;
}

/** Who an SMS goes from with this draft: the approved, wanted name, else null (the SMS company's own number). */
export const draftSender = (d: ChannelsDraft): string | null => (d.maskState === 'approved' && d.maskUse && d.maskName.trim() ? d.maskName.trim() : null);
