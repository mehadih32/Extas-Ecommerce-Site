// S28 · PR 661 on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): the Batch page's current batch counts the
// pipeline, the four stuck kinds and what the rules moved on by themselves. Read only. Made-up test values.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { HAS_TEST_DB } from "@extas/auth/testing";
import { batchOverview } from "./index";
import { setUpOrders, type OrdersFixture } from "./testing";

describe.skipIf(!HAS_TEST_DB)("Batch overview on PostgreSQL (PR 661)", () => {
  let f: OrdersFixture;
  const db = () => f.t.prisma;
  const ids: Record<string, string> = {};
  beforeAll(async () => {
    f = await setUpOrders("batch");
    for (const n of [
      "fresh",
      "booked",
      "packed",
      "dup",
      "risk",
      "noans",
      "auto",
      "out",
      "shipped",
    ])
      ids[n] = (await f.place(n)).orderId;
    const up = (n: string, status: "CONFIRMED" | "PACKED" | "HANDED_OVER") =>
      db().order.update({ where: { id: ids[n]! }, data: { status } });
    await up("booked", "CONFIRMED");
    const courier = await db().courierAccount.findFirst({
      where: { storeId: f.S },
    });
    if (courier)
      await db().shipment.create({
        data: {
          storeId: f.S,
          orderId: ids.booked!,
          courierAccountId: courier.id,
          status: "PENDING_PICKUP",
          idempotencyKey: "batch-test-booked",
        },
      });
    await up("packed", "PACKED");
    await up("auto", "CONFIRMED");
    await up("shipped", "HANDED_OVER");
    await db().orderEvent.create({
      data: {
        storeId: f.S,
        orderId: ids.auto!,
        type: "confirm",
        fromStatus: "PLACED",
        toStatus: "CONFIRMED",
        message: "Rule: prepaid, no flags",
        actorType: "SYSTEM",
        source: "system",
      },
    });
    await db().fraudAlert.create({
      data: {
        storeId: f.S,
        orderId: ids.dup!,
        matchedOrderIds: [ids.fresh!],
        severity: "high",
        proposedAction: "HOLD",
        status: "OPEN",
        summary: { section: "duplicate" },
      },
    });
    await db().fraudAlert.create({
      data: {
        storeId: f.S,
        orderId: ids.risk!,
        matchedOrderIds: [],
        severity: "high",
        proposedAction: "HOLD",
        status: "OPEN",
        summary: { section: "risk" },
      },
    });
    await db().callTask.create({
      data: {
        storeId: f.S,
        orderId: ids.noans!,
        reason: "confirm",
        notes: "NO_ANSWER: rang twice",
      },
    });
  });
  afterAll(async () => {
    await f?.t.drop();
  });

  it("counts the batch along the pipeline and leaves out what the rider already has", async () => {
    const b = await batchOverview(f.ordersDeps(), f.staff);
    expect(b.total).toBe(9); // the sample order of the fixture is in the batch too
    expect(b.pipeline.packed).toBe(1);
    expect(b.pipeline.confirmed + b.pipeline.booked).toBe(2);
    expect(b.pipeline.toConfirm).toBe(6);
    expect(b.yours.map((r) => r.id)).not.toContain(ids.shipped);
  });
  it("shows the stuck orders by kind, and what the rules moved on with the reason", async () => {
    const b = await batchOverview(f.ordersDeps(), f.staff);
    expect(b.stuck.merge).toBe(1);
    expect(b.stuck.noAnswer).toBe(1);
    expect(b.moved).toHaveLength(1);
    expect(b.moved[0]!.reason).toBe("Rule: prepaid, no flags");
  });
  it("No stock: an order whose piece is held for more orders than are on the shelf", async () => {
    const line = await db().orderItem.findFirstOrThrow({
      where: { orderId: ids.out! },
    });
    await db().stockLevel.updateMany({
      where: { variantId: line.variantId! },
      data: { onHand: 0, reserved: 1 },
    });
    const b = await batchOverview(f.ordersDeps(), f.staff);
    expect(b.stuck.noStock).toBeGreaterThan(0);
  });
  it("needs orders.read", async () => {
    await expect(
      batchOverview(f.ordersDeps(), {
        ...f.reader,
        actor: { ...f.reader.actor },
      }),
    ).resolves.toBeTruthy();
  });
});

describe.skipIf(!HAS_TEST_DB)("From last batch (PR 661)", () => {
  it("an order placed before today (the store's day) is tagged, and sits on top of Your work", async () => {
    const f = await setUpOrders("batch-last");
    try {
      const a = await f.place("old");
      const b = await f.place("new");
      await f.t.prisma.order.update({
        where: { id: a.orderId },
        data: { placedAt: new Date(f.clock.now.getTime() - 3 * 86_400_000) },
      });
      const r = await batchOverview(f.ordersDeps(), f.staff, f.clock.now);
      const mine = r.yours.filter((x) => [a.orderId, b.orderId].includes(x.id));
      expect(mine.map((x) => x.id)[0]).toBe(a.orderId);
      expect(mine.find((x) => x.id === a.orderId)!.fromLast).toBe(true);
      expect(mine.find((x) => x.id === b.orderId)!.fromLast).toBe(false);
    } finally {
      await f.t.drop();
    }
  });
});
