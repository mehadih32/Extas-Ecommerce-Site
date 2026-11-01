// The customers rules without a database (client-safe; the admin's browser parts import it too): how a phone number is
// shown (in full to a person with `customers.phone`, masked to everyone else: Note 24.1 with the owner's mask), how the
// merge rules compare two profiles (an e-mail, a WhatsApp number, a name with an address), which profile of a pair
// stays, and what makes a merge impossible; the Customers list's views and sorts (PR 285). One number, one helper:
// phoneNormalizeBD from @extas/delivery/phone.
import { phoneNormalizeBD } from '@extas/delivery/phone';

/** The digits kept visible at each end of a masked number (`customers.phoneMask`). */
export interface PhoneMask {
  first: number;
  last: number;
}

/** The middle of a number as the masked view writes it. */
export const MASK_DOT = '•';

/** A number with only its first and last digits shown (01712-345678 → 017•••••678); every digit hidden when too short. */
export function maskPhone(raw: string, mask: PhoneMask): string {
  const p = phoneNormalizeBD(raw);
  const digits = p.ok ? p.digits : raw.replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length <= mask.first + mask.last) return MASK_DOT.repeat(digits.length);
  return digits.slice(0, mask.first) + MASK_DOT.repeat(digits.length - mask.first - mask.last) + digits.slice(digits.length - mask.last);
}

/** A phone number as one viewer may see it: `text` to show, `dial` only when shown in full (for the call link). */
export interface PhoneShown {
  text: string;
  /** The number in its local form (01…) for tel: and copy — only for a person allowed the full number. */
  dial: string | null;
  masked: boolean;
}

/** The number for this viewer: in full as the team reads it back (01712-345678), or masked. */
export function phoneShown(raw: string | null | undefined, full: boolean, mask: PhoneMask): PhoneShown | null {
  if (!raw) return null;
  const p = phoneNormalizeBD(raw);
  if (full) return { text: p.ok ? p.nice : raw, dial: p.ok ? p.digits : raw, masked: false };
  return { text: maskPhone(raw, mask), dial: null, masked: true };
}

/** An e-mail as the merge rules compare it. */
export function emailKey(raw: string | null | undefined): string | null {
  const v = (raw ?? '').trim().toLowerCase();
  return v.includes('@') ? v : null;
}

/** A name or an address as the merge rules compare it: Unicode-folded, lower case, punctuation gone, one space. */
export function textKey(raw: string | null | undefined): string | null {
  const v = (raw ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return v || null;
}

/** One pair's key, the same whichever way round. */
export const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/** What the survivor pick and the merge checks know about a profile. */
export interface ProfileFacts {
  id: string;
  mergedIntoId: string | null;
  /** Profiles merged into this one now. */
  members: number;
  orders: number;
  createdAt: Date;
  erased: boolean;
  archived: boolean;
}

/** Why two profiles cannot be merged as asked (null: they can): `survivor` stays, `merged` joins it. */
export function mergeProblem(survivor: ProfileFacts, merged: ProfileFacts): { code: 'SAME_PROFILE' | 'ALREADY_MERGED' | 'HAS_MERGED' | 'NOT_ACTIVE'; data?: Record<string, unknown> } | null {
  if (survivor.id === merged.id) return { code: 'SAME_PROFILE' };
  if (survivor.erased || survivor.archived || merged.erased || merged.archived) return { code: 'NOT_ACTIVE' };
  if (survivor.mergedIntoId) return { code: 'ALREADY_MERGED', data: { id: survivor.id, survivorId: survivor.mergedIntoId } };
  if (merged.mergedIntoId) return { code: 'ALREADY_MERGED', data: { id: merged.id, survivorId: merged.mergedIntoId } };
  if (merged.members > 0) return { code: 'HAS_MERGED', data: { id: merged.id, members: merged.members } };
  return null;
}

/**
 * Which of a suggested pair stays: the one others are merged into already, else the one with more orders, else the
 * older profile. Null when both already have profiles merged into them (a person decides that one by hand).
 */
export function pickSurvivor(a: ProfileFacts, b: ProfileFacts): { survivor: ProfileFacts; merged: ProfileFacts } | null {
  if (a.members && b.members) return null;
  if (a.members || b.members) return a.members ? { survivor: a, merged: b } : { survivor: b, merged: a };
  if (a.orders !== b.orders) return a.orders > b.orders ? { survivor: a, merged: b } : { survivor: b, merged: a };
  const older = a.createdAt.getTime() <= b.createdAt.getTime();
  return older ? { survivor: a, merged: b } : { survivor: b, merged: a };
}

/** A group of profiles that share one value (an e-mail, a name with an address …) as pairs: the first with each other. */
export function groupPairs(ids: readonly string[], max: number): [string, string][] {
  const uniq = [...new Set(ids)];
  const out: [string, string][] = [];
  for (let i = 1; i < uniq.length && out.length < max; i++) out.push([uniq[0]!, uniq[i]!]);
  return out;
}

/** PR 285 — the Customers list's views (`vip` only while the owner has a VIP figure) and sorts. */
export const CUSTOMER_VIEWS = ['all', 'new', 'returning', 'vip', 'atrisk', 'refused', 'exchanged', 'nooffers'] as const;
export type CustomerView = (typeof CUSTOMER_VIEWS)[number];

export const CUSTOMER_SORTS = ['last', 'new', 'spend', 'orders', 'name'] as const;
export type CustomerSort = (typeof CUSTOMER_SORTS)[number];

/** PR 285 — the digits a number search needs (fewer would match half the shop). */
export const PHONE_SEARCH_MIN_DIGITS = 4;

// PR 287 — the segment conditions (no database), for the builder in the browser.
export * from './segment-rules';
// PR 288 — the journey view's kinds of touch.
export * from './journey-kinds';
export * from './journey-rules';
