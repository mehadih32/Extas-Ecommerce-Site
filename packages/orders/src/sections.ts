// S05 · PR 541 — the risk-sectioned order dashboard, from the database's side: the moment an order lands (after PR 145's
// duplicate check and PR 156's score) it is placed in ONE section (risk-section.ts) with a note on its timeline — the
// order service's `riskSection` command (the status untouched, an audit row with it) — so the order list opens with
// every order already sorted. A section the owner set to "wait for a person" (`risk.sections.review`) opens a review
// (a FraudAlert of kind "risk", beside PR 145's duplicate reviews): the order is then neither confirmed nor booked until
// someone decides (SIM-F-014; decided with `decideReview`, duplicates.ts).
//
// Placed once when it lands; again only when its score is worked out again (an edit by the team, a person's "score
// again"), and a decided review is never opened again. Marking is instant; the decision never is: nothing here cancels,
// blocks, holds, asks for an advance or touches COD, a price or a charge (CLAUDE.md rule 6; R5).
import type { Prisma } from '@extas/db/client';
import { setting, type OrdersDeps } from './context';
import { DUPLICATE_SECTION, RISK_REVIEW_KIND } from './duplicates';
import { OrdersError, isOrdersError } from './errors';
import { SCORED_SECTIONS, sectionOf, type SectionResult } from './pure';
import type { RiskAfter, StoredRisk } from './risk';
import { auditRow, execute, systemBy, type By, type CommandResult } from './service';

export interface SectionPlaced extends SectionResult {
  /** The review the order waits in (a new one, or null: none needed, or one was opened before). */
  alertId: string | null;
  command: CommandResult;
}

/** The earlier orders a fired signal names (a re-order's other order, the identity match and its refusal). */
function namedNumbers(stored: StoredRisk | null, because: readonly string[]): string[] {
  const out = new Set<string>();
  for (const f of stored?.fired ?? []) {
    if (!because.includes(f.key)) continue;
    for (const k of ['number', 'refusedNumber'] as const) {
      const v = f.values[k];
      if (typeof v === 'string' && v) out.add(v);
    }
  }
  return [...out];
}

/**
 * Places one order in its section (once when it lands, `after: 'placed'`; a second call finds the first and does
 * nothing). After the team's edit or a person's "score again" it is placed again when its section changed. Off
 * (`risk.sections.enabled`): nothing happens. Never moves the order: the status stays as it is.
 */
export async function placeInSection(deps: OrdersDeps, ref: { storeId: number; orderId: string }, opts: { after?: RiskAfter; by?: By } = {}): Promise<SectionPlaced | null> {
  const after = opts.after ?? 'placed';
  const cfg = await setting(deps, ref.storeId, 'risk.sections');
  if (!cfg.enabled) return null;
  const o = await deps.db.order.findFirst({ where: { id: ref.orderId, storeId: ref.storeId }, select: { id: true, riskSection: true, riskBand: true, riskScore: true, paymentMethod: true } });
  if (!o) return null;
  if (after === 'placed' && o.riskSection !== null) return null;
  const [latest, duplicateOpen] = await Promise.all([
    deps.db.riskAssessment.findFirst({ where: { storeId: ref.storeId, orderId: ref.orderId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], select: { signals: true, bandKey: true, score: true } }),
    deps.db.fraudAlert.count({ where: { storeId: ref.storeId, orderId: ref.orderId, status: 'OPEN', summary: { path: ['section'], equals: DUPLICATE_SECTION } } }),
  ]);
  const stored = latest ? (latest.signals as unknown as StoredRisk) : null;
  const r = sectionOf({ duplicateOpen: duplicateOpen > 0, fired: (stored?.fired ?? []).map((x) => x.key), band: latest?.bandKey ?? null, paymentMethod: o.paymentMethod }, cfg);
  const review = r.review && SCORED_SECTIONS.has(r.section);
  if (after !== 'placed' && r.section === o.riskSection) return null;
  const numbers = namedNumbers(stored, r.because);
  const matched = numbers.length ? await deps.db.order.findMany({ where: { storeId: ref.storeId, number: { in: numbers } }, select: { id: true } }) : [];
  const by = opts.by ?? systemBy('risk-sections');
  let alertId: string | null = null;
  try {
    const command = await execute(
      deps,
      ref,
      by,
      {
        command: 'riskSection',
        input: { after, section: r.section },
        effect: async (tx, locked, _f, at) => {
          if (after === 'placed' && locked.riskSection !== null) throw new OrdersError('NOTHING_CHANGED', 'this order was placed in its section before', []);
          if (review && !(await tx.fraudAlert.count({ where: { storeId: ref.storeId, orderId: ref.orderId, summary: { path: ['kind'], equals: RISK_REVIEW_KIND } } }))) {
            const summary = { section: r.section, kind: RISK_REVIEW_KIND, band: latest?.bandKey ?? null, score: latest?.score ?? null, because: r.because };
            const a = await tx.fraudAlert.create({
              data: { storeId: ref.storeId, orderId: ref.orderId, matchedOrderIds: matched.map((m) => m.id), severity: latest?.bandKey ?? null, proposedAction: 'WARN', summary: summary as Prisma.InputJsonValue, createdAt: at.now },
              select: { id: true },
            });
            alertId = a.id;
            await auditRow(tx, by, { storeId: ref.storeId, action: 'order.risk.review', entityType: 'FraudAlert', entityId: a.id, before: null, after: { orderId: ref.orderId, section: r.section } });
          }
          return {
            data: { riskSection: r.section },
            reasonCode: r.section,
            eventData: { section: r.section, previous: locked.riskSection, after, band: latest?.bandKey ?? null, score: latest?.score ?? null, because: r.because, review, alertId, matched: numbers },
            audit: { before: { riskSection: locked.riskSection }, after: { riskSection: r.section } },
          };
        },
      },
      after === 'placed' ? { idempotencyKey: `risk-section:${ref.orderId}` } : {},
    );
    return { ...r, review, alertId, command };
  } catch (e) {
    // placed before (a second call at the same moment), or the order moved on (cancelled in the same second)
    if (isOrdersError(e) && (e.code === 'NOTHING_CHANGED' || e.code === 'ILLEGAL_TRANSITION')) return null;
    throw e;
  }
}
