// S06 · PR 161 — what happens at each risk level (registry version 54). Labels: messages/risk.<lang>.json (the Orders
// group; the admin's place is Orders → Risk rules → Levels, ORD-06 of docs/BACKEND-ARCHITECTURE.md §5.3).
//
// The risk score (PR 156) puts every scored order in one of the owner's bands (`risk.bands`: low, medium, high). This
// setting says, per band, which steps follow (the owner's answer 2 of S06; CN-018 (2): Soft = the delivery charge in
// advance, Hard = the full amount in advance, a partial-advance option):
//   watch — a "watch" mark on the order and its timeline line;
//   hold  — the order is held with the owner's hold reason (it is then neither confirmed nor booked until a person
//           releases it: SIM-F-014);
//   call  — a confirmation call task in the call queue;
//   ask   — what the customer is asked to pay first: nothing, the delivery charge, a part (`partialPercent` of the
//           amount due), the whole amount, or "no cash on delivery for this order" (the whole amount, paid online).
// The ask is ALWAYS a proposal on the order page: a person presses "Request advance" (PR 542), or the owner turns on
// that request's own automatic option. Watch, hold and call run by themselves only while the owner has switched them on
// here. Nothing here blocks anyone, changes a COD rule, a price or a charge (CLAUDE.md rule 6; architecture R5).
//
// Every switch is OFF by default (CN-018): the master and every action. "Claude's set" (register PR 161: Soft = watch,
// call and the delivery charge in advance; Hard = hold, call and the full amount in advance) ships as the suggestion
// the Levels screen offers in one tap (`SUGGESTED_RISK_LEVELS`), never as a running default.
import { z } from 'zod';
import { setting } from './define';
import { dictionaryKeySchema } from './schemas';

const V = 54;

const base = { scope: 'store', isOwnerData: false, isPublic: false, group: 'orders', version: V } as const;

/** What a level asks the customer to pay before the order goes ahead. */
export const RISK_LEVEL_ASKS = ['none', 'delivery', 'partial', 'full', 'codOff'] as const;
export type RiskLevelAsk = (typeof RISK_LEVEL_ASKS)[number];

/** The steps of one band. */
export const riskLevelActionsSchema = z
  .object({ watch: z.boolean(), hold: z.boolean(), call: z.boolean(), ask: z.enum(RISK_LEVEL_ASKS) })
  .strict();
export type RiskLevelActions = z.output<typeof riskLevelActionsSchema>;

/** Nothing at all: a band the owner has not set. */
export const NO_RISK_ACTIONS: RiskLevelActions = { watch: false, hold: false, call: false, ask: 'none' };

/**
 * `enabled`: the master switch — off, a score is only a number on the order page. `levels`: the steps of each band, by
 * the band's key (`risk.bands`; a band not listed does nothing). `partialPercent`: the share of the amount due a
 * partial advance asks (empty: the partial ask cannot be used until the owner sets it). `holdReasonKey`: the hold
 * reason a level's hold uses (`orders.hold.reasons`).
 */
export const riskLevelsSchema = z
  .object({
    enabled: z.boolean(),
    levels: z.record(dictionaryKeySchema, riskLevelActionsSchema).refine((r) => Object.keys(r).length <= 10, { message: 'at most 10 levels' }),
    partialPercent: z.int().min(1).max(99).nullable(),
    holdReasonKey: dictionaryKeySchema,
  })
  .strict()
  .refine((v) => v.partialPercent !== null || Object.values(v.levels).every((l) => l.ask !== 'partial'), { message: 'a partial advance needs its percent', path: ['partialPercent'] });
export type RiskLevels = z.output<typeof riskLevelsSchema>;

/** Claude's set (register PR 161, Blueprint F4 answer 2): offered on the Levels screen, never running by itself. */
export const SUGGESTED_RISK_LEVELS: Readonly<Record<string, RiskLevelActions>> = {
  low: NO_RISK_ACTIONS,
  medium: { watch: true, hold: false, call: true, ask: 'delivery' },
  high: { watch: true, hold: true, call: true, ask: 'full' },
};

export const riskLevelSettings = {
  'risk.levels': setting({
    ...base,
    schema: riskLevelsSchema,
    default: { enabled: false, levels: { low: NO_RISK_ACTIONS, medium: NO_RISK_ACTIONS, high: NO_RISK_ACTIONS }, partialPercent: null, holdReasonKey: 'risk-check' },
    valueType: 'JSON',
    labelKey: 'risk.levels.label',
    helpKey: 'risk.levels.help',
    sortOrder: 325,
  }),
};
