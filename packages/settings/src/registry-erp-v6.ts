// CN-028 · PR 607–610 — Retail and the ERP supplier model (docs/RETAIL-ERP-MODEL.md, docs/erp/site-changes-v6.md).
// Registry version 62. Labels: messages/erp-v6.<lang>.json (the ERP group, Settings → ERP connection; the catalogue keys
// in the Products group).
//
// PR 607 (`erp.model`): which ERP contract the shop speaks. `v5` until the ERP announces its switch date and sends the
// final `openapi.yaml`; then `v6` (PR 619 switches it, after a dry run). Everything of CN-028 sits behind it: in `v5`
// nothing changes. In `v6` the shop reads only the ERP's shop price (never `retailPrice` or `avgCost`) and the retired v5
// calls (customer payments, returns, ad spend, shipment events, a delivered or returned status) are never sent.
// It is a contract switch, not a money value: it moves no money by itself (the ERP bills by its own contract either way).
import { z } from 'zod';
import { setting } from './define';

const V = 62;

/** The ERP contract the shop speaks (PR 607). Kept here as plain values: the settings package does not import adapters. */
export const ERP_MODEL_VALUES = ['v5', 'v6'] as const;
export const erpModelSchema = z.enum(ERP_MODEL_VALUES);

const erp = { scope: 'store', isOwnerData: false, isPublic: false, group: 'erp', version: V } as const;

export const erpV6Settings = {
  // ---- PR 607 · the ERP contract ----
  'erp.model': setting({
    ...erp,
    schema: erpModelSchema,
    default: 'v5',
    valueType: 'ENUM',
    labelKey: 'erp.model.label',
    helpKey: 'erp.model.help',
    sortOrder: 5,
  }),
};
