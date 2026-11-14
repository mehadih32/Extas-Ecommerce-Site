// PR 659 (CN-048) — the admin menu as the prototype v5 draws it (docs/demo/admin-proto-v5/js/core.js `A.NAV`): per
// section, the tabs in the prototype's order and words. This file is the one place that says which real tab (and which
// pages) each prototype tab is; `sections.ts` stays the plain list of every built page and applies this on top.
//   - A prototype tab names the real tab ids it is made of: the first is the tab, the others join it (their pages become
//     the tab's chips). A real tab the prototype has no tab for moves under "More ▾" (nothing is deleted, no address
//     changes). A prototype tab whose page is not built yet is left out until it is (`AWAITING`).
//   - A section none of whose prototype tabs is built keeps its tabs as they are (nothing disappears before its pages land).
//   - Pages built in lanes that could not edit the shared files (the NAV-PATCH notes of waves 4A, 4B, 5A, 5B) are listed
//     in `PENDING`. A pending page shows in the menu only once its page file is merged: `nav-pending.json` lists the keys
//     still waiting, and `node tools/nav/activate-pending.mjs` takes out those whose page now exists. The test
//     `nav-v5.test.ts` fails with that instruction when a page has landed and the list was not updated.
// Words: messages/admin-shell.<lang>.json (`shell.tab.<section>.<tab>`, `nav.<page key>`). No React, no database.
import type { PermissionKey } from '@extas/auth';
import type { AdminSectionId } from '@extas/settings';
import pendingJson from './nav-pending.json';
import type { ShellPage, ShellSection, ShellTab } from './sections';

export interface V5Tab {
  /** The prototype's tab id (`A.NAV` in core.js). */
  proto: string;
  /** The real tab ids: the first is the tab; the rest are folded into it (their pages follow, in this order). */
  real: readonly string[];
  /** The tab's pages in this order (page addresses); pages not listed keep their place after these. */
  order?: readonly string[];
}

/** Prototype section id (core.js `A.NAV[].id`) → the real section id. */
export const V5_SECTION: Readonly<Record<string, AdminSectionId>> = {
  home: 'dashboard',
  orders: 'orders',
  couriers: 'delivery',
  products: 'products',
  customers: 'customers',
  inbox: 'support',
  rules: 'rules',
  marketing: 'marketing',
  website: 'website',
  finance: 'money',
  reports: 'reports',
  ai: 'ai',
  settings: 'settings',
};

export const NAV_V5: Readonly<Partial<Record<AdminSectionId, readonly V5Tab[]>>> = {
  orders: [
    { proto: 'batch', real: ['batch'] },
    { proto: 'all', real: ['all'] },
    { proto: 'processing', real: ['confirm'] },
    { proto: 'ship', real: ['packing'] },
    { proto: 'courier', real: ['courier'] },
    { proto: 'returns', real: ['returns'] },
    { proto: 'incomplete', real: ['incomplete'] },
  ],
  delivery: [
    { proto: 'overview', real: ['overview'] },
    { proto: 'c360', real: ['courier360'] },
    { proto: 'claims', real: ['claims'] },
    { proto: 'setup', real: ['setup', 'zones', 'couriers', 'settings'] },
  ],
  products: [
    { proto: 'all', real: ['all'] },
    { proto: 'add', real: ['add'] },
    { proto: 'stock', real: ['stock'] },
    { proto: 'ranking', real: ['ranking'] },
    { proto: 'combos', real: ['combos'] },
    { proto: 'sets', real: ['sets'] },
    { proto: 'reviews', real: ['reviews'] },
    { proto: 'sizecharts', real: ['charts'] },
  ],
  customers: [
    { proto: 'all', real: ['all'] },
    { proto: 'groups', real: ['segments'] },
    { proto: 'loyalty', real: ['loyalty'] },
    { proto: 'merge', real: ['review'] },
  ],
  support: [
    { proto: 'chats', real: ['inbox'] },
    { proto: 'replies', real: ['replies'] },
    { proto: 'stats', real: ['analytics'] },
  ],
  rules: [
    { proto: 'all', real: ['all'] },
    { proto: 'coupons', real: ['offers'] },
    { proto: 'popups', real: ['popups'] },
  ],
  marketing: [
    { proto: 'overview', real: ['overview'] },
    { proto: 'campaigns', real: ['campaigns'] },
    { proto: 'messages', real: ['messages'] },
    { proto: 'audiences', real: ['audiences'] },
    { proto: 'calendar', real: ['calendar'] },
    { proto: 'plan', real: ['plan'] },
    // Ad accounts, Influencers & affiliates, Landing pages, Refer a friend, Shopping feed (Studio stays its own tab: it is hidden with its closed stages)
    { proto: 'tools', real: ['adPlatforms', 'affiliates', 'landing', 'referrals', 'merchantFeed'] },
  ],
  website: [
    { proto: 'layout', real: ['layouts'] },
    { proto: 'text', real: ['words'] },
    { proto: 'policies', real: ['policies'] },
    { proto: 'blog', real: ['blog'] },
    { proto: 'analytics', real: ['analytics'] },
    { proto: 'seo', real: ['seo'] },
  ],
  money: [
    { proto: 'overview', real: ['overview'] },
    { proto: 'cash', real: ['cash'] },
    { proto: 'pnl', real: ['profit'] },
    {
      proto: 'costs',
      real: ['costs', 'expenses', 'fees', 'ledger'],
      order: ['/admin/money/costs', '/admin/money/expenses', '/admin/money/fees', '/admin/money/cost-ledger', '/admin/money/cost-ledger/report', '/admin/money/budgets'],
    },
    { proto: 'erp', real: ['erp', 'books', 'match', 'differences', 'closes', 'daily', 'monthEnd'] },
    { proto: 'couriers', real: ['couriers'] },
    { proto: 'wallet', real: ['refunds'] },
    { proto: 'vat', real: ['vat'] },
  ],
  reports: [
    { proto: 'overview', real: ['library'] },
    { proto: 'sales', real: ['orders'] },
    { proto: 'profit', real: ['profitReport'] },
    { proto: 'products', real: ['productsReport'] },
    { proto: 'customers', real: ['customers'] },
    { proto: 'delivery', real: ['delivery'] },
    { proto: 'couriers', real: ['couriers'] },
    { proto: 'marketing', real: ['marketingReport'] },
    { proto: 'areas', real: ['areas'] },
    { proto: 'team', real: ['team'] },
    { proto: 'review', real: ['monthlyReview'] },
  ],
  ai: [
    { proto: 'approvals', real: ['approvals'] },
    { proto: 'agents', real: ['agents'] },
    { proto: 'costs', real: ['costBook'] },
    { proto: 'train', real: ['train'] },
  ],
  settings: [
    // Business: Store details, Policies, People, Roles, Staff controls, ERP link, Admin look, Demo products
    {
      proto: 'store',
      real: ['store', 'policies', 'people', 'roles', 'staffControls', 'erp', 'look'],
      order: ['/admin/settings/store', '/admin/settings/policies', '/admin/settings/people', '/admin/settings/roles', '/admin/settings/staff-controls', '/admin/settings/erp-link', '/admin/settings/look', '/admin/products/demo'],
    },
    // System (owner): Keys and connections, Telegram approvals, Backups and system, Security, Activity log, Privacy, Start fresh
    {
      proto: 'keys',
      real: ['keys', 'telegramApprovals', 'system', 'security', 'activity', 'privacy', 'startFresh'],
      order: ['/admin/integrations', '/admin/settings/telegram-approvals', '/admin/settings/system/cache', '/admin/settings/system/backups', '/admin/settings/system/go-live', '/admin/settings/security', '/admin/settings/security/edge', '/admin/settings/activity', '/admin/settings/privacy', '/admin/settings/start-fresh'],
    },
  ],
};

/**
 * Prototype tabs with no built page yet, as `<real section>.<proto tab>`. The pages are in lanes not merged yet (couriers
 * wave 2, rules wave 3, the shop's report and set tabs) and bring their own tab in `sections.ts`; a tab that appears is
 * placed by `NAV_V5` at once. When one of these is built, take it off this list (`nav-v5.test.ts` says so).
 */
export const AWAITING: readonly string[] = [
  'website.policies',
  'reports.profit', 'reports.products', 'reports.marketing', 'reports.review',
  'ai.train',
];

export interface PendingPage {
  /** `<section>.<tab>` or `<section>.<tab>.<page>`: the key in nav-pending.json. */
  key: string;
  /** The register PR that built the page. */
  pr: number;
  section: AdminSectionId;
  /** The real tab it joins (made when missing, under More unless `main`). */
  tab: string;
  /** The page goes first in its tab. */
  first?: boolean;
  page: ShellPage;
}

const page = (href: string, perm: PermissionKey, ...keys: string[]): ShellPage => ({ href, perm, keys });

/** Every page built in a lane that could not edit the shared files (NAV-PATCH notes of waves 4A, 4B, 5A, 5B). */
export const PENDING: readonly PendingPage[] = [
  // wave 4A
  { key: 'products.reviews.faqs', pr: 682, section: 'products', tab: 'reviews', page: page('/admin/products/faqs', 'catalogue.read', 'productFaqs') },
  { key: 'settings.store.demo', pr: 684, section: 'settings', tab: 'store', page: page('/admin/products/demo', 'catalogue.read', 'productDemo') },
  // wave 4B
  { key: 'products.ranking', pr: 686, section: 'products', tab: 'ranking', page: page('/admin/products/ranking', 'catalogue.read', 'productRanking') },
  { key: 'money.cash', pr: 687, section: 'money', tab: 'cash', page: page('/admin/money/cash', 'books.read', 'moneyCash') },
  { key: 'money.costs.budgets', pr: 688, section: 'money', tab: 'costs', page: page('/admin/money/budgets', 'books.read', 'moneyBudgets') },
  { key: 'reports.library', pr: 689, section: 'reports', tab: 'library', first: true, page: page('/admin/reports', 'reports.read', 'reportsLibrary') },
  { key: 'reports.packs', pr: 690, section: 'reports', tab: 'packs', page: page('/admin/reports/packs', 'reports.read', 'reportsPacks') },
  // wave 5A
  { key: 'support.replies', pr: 692, section: 'support', tab: 'replies', page: page('/admin/support/replies', 'support.reply', 'supportReplies') },
  { key: 'support.comments', pr: 693, section: 'support', tab: 'comments', page: page('/admin/support/comments', 'support.read', 'supportComments') },
  { key: 'support.comments.live', pr: 694, section: 'support', tab: 'comments', page: page('/admin/support/comments/live', 'support.read', 'supportCommentsLive') },
  { key: 'marketing.affiliates', pr: 695, section: 'marketing', tab: 'affiliates', page: page('/admin/marketing/affiliates', 'rules.read', 'marketingAffiliates') },
  { key: 'marketing.merchantFeed.meta', pr: 696, section: 'marketing', tab: 'merchantFeed', page: page('/admin/marketing/meta-feed', 'marketing.campaigns.read', 'marketingMetaFeed') },
  { key: 'marketing.messages.campaigns', pr: 697, section: 'marketing', tab: 'messages', first: true, page: page('/admin/marketing/message-campaigns', 'messages.journey.read', 'marketingMessageCampaigns') },
  { key: 'marketing.messages.ceilings', pr: 698, section: 'marketing', tab: 'messages', page: page('/admin/messages/cost-ceilings', 'messages.channels.read', 'messagesCostCeilings') },
  { key: 'marketing.overview', pr: 699, section: 'marketing', tab: 'overview', page: page('/admin/marketing/overview', 'marketing.campaigns.read', 'marketingOverview') },
  { key: 'marketing.plan', pr: 699, section: 'marketing', tab: 'plan', page: page('/admin/marketing/plan', 'marketing.campaigns.read', 'marketingPlan') },
  // wave 5B
  { key: 'website.analytics', pr: 700, section: 'website', tab: 'analytics', page: page('/admin/website/analytics', 'reports.read', 'websiteAnalytics') },
  { key: 'website.analytics.behaviour', pr: 701, section: 'website', tab: 'analytics', page: page('/admin/website/analytics/behaviour', 'reports.read', 'webAnalytics.behaviour') },
  { key: 'settings.staffControls', pr: 702, section: 'settings', tab: 'staffControls', page: page('/admin/settings/staff-controls', 'staff.read', 'staffControls') },
  { key: 'settings.telegramApprovals', pr: 703, section: 'settings', tab: 'telegramApprovals', page: page('/admin/settings/telegram-approvals', 'settings.write', 'telegramApprovals') },
  { key: 'orders.bulk', pr: 704, section: 'orders', tab: 'bulk', page: page('/admin/orders/bulk', 'orders.read', 'ordersBulk') },
  { key: 'settings.people', pr: 705, section: 'settings', tab: 'people', page: page('/admin/settings/people', 'staff.read', 'people') },
  { key: 'settings.roles', pr: 705, section: 'settings', tab: 'roles', page: page('/admin/settings/roles', 'roles.read', 'roles') },
  { key: 'settings.activity', pr: 705, section: 'settings', tab: 'activity', page: page('/admin/settings/activity', 'audit.read', 'activity') },
  { key: 'settings.startFresh', pr: 706, section: 'settings', tab: 'startFresh', page: page('/admin/settings/start-fresh', 'settings.write', 'startFresh') },
];

/** The keys of `PENDING` still waiting for their page (nav-pending.json). */
export const stillPending = (): ReadonlySet<string> => new Set(pendingJson.waiting);

const clone = (t: ShellTab): ShellTab => ({ ...t, pages: [...t.pages] });

/** Adds the pages that have landed (every pending entry not in nav-pending.json) to a copy of the section's tabs. */
export function withLandedPages(section: ShellSection, waiting: ReadonlySet<string> = stillPending()): ShellTab[] {
  const tabs = section.tabs.map(clone);
  for (const p of PENDING) {
    if (p.section !== section.id || waiting.has(p.key)) continue;
    let tab = tabs.find((t) => t.id === p.tab);
    if (!tab) {
      tab = { id: p.tab, more: true, pages: [] };
      tabs.push(tab);
    }
    if (tab.pages.some((x) => x.href === p.page.href)) continue;
    tab.pages = p.first ? [p.page, ...tab.pages] : [...tab.pages, p.page];
  }
  return tabs;
}

/** The section as the prototype draws it: its tabs in `A.NAV` order and words, every other tab under More. */
export function applyNavV5(section: ShellSection, waiting: ReadonlySet<string> = stillPending()): ShellSection {
  const spec = NAV_V5[section.id];
  const tabs = withLandedPages(section, waiting);
  if (!spec) return tabs.length === section.tabs.length ? section : { ...section, tabs };
  const byId = new Map(tabs.map((t) => [t.id, t]));
  const used = new Set<string>();
  const main: ShellTab[] = [];
  for (const s of spec) {
    const found = s.real.map((id) => byId.get(id)).filter((t): t is ShellTab => !!t);
    if (!found.length) continue;
    for (const f of found) used.add(f.id);
    const head = found[0]!;
    const pages = found.flatMap((f) => f.pages);
    const rank = (p: ShellPage) => {
      const i = s.order?.indexOf(p.href) ?? -1;
      return i < 0 ? Number.MAX_SAFE_INTEGER : i;
    };
    const ordered = s.order ? [...pages].sort((a, b) => rank(a) - rank(b)) : pages;
    const tab: ShellTab = { ...head, pages: ordered };
    delete tab.more;
    main.push(tab);
  }
  if (!main.length) return tabs.length === section.tabs.length ? section : { ...section, tabs };
  const others = tabs.filter((t) => !used.has(t.id)).map((t) => ({ ...t, more: true }));
  return { ...section, tabs: [...main, ...others] };
}
