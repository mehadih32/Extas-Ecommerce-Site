// Follow-up 526 (PR 620) — the ERP's signed calls to the shop: refuse a signature already used. Registry version 238.
// Labels: messages/bhandari-p1.<lang>.json (`erp.siteApi.refuseReplays`).
//
// - `erp.siteApi.refuseReplays`: off as shipped. On, a signed call whose exact signature was already answered inside the
//   allowed age (`erp.siteApi.maxAgeSeconds`, both sides of the shop's clock) is refused (401 REPLAYED), so a call
//   copied off the wire cannot be sent again within the 5 minutes. Off by default because an ERP that retries a lost
//   answer with the same signature would then be refused: switch it on once the ERP signs each try anew.
import { z } from 'zod';
import { setting } from './define';

const V = 238;

export const erpReplaySettings = {
  'erp.siteApi.refuseReplays': setting({
    scope: 'installation',
    isOwnerData: false,
    isPublic: false,
    group: 'erp',
    version: V,
    schema: z.boolean(),
    default: false,
    valueType: 'BOOLEAN',
    labelKey: 'erp.siteApi.refuseReplays.label',
    helpKey: 'erp.siteApi.refuseReplays.help',
    sortOrder: 42,
  }),
} as const;
