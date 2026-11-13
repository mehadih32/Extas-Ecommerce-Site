-- PR 706 (CN-049): practice data. Two small guards that go with the `isPractice` flag of 0280.
--
-- 1. A practice flag is fixed at birth. A real record can never be turned into a practice record (which would let its
--    history be purged), and a practice record is never promoted to a real one: an UPDATE that changes "isPractice" is
--    refused on every table that carries it.
-- 2. "Reset practice data" may remove the order timeline and parcel events of PRACTICE records only. The two history
--    ledgers stay locked for the app role (no DELETE privilege, the append-only trigger stays); the one way through is
--    this function, which runs with the owner role's rights (like extas_refresh_kpi_views), sets a transaction-local
--    switch the trigger looks for, and removes only the rows whose order is a practice order. Everything else the reset
--    removes (orders, customers, products, ...) the app deletes itself with its ordinary rights, children first.
--
-- Nothing else is dropped, renamed or rewritten. (This file is the one migration allowed to contain a DELETE: see
-- test/migration.test.ts, PRACTICE_PURGE.)

CREATE OR REPLACE FUNCTION extas_practice_flag_fixed() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."isPractice" IS DISTINCT FROM OLD."isPractice" THEN
    RAISE EXCEPTION 'practice flag: "isPractice" on "%" cannot be changed (PR 706)', TG_TABLE_NAME
      USING ERRCODE = 'insufficient_privilege',
            HINT = 'A practice record stays a practice record, a real record stays real.';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER "Order_practice_fixed" BEFORE UPDATE OF "isPractice" ON "Order" FOR EACH ROW EXECUTE FUNCTION extas_practice_flag_fixed();
CREATE TRIGGER "Customer_practice_fixed" BEFORE UPDATE OF "isPractice" ON "Customer" FOR EACH ROW EXECUTE FUNCTION extas_practice_flag_fixed();
CREATE TRIGGER "Shipment_practice_fixed" BEFORE UPDATE OF "isPractice" ON "Shipment" FOR EACH ROW EXECUTE FUNCTION extas_practice_flag_fixed();
CREATE TRIGGER "Payment_practice_fixed" BEFORE UPDATE OF "isPractice" ON "Payment" FOR EACH ROW EXECUTE FUNCTION extas_practice_flag_fixed();
CREATE TRIGGER "CourierSettlement_practice_fixed" BEFORE UPDATE OF "isPractice" ON "CourierSettlement" FOR EACH ROW EXECUTE FUNCTION extas_practice_flag_fixed();
CREATE TRIGGER "CourierClaim_practice_fixed" BEFORE UPDATE OF "isPractice" ON "CourierClaim" FOR EACH ROW EXECUTE FUNCTION extas_practice_flag_fixed();
CREATE TRIGGER "CheckoutDraft_practice_fixed" BEFORE UPDATE OF "isPractice" ON "CheckoutDraft" FOR EACH ROW EXECUTE FUNCTION extas_practice_flag_fixed();
CREATE TRIGGER "CourierAccount_practice_fixed" BEFORE UPDATE OF "isPractice" ON "CourierAccount" FOR EACH ROW EXECUTE FUNCTION extas_practice_flag_fixed();
CREATE TRIGGER "Product_practice_fixed" BEFORE UPDATE OF "isPractice" ON "Product" FOR EACH ROW EXECUTE FUNCTION extas_practice_flag_fixed();

-- The append-only trigger function (same name, same refusal) with one exception: inside extas_purge_practice_history(),
-- a DELETE of a timeline or parcel-event row whose order is a practice order.
CREATE OR REPLACE FUNCTION extas_append_only() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND current_setting('extas.practice_purge', true) = 'on' THEN
    -- nested on purpose: OLD."orderId" only exists on these two tables, so it must not be read for any other
    IF TG_TABLE_NAME = 'OrderEvent' THEN
      IF EXISTS (SELECT 1 FROM "Order" o WHERE o."id" = OLD."orderId" AND o."isPractice") THEN
        RETURN OLD;
      END IF;
    ELSIF TG_TABLE_NAME = 'ShipmentEvent' THEN
      IF EXISTS (SELECT 1 FROM "Shipment" s JOIN "Order" o ON o."id" = s."orderId" WHERE s."id" = OLD."shipmentId" AND o."isPractice") THEN
        RETURN OLD;
      END IF;
    END IF;
  END IF;
  RAISE EXCEPTION 'append-only: % on "%" is not allowed (PR 139)', TG_OP, TG_TABLE_NAME
    USING ERRCODE = 'insufficient_privilege',
          HINT = 'History is never changed or removed: write a new row that corrects the old one.';
END $$;

-- The one way through: removes the history rows of one store's practice orders, nothing else.
CREATE OR REPLACE FUNCTION extas_purge_practice_history(p_store integer) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  n integer := 0;
  k integer;
BEGIN
  PERFORM set_config('extas.practice_purge', 'on', true);
  DELETE FROM "ShipmentEvent" e USING "Shipment" s, "Order" o
    WHERE e."shipmentId" = s."id" AND s."orderId" = o."id" AND o."isPractice" AND o."storeId" = p_store;
  GET DIAGNOSTICS k = ROW_COUNT; n := n + k;
  DELETE FROM "OrderEvent" e USING "Order" o
    WHERE e."orderId" = o."id" AND o."isPractice" AND o."storeId" = p_store;
  GET DIAGNOSTICS k = ROW_COUNT; n := n + k;
  PERFORM set_config('extas.practice_purge', 'off', true);
  RETURN n;
END $$;

REVOKE ALL ON FUNCTION extas_purge_practice_history(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION extas_purge_practice_history(integer) TO extas_app;
