// PR 620 · p3 review (30 Oct) — the refusal budget of what the ERP sends the shop unasked: its signed calls
// (erp-site-calls.ts, `GET /erp-api/…`) and its webhooks (webhook.ts, `POST /api/erp/webhook`). Each receiver keeps its
// own budget, one per running app (tests make their own).
//
// - Refused calls are counted per client address, for the current minute. So one sender's flood never cuts off
//   another sender. The address is the one Caddy resolved (round 2: Caddy trusts CF-Connecting-IP only from
//   Cloudflare's ranges and overwrites the header it passes on, infra/stack/caddy/client-ip-block.sh), so a caller
//   cannot pick its own. An IPv6 address counts by its /64 (one home or one server gets a whole /64 to rotate in).
// - Bounded in memory however many addresses send: at most ADDRESS_SLOTS addresses are kept (an address is cut to 64
//   characters). When the map is full, addresses whose minute has passed are forgotten first; while it is still full, a
//   new address shares one bucket with every other address not kept. No address at all is that shared bucket too.
// - Round 2: a call takes its slot synchronously, before anything is awaited (`admit`): it counts as a refusal at once
//   and gives the slot back only when it verifies (`giveBack`). So any number of calls at the same moment get no more
//   lookups than the limit.
// - Past the limit (`erp.siteApi.refusedPerMinute`, read by the receiver), an address's unverified calls are refused at
//   once (429), before any store, connection or vault is read. Two ways still lead to the lookup:
//   - a call signed with a secret the last store lookup found (`known`, in this process's memory only, like the
//     connection layer's own secret cache): the real ERP is not locked out by somebody else's refusals;
//   - round 2: one call per receiver every `system.integrationKeyCacheSeconds` (at least a second; `probeOpen`), so
//     `known` is read again after a secret was changed or a store switched on. The real ERP's calls with a new secret
//     are answered again at the latest after that time.
//   The lookup itself reads the current secrets again, so a secret removed since is refused there.
// - Round 3: an address that sent a verified call lately (`rememberVerified`, the last VERIFIED_SLOTS of them) always
//   keeps its own bucket, even while the map is full: one IPv6 /48 holds 65,536 /64s and could fill every slot in a
//   minute, which would otherwise put the real ERP into the shared bucket right after a secret change.
// ADDRESS_SLOTS and VERIFIED_SLOTS are memory bounds of the running app, not business numbers (nothing for the owner to set).

const MINUTE_MS = 60_000;
/** The most addresses one budget keeps. */
export const ADDRESS_SLOTS = 4096;
/** Round 3: the most recently verified addresses that always keep a bucket of their own. */
export const VERIFIED_SLOTS = 64;
/** The bucket of every address not kept (and of a call with no address). */
const SHARED = '*';
const ADDRESS_MAX_CHARS = 64;

export interface RefusalBudget {
  /** Refusals this minute, per address (a call in progress already counts: its slot). */
  addresses: Map<string, { minuteStart: number; refused: number }>;
  /** The secrets the last store lookup found: a call that verifies with one of them is not cut off. */
  known: string[];
  /** While the map is full of addresses still in their minute: when the first of them ends (no scan before then). */
  fullUntil: number;
  /** Round 2: when an over-limit call last went to the lookup to read the secrets again. */
  probedAt: number;
  /** Round 3: addresses (their bucket keys) whose calls verified lately, oldest first; at most VERIFIED_SLOTS. */
  verified: Set<string>;
}

/** A call's place in its address's count, given back when it verifies. */
export interface BudgetSlot {
  key: string;
  minuteStart: number;
  /** The address's own key (differs from `key` when the call counted in the shared bucket). */
  own: string;
}

export const newRefusalBudget = (): RefusalBudget => ({ addresses: new Map(), known: [], fullUntil: 0, probedAt: Number.NEGATIVE_INFINITY, verified: new Set() });

/** The first four groups of an IPv6 address (its /64), or null when it is not one. */
function ipv6Prefix64(a: string): string | null {
  const bare = a.replace(/^\[|\]$/g, '').split('%')[0]!.toLowerCase();
  if (!bare.includes(':') || !/^[0-9a-f:.]+$/.test(bare)) return null;
  // An IPv4 address written as IPv6 (::ffff:192.0.2.1) is that IPv4 address.
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(bare);
  if (mapped) return mapped[1]!;
  const halves = bare.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':') : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const fill = halves.length === 2 ? 8 - head.length - tail.length : 0;
  if (fill < 0) return null;
  const groups = [...head, ...Array<string>(fill).fill('0'), ...tail];
  if (groups.length !== 8 && !(groups.length === 7 && groups[6]!.includes('.'))) return null;
  if (!groups.slice(0, 4).every((g) => /^[0-9a-f]{1,4}$/.test(g))) return null;
  return `${groups.slice(0, 4).map((g) => g.replace(/^0+(?=.)/, '')).join(':')}::/64`;
}

const keyOf = (address: string | null | undefined): string => {
  const a = address?.trim().slice(0, ADDRESS_MAX_CHARS);
  if (!a) return SHARED;
  return ipv6Prefix64(a) ?? a;
};

const expired = (e: { minuteStart: number }, now: number) => now - e.minuteStart >= MINUTE_MS || now < e.minuteStart;

/** Makes room when the map is full: forgets every address whose minute has passed (at most one scan a minute). */
function prune(b: RefusalBudget, now: number): void {
  if (b.addresses.size < ADDRESS_SLOTS || now < b.fullUntil) return;
  let first = Number.POSITIVE_INFINITY;
  for (const [k, e] of b.addresses) {
    if (expired(e, now)) b.addresses.delete(k);
    else first = Math.min(first, e.minuteStart);
  }
  b.fullUntil = b.addresses.size >= ADDRESS_SLOTS ? first + MINUTE_MS : 0;
}

/** The bucket this address counts in now: its own when kept, lately verified or when there is room, else the shared one. */
function bucketKey(b: RefusalBudget, address: string | null | undefined, now: number): string {
  const key = keyOf(address);
  if (b.addresses.has(key) || (key !== SHARED && b.verified.has(key))) return key;
  prune(b, now);
  return b.addresses.size < ADDRESS_SLOTS ? key : SHARED;
}

/** Refusals of this address's bucket in the current minute. */
function refusedNow(b: RefusalBudget, key: string, now: number): number {
  const e = b.addresses.get(key);
  return e && !expired(e, now) ? e.refused : 0;
}

/** Counts one refusal for this address (returns its slot). */
export function countRefusal(b: RefusalBudget, address: string | null | undefined, now: number): BudgetSlot {
  const key = bucketKey(b, address, now);
  const own = keyOf(address);
  const e = b.addresses.get(key);
  if (!e || expired(e, now)) {
    b.addresses.set(key, { minuteStart: now, refused: 1 });
    return { key, minuteStart: now, own };
  }
  e.refused += 1;
  return { key, minuteStart: e.minuteStart, own };
}

/** Round 3: the call in this slot verified: its address keeps a bucket of its own from now on (the latest VERIFIED_SLOTS). */
export function rememberVerified(b: RefusalBudget, slot: BudgetSlot | null): void {
  if (!slot || slot.own === SHARED) return;
  b.verified.delete(slot.own);
  b.verified.add(slot.own);
  while (b.verified.size > VERIFIED_SLOTS) b.verified.delete(b.verified.values().next().value as string);
}

/** A call that verified: its slot is not a refusal after all (nothing when its minute is already over). */
export function giveBack(b: RefusalBudget, slot: BudgetSlot | null): void {
  if (!slot) return;
  const e = b.addresses.get(slot.key);
  if (e && e.minuteStart === slot.minuteStart && e.refused > 0) e.refused -= 1;
}

/** Has this address used up its refusals this minute? (Reads nothing; null limit = not known yet = no.) */
export function overBudget(b: RefusalBudget, address: string | null | undefined, now: number, perMinute: number | null): boolean {
  if (perMinute === null) return false;
  return refusedNow(b, bucketKey(b, address, now), now) >= perMinute;
}

/** Does the call verify with a secret the last lookup found? (`verify` checks one secret; reads nothing.) */
export function signedByKnown(b: RefusalBudget, verify: (secret: string) => boolean): boolean {
  return b.known.some(verify);
}

const probeMs = (seconds: number | null) => Math.max(1, seconds ?? 1) * 1000;

/** May an over-limit call go to the lookup now to read the secrets again? (Reads and changes nothing.) */
export function probeOpen(b: RefusalBudget, now: number, refreshSeconds: number | null): boolean {
  return now - b.probedAt >= probeMs(refreshSeconds);
}

export interface AdmitLimits {
  perMinute: number | null;
  /** `system.integrationKeyCacheSeconds`: how often an over-limit call may read the secrets again. */
  refreshSeconds: number | null;
}

/**
 * Lets the call go on to the lookup, or not (429), synchronously: call it after the last await before the lookup. An
 * admitted call takes its slot (a refusal until `giveBack`). Over the limit, only a call signed with a known secret or
 * the one refresh call (`probeOpen`) is admitted.
 */
export function admit(b: RefusalBudget, address: string | null | undefined, now: number, limits: AdmitLimits, verifyKnown: (secret: string) => boolean): BudgetSlot | null {
  if (overBudget(b, address, now, limits.perMinute) && !signedByKnown(b, verifyKnown)) {
    if (!probeOpen(b, now, limits.refreshSeconds)) return null;
    b.probedAt = now;
  }
  return countRefusal(b, address, now);
}
