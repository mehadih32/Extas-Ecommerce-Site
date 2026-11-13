-- PR 706: Start fresh, the server's purge (S28; additive). The site clears carts, reviews and returns itself; orders,
-- customers, chats, coupon uses and analytics sit on tables the app may never delete from (append-only history below
-- them). They are removed by ONE database function, run by the server's job in the owner's name after the owner's PIN,
-- the typed words and the backup gate have been passed (the run row says so). It is the only way through:
--   * it refuses unless a StartFreshRun of that id is PARTIAL and not purged yet (a run exists only after the PIN, the words
--     and a fresh backup), so it can run once per store and never by itself;
--   * it removes only rows of that store made up to the moment the run began; a customer who has an order newer than that
--     is left; products, settings, staff, rules, policies, customer problems and everything else are not roots and are
--     never touched; the children of a removed row go with it (found from the foreign keys, children first);
--   * the append-only triggers are switched off for the tables it touches and back on at the end, inside one
--     transaction: a failure puts everything back, nothing is half done; the app role keeps no DELETE right anywhere.
-- Nothing is dropped, renamed or changed; two columns are added. (This file is the one migration allowed to contain
-- DELETE FROM next to 0281: see test/migration.test.ts, PURGE_MIGRATIONS.)

ALTER TABLE "StartFreshRun" ADD COLUMN "purgedAt" TIMESTAMPTZ(3);
ALTER TABLE "StartFreshRun" ADD COLUMN "purgeResult" JSONB NOT NULL DEFAULT '{}';

-- The deletes to run, children first: one (table, statement) row per table on the way down from `p_table`.
CREATE OR REPLACE FUNCTION extas_fresh_plan(p_table text, p_where text, p_depth integer)
RETURNS TABLE (tbl text, stmt text)
LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE
  fk record;
BEGIN
  IF p_depth > 12 THEN
    RAISE EXCEPTION 'start fresh: foreign keys go deeper than 12 below %', p_table;
  END IF;
  FOR fk IN
    SELECT cl.relname AS child, ca.attname AS child_col, pa.attname AS parent_col, array_length(c.conkey, 1) AS n
      FROM pg_constraint c
      JOIN pg_class cl ON cl.oid = c.conrelid
      JOIN pg_namespace ns ON ns.oid = cl.relnamespace AND ns.nspname = 'public'
      JOIN pg_class pl ON pl.oid = c.confrelid
      JOIN pg_attribute ca ON ca.attrelid = c.conrelid AND ca.attnum = c.conkey[1]
      JOIN pg_attribute pa ON pa.attrelid = c.confrelid AND pa.attnum = c.confkey[1]
     WHERE c.contype = 'f' AND pl.relname = p_table AND cl.relname <> p_table
     ORDER BY cl.relname, ca.attname
  LOOP
    IF fk.n <> 1 THEN
      RAISE EXCEPTION 'start fresh: % has a many-column foreign key to %', fk.child, p_table;
    END IF;
    RETURN QUERY SELECT * FROM extas_fresh_plan(fk.child, format('%I IN (SELECT %I FROM %I WHERE %s)', fk.child_col, fk.parent_col, p_table, p_where), p_depth + 1);
  END LOOP;
  tbl := p_table;
  stmt := format('DELETE FROM %I WHERE %s', p_table, p_where);
  RETURN NEXT;
END $$;

-- The purge itself. Returns the rows removed per table; marks the run DONE in the same transaction.
CREATE OR REPLACE FUNCTION extas_start_fresh_purge(p_run uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  run record;
  root text;
  scope text;
  step record;
  trg record;
  touched text[] := ARRAY[]::text[];
  tname text;
  n bigint;
  counts jsonb := '{}'::jsonb;
BEGIN
  SELECT * INTO run FROM "StartFreshRun" WHERE "id" = p_run FOR UPDATE;
  IF NOT FOUND OR run."status" <> 'PARTIAL' OR run."purgedAt" IS NOT NULL THEN
    RAISE EXCEPTION 'start fresh: run % is not waiting for its purge', p_run
      USING ERRCODE = 'insufficient_privilege', HINT = 'The purge runs once, after the owner passed the PIN, the words and the backup gate.';
  END IF;
  -- plan first (nothing changes yet), so the triggers are switched off only for the tables that will be touched
  CREATE TEMP TABLE IF NOT EXISTS _fresh_plan (seq serial, root text, tbl text, stmt text) ON COMMIT DROP;
  TRUNCATE _fresh_plan;
  FOREACH root IN ARRAY ARRAY['Order', 'Customer', 'Conversation', 'CouponRedemption', 'AnalyticsEvent'] LOOP
    scope := format('"storeId" = %s AND "createdAt" <= %L', run."storeId", run."createdAt");
    IF root = 'Customer' THEN
      -- a customer who has an order made after the run began is not a test entry: left
      scope := scope || ' AND NOT EXISTS (SELECT 1 FROM "Order" fo WHERE fo."customerId" = "Customer"."id")';
    END IF;
    INSERT INTO _fresh_plan (root, tbl, stmt) SELECT root, p.tbl, p.stmt FROM extas_fresh_plan(root, scope, 0) p;
  END LOOP;
  FOR tname IN SELECT DISTINCT tbl FROM _fresh_plan LOOP
    FOR trg IN
      SELECT t.tgname FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace ns ON ns.oid = c.relnamespace AND ns.nspname = 'public'
       WHERE c.relname = tname AND NOT t.tgisinternal AND t.tgfoid = 'extas_append_only'::regproc
    LOOP
      EXECUTE format('ALTER TABLE %I DISABLE TRIGGER %I', tname, trg.tgname);
      touched := touched || (tname || '|' || trg.tgname);
    END LOOP;
  END LOOP;
  FOR step IN SELECT * FROM _fresh_plan ORDER BY seq LOOP
    EXECUTE step.stmt;
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n > 0 THEN
      counts := jsonb_set(counts, ARRAY[step.tbl], to_jsonb(COALESCE((counts ->> step.tbl)::bigint, 0) + n));
    END IF;
  END LOOP;
  FOREACH tname IN ARRAY touched LOOP
    EXECUTE format('ALTER TABLE %I ENABLE TRIGGER %I', split_part(tname, '|', 1), split_part(tname, '|', 2));
  END LOOP;
  UPDATE "StartFreshRun" SET "status" = 'DONE', "purgedAt" = now(), "purgeResult" = counts, "updatedAt" = now() WHERE "id" = p_run;
  RETURN counts;
END $$;

REVOKE ALL ON FUNCTION extas_fresh_plan(text, text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION extas_start_fresh_purge(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION extas_start_fresh_purge(uuid) TO extas_app;
