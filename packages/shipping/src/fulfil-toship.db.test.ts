// S28 · PR 666 on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): the To ship switches. Both off as shipped: a
// reprint needs only the reason and a printed sticker leaves the order where it is. With `reprintPin` on, a second print
// asks for the owner's PIN (PIN_REQUIRED, and the check really runs: no owner PIN set here is PIN_NOT_SET); the first print
// never asks. With `packOnPrint` on, printing a confirmed order's sticker marks it Packed through the order service.
// Made-up test values.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mockCourierWorld, STEADFAST_PROVIDER } from "@extas/adapters";
import { HAS_TEST_DB } from "@extas/auth/testing";
import { confirmOrder } from "@extas/orders";
import { bookOrders, printStickers } from "./index";
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
});
