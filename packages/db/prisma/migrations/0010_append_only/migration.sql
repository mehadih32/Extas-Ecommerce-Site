-- PR 139 (S05; CN-022, Blueprint B6.1): the audit log is append-only at the database, and so are the history ledgers
-- listed below. Nothing is dropped, rewritten or removed; this migration only adds a role, grants, revokes and triggers.
--
-- TWO GUARDS
-- 1. Privileges. The app connects as its own role, `extas_app` (created here without a login; the server gives it its
--    login and a generated password, infra/deploy/app-role.sh). It may read and write the shop's tables, but on the
--    tables below it may only INSERT and SELECT: UPDATE, DELETE and TRUNCATE are revoked. Migrations, backups and the
--    owner scripts keep using the owner role (DATABASE_DIRECT_URL).
-- 2. A trigger on each of these tables refuses UPDATE, DELETE and TRUNCATE for everybody, the owner role included, so
--    no one can change history silently — not the app, not a script, not a person at the psql prompt.
--
-- A CORRECTION is a new row that points at the old one; rows are never changed in place.
--
-- RETENTION (not built; its own register PR when a retention period is decided): a purge never runs as the app role.
-- It is a job that runs as the owner role and, in one transaction, (a) writes an AuditLog row saying which table, the
-- cut-off date and the row count, (b) runs ALTER TABLE … DISABLE TRIGGER "<table>_append_only" (an exclusive lock,
-- visible in the PostgreSQL log), (c) removes only rows older than the retention setting, (d) runs ALTER TABLE …
-- ENABLE TRIGGER again. The backups keep the removed rows for their own retention time.
--
-- WHICH TABLES: packages/db/src/schema-meta.ts APPEND_ONLY_LOCKED (this list) and APPEND_ONLY_OPEN (every other
-- `@append-only` model, each with the reason it is not locked yet, e.g. a run row that is updated as the run goes on).
-- test/schema-guard.test.ts fails when a new `@append-only` model is in neither list, or a locked one lacks its guards.
--
-- REPORT VIEWS: REFRESH MATERIALIZED VIEW needs the views' owner, so the report refresh job (PR 603) runs as the owner
-- role, never as extas_app.

-- The app's role (idempotent; several test databases on one server may run this at the same moment).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'extas_app') THEN
    CREATE ROLE extas_app NOLOGIN;
  END IF;
EXCEPTION WHEN duplicate_object OR unique_violation THEN
  NULL;
END $$;

-- What the app may do on every table and sequence, now and in every later migration (default privileges of the role
-- that runs the migrations).
GRANT USAGE ON SCHEMA public TO extas_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO extas_app;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO extas_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO extas_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO extas_app;
-- The migration history is the owner's: the app may read it, never write it.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON "_prisma_migrations" FROM extas_app;

-- The trigger function: refuses the change and says what to do instead.
CREATE OR REPLACE FUNCTION extas_append_only() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'append-only: % on "%" is not allowed (PR 139)', TG_OP, TG_TABLE_NAME
    USING ERRCODE = 'insufficient_privilege',
          HINT = 'History is never changed or removed: write a new row that corrects the old one.';
END $$;

-- AuditLog (B6.1): every change, who, when, from where.
REVOKE UPDATE, DELETE, TRUNCATE ON "AuditLog" FROM extas_app;
CREATE TRIGGER "AuditLog_append_only" BEFORE UPDATE OR DELETE ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION extas_append_only();
CREATE TRIGGER "AuditLog_no_truncate" BEFORE TRUNCATE ON "AuditLog" FOR EACH STATEMENT EXECUTE FUNCTION extas_append_only();

-- SecurityEvent (B6.1): login alerts, new admin logins, rate limits, 2FA resets.
REVOKE UPDATE, DELETE, TRUNCATE ON "SecurityEvent" FROM extas_app;
CREATE TRIGGER "SecurityEvent_append_only" BEFORE UPDATE OR DELETE ON "SecurityEvent" FOR EACH ROW EXECUTE FUNCTION extas_append_only();
CREATE TRIGGER "SecurityEvent_no_truncate" BEFORE TRUNCATE ON "SecurityEvent" FOR EACH STATEMENT EXECUTE FUNCTION extas_append_only();

-- SettingChange (PR 491, 496, 510): every change of a setting, old → new.
REVOKE UPDATE, DELETE, TRUNCATE ON "SettingChange" FROM extas_app;
CREATE TRIGGER "SettingChange_append_only" BEFORE UPDATE OR DELETE ON "SettingChange" FOR EACH ROW EXECUTE FUNCTION extas_append_only();
CREATE TRIGGER "SettingChange_no_truncate" BEFORE TRUNCATE ON "SettingChange" FOR EACH STATEMENT EXECUTE FUNCTION extas_append_only();

-- SecretAccessLog (PR 493): every decrypt or change of a secret.
REVOKE UPDATE, DELETE, TRUNCATE ON "SecretAccessLog" FROM extas_app;
CREATE TRIGGER "SecretAccessLog_append_only" BEFORE UPDATE OR DELETE ON "SecretAccessLog" FOR EACH ROW EXECUTE FUNCTION extas_append_only();
CREATE TRIGGER "SecretAccessLog_no_truncate" BEFORE TRUNCATE ON "SecretAccessLog" FOR EACH STATEMENT EXECUTE FUNCTION extas_append_only();

-- OrderEvent (PR 138, 139, 142): the order timeline, every change with who and when.
REVOKE UPDATE, DELETE, TRUNCATE ON "OrderEvent" FROM extas_app;
CREATE TRIGGER "OrderEvent_append_only" BEFORE UPDATE OR DELETE ON "OrderEvent" FOR EACH ROW EXECUTE FUNCTION extas_append_only();
CREATE TRIGGER "OrderEvent_no_truncate" BEFORE TRUNCATE ON "OrderEvent" FOR EACH STATEMENT EXECUTE FUNCTION extas_append_only();

-- StockMovement (PR 200, 207): the stock ledger.
REVOKE UPDATE, DELETE, TRUNCATE ON "StockMovement" FROM extas_app;
CREATE TRIGGER "StockMovement_append_only" BEFORE UPDATE OR DELETE ON "StockMovement" FOR EACH ROW EXECUTE FUNCTION extas_append_only();
CREATE TRIGGER "StockMovement_no_truncate" BEFORE TRUNCATE ON "StockMovement" FOR EACH STATEMENT EXECUTE FUNCTION extas_append_only();

-- WalletEntry (PR 171, 172): the wallet ledger (money).
REVOKE UPDATE, DELETE, TRUNCATE ON "WalletEntry" FROM extas_app;
CREATE TRIGGER "WalletEntry_append_only" BEFORE UPDATE OR DELETE ON "WalletEntry" FOR EACH ROW EXECUTE FUNCTION extas_append_only();
CREATE TRIGGER "WalletEntry_no_truncate" BEFORE TRUNCATE ON "WalletEntry" FOR EACH STATEMENT EXECUTE FUNCTION extas_append_only();

-- RewardEntry (PR 296): the points ledger.
REVOKE UPDATE, DELETE, TRUNCATE ON "RewardEntry" FROM extas_app;
CREATE TRIGGER "RewardEntry_append_only" BEFORE UPDATE OR DELETE ON "RewardEntry" FOR EACH ROW EXECUTE FUNCTION extas_append_only();
CREATE TRIGGER "RewardEntry_no_truncate" BEFORE TRUNCATE ON "RewardEntry" FOR EACH STATEMENT EXECUTE FUNCTION extas_append_only();

-- PriceHistory (PR 38, 213): the record behind every "was" price (the honesty rule).
REVOKE UPDATE, DELETE, TRUNCATE ON "PriceHistory" FROM extas_app;
CREATE TRIGGER "PriceHistory_append_only" BEFORE UPDATE OR DELETE ON "PriceHistory" FOR EACH ROW EXECUTE FUNCTION extas_append_only();
CREATE TRIGGER "PriceHistory_no_truncate" BEFORE TRUNCATE ON "PriceHistory" FOR EACH STATEMENT EXECUTE FUNCTION extas_append_only();

-- ProductRename (PR 590): every rename and link change (the 301s and the before/after report).
REVOKE UPDATE, DELETE, TRUNCATE ON "ProductRename" FROM extas_app;
CREATE TRIGGER "ProductRename_append_only" BEFORE UPDATE OR DELETE ON "ProductRename" FOR EACH ROW EXECUTE FUNCTION extas_append_only();
CREATE TRIGGER "ProductRename_no_truncate" BEFORE TRUNCATE ON "ProductRename" FOR EACH STATEMENT EXECUTE FUNCTION extas_append_only();

-- SmartRuleVersion (PR 218): rule history, what changed, when, by whom.
REVOKE UPDATE, DELETE, TRUNCATE ON "SmartRuleVersion" FROM extas_app;
CREATE TRIGGER "SmartRuleVersion_append_only" BEFORE UPDATE OR DELETE ON "SmartRuleVersion" FOR EACH ROW EXECUTE FUNCTION extas_append_only();
CREATE TRIGGER "SmartRuleVersion_no_truncate" BEFORE TRUNCATE ON "SmartRuleVersion" FOR EACH STATEMENT EXECUTE FUNCTION extas_append_only();

-- CheckoutFlagEvent (PR 562, 566): a flagged checkout and its outcome.
REVOKE UPDATE, DELETE, TRUNCATE ON "CheckoutFlagEvent" FROM extas_app;
CREATE TRIGGER "CheckoutFlagEvent_append_only" BEFORE UPDATE OR DELETE ON "CheckoutFlagEvent" FOR EACH ROW EXECUTE FUNCTION extas_append_only();
CREATE TRIGGER "CheckoutFlagEvent_no_truncate" BEFORE TRUNCATE ON "CheckoutFlagEvent" FOR EACH STATEMENT EXECUTE FUNCTION extas_append_only();

-- FraudDecision (PR 543): every approve or decline, with its reason.
REVOKE UPDATE, DELETE, TRUNCATE ON "FraudDecision" FROM extas_app;
CREATE TRIGGER "FraudDecision_append_only" BEFORE UPDATE OR DELETE ON "FraudDecision" FOR EACH ROW EXECUTE FUNCTION extas_append_only();
CREATE TRIGGER "FraudDecision_no_truncate" BEFORE TRUNCATE ON "FraudDecision" FOR EACH STATEMENT EXECUTE FUNCTION extas_append_only();

-- ShipmentEvent (PR 184): what the courier reported, when.
REVOKE UPDATE, DELETE, TRUNCATE ON "ShipmentEvent" FROM extas_app;
CREATE TRIGGER "ShipmentEvent_append_only" BEFORE UPDATE OR DELETE ON "ShipmentEvent" FOR EACH ROW EXECUTE FUNCTION extas_append_only();
CREATE TRIGGER "ShipmentEvent_no_truncate" BEFORE TRUNCATE ON "ShipmentEvent" FOR EACH STATEMENT EXECUTE FUNCTION extas_append_only();
