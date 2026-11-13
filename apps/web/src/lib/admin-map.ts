// S28 · PR 707 (admin prototype v5, GAP-MAP part 2 P2-15 and part 3 S10/N10) — the Admin map: every page of the admin
// on one searchable page, made from the menu model itself (`SHELL_SECTIONS`), so a page added to the menu is on the
// map without anyone editing the map. Each page carries one plain line in English and Bengali
// (messages/admin-map.<lang>.json `adminMap.lines.<section>.<tab>`); a page with no line yet still shows, with a plain
// "Open this page." line, and `pagesWithoutLine` names it so the nav patch (docs/demo/admin-proto-v5/gap/NAV-PATCH-*.md)
// can list what to write. The map lists only what the person may open (their keys, like the menu), the owner all.
// "Tasks" ("Change the delivery charge" → where) are the owner's everyday questions; a task whose page is not in the
// menu (yet) is left out, never a dead link. No React, no database: the page and the tests both read this.
import { SHELL_GROUPS, SHELL_SECTIONS, sectionVisible, visiblePages, visibleTabs, type ShellGroup, type ShellSection, type ShellViewer } from './admin-shell/sections';

/** The map's own lines, as the messages file holds them (`adminMap.lines`). */
export type MapLines = Readonly<Record<string, string>>;

export interface MapPage {
  /** `<section>.<tab>`: the key of its line. */
  key: string;
  section: string;
  tab: string;
  href: string;
  /** The key the page asks for, so "who can open it" can say it. */
  perm: string;
  more: boolean;
  /** The one line (empty when none is written yet). */
  line: string;
}

export interface MapSection {
  id: string;
  group: ShellGroup;
  href: string;
  pages: MapPage[];
}

export interface MapGroup {
  id: ShellGroup;
  sections: MapSection[];
}

export interface MapTask {
  /** `adminMap.tasks.<id>` in the messages. */
  id: string;
  /** Where it is done: the first of these `<section>.<tab>` pages that is in the menu wins. */
  at: readonly string[];
}

/** The owner's everyday questions and the page each is answered on (the prototype's list, mapped to today's menu). */
export const MAP_TASKS: readonly MapTask[] = [
  { id: 'deliveryCharge', at: ['rules.all', 'delivery.zones'] },
  { id: 'freeDelivery', at: ['rules.all', 'delivery.settings'] },
  { id: 'autoConfirm', at: ['rules.all', 'orders.riskrules'] },
  { id: 'coupon', at: ['rules.coupons', 'marketing.rules'] },
  { id: 'callOrders', at: ['orders.processing', 'orders.confirm'] },
  { id: 'bookCourier', at: ['orders.ship', 'orders.packing'] },
  { id: 'exchange', at: ['orders.returns'] },
  { id: 'incomplete', at: ['orders.incomplete'] },
  { id: 'newProduct', at: ['products.add', 'products.queue', 'products.all'] },
  { id: 'price', at: ['products.all'] },
  { id: 'combo', at: ['products.combos'] },
  { id: 'question', at: ['products.reviews'] },
  { id: 'chats', at: ['inbox.chats', 'support.inbox'] },
  { id: 'customer360', at: ['customers.all'] },
  { id: 'adsProfit', at: ['marketing.overview', 'marketing.campaigns'] },
  { id: 'banners', at: ['website.layout', 'website.layouts'] },
  { id: 'words', at: ['website.text', 'website.words'] },
  { id: 'blog', at: ['website.blog'] },
  { id: 'visitors', at: ['website.analytics'] },
  { id: 'profit', at: ['finance.pnl', 'money.profit'] },
  { id: 'rent', at: ['finance.costs', 'money.costs'] },
  { id: 'erpDue', at: ['finance.erp', 'money.overview'] },
  { id: 'courierCash', at: ['finance.couriers', 'couriers.claims', 'money.books'] },
  { id: 'districts', at: ['reports.areas'] },
  { id: 'monthly', at: ['reports.review', 'money.monthEnd'] },
  { id: 'keys', at: ['settings.keys'] },
  { id: 'backup', at: ['settings.backups', 'settings.system'] },
  { id: 'staff', at: ['settings.people', 'settings.team', 'settings.staffControls'] },
  { id: 'activity', at: ['settings.activity'] },
  { id: 'startFresh', at: ['settings.startFresh'] },
  { id: 'telegram', at: ['settings.telegram', 'support.approvals'] },
];

export interface BuiltMap {
  groups: MapGroup[];
  /** Every page, flat (the search runs over this). */
  pages: MapPage[];
  /** The tasks whose page is in the menu and the person may open. */
  tasks: (MapTask & { page: MapPage })[];
}

const groupOrder: readonly ShellGroup[] = [...SHELL_GROUPS, 'bottom'];

/** The map for one person (their keys); `sections` is the menu model (tests pass their own). */
export function buildAdminMap(viewer: ShellViewer, lines: MapLines, sections: readonly ShellSection[] = SHELL_SECTIONS): BuiltMap {
  const out: MapSection[] = [];
  for (const s of sections) {
    if (s.id === 'dashboard' || !sectionVisible(s, viewer)) continue;
    const pages: MapPage[] = [];
    for (const t of visibleTabs(s, viewer)) {
      const first = visiblePages(t, viewer)[0];
      if (!first) continue;
      const key = `${s.id}.${t.id}`;
      pages.push({ key, section: s.id, tab: t.id, href: first.href, perm: first.perm, more: !!t.more, line: lines[key] ?? '' });
    }
    if (pages.length) out.push({ id: s.id, group: s.group, href: pages[0]!.href, pages });
  }
  const groups = groupOrder.map((g) => ({ id: g, sections: out.filter((s) => s.group === g) })).filter((g) => g.sections.length);
  const flat = out.flatMap((s) => s.pages);
  const byKey = new Map(flat.map((p) => [p.key, p]));
  const tasks: BuiltMap['tasks'] = [];
  for (const task of MAP_TASKS) {
    const page = task.at.map((k) => byKey.get(k)).find(Boolean);
    if (page) tasks.push({ ...task, page });
  }
  return { groups, pages: flat, tasks };
}

/** Pages the menu has but the messages have no line for (what the nav patch lists to write). */
export const pagesWithoutLine = (m: BuiltMap): string[] => m.pages.filter((p) => !p.line).map((p) => p.key);

/** Lines in the messages for a page the menu does not have (stale after a rename). */
export const staleLines = (lines: MapLines, sections: readonly ShellSection[] = SHELL_SECTIONS): string[] => {
  const have = new Set(sections.flatMap((s) => s.tabs.map((t) => `${s.id}.${t.id}`)));
  return Object.keys(lines).filter((k) => !have.has(k));
};

const words = (s: string) => s.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);

/**
 * Search: every word typed must be in the haystack (page name, line, section name, or a task's words). Pages and
 * tasks are answered together, tasks first (they are the questions people ask).
 */
export function searchMap(q: string, items: readonly { id: string; hay: string }[]): string[] {
  const w = words(q);
  if (!w.length) return items.map((i) => i.id);
  return items.filter((i) => {
    const h = i.hay.toLowerCase();
    return w.every((x) => h.includes(x));
  }).map((i) => i.id);
}
