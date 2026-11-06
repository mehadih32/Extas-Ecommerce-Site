// S02 · PR 79 (register "Front-end editing: open the page, change a label, publish"; BACKEND-ARCHITECTURE WEB-05) — the
// switch for editing the shop's words on the shop page itself (registry version 242; lane B, CN-036). While it is on, a
// shop page opened from Website › Words & language ("Edit on the shop") shows the words of that page in a panel to a
// signed-in staff member: pick a word on the page or in the list, change it in English and Bengali, then Publish (the
// same `language.labels` the Words page saves; `website.words.write`). Off: no shop page loads anything for it.
import { z } from 'zod';
import { setting } from './define';

const V = 242;

export const frontEditSchema = z.object({ enabled: z.boolean() }).strict();
export type FrontEdit = z.output<typeof frontEditSchema>;

export const frontEditSettings = {
  'language.frontEdit': setting({
    scope: 'store',
    schema: frontEditSchema,
    default: { enabled: false },
    valueType: 'JSON',
    group: 'language',
    labelKey: 'language.frontEdit.label',
    helpKey: 'language.frontEdit.help',
    isOwnerData: false,
    isPublic: false,
    sortOrder: 45,
    version: V,
  }),
};
