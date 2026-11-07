// S08 · PR 180 follow-up 437 — registry version 275, lane B. The courier's pick-up checked against a handed-over batch:
// once a batch has been with the courier for `afterHours`, the Handover page's history names (1) a parcel on the sheet
// the courier never picked up (no pick-up in its events: still booked, in review or waiting for pick-up) and (2) a
// parcel the courier picked up within `windowHours` of the hand-over that was on no handed-over sheet of that courier.
// Read only: nothing is re-booked, cancelled or moved; a person phones the courier.
//
// `fulfilment.handover.reconcile`: off as shipped; both hours editable on the Handover page.
import { z } from 'zod';
import { setting } from './define';

const V437 = 275;

export const handoverReconcileSchema = z
  .object({
    enabled: z.boolean(),
    afterHours: z.int().min(1).max(168),
    windowHours: z.int().min(1).max(168),
  })
  .strict();
export type HandoverReconcileSettings = z.output<typeof handoverReconcileSchema>;

export const handoverCheckSettings = {
  'fulfilment.handover.reconcile': setting({
    scope: 'store',
    isOwnerData: false,
    isPublic: false,
    group: 'orders',
    version: V437,
    schema: handoverReconcileSchema,
    // hardcode-ok: off as shipped — the owner switches it on on the Handover page; both hours are editable there
    default: { enabled: false, afterHours: 12, windowHours: 24 },
    valueType: 'JSON',
    labelKey: 'fulfilment.handover.reconcile.label',
    helpKey: 'fulfilment.handover.reconcile.help',
    sortOrder: 965,
  }),
};
