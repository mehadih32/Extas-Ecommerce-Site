// S06 · PR 156 — the risk score on the order, from the database's side: the order's facts (its number's history, PR 157
// phone-history.ts; its address and zone against the gazetteer, PR 158 address-facts.ts) worked out by the pure model
// (risk-score.ts) with the owner's settings, and stored ONCE when the order lands: a RiskAssessment row (append-only)
// with every signal that counted and its weight, the order's `riskScore` / `riskBand`, and a timeline row with an audit
// row (the order service's `riskAssess` command). It is never worked out again silently: only an edit by the team
// (`risk.score.afterEdit`) or a person's "score again" adds a new, dated assessment.
//
// The score only informs. Nothing here blocks anyone, holds an order, asks for an advance, turns COD off or touches a
// price or a charge (CLAUDE.md rule 6; architecture R5). Off until the owner switches `risk.score` on (CN-018).
import { createHash } from 'node:crypto';
import type { Prisma } from '@extas/db/client';
import { ADDRESS_FACTS_SELECT, placeFactsOf } from './address-facts';
import { allow, setting, UUID, type OrdersDeps, type Who } from './context';
import { OrdersError, isOrdersError } from './errors';
import { phoneOrders } from './phone-history';
import { scoreRisk, type AddressFacts, type FiredSignal, type KnownPlace, type PhoneSummary, type RiskConfig, type RiskFacts, type RiskResult } from './pure';
import { execute, staffBy, systemBy, type By, type CommandResult } from './service';

/** Why an order was scored: when it landed, after the team's edit, or by a person's "score again". */
export type RiskAfter = 'placed' | 'edit' | 'manual';

/** The owner's model as the scorer takes it, its fingerprint (which rules a stored score was worked out with), and how many earlier orders are read. */
export async function riskConfig(deps: OrdersDeps, storeId: number): Promise<{ config: RiskConfig; version: string; historyOrders: number }> {
  const [signals, bands, history] = await Promise.all([setting(deps, storeId, 'risk.signals'), setting(deps, storeId, 'risk.bands'), setting(deps, storeId, 'risk.history')]);
  const config: RiskConfig = { signals, bands, ourFault: history.ourFaultRefusals, noAnswerOutcomes: history.noAnswerOutcomes };
  return { config, version: createHash('sha256').update(JSON.stringify(config)).digest('hex').slice(0, 12), historyOrders: history.orders };
}

/** The order's facts the score is worked out from (PR 157, 158), with the order's own fields the result is stored with. */
export async function riskFactsOf(deps: OrdersDeps, storeId: number, orderId: string, config: RiskConfig, historyOrders: number) {
  const o = await deps.db.order.findFirst({ where: { id: orderId, storeId }, select: { ...ADDRESS_FACTS_SELECT, totalMinor: true } });
  if (!o) throw new OrdersError('NOT_FOUND', 'no such order', ['orderId']);
  const past = await phoneOrders(deps, storeId, o.phone, { excludeOrderId: o.id, before: o.placedAt, take: historyOrders });
  const place = await placeFactsOf(deps, storeId, o, past, { refusals: config.signals.areaRefusals.enabled });
  const facts: RiskFacts = { placedAt: o.placedAt, totalMinor: o.totalMinor, past, ...place };
  return { order: o, facts };
}

/** What one stored assessment holds (RiskAssessment.signals), for the panel. */
export interface StoredRisk {
  after: RiskAfter;
  raw: number;
  band: RiskResult['band'];
  fired: FiredSignal[];
  checked: string[];
  off: string[];
  history: PhoneSummary;
  address: AddressFacts;
  known: KnownPlace | null;
}

export interface RiskAssessed {
  assessmentId: string;
  score: number;
  band: RiskResult['band'];
  fired: FiredSignal[];
  command: CommandResult;
}

/**
 * Scores one order and stores it (once when it lands: `after: 'placed'`, a second call finds the first and does
 * nothing; again after the team's edit when `risk.score.afterEdit`; by a person's "score again"). Off: nothing happens
 * (null) — except "score again", which says so (RISK_OFF). Never moves the order: the status stays as it is.
 */
export async function assessRisk(deps: OrdersDeps, ref: { storeId: number; orderId: string }, opts: { after?: RiskAfter; by?: By } = {}): Promise<RiskAssessed | null> {
  const after = opts.after ?? 'placed';
  const cfg = await setting(deps, ref.storeId, 'risk.score');
  if (!cfg.enabled || (after === 'edit' && !cfg.afterEdit)) {
    if (after === 'manual') throw new OrdersError('RISK_OFF', 'the risk score is switched off', ['risk.score']);
    return null;
  }
  if (after === 'placed' && (await deps.db.riskAssessment.count({ where: { storeId: ref.storeId, orderId: ref.orderId } }))) return null;
  const { config, version, historyOrders } = await riskConfig(deps, ref.storeId);
  const { order, facts } = await riskFactsOf(deps, ref.storeId, ref.orderId, config, historyOrders);
  const r = scoreRisk(facts, config);
  const stored: StoredRisk = { after, raw: r.raw, band: r.band, fired: r.fired, checked: r.checked, off: r.off, history: r.history, address: facts.address, known: facts.known };
  let assessmentId = '';
  try {
    const command = await execute(
      deps,
      ref,
      opts.by ?? systemBy('risk-score'),
      {
        command: 'riskAssess',
        input: { after },
        effect: async (tx) => {
          if (after === 'placed' && (await tx.riskAssessment.count({ where: { storeId: ref.storeId, orderId: ref.orderId } }))) throw new OrdersError('NOTHING_CHANGED', 'this order was scored before', []);
          const row = await tx.riskAssessment.create({
            data: { storeId: ref.storeId, orderId: ref.orderId, phone: order.phone, score: r.score, bandKey: r.band.key, signals: JSON.parse(JSON.stringify(stored)) as Prisma.InputJsonValue, modelVersion: version, createdAt: deps.now?.() },
            select: { id: true },
          });
          assessmentId = row.id;
          return {
            data: { riskScore: r.score, riskBand: r.band.key },
            reasonCode: r.band.key,
            eventData: { assessmentId: row.id, after, score: r.score, raw: r.raw, band: { key: r.band.key, en: r.band.en, bn: r.band.bn }, fired: r.fired.map((x) => ({ key: x.key, weight: x.weight })), modelVersion: version },
            audit: { before: {}, after: { riskScore: r.score, riskBand: r.band.key } },
          };
        },
      },
      after === 'placed' ? { idempotencyKey: `risk-assess:${ref.orderId}` } : {},
    );
    return { assessmentId, score: r.score, band: r.band, fired: r.fired, command };
  } catch (e) {
    // scored before (a second call at the same moment), or the order moved on (cancelled in the same second)
    if (after !== 'manual' && isOrdersError(e) && (e.code === 'NOTHING_CHANGED' || e.code === 'ILLEGAL_TRANSITION')) return null;
    throw e;
  }
}

/** A person's "score again" (`orders.risk.decide`): a new, dated assessment with today's rules; the old ones stay. */
export async function reassessOrder(deps: OrdersDeps, who: Who, orderId: string): Promise<RiskAssessed> {
  await allow(deps, who, 'orders.risk.decide');
  if (!UUID.test(orderId)) throw new OrdersError('NOT_FOUND', 'no such order', ['orderId']);
  const r = await assessRisk(deps, { storeId: who.storeId, orderId }, { after: 'manual', by: staffBy(who.actor, who.ctx) });
  return r!;
}

/** PR 142 / B1.10: scored again after the team's edit changed the phone, the address or the lines; never undoes the edit. */
export async function rescoreAfterEdit(deps: OrdersDeps, ref: { storeId: number; orderId: string }, by: By, c: { phone?: unknown; address?: unknown; lines?: readonly unknown[] }): Promise<void> {
  if (c.phone === undefined && c.address === undefined && !c.lines?.length) return;
  try {
    await assessRisk(deps, ref, { after: 'edit', by });
  } catch {
    // the order is edited; its earlier score stays until the next edit or "score again"
  }
}
