// PR 12 — SH-02, the command palette's server side (`GET /api/admin/search?q=`, docs/BACKEND-ARCHITECTURE.md §5.1).
// What it finds, in this order, at most `admin.shell.searchPerGroup` per group:
//   - Pages & tabs: every built page the person may open, by its English and Bengali name and a few extra words;
//   - Settings: the cards of built pages that hold settings (delivery bands, the sub-area list, keys & connections,
//     the stock and ERP panels), opening the page at the card;
//   - Products: name (English or Bengali), SKU or barcode (needs `catalogue.read`);
//   - Orders: order number or phone in any form (01…, +880…, Bengali digits) — opens the order's invoice page, the order
//     page that exists today (needs `orders.invoice`; the order screens of S05 take over the link);
//   - Customers: name or phone (also `orders.invoice`, the key that already shows customers' details) — opens their
//     latest order;
//   - Actions (">"): only those the person may do; Help ("?"): the guide of each section they can see.
// "#" searches order numbers only. Bengali digits count as digits. Store-aware: one store's records only.
import type { Prisma, PrismaClient } from '@extas/db/client';
import { connectionCatalogue } from '@extas/adapters';
import type { PermissionKey } from '@extas/auth';
import deliveryBn from '../../../messages/admin-delivery.bn.json';
import deliveryEn from '../../../messages/admin-delivery.en.json';
import { adminDicts, type AdminLang } from '../admin-i18n';
import { t, type Dict } from '../i18n';
import { latinDigits, phoneNormalizeBD } from '../phone-bd';
import type { ShellIconName } from './icons';
import { guideOf, sectionHome, sectionVisible, SHELL_SECTIONS, visiblePages, visibleTabs, type ShellTab, type ShellViewer } from './sections';

export type SearchGroupId = 'jump' | 'pages' | 'settings' | 'products' | 'orders' | 'customers' | 'actions' | 'help';

export interface SearchItem {
  label: string;
  sub?: string;
  /** Where it opens; a Help item opens the guide panel (`guide`) instead. */
  href?: string;
  guide?: { slug: string; section: string };
  icon: ShellIconName;
}

export interface SearchGroup {
  id: SearchGroupId;
  label: string;
  items: SearchItem[];
}

export interface SearchLimits {
  perGroup: number;
  minChars: number;
}

export interface SearchContext {
  db: PrismaClient | null;
  storeId: number;
  lang: AdminLang;
  viewer: ShellViewer;
  limits: SearchLimits;
}

interface Entry {
  words: string[];
  item: (lang: AdminLang) => SearchItem;
  perm: PermissionKey | null;
}

const fold = (s: string) => latinDigits(s).toLowerCase().normalize('NFC');
const both = (key: string, dicts: Record<AdminLang, Dict> = adminDicts) => [t(dicts.en, key), t(dicts.bn, key)];
const deliveryDicts: Record<AdminLang, Dict> = { en: deliveryEn as Dict, bn: deliveryBn as Dict };

/** Built pages, each with its section's name, its tab's name and its own (sub-page) name in both languages. */
function pageEntries(v: ShellViewer): Entry[] {
  const out: Entry[] = [];
  for (const s of SHELL_SECTIONS) {
    if (!sectionVisible(s, v)) continue;
    const sec = (lang: AdminLang) => t(adminDicts[lang], `shell.sec.${s.id}`);
    const tabs = visibleTabs(s, v);
    if (!tabs.length) {
      out.push({ perm: null, words: [...both(`shell.sec.${s.id}`), ...both(`shell.syn.${s.id}`)], item: (lang) => ({ label: sec(lang), sub: t(adminDicts[lang], 'shell.palette.section'), href: sectionHome(s, v), icon: s.icon }) });
      continue;
    }
    for (const tab of tabs) {
      const pages = visiblePages(tab, v);
      pages.forEach((p, i) => {
        const tabKey = `shell.tab.${s.id}.${tab.id}`;
        const subKey = pages.length > 1 && i > 0 ? `nav.${p.keys[0]}` : null;
        out.push({
          perm: p.perm,
          // The section's other words (shell.syn) find only its first page, so "polo" opens Products, not every tab.
          words: [...both(`shell.sec.${s.id}`), ...both(tabKey), ...(subKey ? both(subKey) : []), ...(tab === tabs[0] && i === 0 ? both(`shell.syn.${s.id}`) : [])],
          item: (lang) => ({ label: subKey ? t(adminDicts[lang], subKey) : t(adminDicts[lang], tabKey), sub: sec(lang), href: p.href, icon: s.icon }),
        });
      });
    }
  }
  return out;
}

/** The setting cards of built pages: the page opens at the card. */
function settingEntries(): Entry[] {
  const card = (perm: PermissionKey, href: string, label: (lang: AdminLang) => string, where: (lang: AdminLang) => string, words: string[]): Entry => ({
    perm,
    words,
    item: (lang) => ({ label: label(lang), sub: where(lang), href, icon: 'sliders' }),
  });
  const zones = (lang: AdminLang) => `${t(adminDicts[lang], 'shell.sec.delivery')} › ${t(adminDicts[lang], 'shell.tab.delivery.zones')}`;
  const stock = (lang: AdminLang) => `${t(adminDicts[lang], 'shell.sec.products')} › ${t(adminDicts[lang], 'shell.tab.products.stock')}`;
  const keys = (lang: AdminLang) => `${t(adminDicts[lang], 'shell.sec.settings')} › ${t(adminDicts[lang], 'shell.tab.settings.keys')}`;
  const out: Entry[] = [
    card('delivery.read', '/admin/delivery/zones#dl-bands-h', (l) => t(deliveryDicts[l], 'bands.title'), zones, both('bands.title', deliveryDicts)),
    card('delivery.read', '/admin/delivery/zones#dl-list-h', (l) => t(deliveryDicts[l], 'list.title'), zones, both('list.title', deliveryDicts)),
    card('delivery.read', '/admin/delivery/zones#dl-try-h', (l) => t(deliveryDicts[l], 'try.title'), zones, both('try.title', deliveryDicts)),
    card('inventory.read', '/admin/stock#st-erp', (l) => t(adminDicts[l], 'stock.erp.title'), stock, both('stock.erp.title')),
    card('inventory.read', '/admin/stock#st-low', (l) => t(adminDicts[l], 'stock.low.title'), stock, both('stock.low.title')),
    card('inventory.read', '/admin/stock#st-docs', (l) => t(adminDicts[l], 'stock.docs.title'), stock, both('stock.docs.title')),
  ];
  for (const c of connectionCatalogue) {
    const k = `connections.${c.id}.name`;
    out.push(card('vault.read', '/admin/integrations', (l) => t(adminDicts[l], k), keys, [...both(k), ...both(`connections.${c.id}.desc`)]));
  }
  return out;
}

/** What the person may start from the palette (">"). */
function actionEntries(): Entry[] {
  const act = (perm: PermissionKey, href: string, key: string, icon: ShellIconName): Entry => ({ perm, words: both(`shell.actions.${key}`), item: (lang) => ({ label: t(adminDicts[lang], `shell.actions.${key}`), href, icon }) });
  return [act('catalogue.write', '/admin/products/new', 'newProduct', 'shirt'), act('combos.write', '/admin/combos?tab=new', 'newCombo', 'layers'), act('inventory.audit', '/admin/stock/counts', 'newCount', 'check')];
}

/** The guides of the sections the person can see ("?"). */
/** The guide of each section the person may open, and of each of its tabs that has its own (stock, size charts …). */
function helpEntries(v: ShellViewer): Entry[] {
  const common = [...both('shell.palette.groups.help'), ...both('shell.guide.button')];
  return SHELL_SECTIONS.filter((s) => sectionVisible(s, v)).flatMap((s) => {
    const own = (tab: ShellTab | null): Entry => ({
      perm: null,
      words: [...both(`shell.sec.${s.id}`), ...(tab ? both(`shell.tab.${s.id}.${tab.id}`) : both(`shell.syn.${s.id}`)), ...common],
      item: (lang) => {
        const d = adminDicts[lang];
        const section = tab ? t(d, `shell.tab.${s.id}.${tab.id}`) : t(d, `shell.sec.${s.id}`);
        return { label: t(d, 'shell.palette.guide', { section }), sub: t(d, 'shell.palette.groups.help'), guide: { slug: guideOf({ section: s, tab, page: null }), section }, icon: 'book' };
      },
    });
    return [own(null), ...visibleTabs(s, v).filter((tab) => tab.guide).map((tab) => own(tab))];
  });
}

const allowed = (e: Entry, v: ShellViewer) => !e.perm || v.owner || v.perms.has(e.perm);
const has = (v: ShellViewer, k: PermissionKey) => v.owner || v.perms.has(k);
const matches = (e: Entry, q: string) => e.words.some((w) => fold(w).includes(q));

/** The query's mode (">" actions, "#" orders, "?" help) and its words, Bengali digits as digits. */
export function parseQuery(raw: string): { mode: '' | '>' | '#' | '?'; q: string; digits: string } {
  let s = fold(String(raw ?? '')).trim();
  let mode: '' | '>' | '#' | '?' = '';
  if (/^[>#?]/.test(s)) {
    mode = s[0] as '>' | '#' | '?';
    s = s.slice(1).trim();
  }
  return { mode, q: s.slice(0, 80), digits: s.replace(/\D/g, '') };
}

async function productItems(ctx: SearchContext, q: string): Promise<SearchItem[]> {
  if (!ctx.db) return [];
  const rows = await ctx.db.product.findMany({
    where: {
      storeId: ctx.storeId,
      archivedAt: null,
      OR: [
        { nameEn: { contains: q, mode: 'insensitive' } },
        { nameBn: { contains: q, mode: 'insensitive' } },
        { variants: { some: { OR: [{ sku: { contains: q, mode: 'insensitive' } }, { barcode: { equals: q } }] } } },
      ],
    },
    orderBy: { updatedAt: 'desc' },
    take: ctx.limits.perGroup,
    select: { id: true, nameEn: true, nameBn: true, status: true },
  });
  return rows.map((p) => ({
    label: (ctx.lang === 'bn' ? p.nameBn : null) || p.nameEn,
    sub: t(adminDicts[ctx.lang], `products.status.${p.status}`),
    href: `/admin/products/${p.id}`,
    icon: 'shirt' as const,
  }));
}

const invoiceHref = (number: string) => `/account/orders/${encodeURIComponent(number)}/invoice`;

async function orderItems(ctx: SearchContext, q: string, digits: string, numbersOnly: boolean): Promise<SearchItem[]> {
  if (!ctx.db || !q) return [];
  const phone = phoneNormalizeBD(q);
  const or: Prisma.OrderWhereInput[] = [{ number: { contains: q, mode: 'insensitive' } }];
  if (!numbersOnly && phone.ok) or.push({ phone: { in: [phone.e164, phone.digits, phone.nice] } }, { customer: { phone: phone.e164 } });
  if (!numbersOnly && !phone.ok && !digits && q.length >= ctx.limits.minChars) or.push({ customerName: { contains: q, mode: 'insensitive' } });
  const rows = await ctx.db.order.findMany({
    where: { storeId: ctx.storeId, status: { not: 'DRAFT' }, OR: or },
    orderBy: { placedAt: 'desc' },
    take: ctx.limits.perGroup,
    select: { number: true, customerName: true, status: true },
  });
  const d = adminDicts[ctx.lang];
  return rows.map((o) => ({ label: o.customerName ? `${o.number} · ${o.customerName}` : o.number, sub: t(d, 'shell.palette.invoice'), href: invoiceHref(o.number), icon: 'bag' as const }));
}

async function customerItems(ctx: SearchContext, q: string, digits: string): Promise<SearchItem[]> {
  if (!ctx.db) return [];
  const phone = phoneNormalizeBD(q);
  const where = phone.ok ? { phone: phone.e164 } : digits ? null : { name: { contains: q, mode: 'insensitive' as const } };
  if (!where) return [];
  const rows = await ctx.db.customer.findMany({
    where: { storeId: ctx.storeId, archivedAt: null, erasedAt: null, ...where },
    orderBy: { lastOrderAt: { sort: 'desc', nulls: 'last' } },
    take: ctx.limits.perGroup,
    select: { name: true, orderCount: true, orders: { where: { status: { not: 'DRAFT' } }, orderBy: { placedAt: 'desc' }, take: 1, select: { number: true } } },
  });
  const d = adminDicts[ctx.lang];
  return rows.flatMap((c) => {
    const last = c.orders[0];
    return last ? [{ label: c.name || last.number, sub: t(d, 'shell.palette.orders', { n: c.orderCount }), href: invoiceHref(last.number), icon: 'users' as const }] : [];
  });
}

/** Runs one search. Records need the setting's minimum of typed characters; pages, settings and help need one. */
export async function adminSearch(ctx: SearchContext, raw: string): Promise<SearchGroup[]> {
  const { mode, q, digits } = parseQuery(raw);
  const v = ctx.viewer;
  const d = adminDicts[ctx.lang];
  const out: SearchGroup[] = [];
  const add = (id: SearchGroupId, items: SearchItem[]) => {
    // The empty box's "Jump to" lists every section the person may open; a search keeps each group short.
    if (items.length) out.push({ id, label: t(d, `shell.palette.groups.${id}`), items: id === 'jump' ? items : items.slice(0, ctx.limits.perGroup) });
  };
  const pick = (entries: Entry[]) => entries.filter((e) => allowed(e, v) && (!q || matches(e, q))).map((e) => e.item(ctx.lang));

  if (!q && !mode) {
    add(
      'jump',
      SHELL_SECTIONS.filter((s) => sectionVisible(s, v)).map((s) => ({ label: t(d, `shell.sec.${s.id}`), sub: s.group === 'bottom' ? undefined : t(d, `shell.groups.${s.group}`), href: sectionHome(s, v), icon: s.icon })),
    );
    add('actions', pick(actionEntries()));
    return out;
  }
  if (mode === '>') {
    add('actions', pick(actionEntries()));
    return out;
  }
  if (mode === '?') {
    add('help', pick(helpEntries(v)));
    return out;
  }
  if (!mode) {
    add('pages', pick(pageEntries(v)));
    add('settings', pick(settingEntries()));
  }
  const records = q.length >= ctx.limits.minChars || (mode === '#' && q.length > 0);
  if (records && ctx.db) {
    const [products, orders, customers] = await Promise.all([
      !mode && has(v, 'catalogue.read') ? productItems(ctx, q) : [],
      has(v, 'orders.invoice') ? orderItems(ctx, q, digits, mode === '#') : [],
      !mode && has(v, 'orders.invoice') ? customerItems(ctx, q, digits) : [],
    ]);
    add('orders', orders);
    add('products', products);
    add('customers', customers);
  }
  if (!mode) {
    add('actions', pick(actionEntries()));
    add('help', pick(helpEntries(v)));
  }
  return out;
}
