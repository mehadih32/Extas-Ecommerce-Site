// PR 12 (CN-025, CN-026 (b)) — Settings → Admin look (demo V12.4 #/admin/settings/look, 97z-adm2-rd1-core.js).
// Registry version 51. Labels: messages/admin-look.<lang>.json (`admin.look.*`, `admin.guideOpens.*`, `admin.todo.*`,
// `admin.dashboardDesigns.*`).
//
// - `admin.look`: the team's design per admin page (page id → design key, e.g. `{ "dashboard": "C" }`). A page not
//   listed shows its registry default (the V12.4 default: Dashboard = B). `perPerson` lets each person pick their own
//   design in the page's "…" menu (kept on their staff account); off = everyone sees the team's design.
// - `admin.guideOpens` (CN-026 (b)): where the guide opens. Desktop: a side panel (default), a pop-up window or its own
//   page; phone: a full-screen sheet. `perPerson` lets each person choose their own. The guide itself reads it.
// - `admin.todo`: the "To do" drawer behind the top bar's tray: how many hours "Later" puts a list aside, and which
//   waiting lists are "Mine" for each role (role key → list ids; a role not listed sees its start section's lists).
// - `admin.dashboardDesigns`: the numbers the Dashboard design draws with (the order-to-courier target, how many rows
//   each card lists, how many days the charts cover, the longest date range of a person's own).
// Nothing here changes money, an order or a customer: it is how the admin looks and opens.
import { z } from 'zod';
import { setting } from './define';

const V = 51;

/** An admin page's id in the look registry (apps/web/src/components/admin/look/registry.ts). */
const lookPageSchema = z.string().regex(/^[a-z][a-z0-9-]{1,39}$/);
/** A design's key: one capital letter (A, B, C …). */
export const designKeySchema = z.string().regex(/^[A-Z]$/);
/** A role's key as the role builder makes it (packages/auth roles.ts). */
const roleKeySchema = z.string().regex(/^[a-z][a-z0-9-]{1,39}$/);

export const adminLookSchema = z
  .object({
    /** The team's design per page; a page not listed shows its registry default. */
    pages: z.record(lookPageSchema, designKeySchema).refine((v) => Object.keys(v).length <= 100, { message: 'at most 100 pages' }),
    /** Each person may pick their own design in the page's "…" menu. */
    perPerson: z.boolean(),
  })
  .strict();

export const GUIDE_DESKTOP_MODES = ['panel', 'popup', 'page'] as const;
export const GUIDE_PHONE_MODES = ['sheet'] as const;

export const adminGuideOpensSchema = z
  .object({
    /** Desktop and tablet: a side panel beside the page, a pop-up window, or the guide's own page. */
    desktop: z.enum(GUIDE_DESKTOP_MODES),
    /** Phone: a full-screen sheet. */
    phone: z.enum(GUIDE_PHONE_MODES),
    /** Each person may choose their own. */
    perPerson: z.boolean(),
  })
  .strict();

export const adminTodoSchema = z
  .object({
    /** "Later" puts a waiting list aside for this many hours (in this browser). */
    laterHours: z.int().min(1).max(72),
    /** The lists that are "Mine" per role (role key → list ids, e.g. ordersConfirm). */
    mine: z
      .record(roleKeySchema, z.array(z.string().regex(/^[a-zA-Z][a-zA-Z0-9]{1,39}$/)).max(40))
      .refine((v) => Object.keys(v).length <= 100, { message: 'at most 100 roles' }),
  })
  .strict();

export const adminDashboardDesignsSchema = z
  .object({
    /** The order-to-courier target in hours shown beside the average (0 = no target shown). */
    targetHours: z.int().min(0).max(240),
    /** The sales charts cover at least this many days, even when "Today" is chosen. */
    chartMinDays: z.int().min(2).max(90),
    /** The lines are an average over this many days (1 = the raw day). */
    smoothDays: z.int().min(1).max(14),
    /** Rows in "Top products". */
    topProducts: z.int().min(1).max(20),
    /** Rows in "Stock running out". */
    lowStockRows: z.int().min(1).max(20),
    /** Days the courier cards, delivery success and best sellers cover. */
    courierDays: z.int().min(7).max(180),
    /** A date range of the person's own covers at most this many days. */
    customMaxDays: z.int().min(7).max(731),
    /** Weeks in the week-by-week spark lines (delivery success, average order). */
    sparkWeeks: z.int().min(2).max(26),
  })
  .strict();

const json = { scope: 'store', valueType: 'JSON', group: 'admin', isOwnerData: false, isPublic: false, version: V } as const;

export const adminLookSettings = {
  'admin.look': setting({
    ...json,
    schema: adminLookSchema,
    default: { pages: {}, perPerson: true },
    labelKey: 'admin.look.label',
    helpKey: 'admin.look.help',
    sortOrder: 40,
  }),
  'admin.guideOpens': setting({
    ...json,
    schema: adminGuideOpensSchema,
    default: { desktop: 'panel', phone: 'sheet', perPerson: true },
    labelKey: 'admin.guideOpens.label',
    helpKey: 'admin.guideOpens.help',
    sortOrder: 41,
  }),
  'admin.todo': setting({
    ...json,
    schema: adminTodoSchema,
    default: { laterHours: 3, mine: {} },
    labelKey: 'admin.todo.label',
    helpKey: 'admin.todo.help',
    sortOrder: 42,
  }),
  'admin.dashboardDesigns': setting({
    ...json,
    schema: adminDashboardDesignsSchema,
    default: { targetHours: 24, chartMinDays: 14, smoothDays: 3, topProducts: 5, lowStockRows: 5, courierDays: 30, customMaxDays: 366, sparkWeeks: 8 },
    labelKey: 'admin.dashboardDesigns.label',
    helpKey: 'admin.dashboardDesigns.help',
    sortOrder: 43,
  }),
};
