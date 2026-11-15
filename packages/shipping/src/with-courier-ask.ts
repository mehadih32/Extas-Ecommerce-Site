// PR 827 (prototype v5, Orders › With courier): "Ask courier" and "Ask to send back".
// A person presses the button on a packed parcel the courier's pickup report does not list ("missing"), on a parcel that
// has not moved ("stuck"), or on a cancelled order whose parcel is still booked ("sendBack"). The ask is written on the
// order's timeline (`shipment.courierAsked`) and in the audit log with the courier's name and the consignment id, so the
// person can tell the courier (the courier's own API has no message call). Nothing is sent to the courier, nothing is
// cancelled, no parcel moves and no money moves. Needs `fulfilment.handover`.
import { z } from "zod";
import { allow, logChange, parse, TX, type ShippingDeps, type Who } from "./context";
import { ShippingError } from "./errors";

export const COURIER_ASKS = ["missing", "stuck", "sendBack"] as const;
export type CourierAsk = (typeof COURIER_ASKS)[number];

const askInput = z.object({ orderId: z.uuid(), kind: z.enum(COURIER_ASKS) }).strict();

export interface AskedCourier {
  orderNumber: string;
  courierName: string | null;
  consignmentId: string | null;
  kind: CourierAsk;
}

export async function askCourier(deps: ShippingDeps, who: Who, input: unknown): Promise<AskedCourier> {
  await allow(deps, who, "fulfilment.handover");
  const d = parse(askInput, input, "ask courier");
  const order = await deps.db.order.findFirst({
    where: { id: d.orderId, storeId: who.storeId },
    select: {
      id: true,
      number: true,
      shipments: {
        where: { status: { notIn: ["BOOKING_FAILED", "CANCELLED"] } },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { id: true, consignmentId: true, courierAccount: { select: { name: true } } },
      },
    },
  });
  if (!order) throw new ShippingError("NOT_FOUND", "no such order", ["orderId"]);
  const s = order.shipments[0];
  if (!s) throw new ShippingError("NOT_ACTIVE", "the order has no booked parcel", ["orderId"]);
  await deps.db.$transaction(async (tx) => {
    await tx.orderEvent.create({
      data: {
        storeId: who.storeId,
        orderId: order.id,
        type: "shipment.courierAsked",
        reasonCode: d.kind.toUpperCase(),
        data: { kind: d.kind, shipmentId: s.id, consignmentId: s.consignmentId, courier: s.courierAccount.name },
        actorType: who.actor.staffUserId ? "STAFF" : "SYSTEM",
        actorId: who.actor.staffUserId,
        source: "admin",
      },
    });
    await logChange(tx, who, "shipment.askCourier", "Shipment", s.id, null, { kind: d.kind, consignmentId: s.consignmentId });
  }, TX);
  return { orderNumber: order.number, courierName: s.courierAccount.name, consignmentId: s.consignmentId, kind: d.kind };
}
