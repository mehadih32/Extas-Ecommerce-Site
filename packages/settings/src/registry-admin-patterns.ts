// PR 627 (CN-036) — the numbers of the admin's shared Lumen patterns (docs/demo/admin-look/LUMEN-SPEC.md §3). Registry
// version 236. Labels: messages/admin-look.<lang>.json (`admin.patterns.*`).
//
// - `admin.patterns`: how many seconds a toast keeps its Undo button (5 as shipped; the toast waits while the mouse,
//   a finger or the keyboard is on it), and how many more rows a list's "Show more" adds at a time (12 as shipped).
// Nothing here changes money, an order or a customer: Undo is only ever offered for reversible shop actions
// (apps/web/src/lib/admin-lumen/safety.ts), never for money, refunds, COD, prices, discounts, blocking or deleting.
import { z } from 'zod';
import { setting } from './define';

const V = 236;

export const adminPatternsSchema = z
  .object({
    undoSeconds: z.number().int().min(3).max(30),
    pageStep: z.number().int().min(6).max(100),
  })
  .strict();

export type AdminPatterns = z.infer<typeof adminPatternsSchema>;

export const adminPatternsSettings = {
  'admin.patterns': setting({
    scope: 'store',
    valueType: 'JSON',
    group: 'admin',
    isOwnerData: false,
    isPublic: false,
    version: V,
    schema: adminPatternsSchema,
    default: { undoSeconds: 5, pageStep: 12 },
    labelKey: 'admin.patterns.label',
    helpKey: 'admin.patterns.help',
    sortOrder: 39,
  }),
};
