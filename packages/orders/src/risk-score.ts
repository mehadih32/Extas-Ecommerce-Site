// S06 · PR 156 — the risk score model, as one pure function (no database, no clock): the facts of one order (its phone's
// earlier orders, PR 157's phone-summary.ts; its address against the gazetteer, PR 158's address-checks.ts) and the
// owner's settings (`risk.signals`, `risk.bands`, `risk.history`) in, the score with every signal that counted and its
// weight out. The same facts and settings always give the same answer, so the stored reasons are exactly why the score
// is what it is (PR 160).
//
// The score only informs (CLAUDE.md rule 6, R5): this file decides nothing about the order. A refusal the shop caused —
// one of the owner's "our fault" reasons (SIM-F-044) — is shown in the number's history but never counts; a cancel
// for a change after booking or by someone who never ordered (NOT_A_RISK_SIGNAL) never counts either.
//
// PR 559 (`pattern`, SIM-F-015): a pattern, not a slip — the failed share of the outcomes so far, recency weighted, from
// the number, the same device and the same person under another number (one source), and each courier's own fraud
// check (a source each); the highest share counts, from `minParcels` outcomes in that source (`patternOf`).
import type { RiskBands, RiskSignalKey, RiskSignals } from '@extas/settings';
import { addressNoDetail, addressUnresolved, addressUnsure, areaMismatch, inPlaces, placeRefusalCount, type AddressFacts, type CheckValues, type KnownPlace, type PlaceRefusal } from './address-checks';
import { summarizeHistory, WITH_COURIER, type PastOrder, type PhoneSummary } from './phone-summary';
import { NOT_A_RISK_SIGNAL } from './pure';

/** The highest score (a sum above it is capped; the raw sum is kept beside it). */
export const RISK_SCORE_MAX = 100;

const DAY = 86_400_000;
const HOUR = 3_600_000;

/** Everything one order's score is worked out from. */
export interface RiskFacts {
  placedAt: Date;
  totalMinor: number;
  /** The number's orders placed before this one (newest first is fine; order does not matter). */
  past: readonly PastOrder[];
  address: AddressFacts;
  known: KnownPlace | null;
  /** Parcels to the same place refused before (any number), with their reason and when. */
  placeRefusals: readonly PlaceRefusal[];
  /** PR 541: the pieces in the order (active lines). */
  pieces?: number;
  /**
   * PR 541 (SIM-F-015): earlier orders under ANOTHER number that the identity check matched (the same name and an
   * address alike), placed before this one. Read only while `identityMatch` is on.
   */
  identity?: readonly PastOrder[];
  /**
   * PR 159: earlier orders from the same device (the shop's device id) under ANOTHER number, placed before this one. Read
   * only while `deviceMatch` is on, and only while the device id is kept (`risk.capture`).
   */
  device?: readonly PastOrder[];
  /** PR 159: the OTHER numbers that ordered from this order's connection (IP) in `ipPhones.withinHours`, with the latest order. */
  ipPhones?: { phones: number; latest: string | null };
  /** PR 559: each courier's own fraud check for this number (cached at phone entry), read only while `pattern` is on. */
  courier?: readonly CourierFacts[];
}

/** PR 559 — one courier's own fraud check for a number: its parcels taken and cancelled (refused) across its shops. */
export interface CourierFacts {
  provider: string;
  delivered: number;
  cancelled: number;
}

/** PR 559 — the pattern that fired: the failed share (%), of how many outcomes, and whose ('own' or the courier's key). */
export interface PatternHit {
  pct: number;
  parcels: number;
  source: string;
}

/**
 * PR 559 — a pattern, not a slip. Our own outcomes (the number's, the same device's and the same person's under another
 * number, each once): taken at the door, refused (not our fault, never a re-ship), cancelled with a counted code; others
 * are left out. Each weighs 0.5^(age / halfLifeDays). Each courier's check is a source of its own (no dates: weight 1).
 * The highest failed share among the sources with `minParcels` outcomes, when it reaches `failPct`; else null.
 */
export function patternOf(f: RiskFacts, c: RiskConfig): PatternHit | null {
  const s = c.signals.pattern;
  const ourFault = new Set(c.ourFault);
  const counted = new Set<string>(c.signals.cancels.codes);
  const seen = new Set<string>();
  let good = 0;
  let bad = 0;
  let n = 0;
  for (const o of [...f.past, ...(f.device ?? []), ...(f.identity ?? [])]) {
    if (seen.has(o.id) || o.placedAt > f.placedAt) continue;
    seen.add(o.id);
    let failed: boolean | null = null;
    if (o.status === 'DELIVERED' || o.status === 'PARTIALLY_DELIVERED') failed = false;
    else if (o.status === 'RETURNED') failed = (o.refusalKey && ourFault.has(o.refusalKey)) || o.reshipped ? null : true;
    else if (o.status === 'CANCELLED') failed = o.cancelCode && !(NOT_A_RISK_SIGNAL as ReadonlySet<string>).has(o.cancelCode) && counted.has(o.cancelCode) ? true : null;
    if (failed === null) continue;
    const w = Math.pow(0.5, Math.max(0, f.placedAt.getTime() - o.placedAt.getTime()) / DAY / s.halfLifeDays);
    n++;
    if (failed) bad += w;
    else good += w;
  }
  const sources: { share: number; parcels: number; source: string }[] = [];
  if (n >= s.minParcels && good + bad > 0) sources.push({ share: (bad * 100) / (good + bad), parcels: n, source: 'own' });
  for (const k of f.courier ?? []) {
    const total = k.delivered + k.cancelled;
    if (total >= s.minParcels) sources.push({ share: (k.cancelled * 100) / total, parcels: total, source: k.provider });
  }
  const top = sources.filter((x) => x.share >= s.failPct).sort((a, b) => b.share - a.share)[0];
  return top ? { pct: Math.round(top.share), parcels: top.parcels, source: top.source } : null;
}

export interface RiskConfig {
  signals: RiskSignals;
  bands: RiskBands;
  /** Refusal reasons the shop caused (`risk.history.ourFaultRefusals`): never counted. */
  ourFault: readonly string[];
  /** Call outcomes that mean "did not answer" (`risk.history.noAnswerOutcomes`). */
  noAnswerOutcomes: readonly string[];
}

/** A signal that counted, with the values its words need. */
export interface FiredSignal {
  key: RiskSignalKey;
  weight: number;
  values: CheckValues;
}

export interface RiskResult {
  /** The score, 0–100. */
  score: number;
  /** The sum of the weights before the cap. */
  raw: number;
  band: { key: string; en: string; bn: string; minScore: number; tone: 'ok' | 'warn' | 'bad' };
  /** The signals that counted, in the model's order. */
  fired: FiredSignal[];
  /** The signals checked that did not apply (switched on). */
  checked: RiskSignalKey[];
  /** The signals switched off. */
  off: RiskSignalKey[];
  /** The number's whole history (every earlier order, the owner's our-fault reasons applied). */
  history: PhoneSummary;
}

/** The band a score falls in: the last band whose threshold it reaches (the first starts at 0). */
export function bandOf(bands: RiskBands, score: number): RiskResult['band'] {
  let pick = bands[0]!;
  for (const b of bands) if (score >= b.minScore) pick = b;
  return { key: pick.key, en: pick.en, bn: pick.bn, minScore: pick.minScore, tone: pick.tone };
}

const sinceOf = (at: Date, windowDays: number) => (windowDays > 0 ? new Date(at.getTime() - windowDays * DAY) : null);

/** PR 156 — the score of one order: every switched-on signal that applies adds its weight. */
export function scoreRisk(f: RiskFacts, c: RiskConfig): RiskResult {
  const ourFault = new Set(c.ourFault);
  const noAnswerOutcomes = new Set(c.noAnswerOutcomes);
  const s = c.signals;
  const fired: FiredSignal[] = [];
  const checked: RiskSignalKey[] = [];
  const off: RiskSignalKey[] = [];
  const history = summarizeHistory(f.past, { ourFault, cancelCodes: new Set(s.cancels.codes), noAnswerOutcomes });

  const tests: { [K in RiskSignalKey]: () => CheckValues | null } = {
    // PR 157: the number's history
    refusals: () => {
      const h = summarizeHistory(f.past, { ourFault, since: sinceOf(f.placedAt, s.refusals.windowDays) });
      return h.refused >= s.refusals.atLeast ? { count: h.refused, ourFault: h.ourFault, windowDays: s.refusals.windowDays } : null;
    },
    cancels: () => {
      const h = summarizeHistory(f.past, { ourFault, cancelCodes: new Set(s.cancels.codes), since: sinceOf(f.placedAt, s.cancels.windowDays) });
      return h.cancelsCounted >= s.cancels.atLeast ? { count: h.cancelsCounted, windowDays: s.cancels.windowDays } : null;
    },
    successRatio: () => {
      const parcels = history.delivered + history.refused;
      if (parcels < s.successRatio.minParcels) return null;
      const pct = Math.round((history.delivered * 100) / parcels);
      return pct < s.successRatio.belowPct ? { pct, parcels, delivered: history.delivered, belowPct: s.successRatio.belowPct } : null;
    },
    newPhone: () => (history.orders === 0 ? {} : null),
    noAnswer: () => {
      const h = summarizeHistory(f.past, { ourFault, noAnswerOutcomes, since: sinceOf(f.placedAt, s.noAnswer.windowDays) });
      return h.noAnswer >= s.noAnswer.atLeast ? { count: h.noAnswer, windowDays: s.noAnswer.windowDays } : null;
    },
    recentOrder: () => {
      const from = f.placedAt.getTime() - s.recentOrder.withinHours * HOUR;
      const hit = f.past.filter((o) => o.status !== 'DRAFT' && o.placedAt.getTime() >= from && o.placedAt <= f.placedAt).sort((a, b) => b.placedAt.getTime() - a.placedAt.getTime())[0];
      return hit ? { number: hit.number, withinHours: s.recentOrder.withinHours } : null;
    },
    inTransit: () => {
      const hit = f.past.find((o) => WITH_COURIER.includes(o.status));
      return hit ? { number: hit.number } : null;
    },
    orderValue: () => {
      const at = s.orderValue.atLeastMinor;
      if (at === null || f.totalMinor < at) return null;
      if (s.orderValue.firstOrderOnly && history.orders > 0) return null;
      return { totalMinor: f.totalMinor, atLeastMinor: at, firstOrderOnly: s.orderValue.firstOrderOnly };
    },
    // PR 541 (SIM-F-015): many pieces on a (first) order, and the same person under another number
    orderPieces: () => {
      const at = s.orderPieces.atLeast;
      const pieces = f.pieces ?? 0;
      if (at === null || pieces < at) return null;
      if (s.orderPieces.firstOrderOnly && history.orders > 0) return null;
      return { pieces, atLeast: at, firstOrderOnly: s.orderPieces.firstOrderOnly };
    },
    identityMatch: () => {
      const since = sinceOf(f.placedAt, s.identityMatch.windowDays);
      const hits = (f.identity ?? []).filter((o) => o.status !== 'DRAFT' && o.placedAt <= f.placedAt && (!since || o.placedAt >= since)).sort((a, b) => b.placedAt.getTime() - a.placedAt.getTime());
      if (!hits.length) return null;
      const h = summarizeHistory(hits, { ourFault });
      // the earlier refusal is named (SIM-F-015: "the earlier refusal was not named")
      const refused = hits.find((o) => o.status === 'RETURNED' && !(o.refusalKey && ourFault.has(o.refusalKey)));
      return { count: hits.length, number: hits[0]!.number, refused: h.refused, refusedNumber: refused?.number ?? null, delivered: h.delivered, windowDays: s.identityMatch.windowDays };
    },
    // PR 159: the same device under another number, and many numbers from one connection
    deviceMatch: () => {
      const since = sinceOf(f.placedAt, s.deviceMatch.windowDays);
      const hits = (f.device ?? []).filter((o) => o.status !== 'DRAFT' && o.placedAt <= f.placedAt && (!since || o.placedAt >= since)).sort((a, b) => b.placedAt.getTime() - a.placedAt.getTime());
      if (!hits.length) return null;
      const refused = hits.find((o) => o.status === 'RETURNED' && !(o.refusalKey && ourFault.has(o.refusalKey)));
      return { count: hits.length, number: hits[0]!.number, refusedNumber: refused?.number ?? null, windowDays: s.deviceMatch.windowDays };
    },
    ipPhones: () => {
      const n = f.ipPhones?.phones ?? 0;
      return n >= s.ipPhones.atLeast ? { count: n, number: f.ipPhones?.latest ?? null, withinHours: s.ipPhones.withinHours } : null;
    },
    // PR 559: a pattern, not a slip
    pattern: () => {
      const hit = patternOf(f, c);
      return hit ? { pct: hit.pct, parcels: hit.parcels, source: hit.source, failPct: s.pattern.failPct } : null;
    },
    // PR 158: the address against the gazetteer
    addressUnresolved: () => addressUnresolved(f.address),
    addressUnsure: () => addressUnsure(f.address),
    addressNoDetail: () => addressNoDetail(f.address),
    areaMismatch: () => areaMismatch(f.address, f.known, s.areaMismatch.level),
    riskyArea: () => inPlaces(f.address, s.riskyArea.areaIds),
    areaRefusals: () => {
      const n = placeRefusalCount(f.address, f.placeRefusals, sinceOf(f.placedAt, s.areaRefusals.windowDays), ourFault);
      return n >= s.areaRefusals.atLeast ? { count: n, windowDays: s.areaRefusals.windowDays, area: f.address.area?.name.en ?? null, areaBn: f.address.area?.name.bn ?? null } : null;
    },
  };

  for (const key of Object.keys(tests) as RiskSignalKey[]) {
    const cfg = s[key];
    if (!cfg.enabled) {
      off.push(key);
      continue;
    }
    const values = tests[key]();
    if (values && cfg.weight > 0) fired.push({ key, weight: cfg.weight, values });
    else checked.push(key);
  }
  const raw = fired.reduce((a, x) => a + x.weight, 0);
  const score = Math.min(RISK_SCORE_MAX, raw);
  return { score, raw, band: bandOf(c.bands, score), fired, checked, off, history };
}
