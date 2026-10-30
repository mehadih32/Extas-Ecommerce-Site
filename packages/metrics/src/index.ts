// @extas/metrics — the one KPI definition (register PR 155, change note CN-022, owner decision 23 Oct 2026).
// What it is for:
//   - "Sales" means delivered orders only, counted on the day each was delivered;
//   - "Ordered value" means every placed order, counted on the day it was placed, and is always shown beside Sales,
//     never instead of it;
//   - every report view and the admin dashboard read their money numbers through these functions: the headline pair
//     (`kpi`), day by day (`kpiByDay`), by delivery zone (`kpiByZone`), by payment method (`kpiByPaymentMethod`), and
//     the order lines of a product or a combo (`lines` / `linesBoth`, added up by `sumLines`);
//   - the KPI report views (migration 0012: mv_kpi_daily, mv_kpi_lines_monthly) hold the same two figures precomputed;
//     only views.ts reads them (`kpiByDayFromView`, `linesByMonthFromView`) and refreshes them (`refreshKpiViews`).
//     The PR 603 views (mv_sales_daily …) count by the placed day; they are superseded and nothing reads them.
// customers.ts (S14, PR 284, 285): one customer's lifetime value — Sales (delivered, all time) beside Ordered value —
// over his merged profiles and his numbers (`customerKpis`), and the same figure as a SQL subquery for the Customers
// list (`customerFiguresSql`).
// money.ts (S07, PR 172, 174): the payments screens' figures — the money owed to customers, and what came in through
// each gateway in a period (reconciled against the gateway's statement).
// S08 · PR 525: `deliveryTruth` — the parcels a courier marked delivered beside what really happened (delivery.ts; counts).
// S08 · PR 526: `returnReasons` — why parcels came back, by the owner's reasons and by kind (delivery.ts; counts).
// CN-028 · PR 620: `salesBySku` — Sales by SKU (pieces, net sales, profit over the cost snapshot) for the ERP's live
// "Top products" call (skus.ts).
// CN-028 · PR 617: `retailDayFigures` — the order side of Retail's daily summary to the ERP: orders placed, delivered
// pieces at the customer's price on the delivered day, delivery charges, deliveries and customers (retail-day.ts).
// The rule lives in pure.ts (SALES_STATUSES, NOT_PLACED_STATUSES, BASIS_RULE). src/guard.test.ts fails the build when
// any other package adds up order or line money on its own. Until the order state machine exists (it waits for the
// owner's approval of the architecture draft), no order reaches DELIVERED, so Sales is 0 everywhere — that is correct.
export * from './pure';
export * from './metrics';
export * from './views';
export * from './money';
export * from './delivery';
export * from './customers';
export * from './skus';
// CN-028 · PR 617: the order side of Retail's daily summary to the ERP (delivered pieces on the delivered day).
export * from './retail-day';
