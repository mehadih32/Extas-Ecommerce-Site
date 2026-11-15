// PR 726 — Website › Brand & menus at /admin/website/brand-menus (docs/ADMIN-ARCHITECTURE.md §4.9 Website → Site builder:
// "menus, header, footer"; BACKEND-ARCHITECTURE WEB). Three cards, each saved whole with its own version (a card changed by
// someone else in between answers STALE and is read again): Brand (shop name, slogans, the browser-tab title, logos and
// favicon, their sizes and the text logo's style), Header & menu (the announcement bar, the header's icons, the menu's
// items) and Footer (promise strip, sign-up box, link columns, contact block, social marks and addresses, payment marks,
// copyright line). Seeing needs `website.read`; saving `website.layout.write` (checked here again); a picture is uploaded
// through the media library (`media.upload`), so the logo the owner picks is a normal media asset. The audit row names the
// card and what changed, never a long text.
import { createHash } from 'node:crypto';
import { audit, requirePermission, type Actor, type RequestContext } from '@extas/auth';
import { MOTHER_STORE_ID, type PrismaClient } from '@extas/db/client';
import { phoneNormalizeBD } from '@extas/checkout';
import { imageSources } from '@extas/media';
import { logoSizeSchema, logoStyleSchema, registry, SEO_TITLES_DEFAULT, seoTitlesSchema, storeTarget } from '@extas/settings';
import type { AppResolver } from '../settings';
import { shopT } from '../shop/dict';
import { isObj, mergeFooter, mergeMenu, pairOf, SOCIAL_URL_IDS } from './merge';
import { footerCard, menuCard, type BrandCardValue, type CardKey, type CardValue, type ContactCardValue, type FooterCardValue, type MenuCardValue, type Pair, type Words } from './model';

export interface BrandDeps {
  db: PrismaClient;
  resolver: AppResolver;
}
export interface BrandWho {
  actor: Actor;
  ctx: RequestContext;
}

export interface Card<K extends CardKey> {
  key: K;
  value: CardValue[K];
  version: string;
}
export interface BrandView {
  cards: { brand: Card<'brand'>; menu: Card<'menu'>; footer: Card<'footer'>; contact: Card<'contact'> };
  /** What each saved picture looks like now (null: none, or its sizes are still being made). */
  previews: { logo: string | null; logoPhone: string | null; favicon: string | null; ogImage: string | null };
}

export class BrandPageError extends Error {
  constructor(
    readonly code: 'INVALID_INPUT' | 'STALE' | 'MEDIA_NOT_FOUND',
    readonly status: number,
    readonly details: string[] = [],
    readonly data: Record<string, unknown> = {},
  ) {
    super(code);
  }
}
export const isBrandPageError = (e: unknown): e is BrandPageError => e instanceof BrandPageError;

const S = MOTHER_STORE_ID;
const at = { storeId: S };
export const versionOf = (v: unknown): string => createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0, 16);
/** JSON with every object's keys in one order, so two equal values compare equal however they were built. */
const canon = (v: unknown): string => JSON.stringify(v, (_k, x: unknown) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) : x));
const same = (a: unknown, b: unknown) => canon(a) === canon(b);

/** The shop's words in both languages, with the owner's own changes (Website › Words) on top. */
async function shopWords(deps: BrandDeps): Promise<Words> {
  const own = await deps.resolver.value('language.labels', at);
  const en = shopT('en', own);
  const bn = shopT('bn', own);
  return (key) => ({ en: en(key), bn: bn(key) });
}

async function brandRead(deps: BrandDeps): Promise<BrandCardValue> {
  const r = deps.resolver;
  const [name, slogan, sloganShort, titles, logo, logoPhone, favicon, logoSize, logoStyle] = await Promise.all([
    r.value('store.name', at),
    r.value('brand.slogan', at),
    r.value('brand.sloganShort', at),
    r.value('seo.titles', at),
    r.value('brand.logo', at),
    r.value('brand.logoPhone', at),
    r.value('brand.favicon', at),
    r.value('brand.logoSize', at),
    r.value('brand.logoStyle', at),
  ]);
  return { name: name ?? '', slogan, sloganShort, tabTitle: titles.home.title, logo, logoPhone, favicon, logoSize, logoStyle };
}

/** PR 745: how people reach the shop and the picture a shared link shows. */
async function contactRead(deps: BrandDeps): Promise<ContactCardValue> {
  const r = deps.resolver;
  const [phone, whatsapp, email, address, hours, ogImage] = await Promise.all([
    r.value('contact.phone', at),
    r.value('contact.whatsapp', at),
    r.value('contact.email', at),
    r.value('contact.address', at),
    r.value('contact.hours', at),
    r.value('brand.ogImage', at),
  ]);
  return { phone: phone ?? '', whatsapp: whatsapp ?? '', email: email ?? '', address, hours, ogImage };
}

async function menuRead(deps: BrandDeps, words: Words): Promise<MenuCardValue> {
  const r = deps.resolver;
  const [announce, header, menu] = await Promise.all([r.value('shell.announce', at), r.value('shell.header', at), r.value('shell.menu', at)]);
  return menuCard({ announce, header, menu }, { announce: registry['shell.announce'].default, menu: registry['shell.menu'].default }, words);
}

async function footerRead(deps: BrandDeps, words: Words): Promise<FooterCardValue> {
  const r = deps.resolver;
  const [footer, facebook, instagram, youtube, tiktok] = await Promise.all([
    r.value('shell.footer', at),
    r.value('social.facebook', at),
    r.value('social.instagram', at),
    r.value('social.youtube', at),
    r.value('social.tiktok', at),
  ]);
  return footerCard(footer, registry['shell.footer'].default, { facebook: facebook ?? '', instagram: instagram ?? '', youtube: youtube ?? '', tiktok: tiktok ?? '' }, words);
}

async function previewsOf(deps: BrandDeps, b: BrandCardValue, c: ContactCardValue): Promise<BrandView['previews']> {
  const ids = [b.logo, b.logoPhone, b.favicon, c.ogImage].filter((x): x is string => !!x);
  const none = { logo: null, logoPhone: null, favicon: null, ogImage: null };
  if (!ids.length) return none;
  try {
    const found = await imageSources({ db: deps.db, settings: deps.resolver }, S, ids);
    const widest = (id: string | null) => {
      const v = id ? [...(found.get(id)?.variants ?? [])].sort((x, y) => y.width - x.width)[0] : undefined;
      return v ? v.url : null;
    };
    return { logo: widest(b.logo), logoPhone: widest(b.logoPhone), favicon: widest(b.favicon), ogImage: widest(c.ogImage) };
  } catch {
    return none;
  }
}

/** The page's data (`website.read`). */
export async function brandView(deps: BrandDeps, who: BrandWho): Promise<BrandView> {
  await requirePermission(deps.db, who.actor, 'website.read', { storeId: S });
  const words = await shopWords(deps);
  const [brand, menu, footer, contact] = await Promise.all([brandRead(deps), menuRead(deps, words), footerRead(deps, words), contactRead(deps)]);
  return {
    cards: {
      contact: { key: 'contact', value: contact, version: versionOf(contact) },
      brand: { key: 'brand', value: brand, version: versionOf(brand) },
      menu: { key: 'menu', value: menu, version: versionOf(menu) },
      footer: { key: 'footer', value: footer, version: versionOf(footer) },
    },
    previews: await previewsOf(deps, brand, contact),
  };
}

const meta = (who: BrandWho, card: CardKey) => ({ actorId: who.actor.staffUserId ?? null, reason: `Website › Brand & menus (${card})` });
const invalid = (...details: string[]) => new BrandPageError('INVALID_INPUT', 400, details);

async function saveBrand(deps: BrandDeps, who: BrandWho, before: BrandCardValue, sent: unknown): Promise<string[]> {
  if (!isObj(sent)) throw invalid('value');
  const r = deps.resolver;
  const bad: string[] = [];
  const nullable = (v: unknown): v is string | null => v === null || typeof v === 'string';

  const nameRaw = sent.name;
  const name = typeof nameRaw === 'string' ? nameRaw.trim() || null : undefined;
  if (name === undefined || !registry['store.name'].schema.safeParse(name).success) bad.push('name');

  // a text in both languages: both halves or none
  const pairField = (key: 'slogan' | 'sloganShort', setting: 'brand.slogan' | 'brand.sloganShort'): Pair | null | undefined => {
    const p = pairOf(sent[key]);
    const none = p && !p.en.trim() && !p.bn.trim() ? null : p;
    if (none === undefined || !registry[setting].schema.safeParse(none).success) {
      bad.push(key);
      return undefined;
    }
    return none;
  };
  const slogan = pairField('slogan', 'brand.slogan');
  const sloganShort = pairField('sloganShort', 'brand.sloganShort');

  // the browser-tab title is the home page's search title: emptied, it goes back to the shop's own
  const tab = pairOf(sent.tabTitle);
  let titles: ReturnType<typeof seoTitlesSchema.parse> | undefined;
  if (tab === undefined) bad.push('tabTitle');
  else {
    const cur = await r.value('seo.titles', at);
    const empty = !tab || (!tab.en.trim() && !tab.bn.trim());
    const title = empty ? SEO_TITLES_DEFAULT.home.title : { en: tab.en.trim(), bn: tab.bn.trim() };
    const ok = seoTitlesSchema.safeParse({ ...cur, home: { ...cur.home, title } });
    if (ok.success) titles = ok.data;
    else bad.push('tabTitle');
  }

  const refs = { logo: sent.logo, logoPhone: sent.logoPhone, favicon: sent.favicon };
  for (const [k, v] of Object.entries(refs)) if (!nullable(v) || (typeof v === 'string' && !registry['brand.logo'].schema.safeParse(v).success)) bad.push(k);
  const size = logoSizeSchema.safeParse(sent.logoSize);
  if (!size.success) bad.push('logoSize');
  const style = logoStyleSchema.safeParse(sent.logoStyle);
  if (!style.success) bad.push('logoStyle');
  if (bad.length || name === undefined || slogan === undefined || sloganShort === undefined || !titles || !size.success || !style.success) throw invalid(...new Set(bad));

  // a picture must be a live picture of this shop's own library
  const ids = [refs.logo, refs.logoPhone, refs.favicon].filter((x): x is string => typeof x === 'string');
  if (ids.length) {
    const rows = await deps.db.mediaAsset.findMany({ where: { id: { in: [...new Set(ids)] }, storeId: S, archivedAt: null, kind: 'IMAGE' }, select: { id: true } });
    const live = new Set(rows.map((x) => x.id));
    const gone = (Object.entries(refs) as [string, unknown][]).filter(([, v]) => typeof v === 'string' && !live.has(v)).map(([k]) => k);
    if (gone.length) throw new BrandPageError('MEDIA_NOT_FOUND', 400, gone);
  }

  const seoOut = titles;
  const m = meta(who, 'brand');
  const changed: string[] = [];
  const put = async <T>(field: string, was: unknown, next: T, write: (v: T) => Promise<unknown>) => {
    if (same(was, next)) return;
    await write(next);
    changed.push(field);
  };
  const logo = refs.logo as string | null;
  const logoPhone = refs.logoPhone as string | null;
  const favicon = refs.favicon as string | null;
  await put('name', before.name || null, name, (v) => r.set('store.name', v, storeTarget(S), m));
  await put('slogan', before.slogan, slogan, (v) => r.set('brand.slogan', v, storeTarget(S), m));
  await put('sloganShort', before.sloganShort, sloganShort, (v) => r.set('brand.sloganShort', v, storeTarget(S), m));
  await put('tabTitle', before.tabTitle, titles.home.title, () => r.set('seo.titles', seoOut, storeTarget(S), m));
  await put('logo', before.logo, logo, (v) => r.set('brand.logo', v, storeTarget(S), m));
  await put('logoPhone', before.logoPhone, logoPhone, (v) => r.set('brand.logoPhone', v, storeTarget(S), m));
  await put('favicon', before.favicon, favicon, (v) => r.set('brand.favicon', v, storeTarget(S), m));
  await put('logoSize', before.logoSize, size.data, (v) => r.set('brand.logoSize', v, storeTarget(S), m));
  await put('logoStyle', before.logoStyle, style.data, (v) => r.set('brand.logoStyle', v, storeTarget(S), m));
  return changed;
}

/** A phone number as the shop keeps it (+country form): a Bangladesh mobile may be typed the way it is dialled at home; empty = none; undefined = not a number. */
export function phoneOf(raw: unknown): string | null | undefined {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== 'string') return undefined;
  const t = raw.trim();
  if (!t) return null;
  const plain = t.replace(/[\s\-().]/g, '');
  if (registry['contact.phone'].schema.safeParse(plain).success && plain.startsWith('+')) return plain;
  const bd = phoneNormalizeBD(t);
  return bd.ok ? bd.e164 : undefined;
}

async function saveContact(deps: BrandDeps, who: BrandWho, before: ContactCardValue, sent: unknown): Promise<string[]> {
  if (!isObj(sent)) throw invalid('value');
  const r = deps.resolver;
  const bad: string[] = [];
  const phone = phoneOf(sent.phone);
  const whatsapp = phoneOf(sent.whatsapp);
  if (phone === undefined) bad.push('phone');
  if (whatsapp === undefined) bad.push('whatsapp');
  const emailRaw = sent.email;
  const email = emailRaw === undefined || emailRaw === null ? null : typeof emailRaw === 'string' ? emailRaw.trim() || null : undefined;
  if (email === undefined || (email !== null && !registry['contact.email'].schema.safeParse(email).success)) bad.push('email');
  // a text in both languages: both halves or none
  const pairField = (key: 'address' | 'hours', setting: 'contact.address' | 'contact.hours'): Pair | null | undefined => {
    const p = pairOf(sent[key]);
    const val = p && !p.en.trim() && !p.bn.trim() ? null : p ? { en: p.en.trim(), bn: p.bn.trim() } : p;
    if (val === undefined || !registry[setting].schema.safeParse(val).success) {
      bad.push(key);
      return undefined;
    }
    return val;
  };
  const address = pairField('address', 'contact.address');
  const hours = pairField('hours', 'contact.hours');
  const og = sent.ogImage;
  if (!(og === null || og === undefined || (typeof og === 'string' && registry['brand.ogImage'].schema.safeParse(og).success))) bad.push('ogImage');
  if (bad.length || phone === undefined || whatsapp === undefined || email === undefined || address === undefined || hours === undefined) throw invalid(...new Set(bad));
  const ogImage = typeof og === 'string' ? og : null;
  if (ogImage) {
    const row = await deps.db.mediaAsset.findFirst({ where: { id: ogImage, storeId: S, archivedAt: null, kind: 'IMAGE' }, select: { id: true } });
    if (!row) throw new BrandPageError('MEDIA_NOT_FOUND', 400, ['ogImage']);
  }
  const m = meta(who, 'contact');
  const changed: string[] = [];
  const put = async <T>(field: string, was: unknown, next: T, write: (v: T) => Promise<unknown>) => {
    if (same(was, next)) return;
    await write(next);
    changed.push(field);
  };
  await put('phone', before.phone || null, phone, (v) => r.set('contact.phone', v, storeTarget(S), m));
  await put('whatsapp', before.whatsapp || null, whatsapp, (v) => r.set('contact.whatsapp', v, storeTarget(S), m));
  await put('email', before.email || null, email, (v) => r.set('contact.email', v, storeTarget(S), m));
  await put('address', before.address, address, (v) => r.set('contact.address', v, storeTarget(S), m));
  await put('hours', before.hours, hours, (v) => r.set('contact.hours', v, storeTarget(S), m));
  await put('ogImage', before.ogImage, ogImage, (v) => r.set('brand.ogImage', v, storeTarget(S), m));
  return changed;
}

async function saveMenu(deps: BrandDeps, who: BrandWho, sent: unknown, words: Words): Promise<string[]> {
  const r = deps.resolver;
  const [announce, header, menu] = await Promise.all([r.value('shell.announce', at), r.value('shell.header', at), r.value('shell.menu', at)]);
  const merged = mergeMenu({ announce, header, menu }, { announce: registry['shell.announce'].default, menu: registry['shell.menu'].default }, sent, words);
  if (!merged.ok) throw invalid(...merged.details);
  const m = meta(who, 'menu');
  const changed: string[] = [];
  if (!same(announce, merged.value.announce)) {
    await r.set('shell.announce', merged.value.announce, storeTarget(S), m);
    changed.push('announce');
  }
  if (!same(header, merged.value.header)) {
    await r.set('shell.header', merged.value.header, storeTarget(S), m);
    changed.push('icons');
  }
  if (!same(menu, merged.value.menu)) {
    await r.set('shell.menu', merged.value.menu, storeTarget(S), m);
    changed.push('items');
  }
  return changed;
}

async function saveFooter(deps: BrandDeps, who: BrandWho, sent: unknown, words: Words): Promise<string[]> {
  const r = deps.resolver;
  const cur = await r.value('shell.footer', at);
  const merged = mergeFooter(cur, registry['shell.footer'].default, sent, words);
  if (!merged.ok) throw invalid(...merged.details);
  // each network's address is an https address of its own setting; a bad one refuses the whole save
  const badUrl = SOCIAL_URL_IDS.filter((id) => !registry[`social.${id}`].schema.safeParse(merged.value.urls[id]).success).map((id) => `urls.${id}`);
  if (badUrl.length) throw invalid(...badUrl);
  const m = meta(who, 'footer');
  const changed: string[] = [];
  if (!same(cur, merged.value.footer)) {
    await r.set('shell.footer', merged.value.footer, storeTarget(S), m);
    changed.push('footer');
  }
  for (const id of SOCIAL_URL_IDS) {
    const was = await r.value(`social.${id}`, at);
    const next = merged.value.urls[id];
    if (was === next) continue;
    await r.set(`social.${id}`, next, storeTarget(S), m);
    changed.push(`urls.${id}`);
  }
  return changed;
}

/** Saves one card whole (`website.layout.write`): PUT `{key, value, version}`. */
export async function saveBrandCard(deps: BrandDeps, who: BrandWho, input: unknown): Promise<BrandView> {
  await requirePermission(deps.db, who.actor, 'website.layout.write', { storeId: S });
  if (!isObj(input) || !isObj(input.value)) throw invalid('key', 'value');
  const key = input.key;
  if (key !== 'brand' && key !== 'menu' && key !== 'footer' && key !== 'contact') throw invalid('key');
  const words = await shopWords(deps);
  const before = key === 'brand' ? await brandRead(deps) : key === 'menu' ? await menuRead(deps, words) : key === 'contact' ? await contactRead(deps) : await footerRead(deps, words);
  const was = versionOf(before);
  if (input.version !== undefined && input.version !== was) throw new BrandPageError('STALE', 409, ['version'], { version: was });
  const changed =
    key === 'brand'
      ? await saveBrand(deps, who, before as BrandCardValue, input.value)
      : key === 'menu'
        ? await saveMenu(deps, who, input.value, words)
        : key === 'contact'
          ? await saveContact(deps, who, before as ContactCardValue, input.value)
          : await saveFooter(deps, who, input.value, words);
  if (changed.length) {
    await audit(deps.db, who.actor, { storeId: S, action: `website.${key}.save`, entityType: 'Setting', entityId: key, before: key === 'menu' ? { card: before } : key === 'footer' ? { card: { ...(before as FooterCardValue), urls: null } } : undefined, after: { changed } }, who.ctx);
  }
  return brandView(deps, who);
}
