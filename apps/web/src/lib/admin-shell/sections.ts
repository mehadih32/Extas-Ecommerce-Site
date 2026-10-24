// PR 12 (CN-018, CN-022) — the new admin's 14 sections as data (docs/BACKEND-ARCHITECTURE.md §5.1, decision D8; demo
// V12.3 97p-adm2-sections.js). Each section lists only the tabs that are BUILT (no dead links); what is planned is a
// line in the section's placeholder (`shell.plan.<id>`). Each tab is one or more existing pages: the tab opens the
// first page the person may open, and its sub-pages form the small chips under the tabs (Stock › Counts …).
// Labels: messages/admin-shell.<lang>.json (`shell.sec.<id>`, `shell.tab.<id>.<tab>`). No React, no database: the
// client shell, the server pages and the search all read this one table.
import type { PermissionKey } from '@extas/auth';
import type { AdminSectionId } from '@extas/settings';
import type { ShellIconName } from './icons';

export interface ShellPage {
  /** The page's address; a page also owns every address under it that no other page owns. */
  href: string;
  /** The permission its own page asks for (the page re-checks it). */
  perm: PermissionKey;
  /** The `current` keys pages pass to the frame (ADMIN_PAGES keys, or a native page's own id). */
  keys: readonly string[];
}

export interface ShellTab {
  id: string;
  pages: readonly ShellPage[];
  /** Under "More ▾". */
  more?: boolean;
  /** The tab's own guide, when it is not the section's. */
  guide?: string;
}

export type ShellGroup = 'daily' | 'grow' | 'business' | 'bottom';

export interface ShellSection {
  id: AdminSectionId;
  icon: ShellIconName;
  group: ShellGroup;
  /** The section's own address: its placeholder while nothing is built there (the Dashboard: the admin's front door). */
  base: string;
  tabs: readonly ShellTab[];
  /** Keys that show the section even with no built tab (a section with neither shows for the owner only). */
  perms?: readonly PermissionKey[];
  /** The owner only, whatever the keys (AI Center while AI is off, §5.1). */
  ownerOnly?: boolean;
  /** The admin guide (docs/admin-guide/<slug>.md). */
  guide: string;
}

export const SHELL_GROUPS: readonly Exclude<ShellGroup, 'bottom'>[] = ['daily', 'grow', 'business'];

export const SHELL_SECTIONS: readonly ShellSection[] = [
  { id: 'dashboard', icon: 'grid', group: 'daily', base: '/admin', tabs: [], perms: ['dashboard.read'], guide: 'dashboard' },
  // S05 (PR 140, 141; follow-up 200): All orders (and one order's page) and the To confirm call queue. Risk review,
  // packing, returns and the order settings join as their PRs are built. `orders.invoice` alone no longer shows the
  // section (its pages need orders.read); the palette still opens invoices for that key.
  {
    id: 'orders',
    icon: 'bag',
    group: 'daily',
    base: '/admin/orders',
    guide: 'orders',
    tabs: [
      { id: 'all', pages: [{ href: '/admin/orders', perm: 'orders.read', keys: ['orders', 'order'] }] },
      { id: 'confirm', pages: [{ href: '/admin/orders/confirm', perm: 'orders.confirm', keys: ['ordersConfirm'] }] },
    ],
  },
  {
    id: 'products',
    icon: 'shirt',
    group: 'daily',
    base: '/admin/products',
    guide: 'products',
    tabs: [
      { id: 'all', pages: [{ href: '/admin/products', perm: 'catalogue.read', keys: ['products', 'productNew', 'product'] }] },
      { id: 'queue', pages: [{ href: '/admin/products/queue', perm: 'catalogue.read', keys: ['publishQueue'] }] },
      { id: 'combos', guide: 'combos', pages: [{ href: '/admin/combos', perm: 'combos.read', keys: ['combos'] }] },
      {
        id: 'stock',
        guide: 'stock',
        pages: [
          { href: '/admin/stock', perm: 'inventory.read', keys: ['stock'] },
          { href: '/admin/stock/counts', perm: 'inventory.read', keys: ['stockCounts', 'stockCount'] },
          { href: '/admin/stock/movements', perm: 'inventory.read', keys: ['stockMovements'] },
          { href: '/admin/products/back-in-stock', perm: 'catalogue.read', keys: ['backInStock'] },
        ],
      },
      { id: 'charts', guide: 'size-charts', pages: [{ href: '/admin/size-charts', perm: 'catalogue.read', keys: ['sizeCharts'] }] },
      { id: 'import', more: true, pages: [{ href: '/admin/products/import', perm: 'catalogue.import', keys: ['productImport'] }] },
      { id: 'audit', more: true, pages: [{ href: '/admin/products/audit', perm: 'catalogue.read', keys: ['productAudit'] }] },
    ],
  },
  { id: 'customers', icon: 'users', group: 'daily', base: '/admin/customers', tabs: [], guide: 'customers' },
  {
    id: 'delivery',
    icon: 'truck',
    group: 'daily',
    base: '/admin/delivery',
    guide: 'delivery',
    tabs: [{ id: 'zones', pages: [{ href: '/admin/delivery/zones', perm: 'delivery.read', keys: ['delivery'] }] }],
  },
  { id: 'messages', icon: 'msg', group: 'daily', base: '/admin/messages', tabs: [], guide: 'comms' },
  { id: 'support', icon: 'headset', group: 'daily', base: '/admin/support', tabs: [], guide: 'support' },
  {
    id: 'marketing',
    icon: 'mega',
    group: 'grow',
    base: '/admin/marketing',
    guide: 'ads',
    tabs: [
      {
        id: 'rules',
        guide: 'rules',
        pages: [
          { href: '/admin/rules', perm: 'rules.read', keys: ['rules'] },
          { href: '/admin/rules/notices', perm: 'rules.read', keys: ['notices'] },
        ],
      },
    ],
  },
  { id: 'website', icon: 'globe', group: 'grow', base: '/admin/website', tabs: [], guide: 'site' },
  { id: 'money', icon: 'wallet', group: 'business', base: '/admin/money', tabs: [], guide: 'finance' },
  {
    id: 'reports',
    icon: 'chart',
    group: 'business',
    base: '/admin/reports',
    guide: 'analytics',
    tabs: [{ id: 'health', guide: 'server', pages: [{ href: '/admin/server', perm: 'system.read', keys: ['server'] }] }],
  },
  { id: 'ai', icon: 'spark', group: 'business', base: '/admin/ai', tabs: [], ownerOnly: true, guide: 'ai' },
  {
    id: 'settings',
    icon: 'sliders',
    group: 'bottom',
    base: '/admin/settings',
    guide: 'settings',
    tabs: [{ id: 'keys', guide: 'integrations', pages: [{ href: '/admin/integrations', perm: 'vault.read', keys: ['integrations'] }] }],
  },
  {
    id: 'help',
    icon: 'help',
    group: 'bottom',
    base: '/admin/help',
    guide: 'README',
    tabs: [{ id: 'manual', pages: [{ href: '/admin/help', perm: 'help.read', keys: ['help'] }] }],
  },
];

/** What the person may see: their keys in the current store and whether they are an owner. */
export interface ShellViewer {
  perms: ReadonlySet<string>;
  owner: boolean;
}

export const sectionById = (id: string) => SHELL_SECTIONS.find((s) => s.id === id) ?? null;

const pageVisible = (p: ShellPage, v: ShellViewer) => v.owner || v.perms.has(p.perm);

/** A tab's pages the person may open (the first is where the tab leads). */
export const visiblePages = (t: ShellTab, v: ShellViewer) => t.pages.filter((p) => pageVisible(p, v));

export const visibleTabs = (s: ShellSection, v: ShellViewer) => s.tabs.filter((t) => visiblePages(t, v).length > 0);

/** A menu entry shows only to someone who holds a key in it (§5.0); a section with no key yet, to the owner. */
export function sectionVisible(s: ShellSection, v: ShellViewer): boolean {
  if (v.owner) return true;
  if (s.ownerOnly) return false;
  if (s.perms?.some((k) => v.perms.has(k))) return true;
  return visibleTabs(s, v).length > 0;
}

/** Where the sidebar entry leads: the Dashboard itself (no start-page jump), the first built tab, or the placeholder. */
export function sectionHome(s: ShellSection, v: ShellViewer): string {
  if (s.id === 'dashboard') return '/admin?home=1';
  const t = visibleTabs(s, v)[0];
  return t ? visiblePages(t, v)[0]!.href : s.base;
}

export interface ShellPlace {
  section: ShellSection;
  tab: ShellTab | null;
  page: ShellPage | null;
}

const owns = (href: string, path: string) => path === href || path.startsWith(`${href}/`);

/** The section, tab and page an address belongs to: the longest page address that owns it, else a section base. */
export function locate(pathname: string): ShellPlace | null {
  const path = pathname.replace(/\/+$/, '') || '/admin';
  let best: ShellPlace | null = null;
  let len = -1;
  for (const section of SHELL_SECTIONS) {
    for (const tab of section.tabs) {
      for (const page of tab.pages) {
        if (owns(page.href, path) && page.href.length > len) {
          best = { section, tab, page };
          len = page.href.length;
        }
      }
    }
  }
  if (best) return best;
  for (const section of SHELL_SECTIONS) {
    if (section.base !== '/admin' && owns(section.base, path)) return { section, tab: null, page: null };
  }
  return path === '/admin' ? { section: SHELL_SECTIONS[0]!, tab: null, page: null } : null;
}

/** The place of a page by the key it passes to the frame (`current`). */
export function locateKey(key: string): ShellPlace | null {
  for (const section of SHELL_SECTIONS) {
    for (const tab of section.tabs) {
      const page = tab.pages.find((p) => p.keys.includes(key));
      if (page) return { section, tab, page };
    }
  }
  return null;
}

/** The guide of a place: its tab's own, else its section's. */
export const guideOf = (p: ShellPlace) => p.tab?.guide ?? p.section.guide;

/** Every guide a section or tab names (each must exist in docs/admin-guide/; the tests check). */
export const GUIDE_SLUGS: readonly string[] = [...new Set(SHELL_SECTIONS.flatMap((s) => [s.guide, ...s.tabs.flatMap((t) => (t.guide ? [t.guide] : []))]))];

/** Sections whose placeholder is drawn at their base address (no built page lives there). */
export const placeholderSections = () => SHELL_SECTIONS.filter((s) => s.base !== '/admin' && !s.tabs.some((t) => t.pages.some((p) => p.href === s.base)));
