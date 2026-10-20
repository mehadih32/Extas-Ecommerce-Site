// S03 · PR 99 — "What customers can combine" under the fixed combos (demo acb_ruleCard): one card per set tier rule
// from Smart Rules — its state, what it covers and how many products that is, each tier's price and "each" (or "not
// offered"), and the way to change it. The prices and the switch live in Smart Rules only, where a price needs the
// owner's OK, so this card shows them and links there; it never writes. Drawn on the server (no hooks).
import Link from 'next/link';
import type { SetTierView } from '@extas/combos';
import { t, type Dict } from '@/lib/i18n';
import { Icon } from '../Icon';
import { nameIn, type Lang } from './model';
import { StatePill } from './parts';

export interface SetTiersProps {
  dict: Dict;
  lang: Lang;
  fmt(minor: number | null): string;
  num(n: number): string;
  tiers: SetTierView[];
  /** The Smart Rules page (from the admin's page table). */
  rulesHref: string;
}

export function SetTiers({ dict: d, lang, fmt, num, tiers, rulesHref }: SetTiersProps) {
  const tt = (k: string, vars?: Record<string, string | number>) => t(d, `combos.${k}`, vars);
  const where = (x: SetTierView['include'][number]) => (x.type === 'all' ? tt('tiers.all') : nameIn(lang, x.nameEn, x.nameBn) || tt('tiers.missing'));
  return (
    <section className="cb-tiers-sec" data-testid="cb-tiers">
      <div className="cb-sec-hd">
        <div>
          <h2 className="cb-h2">{tt('tiers.title')}</h2>
          <p className="ad-intro">{tt('tiers.intro')}</p>
        </div>
        <Link className="ad-btn ad-btn-ghost" href={rulesHref}>
          <Icon name="bolt" size={16} />
          {tt('tiers.open')}
        </Link>
      </div>
      {tiers.length ? (
        <div className="cb-grid">
          {tiers.map((r) => {
            const name = nameIn(lang, r.nameEn, r.nameBn);
            const live = r.state === 'live';
            return (
              <article key={r.ruleId} className={`ad-card cb-tier-card${live ? '' : ' off'}`} data-testid={`cb-tier-${r.key}`}>
                <div className="cb-card-hd">
                  <div className="cb-card-hd-t">
                    <h3 className="cb-h3">{name}</h3>
                    <div className="cb-tags">
                      <StatePill dict={d} state={r.state} />
                      <span className="ad-mini">{tt('tiers.products', { n: num(r.products) })}</span>
                    </div>
                  </div>
                </div>
                <div className="cb-items">
                  {r.include.map((x, i) => (
                    <span key={`i${i}`}>{where(x)}</span>
                  ))}
                  {r.exclude.map((x, i) => (
                    <span key={`x${i}`} className="cb-ex-chip">
                      {tt('tiers.except', { name: where(x) })}
                    </span>
                  ))}
                </div>
                <div className="cb-tier-boxes">
                  {r.tiers.map((x) => (
                    <div key={x.quantity} className={`cb-tier-box${x.priceMinor === null ? ' none' : ''}`} data-testid={`cb-tier-${r.key}-${x.quantity}`}>
                      <div className="ad-mini">{tt('tiers.items', { n: num(x.quantity) })}</div>
                      {x.priceMinor === null ? <b>{tt('tiers.notOffered')}</b> : <b>{fmt(x.priceMinor)}</b>}
                      {x.eachMinor !== null ? <div className="ad-mini">{tt('tiers.each', { price: fmt(x.eachMinor) })}</div> : null}
                    </div>
                  ))}
                </div>
                <div className={`ad-mini${live ? '' : ' cb-warn'}`}>{tt(live ? 'tiers.liveNote' : 'tiers.offNote')}</div>
                <div className="ad-mini">{tt('tiers.changeNote')}</div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="cb-empty" data-testid="cb-tiers-empty">
          {tt('tiers.empty')}
        </div>
      )}
    </section>
  );
}
