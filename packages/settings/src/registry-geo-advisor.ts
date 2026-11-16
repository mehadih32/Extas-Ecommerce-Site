// S29 · PR 761 (CN-054; register "Geography map: AI advisor", advice only) — the advisor's own two numbers. The advisor itself
// is switched by `reports.geoMap.ai` (off as shipped) and runs only while `ai.enabled` is on; it reads the Geography map's
// figures and puts each suggestion in the approval queue as a draft. Nothing here changes an ad budget, a campaign, a price,
// a charge, a COD rule or a courier: the draft only asks a person to decide. Registry version 761.
//   - `maxPerRun`: the most suggestions one run drafts (each one is one small AI call, so this also bounds the cost of a run);
//   - `expiresDays`: how long a draft waits in the queue before it expires by itself (a stale figure is never left asking).
// The monthly cap on AI cost is the existing one (`ai.monthlyCapMinor` and each agent's own cap): the advisor never has its own.
import { z } from 'zod';
import { setting } from './define';

const V761 = 761;

export const geoAdvisorSchema = z
  .object({
    /** The most suggestions one run drafts. */
    maxPerRun: z.int().min(1).max(50), // hardcode-ok: technical bounds of the setting
    /** Days a draft waits in the queue before it expires. */
    expiresDays: z.int().min(1).max(90), // hardcode-ok: technical bounds of the setting
  })
  .strict();
export type GeoAdvisorSettings = z.output<typeof geoAdvisorSchema>;

/** The shipped defaults; the advisor itself ships off, and the owner changes both numbers. */
export const GEO_ADVISOR_DEFAULT: GeoAdvisorSettings = {
  maxPerRun: 10,
  expiresDays: 14,
}; // hardcode-ok: the setting's shipped default

export const geoAdvisorSettings = {
  'reports.geoAdvisor': setting({
    scope: 'store',
    schema: geoAdvisorSchema,
    default: GEO_ADVISOR_DEFAULT,
    valueType: 'JSON',
    group: 'reports',
    labelKey: 'reports.geoAdvisor.label',
    helpKey: 'reports.geoAdvisor.help',
    isOwnerData: false,
    isPublic: false,
    sortOrder: 761,
    version: V761,
  }),
};
