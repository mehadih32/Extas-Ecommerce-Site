// CN-033 · the shop follows the ERP's retail decisions of 30 Oct 2026 (PR 610, 614, 619, 621). Registry version 72
// (CN-031 lane A). Labels: messages/switchover.<lang>.json. Each older behaviour stays behind its own switch (nothing
// deleted); nothing here moves money or changes a price, and nothing is owner data.
//
// - `erp.switchOver.mode` (PR 619, per store): how a store switches to ERP contract v6.
//     `fresh-start` (as shipped): the ERP does not build the switch-over steps (`GET /switch-over` with moved old
//                   orders, `GET /cost-of-goods`), because the website never sent real orders to the live ERP through the
//                   old link. The owner, his PIN, a dry run and the switch date typed back stay; there are no moved
//                   orders, the opening balance is 0, no switch transfer and no cost-of-goods backfill (days before the
//                   switch are simply not sent). The only way a store reaches v6 against the real ERP today.
//     `erp-list`    the earlier way, kept whole for an ERP that offers those calls.
import { z } from 'zod';
import { setting } from './define';

const V = 72;

/** How a store switches to ERP contract v6 (CN-033 (1)). */
export const ERP_SWITCH_MODES = ['fresh-start', 'erp-list'] as const;
export type ErpSwitchMode = (typeof ERP_SWITCH_MODES)[number];

export const erpRetailSettings = {
  'erp.switchOver.mode': setting({
    scope: 'store',
    isOwnerData: false,
    isPublic: false,
    group: 'erp',
    version: V,
    schema: z.enum(ERP_SWITCH_MODES),
    default: 'fresh-start',
    valueType: 'ENUM',
    labelKey: 'erp.switchOver.mode.label',
    helpKey: 'erp.switchOver.mode.help',
    sortOrder: 63,
  }),
};
