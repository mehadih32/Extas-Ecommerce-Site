// S04 · PR 558 — the Parameter for Checkout (Orders › Risk rules › Checkout advance; CN-012 (2), CN-018 (2)): its own
// panel, mixed with no earlier parameter. The owner sets what counts as a flag (a risk score at least, a risk band, or
// one of the score's signals), how many layers there are, and what each layer asks for: nothing, the delivery charge
// ahead, a part (a percentage of what is due) or the full amount. The layers are tried in their order and the first
// that matches wins. The whole feature has one off switch (`checkout.advance`, off). A layer taken off the list is
// archived, never deleted (its flag events keep pointing at it). Reading needs `risk.rules.read`; saving needs
// `risk.rules.write`, the list's version (a stale screen is refused) and, to switch the feature on, a confirmation;
// it writes one audit row. Nothing here blocks anyone or changes a price or a charge: a flagged customer is only asked
// to pay ahead at checkout (PR 560), and only once the owner has switched it on.
import { createHash } from 'node:crypto';
import { audit } from '@extas/auth';
import { ADVANCE_CHOICES, messages, pair, RISK_SIGNAL_KEYS, storeTarget, type LabelPair, type RiskSignalKey } from '@extas/settings';
import { z } from 'zod';
import { allow, nowOf, parse, setting, TX, type OrdersDeps, type Who } from './context';
import { OrdersError } from './errors';
import { RISK_SCORE_MAX } from './risk-score';
import type { SettingsWriter } from './rule-switches';

/** What a layer asks for: nothing, the delivery charge, a part of what is due, or all of it. */
export const LAYER_REQUIREMENTS = ['NONE', 'DELIVERY_CHARGE', 'PART_AMOUNT', 'FULL_AMOUNT'] as const;
export type LayerRequirement = (typeof LAYER_REQUIREMENTS)[number];

/** The longest layer name. */
export const LAYER_NAME_MAX = 60;
/** The part's percentage range (a part is never nothing and never everything: those are their own choices). */
export const PART_PERCENT = { min: 1, max: 99 } as const;

/** What counts as a flag on one layer: any one of them is enough. At least one is set (a layer never flags everyone). */
export const layerConditionsSchema = z
  .object({
    /** The risk score at least this (null: not a condition). */
    minScore: z.int().min(1).max(RISK_SCORE_MAX).nullable(),
    /** The risk band is one of these (the owner's band keys). */
    bands: z.array(z.string().trim().min(1).max(40)).max(10),
    /** One of these signals counted on the score. */
    signals: z.array(z.enum(RISK_SIGNAL_KEYS as [RiskSignalKey, ...RiskSignalKey[]])).max(RISK_SIGNAL_KEYS.length),
  })
  .strict();
export type LayerConditions = z.output<typeof layerConditionsSchema>;

export interface CheckoutLayer {
  id: string;
  name: string;
  position: number;
  enabled: boolean;
  conditions: LayerConditions;
  requirement: LayerRequirement;
  /** PART_AMOUNT only: the percentage of what is due asked ahead. */
  partPercent: number | null;
}

/** A checkout's risk as the layers read it: the score, its band and the signals that counted. */
export interface LayerRisk {
  score: number;
  band: string;
  fired: readonly string[];
}

const EMPTY: LayerConditions = { minScore: null, bands: [], signals: [] };

/** The stored conditions, read safely (anything unreadable is no condition at all, so it never flags). */
export function conditionsOf(v: unknown): LayerConditions {
  const r = layerConditionsSchema.safeParse(v);
  return r.success ? r.data : EMPTY;
}

const hasCondition = (c: LayerConditions) => c.minScore !== null || c.bands.length > 0 || c.signals.length > 0;

/** Whether one layer's conditions flag this risk (any one condition is enough; none set: never). */
export function layerMatches(c: LayerConditions, r: LayerRisk): boolean {
  if (!hasCondition(c)) return false;
  if (c.minScore !== null && r.score >= c.minScore) return true;
  if (c.bands.includes(r.band)) return true;
  return c.signals.some((s) => r.fired.includes(s));
}

/** The first switched-on layer (by position) whose conditions flag this risk, or null. */
export function layerFor(layers: readonly CheckoutLayer[], r: LayerRisk): CheckoutLayer | null {
  return [...layers].filter((l) => l.enabled).sort((a, b) => a.position - b.position).find((l) => layerMatches(l.conditions, r)) ?? null;
}

const LAYER_SELECT = { id: true, name: true, position: true, enabled: true, conditions: true, requirement: true, partPercent: true } as const;

type LayerRow = { id: string; name: string; position: number; enabled: boolean; conditions: unknown; requirement: string; partPercent: number | null };

const toLayer = (r: LayerRow): CheckoutLayer => ({
  id: r.id,
  name: r.name,
  position: r.position,
  enabled: r.enabled,
  conditions: conditionsOf(r.conditions),
  requirement: (LAYER_REQUIREMENTS as readonly string[]).includes(r.requirement) ? (r.requirement as LayerRequirement) : 'NONE',
  partPercent: r.partPercent,
});

/** The store's live layers (archived ones left out), in their order. Used by the checkout too (PR 560). */
export async function liveLayers(deps: Pick<OrdersDeps, 'db'>, storeId: number): Promise<CheckoutLayer[]> {
  const rows = await deps.db.checkoutParameterLayer.findMany({ where: { storeId, archivedAt: null }, orderBy: [{ position: 'asc' }, { createdAt: 'asc' }], select: LAYER_SELECT });
  return rows.map(toLayer);
}

/** The panel as the screen draws it. */
export interface LayerList {
  enabled: boolean;
  maxLayers: number;
  layers: CheckoutLayer[];
  /** The owner's risk bands (for the band choices), in their order. */
  bands: { key: string; en: string; bn: string }[];
  /** Every signal of the score with its words (for the signal choices). */
  signals: { key: RiskSignalKey; label: LabelPair }[];
  /** The choices for the most layers ("More options"). */
  maxLayersChoices: readonly number[];
  version: string;
}

const versionOf = (enabled: boolean, maxLayers: number, layers: readonly CheckoutLayer[]) =>
  createHash('sha256')
    .update(JSON.stringify({ enabled, maxLayers, layers: layers.map((l) => [l.id, l.name, l.position, l.enabled, l.conditions, l.requirement, l.partPercent]) }))
    .digest('hex')
    .slice(0, 16);

async function listOf(deps: OrdersDeps, storeId: number): Promise<LayerList> {
  const [cfg, layers, bands] = await Promise.all([setting(deps, storeId, 'checkout.advance'), liveLayers(deps, storeId), setting(deps, storeId, 'risk.bands')]);
  return {
    enabled: cfg.enabled,
    maxLayers: cfg.maxLayers,
    layers,
    bands: bands.map((b) => ({ key: b.key, en: b.en, bn: b.bn })),
    signals: RISK_SIGNAL_KEYS.map((key) => ({ key, label: pair(messages, `risk.signals.names.${key}`) })),
    maxLayersChoices: ADVANCE_CHOICES.maxLayers,
    version: versionOf(cfg.enabled, cfg.maxLayers, layers),
  };
}

/** PR 558 — the Parameter for Checkout panel, for the person reading it (`risk.rules.read`). */
export async function checkoutLayers(deps: OrdersDeps, who: Who): Promise<LayerList> {
  await allow(deps, who, 'risk.rules.read');
  return listOf(deps, who.storeId);
}

const layerInput = z
  .object({
    /** An existing layer's id; none: a new layer. */
    id: z.uuid().nullable().optional(),
    name: z.string().trim().min(1).max(LAYER_NAME_MAX),
    enabled: z.boolean(),
    conditions: layerConditionsSchema,
    requirement: z.enum(LAYER_REQUIREMENTS),
    partPercent: z.int().min(PART_PERCENT.min).max(PART_PERCENT.max).nullable().optional(),
  })
  .strict();

export const saveLayersInput = z
  .object({
    version: z.string().max(64).optional(),
    enabled: z.boolean(),
    /** "More options": the most layers the panel takes (one of the choices). */
    maxLayers: z.int().optional(),
    /** The whole list in its order: a layer left out is archived. */
    layers: z.array(layerInput).max(50),
    /** Switching the feature on asks first: COD disappears for the flagged customers. */
    confirm: z.boolean().optional(),
    reason: z.string().trim().max(500).optional(),
  })
  .strict();

/**
 * PR 558 — saves the whole panel at once (`risk.rules.write`): the one switch and the layers in their order. New layers
 * are added, changed ones updated, and the ones left out archived; all-or-nothing. A stale version is STALE; switching
 * the feature on without `confirm` is INVALID_INPUT ['confirm'].
 */
export async function saveCheckoutLayers(deps: OrdersDeps & { settings: OrdersDeps['settings'] & SettingsWriter }, who: Who, input: unknown): Promise<LayerList> {
  await allow(deps, who, 'risk.rules.write');
  const d = parse(saveLayersInput, input, 'layers');
  const before = await listOf(deps, who.storeId);
  if (d.version !== undefined && d.version !== before.version) throw new OrdersError('STALE', 'the checkout layers were changed by someone else; reload them', ['version'], { version: before.version });
  const maxLayers = d.maxLayers ?? before.maxLayers;
  if (!(ADVANCE_CHOICES.maxLayers as readonly number[]).includes(maxLayers)) throw new OrdersError('INVALID_INPUT', `the most layers is one of ${ADVANCE_CHOICES.maxLayers.join(', ')}`, ['maxLayers']);
  if (d.layers.length > maxLayers) throw new OrdersError('INVALID_INPUT', `at most ${maxLayers} layers`, ['layers'], { maxLayers });
  const bandKeys = new Set(before.bands.map((b) => b.key));
  const problems: string[] = [];
  d.layers.forEach((l, i) => {
    if (!hasCondition(l.conditions)) problems.push(`layers.${i}.conditions`);
    if (l.conditions.bands.some((b) => !bandKeys.has(b))) problems.push(`layers.${i}.conditions.bands`);
    if (l.requirement === 'PART_AMOUNT' && !l.partPercent) problems.push(`layers.${i}.partPercent`);
  });
  if (problems.length) throw new OrdersError('INVALID_INPUT', 'a layer is not complete', problems);
  if (d.enabled && !before.enabled && d.confirm !== true) throw new OrdersError('INVALID_INPUT', 'switching the checkout advance on needs a confirmation', ['confirm']);
  const known = new Map(before.layers.map((l) => [l.id, l]));
  const missing = d.layers.filter((l) => l.id && !known.has(l.id)).map((l) => l.id!);
  if (missing.length) throw new OrdersError('NOT_FOUND', 'no such layer', missing);
  const kept = new Set(d.layers.map((l) => l.id).filter(Boolean));
  const now = nowOf(deps);
  const dupe = new Set<string>();
  for (const l of d.layers) {
    if (!l.id) continue;
    if (dupe.has(l.id)) problems.push(l.id);
    dupe.add(l.id);
  }
  if (problems.length) throw new OrdersError('INVALID_INPUT', 'a layer is listed twice', problems);

  await deps.db.$transaction(async (tx) => {
    for (const [i, l] of d.layers.entries()) {
      const data = {
        name: l.name,
        position: i + 1,
        enabled: l.enabled,
        conditions: { minScore: l.conditions.minScore, bands: [...new Set(l.conditions.bands)], signals: [...new Set(l.conditions.signals)] },
        requirement: l.requirement,
        partPercent: l.requirement === 'PART_AMOUNT' ? (l.partPercent ?? null) : null,
      };
      if (l.id) await tx.checkoutParameterLayer.update({ where: { id: l.id }, data });
      else await tx.checkoutParameterLayer.create({ data: { storeId: who.storeId, ...data } });
    }
    const gone = before.layers.filter((l) => !kept.has(l.id)).map((l) => l.id);
    if (gone.length) await tx.checkoutParameterLayer.updateMany({ where: { storeId: who.storeId, id: { in: gone }, archivedAt: null }, data: { archivedAt: now, enabled: false } });
  }, TX);
  if (d.enabled !== before.enabled || maxLayers !== before.maxLayers) {
    const cfg = await setting(deps, who.storeId, 'checkout.advance');
    await deps.settings.set('checkout.advance', { ...cfg, enabled: d.enabled, maxLayers }, storeTarget(who.storeId), { actorId: who.actor.staffUserId ?? null, reason: 'Risk rules › Checkout advance' });
  }
  const after = await listOf(deps, who.storeId);
  if (after.version !== before.version)
    await audit(
      deps.db,
      who.actor,
      {
        storeId: who.storeId,
        action: 'checkout.advance.save',
        entityType: 'CheckoutParameterLayer',
        entityId: String(who.storeId),
        before: { enabled: before.enabled, maxLayers: before.maxLayers, layers: before.layers },
        after: { enabled: after.enabled, maxLayers: after.maxLayers, layers: after.layers, ...(d.reason ? { reason: d.reason } : {}) },
      },
      { source: 'admin-api', ...who.ctx },
    );
  return after;
}
