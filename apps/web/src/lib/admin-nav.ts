// PR 500 — the admin's pages as data. Only pages that exist are listed (no dead links): each later PR adds its own
// entry when it builds its screen. Labels are keys into messages/admin.<lang>.json (`nav.<key>`). `system` pages also
// form the strip of tabs at the top of each System page (demo ZV_TABS: server, cache, images, speed, backup, keys).
// `catalogue` pages (PR 21, 35) sit under their own heading and form the strip of tabs on the product pages; the
// `inventory` pages (S09) do the same on the stock pages, the `rules` pages (S10) on Smart Rules and notices, and the
// `delivery` pages (S06) on the delivery pages.
export type AdminIcon = 'lock' | 'back' | 'logout' | 'box' | 'check' | 'ruler' | 'plus' | 'doc' | 'eye' | 'sync' | 'barcode' | 'list' | 'bolt' | 'notice' | 'layers' | 'truck';

export interface AdminPage {
  key: string;
  href: string;
  icon: AdminIcon;
  group: 'main' | 'catalogue' | 'combos' | 'inventory' | 'rules' | 'delivery' | 'system';
}

/** The sidebar's headed groups, in order (labels: `frame.groups.<group>`). */
export const ADMIN_GROUPS = ['catalogue', 'combos', 'inventory', 'rules', 'delivery', 'system'] as const;

export const ADMIN_PAGES: readonly AdminPage[] = [
  { key: 'products', href: '/admin/products', icon: 'box', group: 'catalogue' },
  { key: 'publishQueue', href: '/admin/products/queue', icon: 'check', group: 'catalogue' },
  // PR 6 — the Server page (demo #/admin/server): for now the background worker's part (heartbeat, leader, failed jobs)
  { key: 'server', href: '/admin/server', icon: 'layers', group: 'system' },
  { key: 'integrations', href: '/admin/integrations', icon: 'lock', group: 'system' },
  // PR 28 — size charts (demo #/admin/size-charts)
  { key: 'sizeCharts', href: '/admin/size-charts', icon: 'ruler', group: 'catalogue' },
  // PR 33 import from a link · PR 39 product audit · PR 36 back in stock (no demo screen: the product pages' style)
  { key: 'productImport', href: '/admin/products/import', icon: 'plus', group: 'catalogue' },
  { key: 'productAudit', href: '/admin/products/audit', icon: 'doc', group: 'catalogue' },
  { key: 'backInStock', href: '/admin/products/back-in-stock', icon: 'eye', group: 'catalogue' },
  // S09 · PR 202–207 — stock and the ERP sync (health panel, re-sync, documents, low stock), stock counts, movements
  { key: 'stock', href: '/admin/stock', icon: 'sync', group: 'inventory' },
  { key: 'stockCounts', href: '/admin/stock/counts', icon: 'barcode', group: 'inventory' },
  { key: 'stockMovements', href: '/admin/stock/movements', icon: 'list', group: 'inventory' },
  // S10 · PR 208–219 — Smart Rules (demo #/admin/rules) and the notices and pop-ups that quote them (PR 216)
  { key: 'rules', href: '/admin/rules', icon: 'bolt', group: 'rules' },
  { key: 'notices', href: '/admin/rules/notices', icon: 'notice', group: 'rules' },
  // S03 · PR 90, 571 — combos and customer sets (demo #/admin/combos), in their own section (the owner's biggest seller)
  { key: 'combos', href: '/admin/combos', icon: 'layers', group: 'combos' },
  // S06 · PR 550, 551 — the delivery bands, the sub-area list and the address check (demo: the Couriers page's
  // "Three delivery bands" card and Settings › Delivery)
  { key: 'delivery', href: '/admin/delivery', icon: 'truck', group: 'delivery' },
];

export const ADMIN_HOME = ADMIN_PAGES[0]?.href ?? '/admin/login';
export const ADMIN_LOGIN = '/admin/login';
/** The EN | বাং switch's choice (not a secret; read by the server to pick the messages file). */
export const ADMIN_LANG_COOKIE = 'admin_lang';

/** Only a path inside the admin may be a "come back here after sign-in" target (no open redirect). */
export function safeNext(v: string | string[] | undefined | null, fallback: string = ADMIN_HOME): string {
  const s = Array.isArray(v) ? v[0] : v;
  return s && /^\/admin(\/[a-z0-9-]+)*$/.test(s) && !s.startsWith(ADMIN_LOGIN) ? s : fallback;
}
