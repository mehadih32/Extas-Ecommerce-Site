// S06 · PR 160 — the risk panel on one order (`orders.risk.read`): why the score is what it is, read only from what was
// stored when it was worked out (PR 156) — every signal that counted with its weight and what it saw, the band as it was
// named then, when and why it was scored, the earlier scores, whether the owner's rules changed since ("score again"
// would use the new ones) — and the number's history now (PR 157). A read: it never scores, never changes the order.
import { allow, setting, UUID, type OrdersDeps, type Who } from './context';
import { orderPhoneHistory, type PhoneHistoryView } from './phone-history';
import { OPEN_STATES, type OrderState } from './pure';
import { riskConfig, type StoredRisk } from './risk';
import { storedLevel, type StoredLevel } from './risk-levels';

export interface RiskAssessmentView extends StoredRisk {
  id: string;
  score: number;
  at: Date;
  modelVersion: string | null;
}

export interface RiskPanel {
  /** The model is switched on (new orders are scored). */
  enabled: boolean;
  /** The order page shows the card. */
  showOnOrder: boolean;
  /** The newest assessment, with every signal that counted and its weight; null: never scored. */
  current: RiskAssessmentView | null;
  /** The earlier ones, newest first. */
  earlier: RiskAssessmentView[];
  /** The owner's rules changed since the current score was worked out ("score again" would use the new ones). */
  rulesChanged: boolean;
  /** The order may be scored again now (open, the model on). */
  canRescore: boolean;
  phone: PhoneHistoryView;
  /** PR 161: the steps the order's risk level took (watch, hold, a call) and the advance it proposes; null: none. */
  level: StoredLevel | null;
  /** PR 161: the owner's levels are on (a score may then mark, hold or call; it still never blocks or asks by itself). */
  levelsOn: boolean;
}

/** How many assessments of one order the panel reads (newest first). */
const ASSESSMENTS_READ = 20;
const asStored = (v: unknown): StoredRisk => v as StoredRisk;

/** The risk panel of one order (`orders.risk.read`): why the score is what it is, read from what was stored. */
export async function orderRisk(deps: OrdersDeps, who: Who, orderId: string): Promise<RiskPanel | null> {
  await allow(deps, who, 'orders.risk.read');
  if (!UUID.test(orderId)) return null;
  const o = await deps.db.order.findFirst({ where: { id: orderId, storeId: who.storeId }, select: { id: true, status: true } });
  if (!o) return null;
  const [cfg, rows, phone, { version }, level, levels] = await Promise.all([
    setting(deps, who.storeId, 'risk.score'),
    deps.db.riskAssessment.findMany({ where: { storeId: who.storeId, orderId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: ASSESSMENTS_READ }),
    orderPhoneHistory(deps, who, orderId),
    riskConfig(deps, who.storeId),
    storedLevel(deps, who.storeId, orderId),
    setting(deps, who.storeId, 'risk.levels'),
  ]);
  const views: RiskAssessmentView[] = rows.map((r) => ({ ...asStored(r.signals), id: r.id, score: r.score, at: r.createdAt, modelVersion: r.modelVersion }));
  const current = views[0] ?? null;
  return {
    enabled: cfg.enabled,
    showOnOrder: cfg.showOnOrder,
    current,
    earlier: views.slice(1),
    rulesChanged: !!current && current.modelVersion !== version,
    canRescore: cfg.enabled && OPEN_STATES.includes(o.status as OrderState),
    phone: phone!,
    level,
    levelsOn: levels.enabled,
  };
}
