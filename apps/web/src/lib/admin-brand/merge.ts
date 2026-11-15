// PR 726 — Website › Brand & menus: an edited card folded back onto the stored settings (server side only: it checks
// every word and address with the settings' own schemas). Nothing is dropped silently: a built-in row (one the shop
// ships with) can be hidden or reworded but never taken out, a custom row the owner added can be taken out of the
// list (the audit row keeps what it was), and everything the card does not show is kept as it was stored.
import { announceSchema, footerSchema, headerSchema, menuSchema, shopPathSchema, type ShellAnnounce, type ShellFooter, type ShellHeader, type ShellMenu } from '@extas/settings';
import { blockOrderOf, collapseLabel, type Pair, type Words } from './model';

export type Merge<T> = { ok: true; value: T } | { ok: false; details: string[] };
const bad = (...details: string[]): { ok: false; details: string[] } => ({ ok: false, details });

type Obj = Record<string, unknown>;
export const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);
const arr = (v: unknown): unknown[] | null => (Array.isArray(v) ? v : null);

/** A pair from the wire: undefined = malformed, null = none. */
export function pairOf(v: unknown): Pair | null | undefined {
  if (v === null || v === undefined) return null;
  if (!isObj(v) || typeof v.en !== 'string' || typeof v.bn !== 'string') return undefined;
  return { en: v.en, bn: v.bn };
}

const paths = (issues: readonly { path: PropertyKey[] }[]) => [...new Set(issues.map((i) => i.path.map(String).join('.') || 'value'))].slice(0, 12);

/** An address in the shop: empty means none. */
function pathOrNone(v: unknown): string | null | undefined {
  if (v === undefined || v === null || v === '') return null;
  if (typeof v !== 'string') return undefined;
  const s = v.trim();
  return shopPathSchema.safeParse(s).success ? s : undefined;
}

type FooterLink = ShellFooter['columns'][number]['links'][number];

/** PR 745: a link's little picture and the screens it shows on, from the wire ('' and 'both' mean "as the shop has it"); undefined = malformed. */
function linkOptions(link: FooterLink, raw: Obj): boolean {
  const { icon, dev } = raw;
  if (icon !== undefined && icon !== null && typeof icon !== 'string') return false;
  if (dev !== undefined && dev !== 'both' && dev !== 'desk' && dev !== 'phone') return false;
  if (typeof icon === 'string') {
    if (icon) link.icon = icon as FooterLink['icon'];
    else delete link.icon;
  }
  if (dev === 'desk' || dev === 'phone') link.dev = dev;
  else if (dev === 'both') delete link.dev;
  return true;
}

export interface MenuStored {
  announce: ShellAnnounce;
  header: ShellHeader;
  menu: ShellMenu;
}

export function mergeMenu(cur: MenuStored, defaults: { announce: ShellAnnounce; menu: ShellMenu }, sent: unknown, words: Words): Merge<MenuStored> {
  if (!isObj(sent)) return bad('value');
  const messages = arr(sent.announce);
  const icons = arr(sent.icons);
  const items = arr(sent.items);
  if (!messages || !icons || !items || typeof sent.announceOn !== 'boolean') return bad('value');
  const details: string[] = [];

  // the announcement bar
  const curMsg = new Map(cur.announce.messages.map((m) => [m.id, m]));
  const builtMsg = new Set(defaults.announce.messages.map((m) => m.id));
  const outMsg: ShellAnnounce['messages'] = [];
  for (const raw of messages) {
    if (!isObj(raw) || typeof raw.id !== 'string' || typeof raw.on !== 'boolean') {
      details.push('announce');
      continue;
    }
    const base = curMsg.get(raw.id);
    const text = pairOf(raw.text);
    const href = pathOrNone(raw.href);
    if (text === undefined || href === undefined) {
      details.push(`announce.${raw.id}`);
      continue;
    }
    if (!base && !text) {
      details.push(`announce.${raw.id}`);
      continue;
    }
    const label = collapseLabel(text, base?.text, words);
    const msg = { ...(base ?? {}), id: raw.id, on: raw.on, text: label, href: href ?? undefined } as ShellAnnounce['messages'][number];
    if (!msg.href) delete msg.href;
    outMsg.push(msg);
  }
  for (const id of builtMsg) if (curMsg.has(id) && !outMsg.some((m) => m.id === id)) details.push(`announce.${id}`);

  // the header's icons: the same five, in the owner's order, each shown or hidden
  const outIcons: ShellHeader['icons'] = [];
  for (const raw of icons) {
    if (!isObj(raw) || typeof raw.id !== 'string' || typeof raw.on !== 'boolean') {
      details.push('icons');
      continue;
    }
    outIcons.push({ id: raw.id, on: raw.on } as ShellHeader['icons'][number]);
  }
  if (outIcons.length !== cur.header.icons.length) details.push('icons');

  // the menu's items
  const curItem = new Map(cur.menu.items.map((i) => [i.id, i]));
  const builtItem = new Set(defaults.menu.items.map((i) => i.id));
  const outItems: ShellMenu['items'] = [];
  for (const raw of items) {
    if (!isObj(raw) || typeof raw.id !== 'string' || typeof raw.on !== 'boolean' || typeof raw.desk !== 'boolean' || typeof raw.phone !== 'boolean') {
      details.push('items');
      continue;
    }
    const base = curItem.get(raw.id);
    const label = pairOf(raw.label);
    if (label === undefined) {
      details.push(`items.${raw.id}`);
      continue;
    }
    if (base) {
      const item = { ...base, on: raw.on, desk: raw.desk, phone: raw.phone } as ShellMenu['items'][number];
      if (label) item.label = collapseLabel(label, base.label, words);
      if (base.kind === 'link') {
        const href = pathOrNone(raw.href);
        if (href === undefined || href === null) details.push(`items.${raw.id}.href`);
        else item.href = href;
      }
      outItems.push(item);
    } else {
      const href = pathOrNone(raw.href);
      if (!label || !href) {
        details.push(`items.${raw.id}`);
        continue;
      }
      outItems.push({ id: raw.id, kind: 'link', href, label: { en: label.en.trim(), bn: label.bn.trim() }, on: raw.on, desk: raw.desk, phone: raw.phone });
    }
  }
  for (const [id] of curItem) if (builtItem.has(id) && !outItems.some((i) => i.id === id)) details.push(`items.${id}`);
  if (details.length) return bad(...details);

  const announce = announceSchema.safeParse({ ...cur.announce, on: sent.announceOn, messages: outMsg });
  if (!announce.success) return bad(...paths(announce.error.issues).map((p) => `announce.${p}`));
  const header = headerSchema.safeParse({ ...cur.header, icons: outIcons });
  if (!header.success) return bad(...paths(header.error.issues).map((p) => `icons.${p}`));
  const menu = menuSchema.safeParse({ ...cur.menu, items: outItems });
  if (!menu.success) return bad(...paths(menu.error.issues).map((p) => `items.${p}`));
  return { ok: true, value: { announce: announce.data, header: header.data, menu: menu.data } };
}

export const SOCIAL_URL_IDS = ['facebook', 'instagram', 'youtube', 'tiktok'] as const;
export type SocialUrls = Record<(typeof SOCIAL_URL_IDS)[number], string | null>;

export interface FooterOut {
  footer: ShellFooter;
  /** The networks' addresses: null clears one. */
  urls: SocialUrls;
}

export function mergeFooter(cur: ShellFooter, defaults: ShellFooter, sent: unknown, words: Words): Merge<FooterOut> {
  if (!isObj(sent)) return bad('value');
  const promise = arr(sent.promise);
  const columns = arr(sent.columns);
  const social = arr(sent.social);
  const pay = arr(sent.pay);
  const copyright = pairOf(sent.copyright);
  const contact = sent.contact;
  const urlsIn = sent.urls;
  if (!promise || !columns || !social || !pay || !copyright || !isObj(contact) || !isObj(urlsIn)) return bad('value');
  if (typeof sent.promiseOn !== 'boolean' || typeof sent.joinOn !== 'boolean') return bad('value');
  const details: string[] = [];

  const builtPromise = new Set(defaults.promise.items.map((p) => p.id));
  const curPromise = new Map(cur.promise.items.map((p) => [p.id, p]));
  const outPromise: ShellFooter['promise']['items'] = [];
  for (const raw of promise) {
    if (!isObj(raw) || typeof raw.id !== 'string' || typeof raw.on !== 'boolean') {
      details.push('promise');
      continue;
    }
    const base = curPromise.get(raw.id);
    const text = pairOf(raw.text);
    if (text === undefined || (!base && !text)) {
      details.push(`promise.${raw.id}`);
      continue;
    }
    const label = collapseLabel(text, base?.text, words);
    outPromise.push({ ...(base ?? { icon: 'check' }), id: raw.id, text: label, on: raw.on } as ShellFooter['promise']['items'][number]);
  }
  for (const [id] of curPromise) if (builtPromise.has(id) && !outPromise.some((p) => p.id === id)) details.push(`promise.${id}`);

  const builtCol = new Set(defaults.columns.map((c) => c.id));
  const builtLink = new Set(defaults.columns.flatMap((c) => c.links.map((l) => l.id)));
  const curCol = new Map(cur.columns.map((c) => [c.id, c]));
  const curLink = new Map(cur.columns.flatMap((c) => c.links.map((l) => [l.id, l] as const)));
  const outCols: ShellFooter['columns'] = [];
  const seenLinks = new Set<string>();
  for (const rawCol of columns) {
    if (!isObj(rawCol) || typeof rawCol.id !== 'string' || typeof rawCol.on !== 'boolean') {
      details.push('columns');
      continue;
    }
    const baseCol = curCol.get(rawCol.id);
    const title = pairOf(rawCol.title);
    const links = arr(rawCol.links);
    if (!links || title === undefined || (!baseCol && !title)) {
      details.push(`columns.${rawCol.id}`);
      continue;
    }
    const outLinks: ShellFooter['columns'][number]['links'] = [];
    for (const rawLink of links) {
      if (!isObj(rawLink) || typeof rawLink.id !== 'string' || typeof rawLink.on !== 'boolean') {
        details.push(`columns.${rawCol.id}.links`);
        continue;
      }
      seenLinks.add(rawLink.id);
      const base = curLink.get(rawLink.id);
      const label = pairOf(rawLink.label);
      if (label === undefined) {
        details.push(`columns.${rawCol.id}.${rawLink.id}`);
        continue;
      }
      if (base) {
        const link = { ...base, on: rawLink.on } as FooterLink;
        if (!linkOptions(link, rawLink)) details.push(`columns.${rawCol.id}.${rawLink.id}.icon`);
        if (label && base.label) link.label = collapseLabel(label, base.label, words);
        if (!base.cat && !base.act) {
          const href = pathOrNone(rawLink.href);
          if (href === undefined || href === null) details.push(`columns.${rawCol.id}.${rawLink.id}.href`);
          else link.href = href;
          if (label && !base.label) link.label = { en: label.en.trim(), bn: label.bn.trim() };
        }
        outLinks.push(link);
      } else {
        const href = pathOrNone(rawLink.href);
        if (!label || !href) {
          details.push(`columns.${rawCol.id}.${rawLink.id}`);
          continue;
        }
        const fresh: FooterLink = { id: rawLink.id, href, label: { en: label.en.trim(), bn: label.bn.trim() }, on: rawLink.on };
        if (!linkOptions(fresh, rawLink)) details.push(`columns.${rawCol.id}.${rawLink.id}.icon`);
        outLinks.push(fresh);
      }
    }
    outCols.push({ ...(baseCol ?? {}), id: rawCol.id, title: collapseLabel(title, baseCol?.title, words) ?? { en: '', bn: '' }, on: rawCol.on, links: outLinks } as ShellFooter['columns'][number]);
  }
  for (const [id] of curCol) if (builtCol.has(id) && !outCols.some((c) => c.id === id)) details.push(`columns.${id}`);
  for (const [id] of curLink) if (builtLink.has(id) && !seenLinks.has(id)) details.push(`link.${id}`);

  const keepMarks = <T extends { id: string; on: boolean }>(raw: unknown[], stored: readonly T[], what: string): T[] => {
    const out: T[] = [];
    for (const r of raw) {
      if (!isObj(r) || typeof r.id !== 'string' || typeof r.on !== 'boolean') {
        details.push(what);
        continue;
      }
      const base = stored.find((s) => s.id === r.id);
      out.push({ ...(base ?? {}), id: r.id, on: r.on } as unknown as T);
    }
    return out;
  };
  const outSocial = keepMarks(social, cur.social, 'social');
  const outPay = keepMarks(pay, cur.pay, 'pay');

  const c = contact;
  if (typeof c.whatsapp !== 'boolean' || typeof c.hotline !== 'boolean' || typeof c.hours !== 'boolean') details.push('contact');

  const urls = {} as SocialUrls;
  for (const id of SOCIAL_URL_IDS) {
    const v = urlsIn[id];
    if (v === undefined || v === null || (typeof v === 'string' && !v.trim())) urls[id] = null;
    else if (typeof v === 'string') urls[id] = v.trim();
    else details.push(`urls.${id}`);
  }
  if (details.length) return bad(...details);

  // PR 745: the boxes' order (a card without it keeps the order as it is stored)
  let blockOrder: ShellFooter['blockOrder'] = cur.blockOrder;
  if (sent.blocks !== undefined) {
    const rows = arr(sent.blocks);
    if (!rows || rows.some((r) => !isObj(r) || typeof r.id !== 'string' || typeof r.on !== 'boolean')) return bad('blocks');
    blockOrder = blockOrderOf(rows as { id: string; on: boolean }[]);
  }
  const { blockOrder: _old, ...curRest } = cur;
  void _old;
  const footer = footerSchema.safeParse({
    ...curRest,
    ...(blockOrder ? { blockOrder } : {}),
    promise: { on: sent.promiseOn, items: outPromise },
    join: { ...cur.join, on: sent.joinOn },
    columns: outCols,
    contact: { whatsapp: c.whatsapp, hotline: c.hotline, hours: c.hours },
    social: outSocial,
    pay: outPay,
    legal: { ...cur.legal, copyright: collapseLabel(copyright, cur.legal.copyright, words) },
  });
  if (!footer.success) return bad(...paths(footer.error.issues));
  return { ok: true, value: { footer: footer.data, urls } };
}
