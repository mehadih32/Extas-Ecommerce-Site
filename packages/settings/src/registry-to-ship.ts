// S28 · PR 666 (CN-048, admin prototype v5, GAP-MAP O-19, O-20) — registry version 293. The To ship screen's two switches,
// both off as shipped (CN-018): `reprintPin` — a second print of a parcel's sticker needs the owner's PIN as well as a
// reason (the print log shows who, when and why); `packOnPrint` — a printed sticker is the parcel packed (no piece scan),
// so printing a confirmed order's sticker moves it on to Packed through the order service. Neither changes a price, a
// charge or a payment. Labels: messages/to-ship.<lang>.json.
import { z } from "zod";
import { setting } from "./define";

const V666 = 293;

export const toShipSchema = z
  .object({ reprintPin: z.boolean(), packOnPrint: z.boolean() })
  .strict();
export type ToShipSettings = z.output<typeof toShipSchema>;

export const toShipSettings = {
  "fulfilment.toShip": setting({
    scope: "store",
    isOwnerData: false,
    isPublic: false,
    group: "orders",
    version: V666,
    schema: toShipSchema,
    // hardcode-ok: both off as shipped — the owner switches them on on the To ship page
    default: { reprintPin: false, packOnPrint: false },
    valueType: "JSON",
    labelKey: "fulfilment.toShip.label",
    helpKey: "fulfilment.toShip.help",
    sortOrder: 966,
  }),
};
