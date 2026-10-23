// PR 103 — the sets landing page at /combos (demo 42-combo-auto.js ca_L3, the hub): "2 or 3 pieces · one price",
// "Combos", the season tabs when the rules use two seasons or more (`combos.seasons`), then one row per kind of set —
// the 2-piece packs, the 3-piece packs, the top + bottom sets — of cards, each card one fixed set or one auto rule and
// product (its colour pairs). On a computer the rows share lines of four columns (D-038); a phone shows one row under
// the other, each scrolling sideways. Off (`combos.landing`): "Coming soon". A rule's own list (PR 572) and "Build your
// own" (PR 98) are still to come, so a card opens the first set of its group.
import type { Metadata } from 'next';
import { cardView, setCardGroups } from '@/lib/shop/combo';
import { hubRails, hubSeasons, packRails } from '@/lib/shop/combo-model';
import { readPageSettings, shopContext, type ShopContext } from '@/lib/shop/context';
import { hrefIn } from '@/lib/shop/lang';
import { shopMetadata } from '@/lib/shop/meta';
import { ROUTES } from '@/lib/shop/routes';
import { ComingSoon } from '../ComingSoon';
import { HubTabs } from './HubTabs';
import { HubCard } from './SetCards';
import './combos.css';

const KEYS = ['combos.landing', 'combos.seasons'] as const;

export async function combosMetadata(): Promise<Metadata> {
  const c = await shopContext();
  const set = await readPageSettings(KEYS, c.storeId);
  const m = await shopMetadata(c, set['combos.landing'].on ? 'combos' : 'soon-combos', set['combos.landing'].on ? c.t('combo.hub.title') : c.t('soon.title'));
  if (!set['combos.landing'].on) m.robots = { index: false, follow: true };
  return m;
}

function Rails({ c, all, season, perRail }: { c: ShopContext; all: Awaited<ReturnType<typeof setCardGroups>>; season: string | null; perRail: number }) {
  const rails = hubRails(all.groups, all.rules, season).map((r) => ({ ...r, items: r.items.slice(0, perRail) }));
  const packed = packRails(rails.map((r) => ({ key: r.key, count: r.items.length })));
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
    </div>
  );
}

export async function CombosHub() {
  const c = await shopContext();
  const set = await readPageSettings(KEYS, c.storeId);
  const landing = set['combos.landing'];
  if (!landing.on) return <ComingSoon c={c} soonKey="combos" />;
  const all = await setCardGroups(c);
  const seasonList = set['combos.seasons'];
  const seasons = landing.seasonTabs ? hubSeasons(all.groups, all.rules, seasonList.map((s) => s.key)) : [];
  const tabs = seasons.length >= 2 ? seasons.map((k) => ({ key: k, label: (() => { const s = seasonList.find((x) => x.key === k); return s ? c.t.label({ en: s.en, bn: s.bn }) : k; })() })) : [];
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
      {all.groups.length ? (
        tabs.length ? (
          <>
            <HubTabs tabs={tabs} label={c.t('combo.hub.seasons')} initial={tabs[0]!.key} />
            {tabs.map((t, i) => (
              <div key={t.key} data-season-panel={t.key} hidden={i > 0}>
                <Rails c={c} all={all} season={t.key} perRail={landing.perRail} />
              </div>
            ))}
          </>
        ) : (
          <Rails c={c} all={all} season={null} perRail={landing.perRail} />
        )
      ) : (
        <div className="ca-empty" data-testid="ca-empty">
          <p className="text2">{c.t('combo.hub.empty')}</p>
          <a className="btn btn-primary mt12" href={hrefIn(c.lang, ROUTES.home)}>
            {c.t('soon.home')}
          </a>
        </div>
      )}
    </div>
  );
}
