// S02 · PR 83 (register "A/B test module for the storefront"; BACKEND-ARCHITECTURE REP-08 Experiments; Blueprint D4.2
// "A/B testing module — global and per test — Off") — the module's own switch and numbers (registry version 243; lane B,
// CN-036). While `enabled` is off, no shop page shows a test's version B, no visitor is counted and a test cannot start;
// the tests themselves are kept (AbTest). A test only changes words and which parts of a page show (never a price, a
// discount, COD or a delivery charge: those need the owner's written OK, CLAUDE.md rule 6).
// - `confidence`: how sure the result must be (in %) before "Keep B" or "Keep A" is offered as the winner.
// - `minVisitors`: how many visitors each version needs before a result is shown at all.
// - `cookieDays`: how long a new visitor's random id (the bag's own cookie) is kept, so he keeps seeing the same version.
import { z } from 'zod';
import { setting } from './define';

const V = 243;

export const experimentsModuleSchema = z
  .object({
    enabled: z.boolean(),
    confidence: z.int().min(80).max(99),
    minVisitors: z.int().min(10).max(1_000_000),
    cookieDays: z.int().min(1).max(365),
  })
  .strict();
export type ExperimentsModule = z.output<typeof experimentsModuleSchema>;

export const experimentsSettings = {
  'experiments.module': setting({
    scope: 'store',
    schema: experimentsModuleSchema,
    default: { enabled: false, confidence: 95, minVisitors: 100, cookieDays: 30 },
    valueType: 'JSON',
    group: 'experiments',
    labelKey: 'experiments.module.label',
    helpKey: 'experiments.module.help',
    isOwnerData: false,
    isPublic: false,
    sortOrder: 10,
    version: V,
  }),
};
