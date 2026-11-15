// Website › Control — the hub's cards (owner request, 15 Nov 2026, with PR 778–782). One card per website setting, grouped,
// each linking to the page where that setting lives today (no page moves, no address changes). A card names the page it
// opens by its navigation key (`nav` = a key of lib/admin-shell/sections.ts), so the address and the permission always come
// from the one menu table and cannot drift; a page-settings card adds the screen (`?screen=`). A card shows only to a person
// who may open the page it leads to. Words: messages/admin-website-control.<lang>.json (`wc.card.<id>.t|d|k`). Pure.
import { SCREENS, type ScreenId } from '@/lib/admin-pagesettings/screens';
import { locateKey, type ShellViewer } from '@/lib/admin-shell/sections';

export interface ControlCardDef {
  id: string;
  /** The navigation key of the page it opens (sections.ts `keys`). */
  nav: string;
  /** A page-settings screen to open (adds `?screen=<id>`; the screen's own read permission counts). */
  screen?: ScreenId;
}

export interface ControlGroupDef {
  id: string;
  cards: readonly ControlCardDef[];
}

export const CONTROL_GROUPS: readonly ControlGroupDef[] = [
  {
    id: 'identity',
    cards: [
      { id: 'shopName', nav: 'websiteBrand' },
      { id: 'logo', nav: 'websiteBrand' },
      { id: 'favicon', nav: 'websiteBrand' },
      { id: 'contact', nav: 'websiteBrand' },
    ],
  },
  {
    id: 'frame',
    cards: [
      { id: 'header', nav: 'websiteBrand' },
      { id: 'menu', nav: 'websiteBrand' },
      { id: 'footer', nav: 'websiteBrand' },
    ],
  },
  {
    id: 'look',
    cards: [
      { id: 'look', nav: 'websiteLaunchDefault' },
      { id: 'layouts', nav: 'websiteLayouts' },
      { id: 'eye', nav: 'websiteEyeToggles' },
      { id: 'text', nav: 'websiteWords' },
    ],
  },
  {
    id: 'screens',
    cards: [
      { id: 'cookie', nav: 'websitePageSettings', screen: 'cookie' },
      { id: 'appicon', nav: 'websitePageSettings', screen: 'appicon' },
      { id: 'email', nav: 'websitePageSettings', screen: 'email' },
    ],
  },
  { id: 'policies', cards: [{ id: 'policies', nav: 'websitePolicies' }] },
  {
    id: 'find',
    cards: [
      { id: 'seo', nav: 'seo' },
      { id: 'analytics', nav: 'websiteAnalytics' },
    ],
  },
  {
    id: 'buy',
    cards: [
      { id: 'checkout', nav: 'settingsCheckout' },
      { id: 'delivery', nav: 'deliverySettings' },
      { id: 'categories', nav: 'productStructure' },
    ],
  },
];

export interface ControlCard {
  id: string;
  href: string;
}
export interface ControlGroup {
  id: string;
  cards: ControlCard[];
}

/** The page a card opens, or null when the navigation table has no such page. */
export function cardTarget(c: ControlCardDef): { href: string; perm: string } | null {
  const place = locateKey(c.nav);
  if (!place?.page) return null;
  if (c.screen) return { href: `${place.page.href}?screen=${c.screen}`, perm: SCREENS[c.screen].read };
  return { href: place.page.href, perm: place.page.perm };
}

/** The groups this person sees: only cards whose page they may open; a group with none is left out. */
export function controlGroups(viewer: ShellViewer): ControlGroup[] {
  const mayOpen = (perm: string) => viewer.owner || viewer.perms.has(perm);
  return CONTROL_GROUPS.map((g) => ({
    id: g.id,
    cards: g.cards.flatMap((c) => {
      const to = cardTarget(c);
      return to && mayOpen(to.perm) ? [{ id: c.id, href: to.href }] : [];
    }),
  })).filter((g) => g.cards.length > 0);
}

/** Does a card match what was typed? Every word typed must be in its title, line or search words (case-blind). */
export function cardMatches(text: { t: string; d: string; k: string }, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = `${text.t} ${text.d} ${text.k}`.toLowerCase();
  return words.every((w) => hay.includes(w));
}
