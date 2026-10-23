-- PR 155 (S05; CN-022, owner decision 23 Oct 2026; follow-ups 92 and 93): report views that count exactly like
-- @extas/metrics, and an index for the Sales queries. Nothing is dropped, rewritten or removed: this migration only
-- adds an index, two functions, two materialized views and their indexes, and marks the PR 603 views superseded.
--
-- THE ONE KPI DEFINITION (packages/metrics/src/pure.ts, BASIS_RULE):
--   Sales          ('sales')   = orders whose status is DELIVERED, on the shop day they were delivered (deliveredAt);
--   Ordered value  ('ordered') = every placed order (any status except DRAFT), on the shop day it was placed (placedAt);
--   an archived order (archivedAt) counts in neither; order lines count only when ACTIVE.
-- Each view row carries its `basis`, so a screen always reads the two figures side by side, never one for the other.
-- Days are the shop's own days in its time zone: the setting `store.timeZone`, resolved like the app's resolver
-- (store value, then installation value, then the definition's default), with the Store row's own `timezone` last.
-- Every row carries the time zone it was counted in; @extas/metrics reads a view only when that is the time zone the
-- screen asks for, and counts live otherwise (packages/metrics/src/views.ts).
--
-- WHO READS THEM: only @extas/metrics (kpiByDayFromView, linesByMonthFromView). Its guard test fails the build when any
-- other package reads an `mv_…` view or adds up order money on its own.
--
-- REFRESH: `SELECT extas_refresh_kpi_views();` through @extas/metrics `refreshKpiViews` (the reports job, PR 603 /
-- PR 5, at the interval the setting `reports.viewRefreshMinutes` gives). Each view has a unique index, so it refreshes
-- CONCURRENTLY and readers are never blocked. REFRESH needs the views' owner; the function runs as its owner
-- (SECURITY DEFINER, fixed search_path), and only the app's role may call it, so the worker, which connects as
-- extas_app (PR 139), refreshes them without owning anything.
--
-- THE PR 603 VIEWS (0001_init: mv_sales_daily, mv_style_profit_monthly, mv_ad_performance_daily,
-- mv_district_sales_monthly) bucket every figure by the PLACED day or month, so their "delivered revenue" is not Sales.
-- They stay (nothing is deleted) and are marked SUPERSEDED below; nothing reads them. Their KPI-consistent successors:
-- mv_kpi_daily for mv_sales_daily, mv_kpi_lines_monthly for the revenue part of mv_district_sales_monthly and
-- mv_style_profit_monthly. The profit allocation (PR 536) and the ad attribution (PR 283) get their KPI-consistent
-- views with those PRs, built on the same bases.

-- Follow-up 93: Sales queries (status DELIVERED, a deliveredAt range) for one store.
-- CreateIndex
CREATE INDEX "idx_order_sales_delivered" ON "Order"("storeId", "status", "deliveredAt");

-- The shop's time zone for one store, as the settings resolver answers `store.timeZone` (a value PostgreSQL does not
-- know as a time zone is skipped, like a value that fails the setting's schema). It sets its own search_path: from
-- PostgreSQL 17 on, building or refreshing a materialized view runs its functions with only pg_catalog and pg_temp.
CREATE OR REPLACE FUNCTION extas_store_time_zone(store_id integer) RETURNS text
LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
  SELECT COALESCE(
    (SELECT c.tz
       FROM (VALUES
         (1, (SELECT v."value" #>> '{}' FROM "StoreSettingValue" v WHERE v."storeId" = store_id AND v."key" = 'store.timeZone')),
         (2, (SELECT v."value" #>> '{}' FROM "InstallationSettingValue" v WHERE v."key" = 'store.timeZone')),
         (3, (SELECT d."defaultValue" #>> '{}' FROM "SettingDefinition" d WHERE d."key" = 'store.timeZone'))
       ) AS c(tier, tz)
      WHERE c.tz IS NOT NULL AND EXISTS (SELECT 1 FROM pg_timezone_names n WHERE n.name = c.tz)
      ORDER BY c.tier
      LIMIT 1),
    (SELECT s."timezone" FROM "Store" s WHERE s."id" = store_id))
$$;

-- Sales and Ordered value per store, basis and shop day: orders, Σ Order.totalMinor, the goods (subtotal − discount)
-- and the delivery charge — the same four numbers as @extas/metrics `kpi` / `kpiByDay`.
CREATE MATERIALIZED VIEW "mv_kpi_daily" AS
WITH tz AS (
  SELECT s."id" AS "storeId", extas_store_time_zone(s."id") AS "timeZone" FROM "Store" s
), counted AS (
  SELECT o."storeId", 'sales'::text AS "basis", o."deliveredAt" AS "at", o."totalMinor", o."subtotalMinor",
         o."discountMinor", o."deliveryChargeMinor"
  FROM "Order" o
  WHERE o."archivedAt" IS NULL AND o."status"::text = 'DELIVERED' AND o."deliveredAt" IS NOT NULL
  UNION ALL
  SELECT o."storeId", 'ordered'::text, o."placedAt", o."totalMinor", o."subtotalMinor",
         o."discountMinor", o."deliveryChargeMinor"
  FROM "Order" o
  WHERE o."archivedAt" IS NULL AND o."status"::text <> 'DRAFT'
)
SELECT
  c."storeId"                                                          AS "storeId",
  c."basis"                                                            AS "basis",
  (c."at" AT TIME ZONE tz."timeZone")::date                            AS "day",
  tz."timeZone"                                                        AS "timeZone",
  count(*)::bigint                                                     AS "orders",
  COALESCE(sum(c."totalMinor"), 0)::bigint                             AS "valueMinor",
  COALESCE(sum(c."subtotalMinor" - c."discountMinor"), 0)::bigint      AS "itemsMinor",
  COALESCE(sum(c."deliveryChargeMinor"), 0)::bigint                    AS "deliveryMinor"
FROM counted c
JOIN tz ON tz."storeId" = c."storeId"
GROUP BY 1, 2, 3, 4;

CREATE UNIQUE INDEX "mv_kpi_daily_key" ON "mv_kpi_daily" ("storeId", "basis", "day");
COMMENT ON MATERIALIZED VIEW "mv_kpi_daily" IS
  'PR 155 (CN-022): Sales (delivered day) and Ordered value (placed day) per store and shop day, exactly @extas/metrics. Read only through @extas/metrics; refreshed CONCURRENTLY by extas_refresh_kpi_views() (job reports.refresh-views, every reports.viewRefreshMinutes).';

-- Order lines per store, basis, shop month, product (with its category and style) and district / upazila: distinct
-- orders, units, Σ line totals, Σ regular price × quantity and what customers saved — the same numbers as
-- @extas/metrics `lines` + `sumLines`, for the district (PR 568, 569) and style (PR 536) reports.
CREATE MATERIALIZED VIEW "mv_kpi_lines_monthly" AS
WITH tz AS (
  SELECT s."id" AS "storeId", extas_store_time_zone(s."id") AS "timeZone" FROM "Store" s
), counted AS (
  SELECT o."id" AS "orderId", o."storeId", o."areaId", 'sales'::text AS "basis", o."deliveredAt" AS "at"
  FROM "Order" o
  WHERE o."archivedAt" IS NULL AND o."status"::text = 'DELIVERED' AND o."deliveredAt" IS NOT NULL
  UNION ALL
  SELECT o."id", o."storeId", o."areaId", 'ordered'::text, o."placedAt"
  FROM "Order" o
  WHERE o."archivedAt" IS NULL AND o."status"::text <> 'DRAFT'
)
SELECT
  c."storeId"                                                                    AS "storeId",
  c."basis"                                                                      AS "basis",
  date_trunc('month', c."at" AT TIME ZONE tz."timeZone")::date                   AS "month",
  tz."timeZone"                                                                  AS "timeZone",
  oi."productId"                                                                 AS "productId",
  p."categoryId"                                                                 AS "categoryId",
  p."styleGroupId"                                                               AS "styleGroupId",
  geo."districtId"                                                               AS "districtId",
  geo."upazilaId"                                                                AS "upazilaId",
  count(DISTINCT c."orderId")::bigint                                            AS "orders",
  sum(oi."quantity")::bigint                                                     AS "units",
  sum(oi."lineTotalMinor")::bigint                                               AS "valueMinor",
  sum(oi."unitPriceMinor"::bigint * oi."quantity")::bigint                       AS "regularMinor",
  sum(GREATEST(0, oi."unitPriceMinor"::bigint * oi."quantity" - oi."lineTotalMinor"))::bigint AS "savedMinor"
FROM counted c
JOIN tz ON tz."storeId" = c."storeId"
JOIN "OrderItem" oi ON oi."orderId" = c."orderId" AND oi."storeId" = c."storeId" AND oi."status"::text = 'ACTIVE'
LEFT JOIN "Product" p ON p."id" = oi."productId"
LEFT JOIN "GeoArea" a ON a."id" = c."areaId"
LEFT JOIN LATERAL (
  SELECT
    (SELECT d."id" FROM "GeoArea" d
      WHERE d."level" = 'DISTRICT' AND (d."id" = a."id" OR d."id" = ANY (a."ancestorIds")) LIMIT 1) AS "districtId",
    (SELECT u."id" FROM "GeoArea" u
      WHERE u."level" IN ('UPAZILA', 'THANA') AND (u."id" = a."id" OR u."id" = ANY (a."ancestorIds")) LIMIT 1) AS "upazilaId"
) geo ON true
GROUP BY 1, 2, 3, 4, 5, 6, 7, 8, 9;

CREATE UNIQUE INDEX "mv_kpi_lines_monthly_key"
  ON "mv_kpi_lines_monthly" ("storeId", "basis", "month", "productId", "categoryId", "styleGroupId", "districtId", "upazilaId")
  NULLS NOT DISTINCT;
COMMENT ON MATERIALIZED VIEW "mv_kpi_lines_monthly" IS
  'PR 155 (CN-022): order lines by basis (Sales on the delivered month, Ordered value on the placed month), product, category, style and district, exactly @extas/metrics lines + sumLines. Read only through @extas/metrics; refreshed CONCURRENTLY by extas_refresh_kpi_views() (job reports.refresh-views, every reports.viewRefreshMinutes).';

-- The app's role reads the views (default privileges cover them too; said here so it does not depend on that).
GRANT SELECT ON "mv_kpi_daily", "mv_kpi_lines_monthly" TO extas_app;

-- One call refreshes both KPI views without blocking readers. Runs as the views' owner; only the app's role and the
-- owner may call it.
CREATE OR REPLACE FUNCTION extas_refresh_kpi_views() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY "mv_kpi_daily";
  REFRESH MATERIALIZED VIEW CONCURRENTLY "mv_kpi_lines_monthly";
END;
$$;
REVOKE EXECUTE ON FUNCTION extas_refresh_kpi_views() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION extas_refresh_kpi_views() TO extas_app;

-- The PR 603 views stay (nothing is deleted) but no screen reads them: they count by the placed day, so they are not
-- Sales. ~~struck through~~ in their own words, with the view that replaces each.
COMMENT ON MATERIALIZED VIEW "mv_sales_daily" IS
  'SUPERSEDED by mv_kpi_daily (migration 0012, PR 155, CN-022): counts by the placed day, so its delivered revenue is not Sales. Kept, never read. ~~PR 603: daily sales per store. Refreshed CONCURRENTLY by job reports.refresh-views every reports.viewRefreshMinutes.~~';
COMMENT ON MATERIALIZED VIEW "mv_style_profit_monthly" IS
  'SUPERSEDED by mv_kpi_lines_monthly for revenue (migration 0012, PR 155, CN-022); the profit allocation gets its KPI view with PR 536. Counts delivered lines by the placed month. Kept, never read. ~~PR 536/603: profit by style per month. Refreshed CONCURRENTLY by job reports.refresh-views every reports.viewRefreshMinutes.~~';
COMMENT ON MATERIALIZED VIEW "mv_ad_performance_daily" IS
  'SUPERSEDED (migration 0012, PR 155, CN-022): attributes delivered revenue to the placed day, so it is not Sales; the ad attribution gets its KPI view with PR 283. Kept, never read. ~~PR 603: ad spend vs delivered revenue per day and platform. Refreshed CONCURRENTLY by job reports.refresh-views every reports.viewRefreshMinutes.~~';
COMMENT ON MATERIALIZED VIEW "mv_district_sales_monthly" IS
  'SUPERSEDED by mv_kpi_lines_monthly (migration 0012, PR 155, CN-022): counts by the placed month and leaves cancelled orders out of Ordered value. Kept, never read. ~~PR 568/603: sales by district and upazila per month. Refreshed CONCURRENTLY by job reports.refresh-views every reports.viewRefreshMinutes.~~';
