// PR 102, 103 — the set cards: "More sets" under a combo page (demo cb_comboCard: the set's picture, "Set of 2", its
// name and set price with the pieces' own total struck), the sets landing page's cards (demo ca_styleCard: the pieces
// laid over each other, "Save ৳400" and "2 pcs" badges, "15 pairs · pick any", the price "for 2" and the colours) and
// the product page's set offer line (demo pdp_nudges). Prices are the ones @extas/combos gave each card.
import type { ShopContext } from '@/lib/shop/context';
import { cardView, type CardView, type SetCardGroups } from '@/lib/shop/combo';
import type { HubGroup } from '@/lib/shop/combo-model';
import { Icon } from '../Icon';
import { HubPicture, SetPicture } from './SetPicture';
import './offer.css';

/** The colour dots a landing card shows before "+N" (demo ca_styleCard: six). */
const HUB_DOTS = 6;

const altOf = (c: ShopContext, v: CardView) => c.t('combo.card.alt', { pieces: v.pieces.map((p) => p.name).join(', ') });

/** How many sets a card stands for ("15 pairs · pick any"), or null for one set. */
function countLine(c: ShopContext, v: CardView): string | null {
  if (v.count < 2) return null;
  return c.t(v.pieces.length === 2 ? 'combo.card.pairs' : 'combo.card.sets', { n: c.num(v.count) });
}

/** One card of "More sets" (demo cb_comboCard). */
export function SetCardItem({ c, v }: { c: ShopContext; v: CardView }) {
  const sub = countLine(c, v) ?? v.pieceNames;
  return (
    <a className="pcard cb-setcard" href={v.href} data-testid="combo-card">
      <SetPicture parts={v.pieces} lang={c.lang} alt={altOf(c, v)} ratio="ratio-11" sizes="(min-width: 1024px) 30vw, 50vw">
        {v.saving > 0 ? <span className="badge-img sale">{c.t('combo.card.save', { amount: c.money(v.saving) })}</span> : null}
      </SetPicture>
      <div className="pinfo">
        <div className="eyebrow">{c.t('combo.setOf', { n: c.num(v.pieces.length) })}</div>
        <div className="pname" style={{ marginTop: 4 }}>
          {v.name}
        </div>
        {sub ? (
          <div className="xs muted" style={{ marginBottom: 6, lineHeight: 1.4 }}>
            {sub}
          </div>
        ) : null}
        {v.pay !== null ? (
          <div className="row" style={{ gap: 7, alignItems: 'baseline' }}>
            <span className="price">{c.money(v.pay)}</span>
            {v.saving > 0 && v.regular !== null ? <span className="strike small">{c.money(v.regular)}</span> : null}
          </div>
        ) : null}
      </div>
    </a>
  );
}

/** "More sets" (demo cb_moreSets), or nothing when no other set is on sale. */
export function MoreSets({ c, groups, all, title }: { c: ShopContext; groups: readonly HubGroup[]; all: SetCardGroups; title: string }) {
  if (!groups.length) return null;
  return (
    <section className="section" id="cb-more" data-testid="cb-more">
      <div className="sec-hd">
        <h2 className="h2">{title}</h2>
      </div>
      <div className="grid g3">
        {groups.map((g) => (
          <SetCardItem key={g.key} c={c} v={cardView(c, g, all)} />
        ))}
      </div>
    </section>
  );
}

/** One card of the sets landing page (demo ca_styleCard). */
export function HubCard({ c, v }: { c: ShopContext; v: CardView }) {
  const shown = v.colours.slice(0, HUB_DOTS);
  const extra = v.colours.length - shown.length;
  return (
    <a className="ca-card ca-style" href={v.href} data-testid="ca-card">
      <HubPicture parts={v.pieces} lang={c.lang} alt={altOf(c, v)}>
        {v.saving > 0 ? <span className="ca-bdg save">{c.t('combo.card.save', { amount: c.money(v.saving) })}</span> : null}
        <span className="ca-bdg pcs">{c.t('combo.card.pcs', { n: c.num(v.pieces.length) })}</span>
      </HubPicture>
      <div className="ca-cinfo">
        <div className="ca-ctitle">{v.sameProduct ? c.t('combo.card.title', { name: v.styleName || v.name }) : v.name}</div>
        <div className="ca-csub">{countLine(c, v) ?? v.pieceNames ?? ''}</div>
        {v.pay !== null ? (
          <div className="ca-cprice">
            <b className="price">{c.money(v.pay)}</b>{' '}
            {v.sameProduct ? <span className="xs muted">{c.t('combo.card.for', { n: c.num(v.pieces.length) })}</span> : v.saving > 0 && v.regular !== null ? <span className="strike xs">{c.money(v.regular)}</span> : null}
          </div>
        ) : null}
        {shown.length ? (
          <div className="ca-csz">
            <span className="ca-dots many" aria-hidden="true">
              {shown.map((col) => (
                <i key={col.key} style={{ background: col.hex }} />
              ))}
            </span>
            {extra ? <span className="xs muted">{c.t('combo.card.more', { n: c.num(extra) })}</span> : null}
          </div>
        ) : null}
      </div>
    </a>
  );
}

/**
 * PR 102 · the product page's set offer (demo pdp_nudges): one line per set this product is in, "Polo Duo: any 2
 * colours for ৳1,800 · Save ৳200", linking to the set.
 */
export function SetOffer({ c, groups, all }: { c: ShopContext; groups: readonly HubGroup[]; all: SetCardGroups }) {
  if (!groups.length) return null;
  return (
    <div className="pdp-sec stack s8 pdp-nudgesec" data-testid="pdp-set-offer">
      {groups.map((g) => {
        const v = cardView(c, g, all);
        if (v.pay === null) return null;
        const what = v.sameProduct ? c.t('combo.offer.any', { n: c.num(v.pieces.length) }) : (v.pieceNames ?? '');
        return (
          <a key={g.key} className="tint pdp-nudge" href={v.href} data-testid="pdp-set-nudge">
            <span className="ic">
              <Icon name="layers" size={17} />
            </span>
            <span className="grow">
              <b>{v.name}</b>: {c.t('combo.offer.line', { what, price: c.money(v.pay) })}
              {v.saving > 0 ? (
                <>
                  {' · '}
                  <span className="brandc bold">{c.t('combo.offer.save', { amount: c.money(v.saving) })}</span>
                </>
              ) : null}
            </span>
            <Icon name="right" size={16} />
          </a>
        );
      })}
    </div>
  );
}
