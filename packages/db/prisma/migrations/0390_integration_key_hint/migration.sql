-- PR 1020 (D12): Keys & connections shows the last 4 characters of a saved key (prototype: "only the last 4 characters"). Additive: one nullable column, filled when a key is next saved; empty means "shown as dots only".
ALTER TABLE "Integration" ADD COLUMN "keyHint" TEXT;
