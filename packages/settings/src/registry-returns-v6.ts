// CN-028 · PR 612–614 (CN-029 Phase 1, Pherot) — returns and exchanges on the ERP model (docs/RETAIL-ERP-MODEL.md §6, §7;
// docs/erp/site-changes-v6.md §2.5, §2.9, §2.10). Registry version 67. Labels: messages/returns-v6.<lang>.json (Orders
// group; shown read-only under "More options" on Orders → Returns & exchanges → ERP returns).
//
// The old shop-side work (PR 187 the shop's own quality check, its restock into the ERP and its write-off; PR 185–190
// the wallet credit noted when the new piece is cheaper) keeps working while a store speaks ERP contract v5. Each of
// those paths is a switch here, per store, ON by default (= today's behaviour). At the switch-over to v6 (PR 619) the
// switch-over turns them off; they are never deleted (CLAUDE.md rule 3). In v6 the old paths never run, whatever the
// switch says: the owner decides every returned piece in the ERP, and there are no refunds after delivery (CN-028 (3)).
//
// - `returns.legacy.shopQc`    the shop's own sellable / not-sellable check at receipt (PR 187, ORD-05a).
// - `returns.legacy.restock`   a sellable piece sent back to ERP stock as a `return.create` document (PR 187).
// - `returns.legacy.writeOff`  a not-sellable piece booked as the shop's return loss (a RETURN_LOSS cost, PR 187).
// - `returns.legacy.creditDue` a cheaper new piece leaves a credit noted as due after the check (PR 185, 187).
// - `returns.erpCheck.days`    how long the owner has to check a returned piece in the ERP, from the courier's
//                              hand-back date (owner answer Q4: 7, 10 or 15 days; the ERP keeps the setting, the shop
//                              shows the countdown with this number).
// - `exchange.erp.keepForOrders` regular orders come first (§6.2): an exchange waits when it would leave fewer than this
//                              many pieces of the new SKU free in the ERP (1 = it never takes the last piece).
// - `returns.compare.runAt`    when the Returns section is compared with the ERP's `GET /returns/summary` for
//                              yesterday, every night (after the ERP's own 01:00 night run).
import { z } from 'zod';
import { setting } from './define';
import { clockTimeSchema } from './registry-eid';

const V = 67;

const orders = { scope: 'store', isOwnerData: false, isPublic: false, group: 'orders', version: V } as const;

/** Owner answer Q4: the owner checks returned pieces within 7, 10 or 15 days of the courier's hand-back. */
export const RETURNS_ERP_CHECK_DAYS = [7, 10, 15] as const;
export const returnsErpCheckDaysSchema = z.union([z.literal(7), z.literal(10), z.literal(15)]);

export const returnsV6Settings = {
  'returns.legacy.shopQc': setting({
    ...orders,
    schema: z.boolean(),
    default: true,
    valueType: 'BOOLEAN',
    labelKey: 'returns.legacy.shopQc.label',
    helpKey: 'returns.legacy.shopQc.help',
    sortOrder: 93,
  }),
  'returns.legacy.restock': setting({
    ...orders,
    schema: z.boolean(),
    default: true,
    valueType: 'BOOLEAN',
    labelKey: 'returns.legacy.restock.label',
    helpKey: 'returns.legacy.restock.help',
    sortOrder: 94,
  }),
  'returns.legacy.writeOff': setting({
    ...orders,
    schema: z.boolean(),
    default: true,
    valueType: 'BOOLEAN',
    labelKey: 'returns.legacy.writeOff.label',
    helpKey: 'returns.legacy.writeOff.help',
    sortOrder: 95,
  }),
  'returns.legacy.creditDue': setting({
    ...orders,
    schema: z.boolean(),
    default: true,
    valueType: 'BOOLEAN',
    labelKey: 'returns.legacy.creditDue.label',
    helpKey: 'returns.legacy.creditDue.help',
    sortOrder: 96,
  }),
  'returns.erpCheck.days': setting({
    ...orders,
    schema: returnsErpCheckDaysSchema,
    default: 7,
    valueType: 'INT',
    labelKey: 'returns.erpCheck.days.label',
    helpKey: 'returns.erpCheck.days.help',
    sortOrder: 97,
  }),
  'exchange.erp.keepForOrders': setting({
    ...orders,
    schema: z.int().min(0).max(100),
    default: 1,
    valueType: 'INT',
    labelKey: 'exchange.erp.keepForOrders.label',
    helpKey: 'exchange.erp.keepForOrders.help',
    sortOrder: 98,
  }),
  'returns.compare.runAt': setting({
    ...orders,
    schema: clockTimeSchema,
    default: '01:15',
    valueType: 'STRING',
    labelKey: 'returns.compare.runAt.label',
    helpKey: 'returns.compare.runAt.help',
    sortOrder: 99,
  }),
};
