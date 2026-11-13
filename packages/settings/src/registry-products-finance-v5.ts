// S28 · Admin v5 (CN-048, docs/demo/admin-proto-v5) — the settings of Products, Finance, Reports and Home (wave 4, builder B):
// PR 686 shop ranking, PR 687 cashbook, PR 688 budgets and the profit snapshot, PR 689 report library, PR 690 report packs,
// PR 691 Home Command. Every definition carries its own PR number as its registry version (686 … 691), so builders working
// in parallel never meet on one number. Labels: messages/products-finance-v5.<lang>.json. Every number here is the owner's to
// change in the backend; nothing asks him for one.
import { z } from 'zod';
import { setting } from './define';

const V686 = 686;
const V687 = 687;

// ---- PR 686 · shop ranking -----------------------------------------------------------------------------------------

const weight = z.number().int().min(0).max(50);

export const shopRankingSchema = z
  .object({
    /** How much each of the five things counts (0–50 each; only their share of the total matters). */
    weights: z
      .object({
        sales: weight,
        conv: weight,
        margin: weight,
        stock: weight,
        fresh: weight,
      })
      .strict(),
    /** A product newer than this many days gets a "newness" part (it fades to 0 at this age). */
    freshDays: z.number().int().min(1).max(730),
    /** Stock that lasts this many days (at the 30-day sales speed) counts as fully healthy. */
    coverDays: z.number().int().min(1).max(365),
    /** On: the nightly run puts the new order on the shop by itself. Off: the owner presses "Save this order". */
    autoApply: z.boolean(),
  })
  .strict();
export type ShopRankingSettings = z.output<typeof shopRankingSchema>;

// ---- PR 687 · cashbook ---------------------------------------------------------------------------------------------

export const cashbookSchema = z
  .object({
    /** On (the owner's written OK, 13 Nov): Accounts and the owner may record money in and out. Off: the book is read only. */
    enabled: z.boolean(),
    /** How many days ahead the cash forecast looks. */
    forecastDays: z.number().int().min(1).max(60),
    /** The cash couriers hold is expected to reach the shop evenly over this many days (0 = the next day). */
    codPayoutDays: z.number().int().min(0).max(30),
  })
  .strict();
export type CashbookSettings = z.output<typeof cashbookSchema>;

export const productsFinanceV5Settings = {
  'shop.ranking': setting({
    scope: 'store',
    schema: shopRankingSchema,
    default: {
      weights: { sales: 35, conv: 20, margin: 15, stock: 20, fresh: 10 },
      freshDays: 120,
      coverDays: 30,
      autoApply: false,
    },
    valueType: 'JSON',
    group: 'catalogue',
    labelKey: 'shop.ranking.label',
    helpKey: 'shop.ranking.help',
    isOwnerData: false,
    isPublic: false,
    sortOrder: 60,
    version: V686,
  }),
  'books.cash': setting({
    scope: 'store',
    schema: cashbookSchema,
    default: { enabled: true, forecastDays: 14, codPayoutDays: 5 }, // hardcode-ok: on (owner, 13 Nov); two weeks ahead; couriers pay in about five days; all editable
    valueType: 'JSON',
    group: 'books',
    labelKey: 'books.cash.label',
    helpKey: 'books.cash.help',
    isOwnerData: false,
    isPublic: false,
    sortOrder: 20,
    version: V687,
  }),
} as const;
