// CN-020 (4) · PR 117 follow-up (registry version 140, lane C's range; SIM-F-047) — the voice address: a mic in the
// checkout's address box turns Bengali speech into words. Where the phone has its own speech engine (Chrome on
// Android) the words come from the phone; elsewhere the recording goes to the speech-to-text connection (Keys &
// connections, its mock until the key is in: no words come back, so the team listens). The order is marked
// "voice-entered" and keeps the recording (`keepRecording`); a reading below `minConfidence`, or none, is flagged
// "voice — please call" with a call task, so the team calls only for the unclear ones. Off as shipped. Review R3 (M1,
// registry v142): the customer is told before he speaks that his voice is recorded and for how long; a recording is
// kept `retentionDays` (30 by default, at least 1: never forever) and then wiped by the privacy purge
// (`orders.pii.purge`, @extas/jobs pii.ts) once its checkout is finished or was abandoned.
// Labels: messages/voice-address.<lang>.json.
import { z } from 'zod';
import { setting } from './define';

const VVOICE = 140;
/** Review R3 (M1): `retentionDays` added (the next registry version after 141). */
const VVOICE_RETENTION = 142;

export const voiceAddressSchema = z
  .object({
    enabled: z.boolean(),
    /** The language the speech is read in (a BCP 47 tag the speech engines know, e.g. bn-BD). */
    speechLang: z.string().regex(/^[a-z]{2,3}(-[A-Z]{2})?$/),
    /** Below this reading confidence (0–1) the order is flagged "voice — please call". */
    minConfidence: z.number().min(0).max(1),
    /** Keep the recording with the order (the team can listen to it). */
    keepRecording: z.boolean(),
    /** The longest recording, in seconds (the mic stops by itself). */
    maxSeconds: z.int().min(5).max(120),
    /** The largest recording the server takes, in KB. */
    maxKb: z.int().min(64).max(4096),
    /** Recordings one browser may send an hour (abuse guard). */
    maxPerHour: z.int().min(1).max(60),
    /**
     * Review R3 (M1): days a recording is kept, then wiped (at least 1 — never kept forever). A value saved before this
     * field existed reads as 30.
     */
    retentionDays: z.int().min(1).max(3650).default(30), // hardcode-ok: the schema's fallback for values saved before v142, the same as the registry default
  })
  .strict();
export type VoiceAddressSettings = z.output<typeof voiceAddressSchema>;

export const voiceAddressSettings = {
  'checkout.voice': setting({
    scope: 'store',
    group: 'checkout',
    valueType: 'JSON',
    isOwnerData: false,
    isPublic: false,
    schema: voiceAddressSchema,
    default: { enabled: false, speechLang: 'bn-BD', minConfidence: 0.6, keepRecording: true, maxSeconds: 30, maxKb: 1024, maxPerHour: 10, retentionDays: 30 }, // hardcode-ok: registry default (review R3 M1: 30 days, the owner's to change)
    labelKey: 'checkout.voice.label',
    helpKey: 'checkout.voice.help',
    sortOrder: 941,
    version: VVOICE_RETENTION,
    since: VVOICE,
  }),
};
