// S06 · PR 544 — the rule master switches (ORD-06 "Rule switches"; BACKEND-ARCHITECTURE §8.7): one list of every fraud
// and duplicate rule with its own switch, so any one can be turned off the day it costs more than it saves. Each entry
// names the setting that holds it (nothing is stored twice): the duplicate check (PR 145) and its rules engine with the
// scenarios A–E, H, I (PR 520), the two-size check within one order (PR 146), the identity graph (PR 519), the risk
// score (PR 156) with each of its signals, and the risk sections (PR 541). An entry is `active` only when it and every
// switch above it are on. Reading needs `risk.rules.read`; switching needs `risk.rules.write` and writes the setting
// through the settings resolver (its own change log) plus one audit row; the list's version refuses a stale screen.
// Switching a rule changes only whether it marks and proposes: nothing here blocks anyone, decides an order, moves
// money or touches COD, a price or a charge. The defaults stay what each setting ships with (CN-018).
import { createHash } from 'node:crypto';
import { audit } from '@extas/auth';
import { DUPLICATE_SCENARIOS, messages, pair, registry, RISK_SIGNAL_KEYS, storeTarget, type Key, type LabelPair, type Value } from '@extas/settings';
import { z } from 'zod';
import { allow, parse, setting, type OrdersDeps, type Who } from './context';
import { OrdersError } from './errors';

/** Where a rule sits on the list. */
export const RULE_GROUPS = ['duplicate', 'identity', 'score', 'signal', 'section'] as const;
export type RuleGroup = (typeof RULE_GROUPS)[number];

interface RuleDef {
  key: string;
  setting: Key;
  /** The path of the rule's `enabled` inside the setting's value. */
  path: readonly string[];
  group: RuleGroup;
  /** The switch above it (its rule runs only while that one is on too). */
  parent: string | null;
  labelKey: string;
}

/** Every fraud and duplicate rule, in the order the list shows them. */
export const RULE_DEFS: readonly RuleDef[] = [
  { key: 'orders.duplicates', setting: 'orders.duplicates', path: ['enabled'], group: 'duplicate', parent: null, labelKey: 'orders.duplicates.label' },
  { key: 'risk.duplicateRules', setting: 'risk.duplicateRules', path: ['enabled'], group: 'duplicate', parent: 'orders.duplicates', labelKey: 'risk.duplicateRules.label' },
  ...DUPLICATE_SCENARIOS.map((s): RuleDef => ({ key: `risk.duplicateRules.${s}`, setting: 'risk.duplicateRules', path: ['rules', s, 'enabled'], group: 'duplicate', parent: 'risk.duplicateRules', labelKey: `risk.duplicateRules.scenario.${s}` })),
  { key: 'orders.twoSize', setting: 'orders.twoSize', path: ['enabled'], group: 'duplicate', parent: null, labelKey: 'orders.twoSize.label' },
  { key: 'risk.identity', setting: 'risk.identity', path: ['enabled'], group: 'identity', parent: null, labelKey: 'risk.identity.label' },
  { key: 'risk.score', setting: 'risk.score', path: ['enabled'], group: 'score', parent: null, labelKey: 'risk.score.label' },
  ...RISK_SIGNAL_KEYS.map((k): RuleDef => ({ key: `risk.signals.${k}`, setting: 'risk.signals', path: [k, 'enabled'], group: 'signal', parent: 'risk.score', labelKey: `risk.signals.names.${k}` })),
  { key: 'risk.sections', setting: 'risk.sections', path: ['enabled'], group: 'section', parent: null, labelKey: 'risk.sections.label' },
];

const BY_KEY = new Map(RULE_DEFS.map((d) => [d.key, d]));
const SETTINGS = [...new Set(RULE_DEFS.map((d) => d.setting))];

export interface RuleSwitch {
  key: string;
  group: RuleGroup;
  parent: string | null;
  label: LabelPair;
  /** The setting that holds the switch. */
  setting: string;
  enabled: boolean;
  /** On, and every switch above it on: the rule runs now. */
  active: boolean;
  /** What a new installation ships with. */
  byDefault: boolean;
}

export interface RuleList {
  rules: RuleSwitch[];
  /** Sent back with a change; another change in between makes it STALE. */
  version: string;
}

type Values = Map<Key, unknown>;

const at = (v: unknown, path: readonly string[]): unknown => path.reduce<unknown>((n, p) => (n && typeof n === 'object' ? (n as Record<string, unknown>)[p] : undefined), v);

/** The value with `enabled` at the path set, everything else as it was. */
function withEnabled(v: unknown, path: readonly string[], on: boolean): unknown {
  const [head, ...rest] = path;
  const o = { ...((v && typeof v === 'object' ? v : {}) as Record<string, unknown>) };
  o[head!] = rest.length ? withEnabled(o[head!], rest, on) : on;
  return o;
}

async function valuesOf(deps: OrdersDeps, storeId: number): Promise<Values> {
  return new Map(await Promise.all(SETTINGS.map(async (k) => [k, await setting(deps, storeId, k)] as const)));
}

const versionOf = (vals: Values): string => createHash('sha256').update(JSON.stringify(SETTINGS.map((k) => [k, vals.get(k)]))).digest('hex').slice(0, 16);

/** The defaults, from each setting's definition. */
const DEFAULTS: Values = new Map(SETTINGS.map((k) => [k, registry[k].default as unknown]));

function listOf(vals: Values, defs: Values): RuleList {
  const enabled = new Map(RULE_DEFS.map((d) => [d.key, at(vals.get(d.setting), d.path) === true]));
  const active = (d: RuleDef): boolean => enabled.get(d.key)! && (!d.parent || active(BY_KEY.get(d.parent)!));
  return {
    rules: RULE_DEFS.map((d) => ({ key: d.key, group: d.group, parent: d.parent, label: pair(messages, d.labelKey), setting: d.setting, enabled: enabled.get(d.key)!, active: active(d), byDefault: at(defs.get(d.setting), d.path) === true })),
    version: versionOf(vals),
  };
}

/** Every fraud and duplicate rule with its switch (`risk.rules.read`). */
export async function riskRules(deps: OrdersDeps, who: Who): Promise<RuleList> {
  await allow(deps, who, 'risk.rules.read');
  return listOf(await valuesOf(deps, who.storeId), DEFAULTS);
}

/** The settings resolver's write side (the app passes its SettingsResolver). */
export interface SettingsWriter {
  set<K extends Key>(key: K, value: Value<K>, target: ReturnType<typeof storeTarget>, opts?: { actorId?: string | null; reason?: string | null }): Promise<unknown>;
}

export const switchInput = z
  .object({
    /** The rule keys to switch, each on (true) or off (false). */
    switches: z.record(z.string().min(1).max(80), z.boolean()).refine((r) => Object.keys(r).length > 0 && Object.keys(r).length <= RULE_DEFS.length, 'one rule at least'),
    /** The list's version as the screen read it. */
    version: z.string().min(1).max(64).optional(),
  })
  .strict();

/** Switches one or more rules on or off at once (`risk.rules.write`); all are checked before any is written. */
export async function switchRules(deps: OrdersDeps & { settings: OrdersDeps['settings'] & SettingsWriter }, who: Who, input: unknown): Promise<RuleList> {
  await allow(deps, who, 'risk.rules.write');
  const d = parse(switchInput, input, 'switches');
  const unknown = Object.keys(d.switches).filter((k) => !BY_KEY.has(k));
  if (unknown.length) throw new OrdersError('NOT_FOUND', 'no such rule', unknown);
  const before = await valuesOf(deps, who.storeId);
  if (d.version !== undefined && d.version !== versionOf(before)) throw new OrdersError('STALE', 'the rules were changed by someone else; reload them', ['version'], { version: versionOf(before) });
  const next = new Map(before);
  const changed: { key: string; before: boolean; after: boolean }[] = [];
  for (const [key, on] of Object.entries(d.switches)) {
    const def = BY_KEY.get(key)!;
    const was = at(next.get(def.setting), def.path) === true;
    if (was === on) continue;
    next.set(def.setting, withEnabled(next.get(def.setting), def.path, on));
    changed.push({ key, before: was, after: on });
  }
  const settingsChanged = SETTINGS.filter((k) => next.get(k) !== before.get(k));
  for (const k of settingsChanged) {
    try {
      await deps.settings.set(k, next.get(k) as never, storeTarget(who.storeId), { actorId: who.actor.staffUserId ?? null, reason: 'Risk rules › switch' });
    } catch (e) {
      const details = (e as { details?: string[] }).details ?? [];
      throw new OrdersError('INVALID_INPUT', `the ${k} switch could not be saved`, details.length ? details : [k]);
    }
  }
  if (changed.length)
    await audit(deps.db, who.actor, { storeId: who.storeId, action: 'risk.rules.switch', entityType: 'RiskRules', entityId: String(who.storeId), before: Object.fromEntries(changed.map((c) => [c.key, c.before])), after: Object.fromEntries(changed.map((c) => [c.key, c.after])) }, { source: 'admin-api', ...who.ctx });
  return listOf(await valuesOf(deps, who.storeId), DEFAULTS);
}
