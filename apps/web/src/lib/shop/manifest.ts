// PR 744 (owner order 15 Nov 2026, group ঙ) — what a phone shows when a visitor adds the shop to the home screen: the shop's
// web app manifest from `app.homeScreen` (Website › Page settings › Home-screen icon; off as shipped, then there is no
// manifest and the pages link none). Pure: the route reads the settings and the media and gives them here. The name falls
// back to the shop's name, the colours to the shop's theme background, the icon to the shop's tab icon.
import type { AppHomeScreen } from '@extas/settings';

export const MANIFEST_PATH = '/manifest.webmanifest'; // hardcode-ok: the address the browser asks for by convention
/** Android shows about this many letters under an icon (technical, the platform's own limit). */
const SHORT_NAME_MAX = 12; // hardcode-ok: the platform's own limit for a home-screen label

export interface ManifestIcon {
  src: string;
  sizes: string;
  type: string;
}

export interface ManifestInput {
  set: AppHomeScreen;
  storeName: string;
  /** The shop's theme background, for the colours the owner left empty. */
  background: string;
  /** The picked icon's own sizes, widest first (empty: none or still being made). */
  icons: ManifestIcon[];
  /** The shop's tab icon, used while no picture is picked. */
  fallbackIcon: ManifestIcon;
}

/** The manifest, or null while the switch is off. */
export function buildManifest(i: ManifestInput): Record<string, unknown> | null {
  if (!i.set.on) return null;
  const name = i.set.name ?? i.storeName;
  const short = i.set.shortName ?? (name.length <= SHORT_NAME_MAX ? name : name.slice(0, SHORT_NAME_MAX).trim());
  return {
    id: '/',
    name,
    short_name: short,
    start_url: '/',
    scope: '/',
    display: i.set.display,
    theme_color: i.set.themeColour ?? i.background,
    background_color: i.set.backgroundColour ?? i.background,
    icons: (i.icons.length ? i.icons : [i.fallbackIcon]).map((x) => ({ ...x, purpose: 'any' })),
  };
}
