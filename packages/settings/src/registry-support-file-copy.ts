// Follow-up 505 (PR 425, 426; Blueprint B4.8) — a file a customer sends on Messenger or WhatsApp is copied to the
// shop's own storage, because Meta keeps none (a WhatsApp media address expires, a Messenger link is temporary).
// Registry version 273. Labels: messages/support.<lang>.json (`support.fileCopy`).
//
// - `enabled`: off as shipped (the file stays "Copying the file…" with the channel's address). On: each file is copied
//   right after its webhook, through the channel's own adapter behind the SSRF guard (@extas/adapters media-download),
//   on the mock until the channel's key is typed in.
// - `maxMb`: the largest file copied (a bigger one is marked "could not be copied"); `perRun`: files copied per turn.
// - `photoDays` / `videoDays` / `otherDays`: how long our copy is kept (B4.8: photos 2 years, videos 90 days); written
//   as the file's expiry date only. Removing an expired copy is a separate step that needs the owner's word.
// - `giveUpHours`: a file the channel still does not give after this long is marked "could not be copied".
import { z } from 'zod';
import { setting } from './define';

const V = 273;

export const supportFileCopySchema = z
  .object({
    enabled: z.boolean(),
    maxMb: z.int().min(1).max(100),
    perRun: z.int().min(1).max(200),
    photoDays: z.int().min(1).max(3_650),
    videoDays: z.int().min(1).max(3_650),
    otherDays: z.int().min(1).max(3_650),
    giveUpHours: z.int().min(1).max(720),
  })
  .strict();
export type SupportFileCopySettings = z.output<typeof supportFileCopySchema>;

export const supportFileCopySettings = {
  'support.fileCopy': setting({
    scope: 'store',
    schema: supportFileCopySchema,
    default: { enabled: false, maxMb: 25, perRun: 20, photoDays: 730, videoDays: 90, otherDays: 730, giveUpHours: 48 },
    valueType: 'JSON',
    group: 'support',
    labelKey: 'support.fileCopy.label',
    helpKey: 'support.fileCopy.help',
    isOwnerData: false,
    isPublic: false,
    sortOrder: 25,
    version: V,
  }),
} as const;
