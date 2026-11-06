// PR 631 (CN-036) — the Lumen "Today" page's own numbers (Dashboard design B, docs/demo/admin-look/LUMEN-SPEC.md §4).
// Registry version 237. Labels: messages/admin-look.<lang>.json (`admin.today.*`).
//
// - `admin.today.liveRows`: how many of the newest orders the live feed lists (6 as shipped; 0 hides the feed).
// - `admin.today.goal`: the monthly goal ring — off as shipped (CN-018). Turned on with an amount (in the shop's
//   currency, minor units; 0 = no goal set, the ring then says so), it shows this month's Sales (delivered orders only,
//   the one KPI definition of @extas/metrics) against the goal. It is a target to look at: nothing here changes money,
//   a price, an order or a customer.
import { z } from 'zod';
import { setting } from './define';

const V = 237;

export const adminTodaySchema = z
  .object({
    liveRows: z.number().int().min(0).max(20),
    goal: z
      .object({
        on: z.boolean(),
        amountMinor: z.number().int().min(0).max(100_000_000_000),
      })
      .strict(),
  })
  .strict();

export type AdminToday = z.infer<typeof adminTodaySchema>;

export const adminTodaySettings = {
  'admin.today': setting({
    scope: 'store',
    valueType: 'JSON',
    group: 'admin',
    isOwnerData: false,
    isPublic: false,
    version: V,
    schema: adminTodaySchema,
    default: { liveRows: 6, goal: { on: false, amountMinor: 0 } },
    labelKey: 'admin.today.label',
    helpKey: 'admin.today.help',
    sortOrder: 44,
  }),
};
