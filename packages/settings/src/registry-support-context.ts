// S22 · PR 428 (CN-031 lane C; Blueprint B4.5) — the customer beside a support chat. Registry version 156 (lane C's
// range). Labels: messages/support-context.<lang>.json; the admin's place is Support → Support settings
// (docs/ADMIN-ARCHITECTURE.md §4.7).
//
// `support.context` (per store):
// - `enabled`: the "Customer" card on every chat — order count, delivered / refused / returned share, the risk score,
//   the orders still on their way and where each is now, each a link. On as it ships: B4.5 is locked ("customer
//   history is always visible"); it only shows what the admin already holds, to people who may read it.
// - `recentOrders`: how many of the latest orders the card lists (1–10).
//
// Nothing here sends a message, changes an order, a price, a discount or COD, or blocks anyone; nothing is owner data.
import { z } from 'zod';
import { setting } from './define';

const VID = 156;

export const supportContextSchema = z
  .object({
    enabled: z.boolean(),
    recentOrders: z.number().int().min(1).max(10),
  })
  .strict();
export type SupportContextSettings = z.output<typeof supportContextSchema>;

export const supportContextSettings = {
  'support.context': setting({
    scope: 'store',
    group: 'support',
    valueType: 'JSON',
    isOwnerData: false,
    isPublic: false,
    schema: supportContextSchema,
    default: { enabled: true, recentOrders: 3 },
    labelKey: 'support.context.label',
    helpKey: 'support.context.help',
    sortOrder: 51,
    version: VID,
  }),
};
