// PR 625 (CN-036) — the admin's theme layer (docs/demo/admin-look/LUMEN-SPEC.md §1). Registry version 234. Labels:
// messages/admin-look.<lang>.json (`admin.theme.*`).
//
// - `admin.theme`: the team's admin look and its accent colour, and whether motion is reduced for everyone.
//   `look` is one of the looks that are built (only "lumen" until PR 649–651 build the parked ones); `accent` is the
//   colour every button, link and highlight is mixed from (coral as shipped; text on it stays readable, the theme
//   layer darkens it where needed); `reduceMotion` stops the admin's animations for everyone (each person can also
//   turn it on for themselves, and the system's own "reduce motion" is always followed).
// Light or dark is each person's own choice (the moon button), kept on their staff account (StaffUser.adminPrefs),
// never a team setting. Nothing here changes money, an order or a customer: it is how the admin looks.
import { z } from 'zod';
import { setting } from './define';

const V = 234;

/** Every admin look of docs/demo/admin-look/ADMIN-LOOKS-V1.html, in the order Settings › Admin look lists them. */
export const ADMIN_THEME_LOOKS = [
  { id: 'lumen', letter: 'ঘ', built: true },
  { id: 'clear', letter: 'ক', built: false },
  { id: 'night', letter: 'খ', built: false },
  { id: 'studio', letter: 'গ', built: false },
] as const;

export type AdminThemeLookId = (typeof ADMIN_THEME_LOOKS)[number]['id'];

/** The looks a person or the team may choose now (the parked ones show as "Planned"). */
export const BUILT_ADMIN_LOOKS = ADMIN_THEME_LOOKS.filter((l) => l.built).map((l) => l.id);

/** A colour as #RRGGBB. */
export const accentSchema = z.string().regex(/^#[0-9A-Fa-f]{6}$/);

export const adminThemeSchema = z
  .object({
    look: z.enum(['lumen']),
    accent: accentSchema,
    reduceMotion: z.boolean(),
  })
  .strict();

export type AdminTheme = z.infer<typeof adminThemeSchema>;

export const adminThemeSettings = {
  'admin.theme': setting({
    scope: 'store',
    valueType: 'JSON',
    group: 'admin',
    isOwnerData: false,
    isPublic: false,
    version: V,
    schema: adminThemeSchema,
    default: { look: 'lumen', accent: '#FF5A36', reduceMotion: false },
    labelKey: 'admin.theme.label',
    helpKey: 'admin.theme.help',
    sortOrder: 39,
  }),
};
