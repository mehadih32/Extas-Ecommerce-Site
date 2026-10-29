// PR 98, 100 — "Build your own set" at /combos/build-your-own and /combos/build-your-own/<group> (demo 41-set.js
// PAGES.set, `#/set` and `#/set/<rule>`), in the store shell: the crumbs (Home / Combos / Build your own set; the phone
// keeps two steps, D-040), the title, a tab per set group when there are several, then the client part (the tier cards,
// the set's slots, a card per style, the summary beside them on a computer and the bar at the bottom of a phone) and the
// Size exchange card. While the builder is off (`combos.builder`, the owner's switch, off by default) or no set tier
// rule is live, the page says it is taking a break and shows the ready-made sets. Nothing is priced here.
import type { Metadata } from 'next';
import { cache } from 'react';
import { buildPage, previewAsked } from '@/lib/shop/build';
import { headline, tabLine } from '@/lib/shop/build-model';
import { setCardGroups } from '@/lib/shop/combo';
import { readPageSettings, shopContext, type ShopContext } from '@/lib/shop/context';
import { hrefIn } from '@/lib/shop/lang';
import { shopMetadata } from '@/lib/shop/meta';
import { ROUTES } from '@/lib/shop/routes';
import { Icon } from '../Icon';
import '../bag/bag.css';
import '../combo/combo.css';
import { MoreSets } from '../combo/SetCards';
import { BuildRoot } from './BuildRoot';
import './build.css';

export type BuildSearch = Record<string, string | string[] | undefined>;

const pageFor = cache((group: string | null, preview: boolean) => shopContext().then((c) => buildPage(c, group, preview)));

const groupPath = (key: string) => `${ROUTES.buildSet}/${encodeURIComponent(key)}`;

export async function buildMetadata(group: string | null, search: BuildSearch): Promise<Metadata> {
  const c = await shopContext();
  const preview = previewAsked(search);
  const r = await pageFor(group, preview);
  const m = await shopMetadata(c, 'combos/build-your-own', c.t('build.title'), { path: ROUTES.buildSet, index: Boolean(r?.env) && !preview && !group });
  if (r?.env && r.group) m.description = `${r.env.ruleName} · ${headline(r.group.tiers, (k, v) => c.t(`build.${k}`, v), c.money, c.num)}`;
  return m;
}

function Crumbs({ c }: { c: ShopContext }) {
  return (
    <nav className="crumbs cb-crumbs" aria-label={c.t('pdp.breadcrumb')}>
      <a href={hrefIn(c.lang, ROUTES.home)}>{c.t('pdp.home')}</a>
      <span aria-hidden="true">/</span>
      <a className="hide-m" href={hrefIn(c.lang, ROUTES.combos)}>
        {c.t('combo.crumbCombos')}
      </a>
      <span className="hide-m" aria-hidden="true">
        /
      </span>
      <span>{c.t('build.title')}</span>
    </nav>
  );
}

/** The Size exchange card under the styles (demo bs foot), only while the exchange rule is on; the whole-set promise
 * only when the owner has made it (`combos.page.parts.exchangeLine`, off by default). */
async function Foot({ c }: { c: ShopContext }) {
  const set = await readPageSettings(['combos.page.parts'] as const, c.storeId);
  return (
    <>
      {c.flags.exchange ? (
        <div className="card p16" data-testid="bs-exchange">
          <div className="row top bs-foot">
            <span className="brandc bs-footicon">
              <Icon name="swap" size={20} />
            </span>
            <div className="grow">
              <div className="h3 bs-footh">{c.t('combo.rules.exchange')}</div>
              <div className="small text2">{c.t('combo.rules.exchangeText', c.vars)}</div>
              {set['combos.page.parts'].exchangeLine ? <div className="small bold mt8">{c.t('combo.rules.exchangeSet')}</div> : null}
            </div>
          </div>
        </div>
      ) : null}
      <p className="xs muted hide-d bs-note">{c.t('build.note')}</p>
    </>
  );
}

/** The builder is off, or nothing can be built now (demo bs_empty): the ready-made sets still have a set price. */
async function Off({ c }: { c: ShopContext }) {
  const all = await setCardGroups(c);
  return (
    <div className="container bs-wrap" data-testid="build-page" data-state="off">
      <Crumbs c={c} />
      <div className="card cb-off mt16" data-testid="build-off">
        <span className="cb-ico">
          <Icon name="layers" size={26} />
        </span>
        <h1 className="h1 mt16">{c.t('build.off.title')}</h1>
        <p className="text2 bs-offtext">
          {c.t('build.off.text')} {all.groups.length ? c.t('build.off.sets') : c.t('build.off.soon')}
        </p>
        <div className="row wrap mt24 bs-offbtns">
          <a className="btn btn-primary" href={hrefIn(c.lang, ROUTES.home)}>
            {c.t('build.off.home')}
          </a>
        </div>
      </div>
      {all.groups.length ? <MoreSets c={c} groups={all.groups.slice(0, 12)} all={all} title={c.t('build.off.readyMade')} /> : null}
    </div>
  );
}

export async function BuildPage({ group, search }: { group: string | null; search: BuildSearch }) {
  const c = await shopContext();
  const preview = previewAsked(search);
  const r = await pageFor(group, preview);
  if (!r?.env || !r.group) return <Off c={c} />;
  const missing = group !== null && r.group.key !== group;
  const keep = preview ? '?try=1' : '';
  return (
    <div className="container bs-wrap" data-testid="build-page" data-state="on">
      <Crumbs c={c} />
      <header className="bs-hd">
        <div className="eyebrow">{c.t('build.eyebrow')}</div>
        <h1 className="h1 bs-h1">{c.t('build.title')}</h1>
        <p className="text2">{c.t('build.lead')}</p>
      </header>
      {missing ? (
        <div className="warnbox p16 small mt16" role="status" data-testid="bs-missing">
          {c.t('build.missing')}
        </div>
      ) : null}
      {r.builder.groups.length > 1 ? (
        <nav className="bs-tabs" aria-label={c.t('build.groups')}>
          {r.builder.groups.map((g) => {
            const on = g.key === r.group!.key;
            return (
              <a key={g.key} className={`bs-tab${on ? ' on' : ''}`} href={`${hrefIn(c.lang, groupPath(g.key))}${keep}`} aria-current={on ? 'page' : undefined} data-testid="bs-tab">
                <b>{c.lang === 'bn' && g.nameBn ? g.nameBn : g.nameEn}</b>
                <span>{tabLine(g.tiers, (k, v) => c.t(`build.${k}`, v), c.money, c.num)}</span>
              </a>
            );
          })}
        </nav>
      ) : null}
      <BuildRoot key={r.group.key} env={r.env} foot={<Foot c={c} />} />
    </div>
  );
}
