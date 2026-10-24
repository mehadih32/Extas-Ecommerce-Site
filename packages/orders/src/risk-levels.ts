// S06 · PR 161 — the actions per risk level, from the database's side (Blueprint F4 answer 2; CN-018 (2); demo V12.3
// Orders → Risk rules "Levels"). After a score (PR 156) puts an order in a band, the owner's `risk.levels` for that band
// follow, once per band:
//   - hold: the order is held with the owner's hold reason (the order service's own `hold` command, its timeline and
//     audit row) — it is then neither confirmed nor booked until a person releases it (SIM-F-014);
//   - watch, call and the ask are written as ONE timeline row (the `riskLevel` command; the status untouched): the watch
//     mark on the order, a confirmation call task in the call queue, and the advance the level proposes;
//   - the ask itself (the delivery charge, a part, the whole amount, no cash on delivery for this order) is a proposal:
//     the order page shows it, and a person presses "Request advance" (PR 542) — unless the owner turned on that
//     request's own auto option (`orders.advanceRequest.auto`, off), which asks it right here (advance-request.ts).
// Every switch is off by default; with the master off nothing happens. A score again in the same band does nothing again;
// a new band writes its own row (an order that went up from medium to high is held then, not before). Nothing here
// blocks anyone, changes a COD rule, a price or a charge (CLAUDE.md rule 6; architecture R5).
//
// The Levels screen (ORD-06) reads the setting with the bands it is keyed by, the owner's hold reasons and Claude's
// suggested set (`riskLevels`, `risk.rules.read`) and saves it whole (`saveRiskLevels`, `risk.rules.write`): the
// settings resolver's own change log, one audit row, and a version that refuses a stale screen.
import { createHash } from 'node:crypto';
import { audit } from '@extas/auth';
import { NO_RISK_ACTIONS, registry, RISK_LEVEL_ASKS, riskLevelsSchema, storeTarget, SUGGESTED_RISK_LEVELS, type RiskBands, type RiskLevelActions, type RiskLevels } from '@extas/settings';
import { z } from 'zod';
import { allow, parse, setting, type OrdersDeps, type Who } from './context';
import { autoAdvance, type AdvanceRequestResult } from './advance-request';
import { holdWith } from './commands';
import { OrdersError, isOrdersError } from './errors';
import { levelPlanOf, type LevelPlan } from './pure';
import type { SettingsWriter } from './rule-switches';
import { execute, systemBy, type By, type CommandResult } from './service';

/** The order flag of a watched order (Order.flags; the team's screens show it, never the customer). */
export const RISK_WATCH_FLAG = 'RISK_WATCH';
/** Why the team calls (CallTask.reason) when a level asks for a confirmation call. */
export const RISK_LEVEL_CALL_REASON = 'RISK_LEVEL';
/** The timeline type of a level's steps. */
export const RISK_LEVEL_EVENT = 'order.riskLevel';

/** What a level did to one order. */
export interface LevelApplied {
  plan: LevelPlan;
  /** The hold: done, or why not (no such hold reason on the owner's list, or the order could not be held now). */
  hold: 'held' | 'NO_REASON' | 'NOT_HOLDABLE' | null;
  callTaskId: string | null;
  command: CommandResult;
  /**
   * PR 542: the owner's auto option (`orders.advanceRequest.auto`, off) asked the level's advance by itself — the
   * request, or why it could not be asked (NOTHING_DUE, NO_CHARGE …); null when the option is off or nothing is asked.
   */
  advance: AdvanceRequestResult | string | null;
}

/** The level written on an order last (its band and steps), from its timeline; null when none was. */
export interface StoredLevel {
  band: string;
  watch: boolean;
  hold: string | null;
  call: boolean;
  ask: RiskLevelActions['ask'];
  at: Date;
}

const LEVEL_SELECT = { data: true, createdAt: true } as const;

function storedOf(row: { data: unknown; createdAt: Date } | null): StoredLevel | null {
  const d = row?.data && typeof row.data === 'object' && !Array.isArray(row.data) ? (row.data as Record<string, unknown>) : null;
  if (!d || typeof d.band !== 'string') return null;
  const ask = (RISK_LEVEL_ASKS as readonly string[]).includes(String(d.ask)) ? (d.ask as RiskLevelActions['ask']) : 'none';
  return { band: d.band, watch: d.watch === true, hold: typeof d.hold === 'string' ? d.hold : null, call: d.call === true, ask, at: row!.createdAt };
}

/** The level last written on one order (no permission check: the callers have read the order). */
export async function storedLevel(deps: OrdersDeps, storeId: number, orderId: string): Promise<StoredLevel | null> {
  return storedOf(await deps.db.orderEvent.findFirst({ where: { storeId, orderId, type: RISK_LEVEL_EVENT }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], select: LEVEL_SELECT }));
}

/**
 * Applies the owner's steps for the band a score put the order in (called after every stored score: when it lands,
 * after an edit, a person's "score again"). Null when the master is off, the band does nothing, or this band's steps
 * were written before. Never fails the score: the caller catches.
 */
export async function applyRiskLevel(deps: OrdersDeps, ref: { storeId: number; orderId: string }, opts: { band: string; assessmentId: string; by?: By }): Promise<LevelApplied | null> {
  const cfg = await setting(deps, ref.storeId, 'risk.levels');
  const plan = levelPlanOf(opts.band, cfg);
  if (!plan) return null;
  const last = await storedLevel(deps, ref.storeId, ref.orderId);
  if (last?.band === plan.band) return null;
  const by = opts.by ?? systemBy('risk-levels');
  // the hold first, through the order service's own command (its timeline row and audit row)
  let hold: LevelApplied['hold'] = null;
  if (plan.hold) {
    const reasons = await setting(deps, ref.storeId, 'orders.hold.reasons');
    if (!reasons.some((r) => r.key === cfg.holdReasonKey)) hold = 'NO_REASON';
    else {
      try {
        await holdWith(deps, ref, by, cfg.holdReasonKey, undefined, { idempotencyKey: `risk-level-hold:${opts.assessmentId}` });
        hold = 'held';
      } catch (e) {
        // already held, confirmed into packing, or waiting for an advance: the level says so, a person decides
        if (!isOrdersError(e) || e.code !== 'ILLEGAL_TRANSITION') throw e;
        hold = 'NOT_HOLDABLE';
      }
    }
  }
  let callTaskId: string | null = null;
  try {
    const command = await execute(
      deps,
      ref,
      by,
      {
        command: 'riskLevel',
        input: { band: plan.band, assessmentId: opts.assessmentId },
        effect: async (tx, o) => {
          if (plan.call) {
            const open = await tx.callTask.findFirst({ where: { storeId: o.storeId, orderId: o.id, reason: RISK_LEVEL_CALL_REASON, status: { in: ['OPEN', 'IN_PROGRESS'] } }, select: { id: true } });
            callTaskId = (open ?? (await tx.callTask.create({ data: { storeId: o.storeId, orderId: o.id, customerId: o.customerId, reason: RISK_LEVEL_CALL_REASON }, select: { id: true } }))).id;
          }
          const row = await tx.order.findUniqueOrThrow({ where: { id: o.id }, select: { flags: true } });
          const flags = [...row.flags.filter((f) => f !== RISK_WATCH_FLAG), ...(plan.watch ? [RISK_WATCH_FLAG] : [])];
          return {
            data: { flags },
            reasonCode: plan.band,
            eventData: { band: plan.band, assessmentId: opts.assessmentId, watch: plan.watch, hold, call: plan.call, callTaskId, ask: plan.ask, previous: last?.band ?? null },
            audit: { before: { flags: row.flags, level: last?.band ?? null }, after: { flags, level: plan.band } },
          };
        },
      },
      { idempotencyKey: `risk-level:${opts.assessmentId}` },
    );
    // PR 542: only with the owner's auto option on; otherwise the ask stays a proposal for a person
    const advance = await autoAdvance(deps, ref, plan.ask, `risk-level-advance:${opts.assessmentId}`, by);
    return { plan, hold, callTaskId, command, advance };
  } catch (e) {
    // the order moved on (cancelled in the same second): nothing to mark
    if (isOrdersError(e) && e.code === 'ILLEGAL_TRANSITION') return null;
    throw e;
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// The Levels screen (ORD-06)
// ---------------------------------------------------------------------------------------------------------------------

export interface RiskLevelsView {
  value: RiskLevels;
  /** The bands the levels are keyed by (the owner's `risk.bands`), lowest first. */
  bands: RiskBands;
  /** The owner's hold reasons (the level's hold uses one). */
  holdReasons: { key: string; en: string; bn: string }[];
  /** Claude's set, for "Use the suggested set" (only the bands that exist; others do nothing). */
  suggested: Record<string, RiskLevelActions>;
  /** What a new installation ships with (everything off). */
  byDefault: RiskLevels;
  /** Sent back with a save; another save in between makes it STALE. */
  version: string;
}

const versionOf = (v: RiskLevels): string => createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0, 16);

async function viewOf(deps: OrdersDeps, storeId: number): Promise<RiskLevelsView> {
  const [value, bands, holdReasons] = await Promise.all([setting(deps, storeId, 'risk.levels'), setting(deps, storeId, 'risk.bands'), setting(deps, storeId, 'orders.hold.reasons')]);
  return {
    value,
    bands,
    holdReasons: holdReasons.map((r) => ({ key: r.key, en: r.en, bn: r.bn })),
    suggested: Object.fromEntries(bands.map((b) => [b.key, SUGGESTED_RISK_LEVELS[b.key] ?? NO_RISK_ACTIONS])),
    byDefault: registry['risk.levels'].default,
    version: versionOf(value),
  };
}

/** The Levels screen's data (`risk.rules.read`). */
export async function riskLevels(deps: OrdersDeps, who: Who): Promise<RiskLevelsView> {
  await allow(deps, who, 'risk.rules.read');
  return viewOf(deps, who.storeId);
}

export const saveLevelsInput = z.object({ value: z.unknown(), version: z.string().min(1).max(64).optional() }).strict();

/**
 * Saves the levels whole (`risk.rules.write`): each level keyed by one of the owner's bands, the hold reason one of his
 * list, a partial ask only with its percent. A stale version is refused with the fresh one.
 */
export async function saveRiskLevels(deps: OrdersDeps & { settings: OrdersDeps['settings'] & SettingsWriter }, who: Who, input: unknown): Promise<RiskLevelsView> {
  await allow(deps, who, 'risk.rules.write');
  const d = parse(saveLevelsInput, input, 'levels');
  const value = parse(riskLevelsSchema, d.value, 'levels');
  const before = await viewOf(deps, who.storeId);
  if (d.version !== undefined && d.version !== before.version) throw new OrdersError('STALE', 'the levels were changed by someone else; reload them', ['version'], { version: before.version });
  const bandKeys = new Set(before.bands.map((b) => b.key));
  const unknown = Object.keys(value.levels).filter((k) => !bandKeys.has(k));
  if (unknown.length) throw new OrdersError('INVALID_INPUT', 'a level for a band that does not exist', unknown.map((k) => `levels.${k}`));
  if (!before.holdReasons.some((r) => r.key === value.holdReasonKey)) throw new OrdersError('REASON_REQUIRED', 'pick a hold reason from the list', ['holdReasonKey']);
  if (versionOf(value) === before.version) return before;
  try {
    await deps.settings.set('risk.levels', value, storeTarget(who.storeId), { actorId: who.actor.staffUserId ?? null, reason: 'Risk rules › Levels' });
  } catch (e) {
    const details = (e as { details?: string[] }).details ?? [];
    throw new OrdersError('INVALID_INPUT', 'the levels could not be saved', details.length ? details : ['value']);
  }
  await audit(deps.db, who.actor, { storeId: who.storeId, action: 'risk.levels.save', entityType: 'RiskLevels', entityId: String(who.storeId), before: before.value, after: value }, { source: 'admin-api', ...who.ctx });
  return viewOf(deps, who.storeId);
}
