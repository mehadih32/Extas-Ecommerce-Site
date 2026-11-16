// PR 779 (owner order: the real admin equals prototype v5 100%) — Settings as the prototype draws it
// (docs/demo/admin-proto-v5/js/m-settings.js `frame()` / `ITEMS`): one page with a searchable list on the left in two groups,
// Business and System (owner only), each item its own page. The pages and their addresses are unchanged; this table says which
// built page (by its navigation key in sections.ts, so the address and the permission come from the one menu table) each
// list item opens, in the prototype's order and words. Real pages the prototype has no item for keep an item at the end of
// their group (nothing is dropped). PR 791 built the last two (Site health, Updates & versions).
// Words: messages/admin-shell.<lang>.json `shell.setlist.*` (group names, item names, search words). Pure: no React, no database.
import type { ShellIconName } from './icons';
import { locateKey, type ShellViewer } from './sections';

export interface SettingsItemDef {
  /** `shell.setlist.item.<id>` and `.kw` in the shell's words. */
  id: string;
  group: 'b' | 's' | 'm';
  /** Owner only even though it sits in More settings (the System items of the real admin that the prototype has no item for). */
  owner?: true;
  /** The navigation key of the page it opens (sections.ts `keys`). */
  nav: string;
  icon: ShellIconName;
}

export const SETTINGS_ITEMS: readonly SettingsItemDef[] = [
  // Business (prototype: Store details, ERP connection, Couriers, Payments, Customer messages, Team & roles, Demo products)
  { id: 'store', group: 'b', nav: 'store', icon: 'home' },
  { id: 'erp', group: 'b', nav: 'erpLink', icon: 'refresh' },
  { id: 'couriers', group: 'b', nav: 'settingsCouriers', icon: 'truck' },
  { id: 'payments', group: 'b', nav: 'settingsCheckout', icon: 'wallet' },
  { id: 'messages', group: 'b', nav: 'settingsMessages', icon: 'msg' },
  { id: 'team', group: 'b', nav: 'people', icon: 'users' },
  { id: 'demo', group: 'b', nav: 'productDemo', icon: 'box' },
  // System (owner only; prototype: Keys & connections, Backups & restore, Site health, AI control, Updates & versions, Security, Activity log, Data & privacy, Telegram control, Help & manual)
  { id: 'keys', group: 's', nav: 'integrations', icon: 'check' },
  { id: 'backups', group: 's', nav: 'backups', icon: 'refresh' },
  { id: 'health', group: 's', nav: 'siteHealth', icon: 'chart' },
  { id: 'ai', group: 's', nav: 'settingsAi', icon: 'spark' },
  { id: 'updates', group: 's', nav: 'updates', icon: 'refresh' },
  { id: 'security', group: 's', nav: 'security', icon: 'alert' },
  { id: 'activity', group: 's', nav: 'activity', icon: 'menu' },
  { id: 'privacy', group: 's', nav: 'privacy', icon: 'users' },
  { id: 'telegram', group: 's', nav: 'telegramApprovals', icon: 'msg' },
  { id: 'help', group: 's', nav: 'help', icon: 'help' },
  // More settings (D10): the real pages the prototype folds into its items or does not list, kept reachable at the end (nothing dropped)
  { id: 'roles', group: 'm', nav: 'roles', icon: 'lock' },
  { id: 'staffControls', group: 'm', nav: 'staffControls', icon: 'sliders' },
  { id: 'policies', group: 'm', nav: 'policies', icon: 'file' },
  { id: 'look', group: 'm', nav: 'adminLook', icon: 'layers' },
  { id: 'practice', group: 'm', nav: 'practice', icon: 'box' },
  { id: 'shell', group: 'm', nav: 'settingsShell', icon: 'search' },
  { id: 'shimmer', group: 'm', nav: 'settingsShimmer', icon: 'spark' },
  { id: 'cache', group: 'm', nav: 'cache', icon: 'chart', owner: true },
  { id: 'golive', group: 'm', nav: 'golive', icon: 'check', owner: true },
  { id: 'edge', group: 'm', nav: 'edge', icon: 'globe', owner: true },
  { id: 'startFresh', group: 'm', nav: 'startFresh', icon: 'refresh', owner: true },
];

export interface SettingsItem {
  id: string;
  group: 'b' | 's' | 'm';
  owner: boolean;
  href: string;
  icon: ShellIconName;
  /** The page the item opens lives in the Settings section (the list stays around it). */
  inside: boolean;
}

/** The list for this person: only items whose page they may open (and that the menu table has). */
export function settingsItems(viewer: ShellViewer): SettingsItem[] {
  return SETTINGS_ITEMS.flatMap((it) => {
    const place = locateKey(it.nav);
    if (!place?.page) return [];
    if (!(viewer.owner || viewer.perms.has(place.page.perm))) return [];
    if (viewer.hidden?.has(place.section.id) || viewer.hidden?.has(`${place.section.id}.${place.tab?.id}`)) return [];
    return [{ id: it.id, group: it.group, owner: it.group === 's' || Boolean(it.owner), href: place.page.href, icon: it.icon, inside: place.section.id === 'settings' }];
  });
}

/** The item a page address belongs to: the longest item address that owns it (a sub-page keeps its parent item lit). */
export function currentItem(items: readonly SettingsItem[], pathname: string): SettingsItem | null {
  const path = pathname.replace(/\/+$/, '');
  let best: SettingsItem | null = null;
  for (const it of items) {
    if ((path === it.href || path.startsWith(`${it.href}/`)) && (!best || it.href.length > best.href.length)) best = it;
  }
  return best;
}

/** Does an item match what was typed (its name or search words, in the person's language)? */
export function itemMatches(text: { name: string; kw: string }, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = `${text.name} ${text.kw}`.toLowerCase();
  return words.every((w) => hay.includes(w));
}
