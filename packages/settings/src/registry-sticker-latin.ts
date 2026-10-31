// SIM-F-048 · PR 179 follow-up (registry version 96, lane C's range) — the courier sticker's second address line: a
// Bengali address printed again in Latin letters under it (@extas/delivery `bengaliToLatin`), with the area and district
// as the gazetteer names them in English, for riders and hub staff who read Latin letters faster. The Bengali address
// stays the one that counts. Off as shipped. Labels: messages/sticker-latin.<lang>.json.
import { z } from 'zod';
import { setting } from './define';

const V179F = 96;

export const stickerLatinSchema = z.object({ enabled: z.boolean() }).strict();
export type StickerLatinSettings = z.output<typeof stickerLatinSchema>;

export const stickerLatinSettings = {
  'delivery.sticker.latin': setting({
    scope: 'store',
    group: 'delivery',
    valueType: 'JSON',
    isOwnerData: false,
    isPublic: false,
    schema: stickerLatinSchema,
    default: { enabled: false },
    labelKey: 'delivery.sticker.latin.label',
    helpKey: 'delivery.sticker.latin.help',
    sortOrder: 932,
    version: V179F,
  }),
};
