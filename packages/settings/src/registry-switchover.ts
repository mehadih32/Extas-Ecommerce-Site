// CN-028 · CN-029 Phase 2, Prohori's lane (PR 619, 621). Registry version 70. Labels: messages/switchover.<lang>.json.
// The switch itself is the setting `erp.model` (registry-erp-v6.ts, Phase 0: the owner's written OK, `requiresOwnerOk`);
// this file holds only what the lane adds. Nothing here moves money or changes a price, and nothing is owner data.
//
// PR 619 (ERP group): the switch-over and the per-store ERP link page.
// - `erp.switchOver.dryRunMaxHours`  a switch goes only after a dry run this fresh that saw the same list from the ERP
//                                    (the owner switches what he looked at, nothing else);
// - `erp.switchOver.queuedV5Orders`  an order document still waiting in the old (v5) form at the switch (follow-up 530):
//                                    `resend` builds it again as a v6 order (one line per piece) and sends it like any
//                                    new order; `hold` keeps it for a person, who sends it from the ERP link page;
// - `erp.link.listShown`             how many rows each list of the ERP link page shows (queued orders, summaries …).
// PR 621 (ERP group): the acceptance suite against the demo ERP. It runs only once the owner has typed the demo shop's
// key on the ERP link page (the vault, never Git); without it the run says "waiting for the demo key" and calls nobody.
// - `erp.acceptance.demoBaseUrl`     the demo ERP's address (the contract's path `/api/v1/ecommerce` is added by the
//                                    client), https only;
// - `erp.acceptance.timeoutSeconds`  how long one call to the demo ERP may take;
// - `erp.acceptance.demoWrites`      off: against the demo ERP only the read checks run; on: the write checks make their
//                                    own sample orders, deliveries, return lists, summaries and fixed costs there too
//                                    (ids `ACC-<run>-…`). The practice ERP in CI always runs every check.
import { z } from 'zod';
import { setting } from './define';

const V = 70;

const erp = { scope: 'installation', isOwnerData: false, isPublic: false, group: 'erp', version: V } as const;

/** What happens to an order document still waiting in the v5 form when its store switches to v6 (follow-up 530). */
export const ERP_SWITCH_QUEUED_V5 = ['resend', 'hold'] as const;
export type ErpSwitchQueuedV5 = (typeof ERP_SWITCH_QUEUED_V5)[number];

export const switchoverSettings = {
  // ---- PR 619 · the switch-over ----
  'erp.switchOver.dryRunMaxHours': setting({
    ...erp,
    schema: z.int().min(1).max(168),
    default: 24,
    valueType: 'INT',
    labelKey: 'erp.switchOver.dryRunMaxHours.label',
    helpKey: 'erp.switchOver.dryRunMaxHours.help',
    sortOrder: 60,
  }),
  'erp.switchOver.queuedV5Orders': setting({
    ...erp,
    scope: 'store',
    schema: z.enum(ERP_SWITCH_QUEUED_V5),
    default: 'resend',
    valueType: 'ENUM',
    labelKey: 'erp.switchOver.queuedV5Orders.label',
    helpKey: 'erp.switchOver.queuedV5Orders.help',
    sortOrder: 61,
  }),
  'erp.link.listShown': setting({
    ...erp,
    schema: z.int().min(1).max(200),
    default: 20,
    valueType: 'INT',
    labelKey: 'erp.link.listShown.label',
    helpKey: 'erp.link.listShown.help',
    sortOrder: 62,
  }),

  // ---- PR 621 · the acceptance suite against the demo ERP ----
  'erp.acceptance.demoBaseUrl': setting({
    ...erp,
    schema: z.url({ protocol: /^https$/ }).max(500),
    default: 'https://demo.extasbd.com',
    valueType: 'STRING',
    labelKey: 'erp.acceptance.demoBaseUrl.label',
    helpKey: 'erp.acceptance.demoBaseUrl.help',
    sortOrder: 70,
  }),
  'erp.acceptance.timeoutSeconds': setting({
    ...erp,
    schema: z.int().min(5).max(120),
    default: 20,
    valueType: 'INT',
    labelKey: 'erp.acceptance.timeoutSeconds.label',
    helpKey: 'erp.acceptance.timeoutSeconds.help',
    sortOrder: 71,
  }),
  'erp.acceptance.demoWrites': setting({
    ...erp,
    schema: z.boolean(),
    default: false,
    valueType: 'BOOLEAN',
    labelKey: 'erp.acceptance.demoWrites.label',
    helpKey: 'erp.acceptance.demoWrites.help',
    sortOrder: 72,
  }),
};
