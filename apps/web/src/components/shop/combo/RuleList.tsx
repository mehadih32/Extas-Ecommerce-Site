// PR 572 — one auto colour-pair rule's own page at /combos/<rule key> (demo 42-combo-auto.js ca_listPage), in one of
// five templates (Blueprint D8.4; the rule's own choice, else the shop's `combos.template.list`, L1 by default):
//   L1 pair grid   — the offer strip, the 2 / 3 piece switch, "Has:" colour chips, "My size", the order, the count and a
//                    grid of every pair (past `combos.list` seeAllOver: the first ones and "See all N"), with the
//                    "Pick your own colours" card;
//   L2 style cards — one card per style of the rule ("15 pairs · pick any", opening L1 on that style), then the other
//                    rules' styles under "More combo styles";
//   L3 hub         — the sets landing page's rows, opened on the rule's season;
//   L4 big list    — big cards with the size for both and "Add both to bag" right in the list;
//   L5 2 or 3 first — the 2 / 3 piece switch first, then the chosen pack's grid with "৳X each".
// Every filter is part of the link (shareable, works without script); such a page is not indexed. A rule that is
// switched off, ended or not started yet keeps its page: it says so in Bengali and English and shows the combos on
// sale now. Every price is the one @extas/combos gave the pair (CN-009: a struck price only behind the owner's switch).
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cache, type ReactNode } from 'react';
import { filterColours, filterPairs, offerNumbers, pricesVary, shownCount, styleGroups, type ListPair, type ListPiece } from '@extas/combos/rule-page-model';
import type { RulePage } from '@extas/combos';
import { plural } from '@/lib/shop/bag-model';
import { bagSettings } from '@/lib/shop/bag';
import { buildEntry } from '@/lib/shop/build';
import { photoFor, productName } from '@/lib/shop/catalogue';
import { setCardGroups, cardView } from '@/lib/shop/combo';
import { cardSizeWords, isFiltered, listHref, pairTitle, parseListQuery, toggleHas, type ListQuery, type Search } from '@/lib/shop/combo-list-model';
import { LIST_TEMPLATES, listTemplateOf, readListSettings, ruleData, type ListSettings, type ListTemplate, type RuleData } from '@/lib/shop/combo-list';
import { shopContext, type ShopContext } from '@/lib/shop/context';
import { productPath } from '@/lib/shop/home-model';
import { hrefIn } from '@/lib/shop/lang';
import { shopMetadata } from '@/lib/shop/meta';
import { ROUTES } from '@/lib/shop/routes';
import { Icon } from '../Icon';
import { HubBody } from './CombosHub';
import { L4Pick, ListSort, type L4Size } from './RuleListClient';
import { HubCard } from './SetCards';
import { HubPicture, type SetPart } from './SetPicture';
import './combos.css';
import './combo-list.css';
import { PreviewBar } from './PreviewBar';

const inLang = (lang: 'en' | 'bn', en: string | null | undefined, bn: string | null | undefined) => (lang === 'bn' && bn?.trim()) || en?.trim() || '';
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? null;

const dataFor = cache((key: string) => shopContext().then((c) => ruleData(c, { key })));

export async function ruleListMetadata(key: string, search: Search): Promise<Metadata> {
  const c = await shopContext();
  const d = await dataFor(key);
  if (!d || d === 'missing') return {};
  const title = c.t('ctpl.list.title', { title: ruleTitle(c, d.page) });
  const index = !isFiltered(parseListQuery(search)) && d.page.onSale;
  return shopMetadata(c, `combos/${d.page.rule.key}`, title, { path: ROUTES.comboRule(d.page.rule.key), index, seo: { kind: 'comboList', tokens: { name: title } } });
}

const ruleTitle = (c: Pick<ShopContext, 'lang'>, page: Pick<RulePage, 'rule'>) => inLang(c.lang, page.rule.titleEn ?? page.rule.nameEn, page.rule.titleBn ?? page.rule.nameBn);

/** Everything a card needs to draw a pair's pieces, colours and names. */
interface Draw {
  c: ShopContext;
  d: RuleData;
  colour: (id: string) => { key: string; name: string; hex: string } | undefined;
  product: (id: string) => { name: string; slug: string } | undefined;
}

function drawOf(c: ShopContext, d: RuleData): Draw {
  const products = [...d.page.products, ...(d.page.companion?.products ?? [])];
  const colours = new Map(products.flatMap((p) => p.colours.map((x) => [x.id, { key: x.key, name: inLang(c.lang, x.nameEn, x.nameBn) || x.key, hex: x.hex }] as const)));
  const byId = new Map(products.map((p) => [p.id, { name: inLang(c.lang, p.nameEn, p.nameBn), slug: p.slug }]));
  return { c, d, colour: (id) => colours.get(id), product: (id) => byId.get(id) };
}

export function partsOf(w: Pick<Draw, 'd' | 'colour' | 'product'>, pieces: readonly ListPiece[]): SetPart[] {
  return pieces.map((p) => {
    const card = w.d.cards.get(p.productId);
    const col = w.colour(p.colourId);
    return { garment: card?.garment ?? null, hex: col?.hex ?? '', photo: card ? photoFor(card, col?.key) : null, name: [col?.name, w.product(p.productId)?.name].filter(Boolean).join(' ') };
  });
}

/** The style a pair belongs to, in words: its product's name, or the rule's title for a pair across styles. */
const styleName = (w: Draw, p: Pick<ListPair, 'pieces' | 'sameProduct' | 'styleKey'>) => (p.styleKey === 'mix' ? ruleTitle(w.c, w.d.page) : (w.product(p.pieces[0]!.productId)?.name ?? ''));

function Badges({ w, p }: { w: Draw; p: ListPair }) {
  const { c } = w;
  return (
    <>
      {p.price.offer && p.price.saving > 0 ? <span className="ca-bdg save">{c.t('combo.card.save', { amount: c.money(p.price.saving) })}</span> : null}
      <span className="ca-bdg pcs">{c.t('combo.card.pcs', { n: c.num(p.pieces.length) })}</span>
      {p.isNew ? <span className="ca-bdg new">{c.t('ctpl.list.new')}</span> : null}
    </>
  );
}

function Dots({ hexes }: { hexes: string[] }) {
  return (
    <span className="ca-dots" aria-hidden="true">
      {hexes.map((h, i) => (
        <i key={i} style={{ background: h }} />
      ))}
    </span>
  );
}

/** One pair's card (demo ca_card): the pieces laid over each other, the colours, the style, the price and the sizes. */
function PairCard({ w, p, size, each = false }: { w: Draw; p: ListPair; size: string | null; each?: boolean }) {
  const { c } = w;
  const title = pairTitle(p, (id) => w.colour(id)?.name ?? '');
  const sz = cardSizeWords(c.t, p, size);
  return (
    <a className="ca-card" href={hrefIn(c.lang, ROUTES.combo(p.slug))} data-testid="ca-card" data-id={p.slug}>
      <HubPicture parts={partsOf(w, p.pieces)} lang={c.lang} alt={c.t('combo.card.alt', { pieces: partsOf(w, p.pieces).map((x) => x.name).join(', ') })}>
        <Badges w={w} p={p} />
      </HubPicture>
      <div className="ca-cinfo">
        <div className="ca-ctitle">{title}</div>
        <div className="ca-csub">{c.t('ctpl.list.sub', { style: styleName(w, p), n: c.num(p.pieces.length) })}</div>
        {p.price.pay !== null ? (
          <div className={each ? 'ca-cprice ca-ceach' : 'ca-cprice'}>
            {each ? (
              <>
                <b className="price">{c.t('ctpl.list.each', { price: c.money(Math.round(p.price.pay / p.pieces.length)) })}</b> <span className="xs muted">{c.t('ctpl.list.total', { total: c.money(p.price.pay) })}</span>
              </>
            ) : (
              <>
                <b className="price">{c.money(p.price.pay)}</b>
                {p.price.was !== null ? (
                  <>
                    {' '}
                    <span className="strike xs">{c.money(p.price.was)}</span>
                  </>
                ) : null}
              </>
            )}
          </div>
        ) : null}
        <div className="ca-csz">
          <Dots hexes={p.pieces.map((x) => w.colour(x.colourId)?.hex ?? '')} />
          <span>
            {sz.ok === true ? (
              <span className="ca-ok">
                <Icon name="check" size={12} /> {sz.text}
              </span>
            ) : (
              sz.text
            )}
          </span>
        </div>
      </div>
    </a>
  );
}

/** "Pick your own N colours" (demo ca_builderCard): the first pair's page opened on "pick your colours" (P2). */
function BuilderCard({ w, first, n }: { w: Draw; first: ListPair; n: number }) {
  const { c } = w;
  return (
    <a className="ca-card ca-build" href={`${hrefIn(c.lang, ROUTES.combo(first.slug))}?pick=1`} data-testid="ca-builder">
      <div className="ca-ph ca-ph-card n2 ca-ph-empty">
        <span className="ca-plus">
          <Icon name="plus" size={28} />
        </span>
      </div>
      <div className="ca-cinfo">
        <div className="ca-ctitle">{c.t('ctpl.list.builder', { n: c.num(n) })}</div>
        <div className="ca-csub">{c.t('ctpl.list.builderSub')}</div>
        {first.price.pay !== null ? (
          <div className="ca-cprice">
            <b className="price">{c.money(first.price.pay)}</b> <span className="xs muted">{c.t('combo.card.for', { n: c.num(n) })}</span>
          </div>
        ) : null}
        <div className="ca-csz">
          <span className="brandc bold">
            {c.t('ctpl.list.start')} <Icon name="right" size={12} />
          </span>
        </div>
      </div>
    </a>
  );
}

/** The offer strip (demo ca_offerStrip): "Polo combos · any 2 for ৳1,530", the regular price, the saving, the shop's
 * free delivery and cash on delivery when they apply. */
function OfferStrip({ w, page }: { w: Draw; page: Pick<RulePage, 'pairs' | 'rule'> }) {
  const { c } = w;
  const o = offerNumbers(page.pairs);
  if (!o) return null;
  const n = c.num(page.rule.pieces);
  const title = ruleTitle(c, page);
  const freeOver = c.s['delivery.freeOverMinor'];
  const free = c.flags.freeDelivery && typeof freeOver === 'number' && o.payMinor >= freeOver;
  return (
    <div className="ca-strip" data-testid="ca-strip">
      <div className="ca-strip1">{o.one ? c.t('ctpl.list.stripOne', { title, n, price: c.money(o.payMinor) }) : c.t('ctpl.list.stripFrom', { title, n, price: c.money(o.payMinor) })}</div>
      <div className="ca-strip2">
        {o.regularMinor !== null ? <span className="ca-tseg">{c.t('ctpl.list.stripRegular', { n, price: c.money(o.regularMinor) })}</span> : null}
        {o.savingMinor > 0 ? <span className="ca-tseg">&nbsp;· {c.t('ctpl.list.stripSave', { amount: c.money(o.savingMinor) })}</span> : null}
        {free ? <span className="ca-tseg">&nbsp;· {c.t('ctpl.list.free')}</span> : null}
        {c.flags.cod ? <span className="ca-tseg">&nbsp;· {c.t('ctpl.list.cod')}</span> : null}
      </div>
    </div>
  );
}

/** The 2 / 3 piece rules of one pack, `two` first. */
function tiersOf(page: RulePage) {
  const other = page.companion;
  if (!other) return null;
  const mine = { rule: page.rule, pairs: page.pairs };
  const them = { rule: other.rule, pairs: other.pairs };
  return page.rule.pieces === 2 ? { two: mine, three: them } : { two: them, three: mine };
}

/** The 2 / 3 piece switch (demo ca_tierSeg): links to the two rules' pages, or (L5) to this page on either pack. */
function TierSeg({ w, page, base, q, inPage }: { w: Draw; page: RulePage; base: string; q: ListQuery; inPage: boolean }) {
  const { c } = w;
  const tr = tiersOf(page);
  if (!tr) return null;
  const cur = inPage ? (q.tier ?? page.rule.pieces) : page.rule.pieces;
  const btn = (t: { rule: RulePage['rule']; pairs: ListPair[] }) => {
    const o = offerNumbers(t.pairs);
    if (!o) return null;
    const n = t.rule.pieces;
    const on = cur === n;
    const href = inPage ? listHref(base, q, { tier: n === page.rule.pieces ? null : (n as 2 | 3), has: [], size: null, all: false }) : listHref(hrefIn(c.lang, ROUTES.comboRule(t.rule.key)), { ...q, has: [], size: null, all: false, style: null, tier: null }, {});
    return (
      <a key={t.rule.key} className={`ca-segb${on ? ' on' : ''}`} href={href} aria-current={on || undefined} data-testid="ca-tier">
        <span>
          {c.t('ctpl.list.tier', { n: c.num(n), price: c.money(o.payMinor) })}
          {n === 3 ? <span className="ca-best">{c.t('ctpl.list.best')}</span> : null}
        </span>
        <span className="ca-segsub">{c.t('ctpl.list.each', { price: c.money(Math.round(o.payMinor / n)) })}</span>
      </a>
    );
  };
  return (
    <div className={`ca-seg${inPage ? ' big' : ''}`} role="group" aria-label={c.t('ctpl.list.tierLabel')}>
      {btn(tr.two)}
      {btn(tr.three)}
    </div>
  );
}

/** The colour chips, "My size", the order (demo ca_filterBar). */
function FilterBar({ w, pairs, base, q }: { w: Draw; pairs: ListPair[]; base: string; q: ListQuery }) {
  const { c, d } = w;
  const order = [...d.page.products, ...(d.page.companion?.products ?? [])].flatMap((p) => p.colours.map((x) => x.id));
  const cols = filterColours(pairs, order);
  const sizes = pairs.find((p) => p.sizes.length)?.sizes ?? [];
  const sorts = (['best', 'sizes', 'new', ...(pricesVary(pairs) ? (['price'] as const) : [])] as const).map((v) => ({ value: v, label: c.t(`ctpl.list.sort${v[0]!.toUpperCase()}${v.slice(1)}`) }));
  const sizeLabel = sizes.find((s) => s.key === q.size)?.label ?? q.size;
  return (
    <div className="ca-filters">
      <div className="ca-hasrow" role="group" aria-label={c.t('ctpl.list.hasLabel')}>
        <span className="ca-haslbl">{c.t('ctpl.list.has')}</span>
        {cols.map((id) => {
          const col = w.colour(id);
          if (!col) return null;
          const on = q.has.includes(col.key);
          return (
            <a key={id} className={`chip ca-colchip${on ? ' on' : ''}`} href={toggleHas(base, q, col.key)} aria-pressed={on} data-testid="ca-has">
              <i style={{ background: col.hex }} />
              {col.name}
            </a>
          );
        })}
      </div>
      <div className="ca-tools">
        {q.size ? (
          <a className="chip on" href={listHref(base, q, { size: null })} aria-label={c.t('ctpl.list.sizeClear', { size: sizeLabel ?? '' })} data-testid="ca-size-clear">
            {c.t('ctpl.list.sizeOn', { size: sizeLabel ?? '' })} <Icon name="close" size={13} />
          </a>
        ) : sizes.length ? (
          <details className="ca-sizepick">
            <summary className="chip" data-testid="ca-size-pick">
              {c.t('ctpl.list.mySize')} <Icon name="down" size={13} />
            </summary>
            <div className="ca-sizepop">
              <p className="small text2">{c.t('ctpl.list.sizeHelp')}</p>
              <div className={`ca-sizes n${sizes.length}`}>
                {sizes.map((s) => {
                  const n = pairs.filter((p) => p.openSizes > 0 && p.sizes.some((x) => x.key === s.key && x.ok)).length;
                  return n ? (
                    <a key={s.key} className="size-pill" href={listHref(base, q, { size: s.key, all: false })}>
                      {s.label}
                    </a>
                  ) : (
                    <span key={s.key} className="size-pill out" aria-disabled="true">
                      {s.label}
                    </span>
                  );
                })}
              </div>
            </div>
          </details>
        ) : null}
        {q.has.length ? (
          <a className="link xs" href={listHref(base, q, { has: [] })}>
            {c.t('ctpl.list.clearColours')}
          </a>
        ) : null}
        <ListSort options={sorts} value={q.sort} label={c.t('ctpl.list.sort')} hrefs={Object.fromEntries(sorts.map((s) => [s.value, listHref(base, q, { sort: s.value, all: false })]))} />
      </div>
    </div>
  );
}

function CountLine({ w, n, colourOrder }: { w: Draw; n: number; colourOrder: boolean }) {
  const { c } = w;
  const count = plural(c.t, 'ctpl.list.count', n, c.num);
  return (
    <div className="ca-count xs muted" data-testid="ca-count">
      {c.t(colourOrder ? 'ctpl.list.orderColour' : 'ctpl.list.orderBest', { count })}
    </div>
  );
}

function Empty({ w, base, q }: { w: Draw; base: string; q: ListQuery }) {
  const { c } = w;
  return (
    <div className="ca-empty" data-testid="ca-empty">
      <div className="h3">{c.t('ctpl.list.empty')}</div>
      <p className="small muted mt8">{c.t('ctpl.list.emptyText')}</p>
      <a className="btn btn-secondary btn-sm mt12" href={listHref(base, q, { has: [], size: null, all: false })}>
        {c.t('ctpl.list.clear')}
      </a>
    </div>
  );
}

/** The grid with "See all" and the builder card (demo ca_grid). */
function Grid({ w, list, rule, base, q, set, each = false }: { w: Draw; list: ListPair[]; rule: RulePage['rule']; base: string; q: ListQuery; set: ListSettings['combos.list']; each?: boolean }) {
  const { c } = w;
  if (!list.length) return <Empty w={w} base={base} q={q} />;
  const { shown, more } = shownCount(list.length, q.all, { over: set.seeAllOver, first: set.firstShown });
  const big = list.length > set.seeAllOver;
  const builder = set.builderCard && !q.has.length && !q.size && rule.pairing !== 'ANY' ? <BuilderCard key="builder" w={w} first={list[0]!} n={rule.pieces} /> : null;
  const cards: ReactNode[] = list.slice(0, shown).map((p) => <PairCard key={p.slug} w={w} p={p} size={q.size} each={each} />);
  if (builder) {
    if (big) cards.unshift(builder);
    else cards.push(builder);
  }
  return (
    <>
      <div className="ca-grid" data-testid="ca-grid" data-count={list.length}>
        {cards}
      </div>
      {more ? (
        <div className="center mt16">
          <a className="btn btn-secondary" href={listHref(base, q, { all: true })} data-testid="ca-seeall">
            {c.t('ctpl.list.seeAll', { n: c.num(list.length) })}
          </a>
        </div>
      ) : null}
    </>
  );
}

/** "Also sold one at a time" (demo ca_singles), while the rule lets its pieces sell on their own. */
function Singles({ w }: { w: Draw }) {
  const { c, d } = w;
  if (d.page.rule.noSinglePiece) return null;
  const prefix = c.s['naming.productPathPrefix'];
  const items = d.page.products.flatMap((p) => {
    const card = d.cards.get(p.id);
    return card ? [{ p, card }] : [];
  });
  if (!items.length) return null;
  return (
    <section className="mt32" data-testid="ca-singles">
      <div className="h3">{c.t('ctpl.list.singles')}</div>
      <div className="row wrap mt8" style={{ gap: 8 }}>
        {items.map(({ p, card }) => (
          <a key={p.id} className="chip" href={hrefIn(c.lang, productPath(prefix, p.slug))}>
            {productName(card, c.lang)}
            {card.priceMinor !== null ? ` · ${c.money(card.priceMinor)}` : ''}
          </a>
        ))}
      </div>
    </section>
  );
}

function filtered(d: RuleData, pairs: ListPair[], q: ListQuery): ListPair[] {
  // a colour key may name the colour of several products (one id each): a pair has it when it has any of them
  const keys = q.has;
  const colourKeyOf = new Map([...d.page.products, ...(d.page.companion?.products ?? [])].flatMap((p) => p.colours.map((x) => [x.id, x.key] as const)));
  const base = filterPairs(pairs, { has: [], size: q.size, style: q.style, sort: q.sort });
  return keys.length ? base.filter((p) => keys.every((k) => p.pieces.some((x) => colourKeyOf.get(x.colourId) === k))) : base;
}

function L1({ w, base, q, set }: { w: Draw; base: string; q: ListQuery; set: ListSettings }) {
  const page = w.d.page;
  const list = filtered(w.d, page.pairs, q);
  return (
    <>
      <OfferStrip w={w} page={page} />
      <TierSeg w={w} page={page} base={base} q={q} inPage={false} />
      <FilterBar w={w} pairs={page.pairs} base={base} q={q} />
      <CountLine w={w} n={list.length} colourOrder={page.rule.sortMode === 'COLOUR' && q.sort === 'best'} />
      <Grid w={w} list={list} rule={page.rule} base={base} q={q} set={set['combos.list']} />
      <Singles w={w} />
    </>
  );
}

/** L2's style card (demo ca_styleCard): one style of the rule, "15 pairs · pick any", opening the grid on it. */
function StyleCard({ w, pairs, base }: { w: Draw; pairs: ListPair[]; base: string }) {
  const { c } = w;
  const p = pairs[0]!;
  const n = p.pieces.length;
  const cols = [...new Set(pairs.flatMap((x) => x.pieces.map((y) => y.colourId)))];
  const shown = cols.slice(0, 6);
  const extra = cols.length - shown.length;
  return (
    <a className="ca-card ca-style" href={`${base}?style=${encodeURIComponent(p.styleKey)}`} data-testid="ca-style">
      <HubPicture parts={partsOf(w, p.pieces)} lang={c.lang} alt={c.t('combo.card.alt', { pieces: partsOf(w, p.pieces).map((x) => x.name).join(', ') })}>
        <Badges w={w} p={p} />
      </HubPicture>
      <div className="ca-cinfo">
        <div className="ca-ctitle">{c.t('combo.card.title', { name: styleName(w, p) })}</div>
        <div className="ca-csub">{c.t(n === 3 ? 'combo.card.sets' : 'combo.card.pairs', { n: c.num(pairs.length) })}</div>
        {p.price.pay !== null ? (
          <div className="ca-cprice">
            <b className="price">{c.money(p.price.pay)}</b> <span className="xs muted">{c.t('combo.card.for', { n: c.num(n) })}</span>
          </div>
        ) : null}
        <div className="ca-csz">
          <span className="ca-dots many" aria-hidden="true">
            {shown.map((id) => (
              <i key={id} style={{ background: w.colour(id)?.hex }} />
            ))}
          </span>
          {extra ? <span className="xs muted">{c.t('combo.card.more', { n: c.num(extra) })}</span> : null}
        </div>
      </div>
    </a>
  );
}

async function L2({ w, base }: { w: Draw; base: string }) {
  const { c, d } = w;
  const mine = styleGroups(d.page.pairs);
  const all = await setCardGroups(c);
  const others = all.groups.filter((g) => g.ruleId !== d.page.rule.id);
  return (
    <>
      <OfferStrip w={w} page={d.page} />
      <div className="ca-grid mt16" data-testid="ca-grid-l2">
        {mine.map((g) => (
          <StyleCard key={g.key} w={w} pairs={g.pairs} base={base} />
        ))}
      </div>
      {others.length ? (
        <>
          <h2 className="h2 mt32">{c.t('ctpl.list.moreStyles')}</h2>
          <div className="ca-grid mt12">
            {others.map((g) => (
              <HubCard key={g.key} c={c} v={cardView(c, g, all)} />
            ))}
          </div>
        </>
      ) : null}
    </>
  );
}

async function L3({ w, set }: { w: Draw; set: ListSettings }) {
  const { c, d } = w;
  const [all, build] = await Promise.all([setCardGroups(c), buildEntry(c)]);
  return <HubBody c={c} all={all} build={build} seasonTabs={set['combos.landing'].seasonTabs} seasonList={set['combos.seasons']} perRail={set['combos.landing'].perRail} first={d.page.rule.season} />;
}

/** L4's big card (demo ca_l4card): the picture, the price line, the size for both and "Add both to bag". */
function BigCard({ w, p, behaviour }: { w: Draw; p: ListPair; behaviour: 'sheet' | 'toast' | 'page' }) {
  const { c, d } = w;
  const title = pairTitle(p, (id) => w.colour(id)?.name ?? '');
  const n = p.pieces.length;
  const products = new Map(d.page.products.map((x) => [x.id, x]));
  const sizes: L4Size[] = p.sizes.map((s) => ({
    key: s.key,
    label: s.label,
    ok: s.ok,
    sizeIds: p.slots.map((slot) => products.get(slot.productId)?.sizes.find((z) => z.key === s.key)?.id ?? null),
    why: s.ok ? null : c.t('ctpl.list.outWhy', { size: s.label }),
  }));
  const pay = p.price.pay;
  return (
    <article className="ca-l4" data-testid="ca-l4">
      <a className="ca-l4ph" href={hrefIn(c.lang, ROUTES.combo(p.slug))} aria-label={c.t('ctpl.list.seePair', { name: title })}>
        <HubPicture parts={partsOf(w, p.pieces)} lang={c.lang} alt={title}>
          <Badges w={w} p={p} />
        </HubPicture>
      </a>
      <div className="ca-l4b">
        <div className="ca-l4t">{title}</div>
        <div className="xs muted">{c.t('ctpl.list.sub', { style: styleName(w, p), n: c.num(n) })}</div>
        {pay !== null ? (
          <div className="ca-pline mt8">
            {c.t('combo.card.pcs', { n: c.num(n) })} {p.price.was !== null ? <span className="strike">{c.money(p.price.was)}</span> : null} → <b className="price">{c.money(pay)}</b>
            {p.price.offer && p.price.saving > 0 ? (
              <>
                {' · '}
                <b className="ca-savetxt">{c.t('combo.card.save', { amount: c.money(p.price.saving) })}</b>
              </>
            ) : null}
          </div>
        ) : null}
        {sizes.length && pay !== null ? (
          <L4Pick
            slug={p.slug}
            colourIds={p.slots.map((s) => s.colourId)}
            sizes={sizes}
            behaviour={behaviour}
            hrefs={{ bag: hrefIn(c.lang, ROUTES.bag), checkout: hrefIn(c.lang, ROUTES.checkout) }}
            words={{
              sizeFor: c.t(n === 3 ? 'ctpl.list.sizeFor3' : 'ctpl.list.sizeFor2'),
              add: c.t(n === 3 ? 'ctpl.list.add3' : 'ctpl.list.add2', { price: c.money(pay) }),
              choose: c.t('ctpl.list.chooseSize'),
              added: c.t('ctpl.list.added', { name: title }),
              view: c.t('ctpl.list.view'),
              error: c.t('ctpl.list.error'),
            }}
          />
        ) : (
          <a className="btn btn-primary btn-block mt12" href={hrefIn(c.lang, ROUTES.combo(p.slug))}>
            {c.t('ctpl.list.seePair', { name: title })}
          </a>
        )}
      </div>
    </article>
  );
}

async function L4({ w, base, q, set }: { w: Draw; base: string; q: ListQuery; set: ListSettings }) {
  const { c, d } = w;
  const list = filtered(d, d.page.pairs, q);
  const lim = q.all ? list.length : set['combos.list'].bigListShown;
  const behaviour = (await bagSettings(c.storeId))['bag.addBehaviour'];
  return (
    <>
      <OfferStrip w={w} page={d.page} />
      <FilterBar w={w} pairs={d.page.pairs} base={base} q={q} />
      <CountLine w={w} n={list.length} colourOrder={d.page.rule.sortMode === 'COLOUR' && q.sort === 'best'} />
      {list.length ? (
        <div className="ca-l4list" data-testid="ca-grid" data-count={list.length}>
          {list.slice(0, lim).map((p) => (
            <BigCard key={p.slug} w={w} p={p} behaviour={behaviour} />
          ))}
        </div>
      ) : (
        <Empty w={w} base={base} q={q} />
      )}
      {list.length > lim ? (
        <div className="center mt16">
          <a className="btn btn-secondary" href={listHref(base, q, { all: true })} data-testid="ca-seeall">
            {c.t('ctpl.list.showMore', { n: c.num(list.length - lim) })}
          </a>
        </div>
      ) : null}
    </>
  );
}

function L5({ w, base, q, set }: { w: Draw; base: string; q: ListQuery; set: ListSettings }) {
  const { c, d } = w;
  const tr = tiersOf(d.page);
  if (!tr) {
    return (
      <>
        <div className="ca-note xs muted">{c.t('ctpl.list.oneTier')}</div>
        <L1 w={w} base={base} q={q} set={set} />
      </>
    );
  }
  const cur = (q.tier ?? d.page.rule.pieces) === 3 ? tr.three : tr.two;
  const page = { rule: cur.rule, pairs: cur.pairs };
  const list = filtered(d, cur.pairs, q);
  return (
    <>
      <div className="ca-l5top">
        <TierSeg w={w} page={d.page} base={base} q={q} inPage />
      </div>
      <OfferStrip w={w} page={page} />
      <FilterBar w={w} pairs={cur.pairs} base={base} q={q} />
      <CountLine w={w} n={list.length} colourOrder={cur.rule.sortMode === 'COLOUR' && q.sort === 'best'} />
      <Grid w={w} list={list} rule={cur.rule} base={base} q={q} set={set['combos.list']} each />
    </>
  );
}

/** The demo's template bar, only while previewing (`?tpl=`): every template, and the way back to the shop's choice. */
function Crumbs({ c, title }: { c: ShopContext; title: string }) {
  return (
    <nav className="ca-crumbs xs" aria-label={c.t('pdp.breadcrumb')}>
      <a href={hrefIn(c.lang, ROUTES.home)}>{c.t('pdp.home')}</a>
      <span aria-hidden="true">
        <bdi className="hide-d">›</bdi>
        <bdi className="hide-m">/</bdi>
      </span>
      <a href={hrefIn(c.lang, ROUTES.combos)}>{c.t('combo.hub.title')}</a>
      <span aria-hidden="true">
        <bdi className="hide-d">›</bdi>
        <bdi className="hide-m">/</bdi>
      </span>
      <span>{title}</span>
    </nav>
  );
}

/** A rule that is not on sale now (demo ca_endedHTML): it says so, in Bengali and English, and shows the combos on sale. */
async function Ended({ c, d, title }: { c: ShopContext; d: RuleData; title: string }) {
  const r = d.page.rule;
  const soon = r.state === 'soon';
  const date = r.startsOn ?? '';
  const all = await setCardGroups(c);
  const alt = all.groups.filter((g) => g.ruleId !== r.id).slice(0, 6);
  return (
    <>
      <div className="ca-ended" data-testid="ca-ended" data-state={r.state}>
        <div className="ca-ended-t">
          <h1 className="h2">{c.t('ctpl.list.title', { title })}</h1>
          <p className="ca-ended-b">
            {c.lang === 'en' ? <b lang="bn">{c.t(soon ? 'ctpl.list.soonBn' : 'ctpl.list.endedBn', { date })}</b> : null}
            <span>{c.t(soon ? 'ctpl.list.soon' : 'ctpl.list.ended', { date })}</span>
          </p>
        </div>
      </div>
      {alt.length ? (
        <section className="ca-sec" data-testid="ca-alt">
          <h2 className="h3">{c.t('ctpl.list.onSale')}</h2>
          <div className="ca-grid mt12">
            {alt.map((g) => (
              <HubCard key={g.key} c={c} v={cardView(c, g, all)} />
            ))}
          </div>
        </section>
      ) : (
        <a className="btn btn-primary mt16" href={hrefIn(c.lang, ROUTES.combos)}>
          {c.t('ctpl.list.allCombos')}
        </a>
      )}
    </>
  );
}

export async function RuleList({ ruleKey, search }: { ruleKey: string; search: Search }) {
  const c = await shopContext();
  const [d, set] = await Promise.all([dataFor(ruleKey), readListSettings(c.storeId)]);
  if (!d || d === 'missing') notFound();
  const q = parseListQuery(search);
  const tpl: ListTemplate = listTemplateOf(d.page, set, one(search.tpl));
  const w = drawOf(c, d);
  const title = ruleTitle(c, d.page);
  const base = hrefIn(c.lang, ROUTES.comboRule(d.page.rule.key));
  const previewing = set['combos.template.preview'] && q.tpl === tpl;
  const live = d.page.onSale && d.page.pairs.length > 0;
  // L2's style card opens the grid on one style (L1's body), whatever the template
  const body = !live ? null : tpl === 'L2' && q.style ? 'L1' : tpl;
  return (
    <div className={`container ca-page ca-list ca-${tpl}`} data-testid="ca-list" data-tpl={tpl} data-rule={d.page.rule.key}>
      <Crumbs c={c} title={title} />
      {!d.page.onSale ? (
        <Ended c={c} d={d} title={title} />
      ) : (
        <>
          <header className="ca-head">
            <div className="eyebrow">{c.t('ctpl.list.eyebrow', { n: c.num(d.page.rule.pieces) })}</div>
            <h1 className="h1">{c.t('ctpl.list.title', { title })}</h1>
          </header>
          {!live ? (
            <div className="ca-empty" data-testid="ca-none">
              <div className="h2">{c.t('ctpl.list.none')}</div>
              <p className="muted mt8">{c.t('ctpl.list.noneText')}</p>
              <a className="btn btn-primary mt16" href={hrefIn(c.lang, ROUTES.combos)}>
                {c.t('ctpl.list.allCombos')}
              </a>
            </div>
          ) : body === 'L1' ? (
            <L1 w={w} base={base} q={q} set={set} />
          ) : body === 'L2' ? (
            <L2 w={w} base={base} />
          ) : body === 'L3' ? (
            <L3 w={w} set={set} />
          ) : body === 'L4' ? (
            <L4 w={w} base={base} q={q} set={set} />
          ) : (
            <L5 w={w} base={base} q={q} set={set} />
          )}
        </>
      )}
      {previewing ? <PreviewBar c={c} kind="list" list={LIST_TEMPLATES} current={tpl} hrefOf={(t) => `${base}?tpl=${t}`} chosen={base} /> : null}
    </div>
  );
}
