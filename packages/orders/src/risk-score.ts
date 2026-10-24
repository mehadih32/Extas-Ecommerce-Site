// S06 · PR 156 — the risk score model, as one pure function (no database, no clock): the facts of one order (its phone's
// earlier orders, PR 157's phone-summary.ts; its address against the gazetteer, PR 158's address-checks.ts) and the
// owner's settings (`risk.signals`, `risk.bands`, `risk.history`) in, the score with every signal that counted and its
// weight out. The same facts and settings always give the same answer, so the stored reasons are exactly why the score
// is what it is (PR 160).
//
// The score only informs (CLAUDE.md rule 6, R5): this file decides nothing about the order. A refusal the shop caused —
// one of the owner's "our fault" reasons (SIM-F-044) — is shown in the number's history but never counts; a cancel
// for a change after booking or by someone who never ordered (NOT_A_RISK_SIGNAL) never counts either.
import type { RiskBands, RiskSignalKey, RiskSignals } from '@extas/settings';
import { addressNoDetail, addressUnresolved, addressUnsure, areaMismatch, inPlaces, placeRefusalCount, type AddressFacts, type CheckValues, type KnownPlace, type PlaceRefusal } from './address-checks';
import { summarizeHistory, WITH_COURIER, type PastOrder, type PhoneSummary } from './phone-summary';

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
