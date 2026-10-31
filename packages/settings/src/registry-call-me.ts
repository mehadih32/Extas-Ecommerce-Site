// CN-020 (3) · checkout follow-up (registry version 99, lane C's range; SIM-F-046) — "Call me" appears only when someone
// struggles at checkout: after `failedTries` refused tries on one field, or `idleSeconds` without progress. There is no
// permanent button. A tap leaves a call-back in Support (the inbox, channel "Call-back"), with the number he typed or
// gave; one per number a day at most (`perPhonePerDay`), and the same tap twice is one. Off as shipped; both thresholds
// are settings (the owner's defaults of CN-020: 3 tries, 90 seconds). Labels: messages/call-me.<lang>.json.
import { z } from 'zod';
import { setting } from './define';

const VCALL = 99;

export const callMeSchema = z
  .object({
    enabled: z.boolean(),
    /** Refused tries on one field (Confirm pressed with that field wrong) before "Call me" shows. */
    failedTries: z.int().min(1).max(10),
    /** Seconds without any change on an unfinished checkout before "Call me" shows. */
    idleSeconds: z.int().min(15).max(900),
    /** Call-backs one number may leave a day (abuse guard). */
    perPhonePerDay: z.int().min(1).max(20),
  })
  .strict();
export type CallMeSettings = z.output<typeof callMeSchema>;

export const callMeSettings = {
  'checkout.callMe': setting({
    scope: 'store',
    group: 'checkout',
    valueType: 'JSON',
    isOwnerData: false,
    isPublic: false,
    schema: callMeSchema,
    default: { enabled: false, failedTries: 3, idleSeconds: 90, perPhonePerDay: 3 },
    labelKey: 'checkout.callMe.label',
    helpKey: 'checkout.callMe.help',
    sortOrder: 940,
    version: VCALL,
  }),
};
