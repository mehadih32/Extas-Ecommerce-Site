// S28 · PR 667 (CN-048, admin prototype v5, GAP-MAP O-22..O-25) — registry version 294. The With courier screen's watch:
// `stuckAlert` (off as shipped) marks a parcel the courier holds that has not moved for `stuckHours` (48 as the prototype
// has it, editable) and counts it on the page and in the alerts; `backupCourierId` is the courier today's parcels move to
// when the first one is down ("Move to the backup courier", with the owner's PIN; an empty text until the owner picks one).
// Read-only except the move; nothing is cancelled at a courier by us (a person cancels there). Labels: messages/courier-watch.<lang>.json.
import { z } from "zod";
import { setting } from "./define";

const V667 = 294;

export const courierWatchSchema = z
  .object({
    stuckAlert: z.boolean(),
    stuckHours: z.int().min(1).max(720),
    backupCourierId: z.union([z.uuid(), z.literal("")]),
  })
  .strict();
export type CourierWatchSettings = z.output<typeof courierWatchSchema>;

export const courierWatchSettings = {
  "fulfilment.courierWatch": setting({
    scope: "store",
    isOwnerData: false,
    isPublic: false,
    group: "orders",
    version: V667,
    schema: courierWatchSchema,
    // hardcode-ok: off as shipped; 48 hours is the prototype's own default and is editable on the With courier page
    default: { stuckAlert: false, stuckHours: 48, backupCourierId: "" },
    valueType: "JSON",
    labelKey: "fulfilment.courierWatch.label",
    helpKey: "fulfilment.courierWatch.help",
    sortOrder: 967,
  }),
};
