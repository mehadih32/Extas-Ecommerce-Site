// PR 103 — the sets landing page at /combos (demo 42-combo-auto.js ca_L3, the hub): "2 or 3 pieces · one price",
// "Combos", the season tabs when the rules use two seasons or more (`combos.seasons`), then one row per kind of set —
// the 2-piece packs, the 3-piece packs, the top + bottom sets — of cards, each card one fixed set or one auto rule and
// product (its colour pairs). On a computer the rows share lines of four columns (D-038); a phone shows one row under
// the other, each scrolling sideways. Off (`combos.landing`): "Coming soon". A rule's card opens the rule's own page
// (PR 572; ~~a rule's own list is still to come, so a card opens the first set of its group~~), whose template L3 is
// this page's body (`HubBody`). PR 98: while the set builder is open (`combos.builder`, with its
// entries on) a last row "Build your own" holds its one card ("Any 2 or 3 pieces"), packed like the others.
import type { Metadata } from 'next';
import { buildEntry } from '@/lib/shop/build';
import { cardView, setCardGroups } from '@/lib/shop/combo';
import { hubRails, hubSeasons, packRails } from '@/lib/shop/combo-model';
import { readPageSettings, shopContext, type ShopContext } from '@/lib/shop/context';
import { hrefIn } from '@/lib/shop/lang';
import { shopMetadata } from '@/lib/shop/meta';
import { ROUTES } from '@/lib/shop/routes';
import { ComingSoon } from '../ComingSoon';
import { HubTabs } from './HubTabs';
import { Icon } from '../Icon';
import { HubCard } from './SetCards';
import './combos.css';

const KEYS = ['combos.landing', 'combos.seasons'] as const;

export async function combosMetadata(): Promise<Metadata> {
  const c = await shopContext();
  const set = await readPageSettings(KEYS, c.storeId);
  const on = set['combos.landing'].on;
  if (!on) return shopMetadata(c, 'soon-combos', c.t('soon.title'), { index: false });
  return shopMetadata(c, 'combos', c.t('combo.hub.title'), { index: true, seo: { kind: 'combosHub', tokens: { name: c.t('combo.hub.title') } } });
}

type Build = Awaited<ReturnType<typeof buildEntry>>;

/** PR 98 · the "Build your own" row's one card (demo ca_L3 `build`): the empty set picture with a plus, the builder's sizes. */
function BuildRail({ c, build, p }: { c: ShopContext; build: NonNullable<Build>; p: ReturnType<typeof packRails>[number] }) {
  const list = build.quantities.map((n) => c.num(n)).join(c.t('build.hub.or'));
  return (
    <section className="ca-rail" data-testid="ca-rail-build" style={{ '--n': p.n, '--span': p.span, '--o': p.order } as React.CSSProperties}>
      <div className="row between">
        <h2 className="h2">{c.t('build.hub.rail')}</h2>
      </div>
      <div className="ca-railtrk">
        <a className="ca-card ca-build" href={hrefIn(c.lang, ROUTES.buildSet)} data-testid="ca-build">
          <div className="ca-ph ca-ph-card n2 ca-ph-empty">
            <span className="ca-plus">
              <Icon name="plus" size={28} />
            </span>
          </div>
          <div className="ca-cinfo">
            <div className="ca-ctitle">{c.t('build.hub.card')}</div>
            <div className="ca-csub">{c.t('build.hub.sub', { list })}</div>
          </div>
        </a>
      </div>
    </section>
  );
}

function Rails({ c, all, season, perRail, build }: { c: ShopContext; all: Awaited<ReturnType<typeof setCardGroups>>; season: string | null; perRail: number; build: Build }) {
  const rails = hubRails(all.groups, all.rules, season).map((r) => ({ ...r, items: r.items.slice(0, perRail) }));
  const packed = packRails([...rails.map((r) => ({ key: r.key, count: r.items.length })), ...(build ? [{ key: 'build', count: 1 }] : [])]);
  return (
    <div className="ca-rails">
      {rails.map((r, i) => {
        const p = packed[i]!;
        return (
          <section
            key={r.key}
            className="ca-rail"
            data-testid={`ca-rail-${r.key}`}
            style={{ '--n': p.n, '--span': p.span, '--o': p.order } as React.CSSProperties}
            {...(p.many ? { 'data-many': '1' } : {})}
          >
            <div className="row between">
              <h2 className="h2">{r.kind === 'packs' ? c.t('combo.hub.packs', { n: c.num(r.pieces) }) : c.t('combo.hub.topBottom')}</h2>
            </div>
            <div className="ca-railtrk">
              {r.items.map((g) => (
                <HubCard key={g.key} c={c} v={cardView(c, g, all)} />
              ))}
            </div>
          </section>
        );
      })}
      {build ? <BuildRail c={c} build={build} p={packed[rails.length]!} /> : null}
    </div>
  );
}

/** The landing page's rows with their season tabs (also a rule's own page in template L3, opened on its season). */
export function HubBody({
  c,
  all,
  build,
  seasonTabs,
  seasonList,
  perRail,
  first = null,
}: {
  c: ShopContext;
  all: Awaited<ReturnType<typeof setCardGroups>>;
  build: Build;
  seasonTabs: boolean;
  seasonList: readonly { key: string; en: string; bn: string }[];
  perRail: number;
  /** The season to open on (a rule's own season), else the first. */
  first?: string | null;
}) {
  const seasons = seasonTabs ? hubSeasons(all.groups, all.rules, seasonList.map((s) => s.key)) : [];
  const tabs = seasons.length >= 2 ? seasons.map((k) => ({ key: k, label: (() => { const s = seasonList.find((x) => x.key === k); return s ? c.t.label({ en: s.en, bn: s.bn }) : k; })() })) : [];
  if (!all.groups.length && !build) {
    return (
      <div className="ca-empty" data-testid="ca-empty">
        <p className="text2">{c.t('combo.hub.empty')}</p>
        <a className="btn btn-primary mt12" href={hrefIn(c.lang, ROUTES.home)}>
          {c.t('soon.home')}
        </a>
      </div>
    );
  }
  if (!tabs.length) return <Rails c={c} all={all} season={null} perRail={perRail} build={build} />;
  const open = tabs.find((t) => t.key === first)?.key ?? tabs[0]!.key;
  return (
    <>
      <HubTabs tabs={tabs} label={c.t('combo.hub.seasons')} initial={open} />
      {tabs.map((t) => (
        <div key={t.key} data-season-panel={t.key} hidden={t.key !== open}>
          <Rails c={c} all={all} season={t.key} perRail={perRail} build={build} />
        </div>
      ))}
    </>
  );
}

export async function CombosHub() {
  const c = await shopContext();
  const set = await readPageSettings(KEYS, c.storeId);
  const landing = set['combos.landing'];
  if (!landing.on) return <ComingSoon c={c} soonKey="combos" />;
  const [all, build] = await Promise.all([setCardGroups(c), buildEntry(c)]);
  const counts = [...new Set(all.groups.map((g) => g.cards[0]!.productIds.length))].sort((a, b) => a - b).map((n) => c.num(n));
  return (
    <div className="container ca-page ca-list ca-L3" data-testid="combos-hub">
      <nav className="ca-crumbs xs" aria-label={c.t('pdp.breadcrumb')}>
        <a href={hrefIn(c.lang, ROUTES.home)}>{c.t('pdp.home')}</a>
        <span aria-hidden="true">
          <bdi className="hide-d">›</bdi>
          <bdi className="hide-m">/</bdi>
        </span>
        <span>{c.t('combo.hub.title')}</span>
      </nav>
      <header className="ca-head">
        {counts.length ? <div className="eyebrow">{c.t('combo.hub.eyebrow', { counts: counts.join(c.t('combo.hub.or')) })}</div> : null}
        <h1 className="h1">{c.t('combo.hub.title')}</h1>
      </header>
      <HubBody c={c} all={all} build={build} seasonTabs={landing.seasonTabs} seasonList={set['combos.seasons']} perRail={landing.perRail} />
    </div>
  );
}
