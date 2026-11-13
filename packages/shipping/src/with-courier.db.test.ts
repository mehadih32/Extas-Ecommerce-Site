// S28 · PR 667 on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): the With courier screen. What the couriers
// hold, with the live status and a filter; the stuck alert (off as shipped, then the owner's hours); an order cancelled but
// still booked; the day-end check (packed today against entered at a courier); one parcel's tracking history; and "Move to
// the backup courier" (the owner's PIN: no PIN, a wrong PIN or no backup chosen changes nothing; with it a parcel the
// courier has not picked up is closed here and booked again with the backup). Made-up test values.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mockCourierWorld, STEADFAST_PROVIDER } from "@extas/adapters";
import { hashPassword } from "@extas/auth";
import { HAS_TEST_DB } from "@extas/auth/testing";
import { confirmOrder } from "@extas/orders";
import { bookOrders, moveToBackup, parcelHistory, withCourier } from "./index";
import { setUpShipping, type ShippingFixture } from "./testing";

async function refusal(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return "ok";
  } catch (e) {
    return (e as { code?: string }).code ?? String(e);
  }
}

describe.skipIf(!HAS_TEST_DB)("PR 667 · With courier (PostgreSQL)", () => {
  let f: ShippingFixture;
  let courierId: string;
  let backupId: string;
  const world = mockCourierWorld(STEADFAST_PROVIDER);
  const db = () => f.t.prisma;
  let n = 0;
  const booked = async (name: string) => {
    const o = await f.place(name, {
      phone: `0170000${String(2670 + ++n).padStart(4, "0")}`,
    });
    await confirmOrder(f.ordersDeps(), f.staff, o.orderId);
    await bookOrders(f.shippingDeps(), f.shipper, {
      courierAccountId: courierId,
      orderIds: [o.orderId],
    });
    const s = await db().shipment.findFirstOrThrow({
      where: { orderId: o.orderId },
    });
    return { ...o, shipmentId: s.id };
  };
  const watch = (v: {
    stuckAlert: boolean;
    stuckHours: number;
    backupCourierId: string;
  }) => f.overrides.set("fulfilment.courierWatch", v);

  beforeAll(async () => {
    f = await setUpShipping("shipping_withcourier");
    courierId = await f.courier(STEADFAST_PROVIDER, "Steadfast main");
    backupId = await f.courier(STEADFAST_PROVIDER, "Steadfast backup");
    world.reset();
    world.useClock(() => f.clock.now.getTime());
  });
  afterAll(async () => {
    world.reset();
    await f?.t.drop();
  });

  it("lists the parcels the courier holds with their live status, a filter, the stuck mark only while the owner switches it on, and an order cancelled but still booked", async () => {
    const a = await booked("wc-a");
    f.clock.now = new Date(f.clock.now.getTime() + 60 * 3_600_000); // nothing has moved on a since its booking, 60 hours ago
    const b = await booked("wc-b");
    const c = await booked("wc-c");
    const old = new Date(f.clock.now.getTime() - 60 * 3_600_000);
    await db().shipment.update({
      where: { id: a.shipmentId },
      data: { status: "IN_TRANSIT", pickedAt: old, lastTrackedAt: old },
    });
    await db().shipment.update({
      where: { id: b.shipmentId },
      data: {
        status: "OUT_FOR_DELIVERY",
        pickedAt: new Date(f.clock.now.getTime() - 3_600_000),
      },
    });
    await db().order.update({
      where: { id: c.orderId },
      data: { status: "CANCELLED" },
    });
    const off = await withCourier(f.shippingDeps(), f.shipper);
    const mine = (r: typeof off) =>
      r.rows.filter((x) =>
        [a.shipmentId, b.shipmentId, c.shipmentId].includes(x.shipmentId),
      );
    expect(
      mine(off)
        .map((x) => x.status)
        .sort(),
    ).toEqual(["IN_TRANSIT", "OUT_FOR_DELIVERY", expect.any(String)].sort());
    expect(off.stuck).toBe(0);
    expect(
      mine(off).find((x) => x.shipmentId === c.shipmentId)!.cancelledButBooked,
    ).toBe(true);
    expect(off.cancelledButBooked).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(off)).not.toContain("01700");
    watch({ stuckAlert: true, stuckHours: 48, backupCourierId: "" });
    try {
      const on = await withCourier(f.shippingDeps(), f.shipper);
      expect(mine(on).find((x) => x.shipmentId === a.shipmentId)!.stuck).toBe(
        true,
      );
      expect(mine(on).find((x) => x.shipmentId === b.shipmentId)!.stuck).toBe(
        false,
      );
      expect(on.stuck).toBe(1);
      const only = await withCourier(f.shippingDeps(), f.shipper, {
        status: "OUT_FOR_DELIVERY",
      });
      expect(only.rows.every((x) => x.status === "OUT_FOR_DELIVERY")).toBe(
        true,
      );
    } finally {
      f.overrides.delete("fulfilment.courierWatch");
    }
  });

  it("the day-end check counts orders packed today against the ones entered at a courier, and names the missing ones", async () => {
    const o = await f.place("wc-dayend", { phone: "01700002699" });
    await confirmOrder(f.ordersDeps(), f.staff, o.orderId);
    await db().orderEvent.create({
      data: {
        storeId: f.S,
        orderId: o.orderId,
        type: "pack",
        fromStatus: "CONFIRMED",
        toStatus: "PACKED",
        actorType: "STAFF",
        source: "admin",
        createdAt: f.clock.now,
      },
    });
    const r = await withCourier(f.shippingDeps(), f.shipper);
    expect(r.dayEnd.packedToday).toBeGreaterThanOrEqual(1);
    expect(r.dayEnd.enteredToday).toBeLessThan(r.dayEnd.packedToday);
    const num = (
      await db().order.findUniqueOrThrow({ where: { id: o.orderId } })
    ).number;
    expect(r.dayEnd.missing).toContain(num);
  });

  it("one parcel's history: its events oldest first and the failed tries counted", async () => {
    const a = await booked("wc-hist");
    await db().shipmentEvent.createMany({
      data: [
        {
          storeId: f.S,
          shipmentId: a.shipmentId,
          status: "PICKED_UP",
          occurredAt: new Date(f.clock.now.getTime() + 3_600_000),
        },
        {
          storeId: f.S,
          shipmentId: a.shipmentId,
          status: "ATTEMPT_FAILED",
          occurredAt: new Date(f.clock.now.getTime() + 7_200_000),
          message: "not at home",
        },
      ],
    });
    const h = await parcelHistory(f.shippingDeps(), f.shipper, a.shipmentId);
    expect(h.attempts).toBe(1);
    expect(h.events.map((e) => e.status).slice(-2)).toEqual([
      "PICKED_UP",
      "ATTEMPT_FAILED",
    ]);
    expect(
      await refusal(
        parcelHistory(
          f.shippingDeps(),
          f.shipper,
          "00000000-0000-7000-8000-000000000000",
        ),
      ),
    ).toBe("NOT_FOUND");
  });

  it("Move to the backup courier: refused without a backup, without the PIN and with a wrong PIN; with the PIN a waiting parcel moves and a picked-up one is skipped", async () => {
    const waiting = await booked("wc-move");
    const picked = await booked("wc-picked");
    await db().shipment.update({
      where: { id: picked.shipmentId },
      data: { status: "PICKED_UP", pickedAt: f.clock.now },
    });
    const ids = [waiting.shipmentId, picked.shipmentId];
    expect(
      await refusal(
        moveToBackup(f.shippingDeps(), f.shipper, {
          shipmentIds: ids,
          cancelledVia: "phone",
          pin: "482913",
        }),
      ),
    ).toBe("NO_BACKUP_COURIER");
    watch({ stuckAlert: false, stuckHours: 48, backupCourierId: backupId });
    try {
      expect(
        await refusal(
          moveToBackup(f.shippingDeps(), f.shipper, {
            shipmentIds: ids,
            cancelledVia: "phone",
          }),
        ),
      ).toBe("PIN_REQUIRED");
      expect(
        await refusal(
          moveToBackup(f.shippingDeps(), f.shipper, {
            shipmentIds: ids,
            cancelledVia: "phone",
            pin: "482913",
          }),
        ),
      ).toBe("PIN_NOT_SET");
      // an owner with a PIN
      const owner = await db().staffUser.create({
        data: {
          email: "owner-pin@example.com",
          displayName: "Owner",
          passwordHash: "not-a-login",
          booksPinHash: await hashPassword("482913"),
        },
      });
      const ownerRole = await db().role.findFirstOrThrow({
        where: { key: "owner" },
      });
      await db().staffRoleAssignment.create({
        data: { staffUserId: owner.id, roleId: ownerRole.id, storeId: null },
      });
      expect(
        await refusal(
          moveToBackup(f.shippingDeps(), f.shipper, {
            shipmentIds: ids,
            cancelledVia: "phone",
            pin: "000000",
          }),
        ),
      ).toBe("WRONG_PIN");
      expect(
        (
          await db().shipment.findUniqueOrThrow({
            where: { id: waiting.shipmentId },
          })
        ).status,
      ).not.toBe("CANCELLED");
      const r = await moveToBackup(f.shippingDeps(), f.shipper, {
        shipmentIds: ids,
        cancelledVia: "phone",
        pin: "482913",
      });
      expect(r.moved.map((m) => m.shipmentId)).toEqual([waiting.shipmentId]);
      expect(r.moved[0]!.booking.outcome).toBe("booked");
      expect(r.skipped).toEqual([
        { shipmentId: picked.shipmentId, why: "ALREADY_PICKED_UP" },
      ]);
      expect(
        (
          await db().shipment.findUniqueOrThrow({
            where: { id: waiting.shipmentId },
          })
        ).cancelOutcome,
      ).toBe("REBOOKED");
      const now = await db().shipment.findFirstOrThrow({
        where: { orderId: waiting.orderId, status: { not: "CANCELLED" } },
      });
      expect(now.courierAccountId).toBe(backupId);
      expect(
        await db().orderEvent.count({
          where: { orderId: waiting.orderId, type: "shipment.movedToBackup" },
        }),
      ).toBe(1);
    } finally {
      f.overrides.delete("fulfilment.courierWatch");
    }
  });
});
