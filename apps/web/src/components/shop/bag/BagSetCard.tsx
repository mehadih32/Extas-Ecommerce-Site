// PR 574 — a set in the bag in the templates B1–B5 (demo 43-combo-tpl.js cbt_B1 … cbt_B5, r12-zcombo2.css .cbt-), drawn
// on the server; BagActions sends its choices. The money is the bag engine's in every template: the set's price, its
// pieces' own prices struck (B4: each piece at its own price and one combo discount line that adds up to the same set
// price). Every template keeps "Change size or colour" (the pair page on these picks), Save / Move to wishlist and
// Remove with Undo, and the ended / repriced notes. "current" stays the SetLine of PR 108.
//   B1 one card, each piece with its own picture (read only)
//   B2 the card with each piece's size changed right in the bag (a size the stock cannot take is shown sold out)
//   B3 B2 with "Add 1 more → 3 for ৳…" for a 2-piece pair whose rule sells the 3-piece set of the same product
//   B4 the pieces at their own prices, the combo discount and "You pay for this combo"
//   B5 one short row per set once the bag holds `combos.bag.compactFrom` sets (▸ opens the B2 card); under it, B2
import type { BagSetView } from '@extas/cart';
import { colourName, photoFor, type ShopCard } from '@/lib/shop/catalogue';
import type { ShopContext } from '@/lib/shop/context';
import { hrefIn } from '@/lib/shop/lang';
import { ROUTES } from '@/lib/shop/routes';
import { plural } from '@/lib/shop/bag-model';
import { sizeChoices, sizesInBag, type BagDraw, type Nudge } from '@/lib/shop/combo-bag-model';
import { Icon } from '../Icon';
import { HubPicture, type SetPart } from '../combo/SetPicture';
import { nameOf, Note } from './BagLines';

type Props = { c: ShopContext; set: BagSetView; cards: Map<string, ShopCard>; draw: Exclude<BagDraw, 'current'>; nudge: Nudge | null; lowStockAt: number };

interface Info {
  c: ShopContext;
  set: BagSetView;
  name: string;
  setHref: string;
  changeHref: string;
  parts: SetPart[];
}

function infoOf(c: ShopContext, set: BagSetView, cards: Map<string, ShopCard>): Info {
  const setHref = hrefIn(c.lang, ROUTES.combo(set.slug));
  const parts = set.pieces.map((p) => {
    const card = p.productId ? cards.get(p.productId) : undefined;
    return { garment: card?.garment ?? null, hex: p.colour?.hex ?? '', photo: card ? photoFor(card, p.colour?.key) : null, name: [p.colour ? colourName(p.colour, c.lang) : null, nameOf(p, c)].filter(Boolean).join(' ') };
  });
  return { c, set, name: nameOf(set, c), setHref, changeHref: `${setHref}?from=${encodeURIComponent(set.groupKey)}`, parts };
}

function Thumb({ x, link = true }: { x: Info; link?: boolean }) {
  const pic = <HubPicture parts={x.parts} lang={x.c.lang} alt={x.name} layout="thumb" />;
  return link ? (
    <a className="bg-thumb" href={x.setHref} aria-label={x.name}>
      {pic}
    </a>
  ) : (
    <span className="bg-thumb">{pic}</span>
  );
}

function Price({ x }: { x: Info }) {
  const { c, set } = x;
  const struck = set.regularMinor > set.payMinor;
  return (
    <div className="cbt-pr">
      <div className="price" data-testid="bag-set-price">
        {c.money(set.payMinor)}
      </div>
      {struck ? <div className="strike xs">{c.money(set.regularMinor)}</div> : null}
    </div>
  );
}

function Head({ x, thumb, price = true }: { x: Info; thumb: boolean; price?: boolean }) {
  const { c, set } = x;
  return (
    <div className={`cbt-top${thumb ? '' : ' cbt-nothumb'}${price ? '' : ' cbt-noprice'}`}>
      {thumb ? <Thumb x={x} /> : null}
      <div className="cbt-hd">
        <a className="bg-name" href={x.setHref}>
          {x.name}
        </a>
        <div className="xs muted">
          {plural(c.t, 'bag.set.pieces', set.pieces.length, c.num)}
          {set.savingMinor > 0 && price ? (
            <>
              {' · '}
              <span className="cbt-save">{c.t('ctpl.bag.youSave', { amount: c.money(set.savingMinor) })}</span>
            </>
          ) : null}
        </div>
      </div>
      {price ? <Price x={x} /> : null}
    </div>
  );
}

function Pieces({ x, edit, lowStockAt }: { x: Info; edit: boolean; lowStockAt: number }) {
  const { c, set } = x;
  return (
    <ul className="cbt-pcs">
      {set.pieces.map((p, i) => {
        const pn = nameOf(p, c);
        const colour = p.colour ? colourName(p.colour, c.lang) : '';
        const low = p.left > 0 && p.left <= lowStockAt ? c.t('bag.line.low', { n: c.num(p.left) }) : null;
        const id = `cbt-${set.groupKey}-${i}`;
        const label = [colour, pn].filter(Boolean).join(' ');
        return (
          <li key={p.lineId} className="cbt-pc">
            <HubPicture parts={[x.parts[i]!]} lang={c.lang} alt={x.parts[i]!.name} layout="thumb" />
            <div className="cbt-pcn">
              <b>{pn}</b>
              <span>
                {colour}
                {!edit && p.size ? ` · ${p.size}` : null}
                {low ? (
                  <>
                    {' · '}
                    <span className="cbt-low" data-testid="bag-piece-low">
                      {low}
                    </span>
                  </>
                ) : null}
              </span>
            </div>
            {edit && p.sizes.length > 1 ? (
              <span>
                <label className="sr" htmlFor={id}>
                  {c.t('ctpl.bag.sizeFor', { piece: label })}
                </label>
                <select
                  key={`${p.lineId}-${p.sizeId}`}
                  id={id}
                  className="cbt-sel"
                  data-bag-change="set-size"
                  data-group={set.groupKey}
                  data-i={i}
                  data-was={p.sizeId ?? ''}
                  data-choices={JSON.stringify(sizeChoices(set.pieces, i, p.sizeId ?? ''))}
                  data-msg={c.t('ctpl.bag.sizeChanged', { piece: label, from: p.size ?? '' })}
                  data-testid="bag-size-sel"
                  defaultValue={p.sizeId ?? ''}
                >
                  {p.sizes.map((z) => (
                    <option key={z.id} value={z.id} disabled={!z.ok}>
                      {z.ok ? z.label : c.t('bag.line.soldOut', { option: z.label })}
                    </option>
                  ))}
                </select>
              </span>
            ) : (
              <span className="cbt-pcr">{edit ? p.size : null}</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function Notes({ x }: { x: Info }) {
  const { c, set } = x;
  return (
    <>
      {set.note === 'ENDED_KEEPS_PRICE' ? <Note testId="bag-set-ended" text={c.t('bag.set.ended')} /> : null}
      {set.note === 'PRICE_CHANGED' ? <Note testId="bag-set-repriced" text={c.t('bag.set.repriced')} /> : null}
    </>
  );
}

/** The three actions on one line; on a narrow phone the words step down (BagActions' fit). */
function Acts({ x }: { x: Info }) {
  const { c, set } = x;
  return (
    <div className="cbt-acts cbt-fit" data-bag-fit="">
      <a className="link cbt-chg" href={x.changeHref} data-testid="bag-set-change" aria-label={c.t('bag.set.change')}>
        <Icon name="edit" size={14} />
        <span className="cbt-f">{c.t('bag.set.change')}</span>
        <span className="cbt-s">{c.t('bag.set.changeShort')}</span>
      </a>
      <button type="button" className="link zc-wishbtn" data-bag-act="save" data-id={set.lineId} data-name={x.name} aria-label={c.t('bag.set.save')}>
        <Icon name="heart" size={15} />
        <span className="cbt-f">{c.t('bag.line.save')}</span>
        <span className="cbt-s">{c.t('bag.line.saveShort')}</span>
      </button>
      <button type="button" className="link" data-bag-act="remove" data-id={set.lineId} data-name={x.name} data-set="1" aria-label={c.t('bag.set.remove')}>
        {c.t('bag.line.remove')}
      </button>
    </div>
  );
}

/** B3 · "Add 1 more → 3 for ৳…": it opens the colours the 3rd piece can take, in this pair's size. */
function NudgeBox({ x, n }: { x: Info; n: Nudge }) {
  const { c, set } = x;
  const pay = n.price.pay ?? 0;
  const more = Math.max(0, n.price.saving - set.savingMinor);
  const count = c.num(n.pieces);
  return (
    <details className="cbt-nudge-d" data-testid="bag-nudge">
      <summary className="cbt-nudge">
        <span className="grow">
          <b>{c.t('ctpl.bag.nudge', { pieces: count, price: c.money(pay) })}</b>
          {c.t('ctpl.bag.each', { price: c.money(Math.round(pay / n.pieces)) })}
          {more > 0 ? ` · ${c.t('ctpl.bag.saveMore', { amount: c.money(more) })}` : null}
        </span>
        <span className="btn btn-secondary btn-sm">
          <Icon name="plus" size={15} />
          {c.t('ctpl.bag.add1')}
        </span>
      </summary>
      <div className="cbt-more">
        <p className="small text2">{c.t('ctpl.bag.pick', { size: n.sizeLabel ?? '', pieces: count, price: c.money(pay) })}</p>
        <div className="cbt-cols">
          {n.colours.map((col) => {
            const name = colourName(col, c.lang);
            return (
              <button
                key={col.colourId}
                type="button"
                className="chip cbt-col"
                disabled={!col.ok}
                data-bag-act="set-grow"
                data-group={set.groupKey}
                data-slug={col.slug}
                data-choices={JSON.stringify(col.choices)}
                data-msg={c.t('ctpl.bag.grown', { pieces: count, price: c.money(col.price.pay ?? 0) })}
                data-testid="bag-nudge-colour"
              >
                <span className="swatch sm" style={{ background: col.hex }} aria-hidden="true" />
                <span>{name}</span>
                {col.ok ? null : <em>{c.t('ctpl.bag.outSize', { size: n.sizeLabel ?? '' })}</em>}
              </button>
            );
          })}
        </div>
      </div>
    </details>
  );
}

/** B4 · the pieces at their own prices, one combo discount line, and what the combo costs. */
function Split({ x }: { x: Info }) {
  const { c, set } = x;
  const discount = set.regularMinor - set.payMinor;
  return (
    <ul className="cbt-split" data-testid="bag-split">
      {set.pieces.map((p) => (
        <li key={p.lineId}>
          <span>{[nameOf(p, c), p.colour ? colourName(p.colour, c.lang) : null, p.size].filter(Boolean).join(' · ')}</span>
          <span>{c.money(p.unitPriceMinor)}</span>
        </li>
      ))}
      {discount > 0 ? (
        <li className="cbt-disc">
          <span>{c.t('ctpl.bag.discount')}</span>
          <span>{c.money(-discount)}</span>
        </li>
      ) : null}
      <li className="cbt-sum">
        <span>{c.t('ctpl.bag.youPay')}</span>
        <span data-testid="bag-set-price">{c.money(set.payMinor)}</span>
      </li>
    </ul>
  );
}

export function BagSetCard({ c, set, cards, draw, nudge, lowStockAt }: Props) {
  const x = infoOf(c, set, cards);
  const edit = sizesInBag(draw);
  if (draw === 'B4') {
    return (
      <div className="cbt-card" data-line={set.lineId} data-testid="bag-set" data-btpl="B4">
        <Head x={x} thumb price={false} />
        <Split x={x} />
        <Notes x={x} />
        <Acts x={x} />
      </div>
    );
  }
  const body = (
    <>
      <Pieces x={x} edit={edit} lowStockAt={lowStockAt} />
      {draw === 'B3' && nudge ? <NudgeBox x={x} n={nudge} /> : null}
      <Notes x={x} />
      <Acts x={x} />
    </>
  );
  if (draw === 'B5row') {
    const colours = set.pieces.map((p) => (p.colour ? colourName(p.colour, c.lang) : '')).filter(Boolean);
    const sizes = set.pieces.map((p) => p.size ?? '').join(' / ');
    // an auto pair's name already says its colours ("Polo — Navy + Black"); a set's own name gets them after it
    const named = colours.every((n) => x.name.includes(n));
    return (
      <details className="cbt-b5" data-line={set.lineId} data-testid="bag-set" data-btpl="B5">
        <summary className="cbt-row" aria-label={`${x.name} · ${c.money(set.payMinor)} · ${c.t('ctpl.bag.open')}`}>
          <Thumb x={x} link={false} />
          {/* the words step down (demo cbt_fitTxt) instead of being cut: the name → its colours, "sizes · you save" → the
              sizes (BagActions' fit, `data-bag-fit`) */}
          <span className="cbt-rowt">
            <b className="cbt-fit" data-bag-fit="">
              <span className="cbt-f">{named ? x.name : [x.name, colours.join(' + ')].filter(Boolean).join(' · ')}</span>
              <span className="cbt-s">{colours.join(' + ') || x.name}</span>
            </b>
            <span className="cbt-fit" data-bag-fit="">
              <span className="cbt-f">{set.savingMinor > 0 ? `${sizes} · ${c.t('ctpl.bag.youSave', { amount: c.money(set.savingMinor) })}` : sizes}</span>
              <span className="cbt-s">{sizes}</span>
            </span>
          </span>
          <span className="cbt-rowp" data-testid="bag-set-price">
            {c.money(set.payMinor)}
          </span>
          <span className="cbt-exp" aria-hidden="true">
            <Icon name="down" size={16} />
          </span>
        </summary>
        <div className="cbt-card cbt-open">{body}</div>
      </details>
    );
  }
  const tpl = draw === 'B5card' ? 'B5' : draw;
  return (
    <div className="cbt-card" data-line={set.lineId} data-testid="bag-set" data-btpl={tpl}>
      <Head x={x} thumb={false} />
      {body}
    </div>
  );
}
