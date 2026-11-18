// S28 · PR 666 on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): the To ship switches. Both off as shipped: a
// reprint needs only the reason and a printed sticker leaves the order where it is. With `reprintPin` on, a second print
// asks for the owner's PIN (PIN_REQUIRED, and the check really runs: no owner PIN set here is PIN_NOT_SET); the first print
// never asks. With `packOnPrint` on, printing a confirmed order's sticker marks it Packed through the order service.
// Made-up test values.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mockCourierWorld, STEADFAST_PROVIDER } from "@extas/adapters";
import { HAS_TEST_DB } from "@extas/auth/testing";
import { confirmOrder } from "@extas/orders";
import { bookOrders, bookedFigures, dayEndFigures, packContacts, printStickers } from "./index";
import { setUpShipping, type ShippingFixture } from "./testing";

async function refusal(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return "ok";
  } catch (e) {
    return (e as { code?: string }).code ?? String(e);
  }
}

describe.skipIf(!HAS_TEST_DB)("PR 666 · To ship switches (PostgreSQL)", () => {
  let f: ShippingFixture;
  let courierId: string;
  const world = mockCourierWorld(STEADFAST_PROVIDER);
  const db = () => f.t.prisma;
  let n = 0;
  const booked = async (name: string) => {
    const o = await f.place(name, {
      phone: `0170000${String(2660 + ++n).padStart(4, "0")}`,
    });
    await confirmOrder(f.ordersDeps(), f.staff, o.orderId);
    await bookOrders(f.shippingDeps(), f.shipper, {
      courierAccountId: courierId,
      orderIds: [o.orderId],
    });
    return {
      ...o,
      shipmentId: (
        await db().shipment.findFirstOrThrow({ where: { orderId: o.orderId } })
      ).id,
    };
  };
  const press = (ids: string[], extra: Record<string, unknown> = {}) =>
    printStickers(f.shippingDeps(), f.shipper, { shipmentIds: ids, ...extra });

  beforeAll(async () => {
    f = await setUpShipping("shipping_toship");
    courierId = await f.courier(STEADFAST_PROVIDER, "Steadfast main");
    world.reset();
    world.useClock(() => f.clock.now.getTime());
  });
  afterAll(async () => {
    world.reset();
    await f?.t.drop();
  });

  it("off as shipped: a reprint needs only its reason, and printing leaves the order Confirmed", async () => {
    const o = await booked("ts-off");
    await press([o.shipmentId]);
    expect(
      (await db().order.findUniqueOrThrow({ where: { id: o.orderId } })).status,
    ).toBe("CONFIRMED");
    expect(await refusal(press([o.shipmentId]))).toBe("REASON_REQUIRED");
    expect(
      await refusal(press([o.shipmentId], { reason: "sticker torn" })),
    ).toBe("ok");
  });

  it("reprintPin on: the first print never asks; a second print asks for the PIN after the reason, and the job is not made without it", async () => {
    f.overrides.set("fulfilment.toShip", {
      reprintPin: true,
      packOnPrint: false,
    });
    try {
      const o = await booked("ts-pin");
      expect(await refusal(press([o.shipmentId]))).toBe("ok");
      expect(await refusal(press([o.shipmentId]))).toBe("REASON_REQUIRED");
      expect(
        await refusal(press([o.shipmentId], { reason: "sticker torn" })),
      ).toBe("PIN_REQUIRED");
      expect(
        await refusal(
          press([o.shipmentId], { reason: "sticker torn", pin: "482913" }),
        ),
      ).toBe("PIN_NOT_SET");
      expect(
        (await db().shipment.findUniqueOrThrow({ where: { id: o.shipmentId } }))
          .labelPrintCount,
      ).toBe(1);
      expect(
        await db().printJob.count({
          where: { shipmentIds: { has: o.shipmentId }, kind: "STICKER" },
        }),
      ).toBe(1);
    } finally {
      f.overrides.delete("fulfilment.toShip");
    }
  });

  it("packOnPrint on: printing the sticker of a confirmed order marks it Packed, once", async () => {
    f.overrides.set("fulfilment.toShip", {
      reprintPin: false,
      packOnPrint: true,
    });
    try {
      const o = await booked("ts-pack");
      await press([o.shipmentId]);
      expect(
        (await db().order.findUniqueOrThrow({ where: { id: o.orderId } }))
          .status,
      ).toBe("PACKED");
      expect(
        await db().orderEvent.count({
          where: { orderId: o.orderId, toStatus: "PACKED" },
        }),
      ).toBe(1);
      await press([o.shipmentId], { reason: "sticker torn" }); // a reprint of a packed order changes nothing more
      expect(
        await db().orderEvent.count({
          where: { orderId: o.orderId, toStatus: "PACKED" },
        }),
      ).toBe(1);
    } finally {
      f.overrides.delete("fulfilment.toShip");
    }
  });

  // PR 813 (prototype v5): the Booked chip's four figures
  it("booked figures: stickers and pieces of the booked orders; an open shortage card keeps an order apart as a problem", async () => {
    const before = await bookedFigures(f.shippingDeps(), f.shipper);
    const a = await booked("bf-a");
    const b = await booked("bf-b");
    const after = await bookedFigures(f.shippingDeps(), f.shipper);
    expect(after.stickers).toBe(before.stickers + 2);
    expect(after.pieces).toBeGreaterThan(before.pieces);
    const item = await db().orderItem.findFirstOrThrow({ where: { orderId: b.orderId } });
    await db().packingIssue.create({ data: { storeId: f.S, orderId: b.orderId, orderItemId: item.id, kind: "SHORTAGE" } });
    const held = await bookedFigures(f.shippingDeps(), f.shipper);
    expect(held.stickers).toBe(before.stickers + 1);
    expect(held.problems).toBe(before.problems + 1);
    expect(held.short).toBe(before.short + 1);
    expect(a.orderId).not.toBe(b.orderId);
  });

  // PR 814 (prototype v5): the day-end check and the Owner / Packer phone view
  it("day-end figures: a packed order counts as packed today and as not handed over; nothing is handed over by a print", async () => {
    const before = await dayEndFigures(f.shippingDeps(), f.shipper);
    const o = await booked("de-a");
    await db().order.update({ where: { id: o.orderId }, data: { status: "PACKED", packedAt: f.clock.now } });
    const after = await dayEndFigures(f.shippingDeps(), f.shipper);
    expect(after.packedToday).toBe(before.packedToday + 1);
    expect(after.notHanded).toBe(before.notHanded + 1);
    expect(after.handedToday).toBe(before.handedToday);
  });

  it("pack contacts: the phone is masked to its first and last three digits, and an unknown order gives nothing", async () => {
    const o = await booked("pc-a");
    const rows = await packContacts(f.shippingDeps(), f.shipper, [o.orderId, "00000000-0000-7000-8000-000000000000"]);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.phone).toMatch(/^(\+880|0)170000/);
    expect(rows[0]!.phoneMasked).toBe(`${rows[0]!.phone.slice(0, 3)}•••••${rows[0]!.phone.slice(-3)}`);
    // PR 1120: the To ship table's items and cash come with it
    expect(rows[0]!.lines.length).toBeGreaterThan(0);
    expect(rows[0]!.lines[0]!.qty).toBeGreaterThan(0);
    expect(typeof rows[0]!.codMinor).toBe("number");
    expect(rows[0]!.currency).toBeTruthy();
    expect(await packContacts(f.shippingDeps(), f.shipper, [])).toEqual([]);
  });
});
