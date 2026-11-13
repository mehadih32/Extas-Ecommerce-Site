# Practice data: what is built and what is left (PR 706, CN-049)

Built now: the flag `isPractice` on orders, customers, parcels, payments, courier payouts, claims, incomplete orders,
courier accounts and products; the settings `practice.enabled` and `practice.showReset`; the seeder (60 customers,
about 90 orders over 6 months in every status, parcels with events, payouts and their lines, claims, 18 incomplete
orders, 3 courier accounts, sample products); Settings > Practice data; the PIN reset that keeps products the owner
uploaded; the guards (ERP push, messages, courier booking and tracking, conversion feeds each skip practice rows);
practice rows out of figures and lists while practice mode is off.

## Not seeded yet (the table does not exist on main, or its release is not merged)
- Offers and coupons, reviews, inbox conversations, ad accounts and campaigns, returns and exchanges, stock levels and
  stock moves. The seeder skips a table that is not there; add each one when its PR lands, with its own flag and a
  line in `PRACTICE_ROOTS` (`apps/web/src/lib/practice/reset.ts`).
- The sample orders take no stock and reserve nothing. Stock-aware practice waits for the stock PRs.

## To connect later
- Start fresh (branch w5b, PR 706 first part) should call `resetPractice` for its "clear sample data" step instead of
  its own list; `apps/web/src/lib/owner-pin.ts` is the same file in both branches.
- `isDemo` (branch w4a, PR 684) does not exist on main. The reset ignores "Also remove demo products" until that
  column is there; once it is, the checkbox starts to work and a test for it (demo product removed only when ticked)
  turns on by itself.
- An order made by hand while practice mode is on is a real order (not flagged). Only seeded records are practice.
- Editing `practice.showReset` on a screen: today it is a registry setting only (default on while practice mode is on).
