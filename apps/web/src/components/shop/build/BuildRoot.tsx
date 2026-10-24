'use client';
// PR 98, 100 — the set builder's one client part (demo 41-set.js PAGES.set and its bs-* actions): the tier cards, the
// set's slots (on a phone above the styles, on a computer in the summary beside them), one card per style with its
// colour, size and "Add to set", the summary with the set price, and the phone's bar. A picture tap turns it in place
// (front → back → detail) and never leaves the page (R16). A piece is removed with the cross on its slot; a full set
// is swapped by removing one first. Every set price is @extas/combos' (`checkBuild` → `tierQuote`, the bag's own
// grouping); "Add set to Bag" sends the picks with one key per tap and the server checks and prices them again.
import { useRouter } from 'next/navigation';
import { useCallback, useMemo, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { addProblem, checkBuild } from '@extas/combos/pure';
import { buildWord, cardPrice, colourOpen, firstColour, headline, nextView, sizeless, statusOf, variantOf, type BuildCard, type BuildEnv, type BuildView } from '@/lib/shop/build-model';
import { formatMoney, toBnDigits } from '@/lib/shop/lang';
import { NO_COLOUR } from '@/lib/shop/product-model';
import { Icon } from '../Icon';
import { ShotPicture } from '../product/ShotPicture';
import { showToast } from '../toast';

interface Pick {
  k: string;
  variantId: string;
  productId: string;
  colourId: string | null;
  sizeId: string | null;
}

interface CardUi {
  colour: string | null;
  size: string | null;
  err: string;
  view: BuildView;
}

const newKey = () => {
  const a = new Uint8Array(12);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('');
};

export function BuildRoot({ env, foot }: { env: BuildEnv; foot: ReactNode }) {
  const router = useRouter();
  const [picks, setPicks] = useState<Pick[]>([]);
  const [cards, setCards] = useState<Record<string, CardUi>>(() => Object.fromEntries(env.cards.map((c) => [c.id, { colour: firstColour(c), size: null, err: '', view: 'front' as BuildView }])));
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const num = useCallback((x: number) => (env.bnDigits ? toBnDigits(String(x)) : String(x)), [env.bnDigits]);
  const money = useCallback((minor: number) => formatMoney(minor, env.currency, env.lang, env.bnDigits), [env.currency, env.lang, env.bnDigits]);
  const w = useCallback((key: string, vars?: Record<string, string | number>) => buildWord(env.words, key, vars), [env.words]);

  const variants = useMemo(() => env.cards.flatMap((c) => c.variants), [env.cards]);
  const ids = useMemo(() => picks.map((p) => p.variantId), [picks]);
  const check = useMemo(() => checkBuild({ picks: ids, variants, tiers: env.tiers, inBag: env.inBag, on: true, maxPerLine: env.maxPerLine }), [ids, variants, env]);
  const q = check.quote;
  const min = check.min ?? 2;
  const max = check.max ?? 2;
  const st = statusOf(q, w, money, num);
  const ready = q.count >= min;

  const cardOf = (id: string) => env.cards.find((c) => c.id === id)!;
  const colourName = (card: BuildCard, id: string | null) => card.colours.find((c) => c.id === id)?.name ?? '';
  const sizeName = (card: BuildCard, id: string | null) => card.sizes.find((s) => s.id === id)?.label ?? '';
  const setCard = (id: string, patch: Partial<CardUi>) => setCards((all) => ({ ...all, [id]: { ...all[id]!, ...patch } }));

  const pickColour = (card: BuildCard, colour: string) => {
    const cu = cards[card.id]!;
    const gone = cu.size !== null && (variantOf(card, colour, cu.size)?.sellable ?? 0) <= 0;
    setCard(card.id, { colour, err: gone ? w('err.sizeGone', { size: sizeName(card, cu.size), colour: colourName(card, colour) }) : '', size: gone ? null : cu.size });
  };

  const add = (card: BuildCard, el: Element) => {
    const cu = cards[card.id]!;
    if (picks.length >= max) return showToast(el, w('err.full'));
    if (!sizeless(card) && !cu.size) return setCard(card.id, { err: w('err.pickSize') });
    const v = variantOf(card, cu.colour, sizeless(card) ? null : cu.size);
    const vars = { size: sizeName(card, cu.size), colour: colourName(card, cu.colour) };
    const p = v ? addProblem({ picks: ids, variants, tiers: env.tiers, inBag: env.inBag, maxPerLine: env.maxPerLine }, v.id) : { code: 'SOLD_OUT' as const };
    if (p) {
      if (p.code === 'FULL') return showToast(el, w('err.full'));
      if (p.code === 'NOT_ENOUGH') return setCard(card.id, { err: w((p.inBag ?? 0) > 0 ? 'err.onlyLeftBag' : 'err.onlyLeft', { ...vars, stock: num(p.stock ?? 0) }) });
      return setCard(card.id, { err: w('err.soldOut', vars) });
    }
    const next = [...picks, { k: newKey(), variantId: v!.id, productId: card.id, colourId: cu.colour, sizeId: v!.sizeId }];
    setPicks(next);
    setCard(card.id, { err: '' });
    const nq = checkBuild({ picks: next.map((x) => x.variantId), variants, tiers: env.tiers, inBag: env.inBag, on: true, maxPerLine: env.maxPerLine }).quote;
    const base = { name: card.name, colour: vars.colour, size: sizeless(card) ? '' : vars.size };
    showToast(el, nq.next ? w('addedNext', { ...base, more: num(nq.next.more), n: num(nq.next.quantity), price: money(nq.next.priceMinor) }) : nq.applied ? w('addedSet', { ...base, price: money(nq.payMinor) }) : w('added', base));
  };

  const remove = (k: string) => setPicks((all) => all.filter((p) => p.k !== k));
  const toGrid = () => document.getElementById('bs-grid')?.scrollIntoView({ block: 'start', behavior: 'smooth' });

  const toBag = (e: MouseEvent<HTMLButtonElement>) => {
    const el = e.currentTarget;
    if (busyRef.current) return;
    if (!ready) return showToast(el, w('err.tooFew', { n: num(min) }));
    busyRef.current = true;
    setBusy(true);
    void fetch('/api/bag/built-sets', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ruleId: env.ruleId, picks: ids, addKey: newKey() }),
      credentials: 'same-origin',
    })
      .then(async (r) => {
        const d = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string; details?: string[] };
        if (r.ok && d.ok) return void window.location.assign(env.hrefs.bag);
        showToast(el, w(d.error === 'SET_INVALID' && d.details?.includes('NOT_ON') ? 'err.ended' : 'err.error'));
        router.refresh();
      })
      .catch(() => showToast(el, w('err.error')))
      .finally(() => {
        busyRef.current = false;
        setBusy(false);
      });
  };

  // ---- the pieces ----
  const tiers = (
    <div className="bs-tiers" data-testid="bs-tiers">
      {env.tiers.map((t) => {
        const on = q.applied?.quantity === t.quantity;
        const isNext = q.next?.quantity === t.quantity;
        const cls = on ? ' on' : isNext ? ' next' : t.quantity < q.count ? ' dim' : '';
        return (
          <div key={t.quantity} className={`bs-tier${cls}`} data-testid={`bs-tier-${t.quantity}`}>
            <div className="xs muted bold bs-tany">{w('tier.any', { n: num(t.quantity) })}</div>
            <div className="price bs-tprice">{money(t.priceMinor)}</div>
            {env.perItem ? <div className="xs text2">{w('tier.each', { price: money(Math.round(t.priceMinor / t.quantity)) })}</div> : null}
            {on ? (
              <span className="tag">
                <Icon name="check" size={12} />
                {w('tier.unlocked')}
              </span>
            ) : t.quantity > q.count ? (
              <span className={`tag ${isNext ? 'gold' : 'plain'}`}>{q.count ? w('tier.more', { n: num(t.quantity - q.count) }) : w('tier.pick', { n: num(t.quantity) })}</span>
            ) : null}
          </div>
        );
      })}
    </div>
  );

  const slots = (
    <div className="bs-slots" style={{ '--n': Math.min(max, 4) } as React.CSSProperties}>
      {Array.from({ length: max }, (_, i) => {
        const it = picks[i];
        if (!it) {
          return (
            <button key={`e${i}`} type="button" className="bs-slot empty" onClick={toGrid} data-testid="bs-slot-empty">
              <Icon name="plus" size={18} />
              <span>{w('set.pickItem')}</span>
              <span className="tiny bs-slotn">{w(i + 1 > min ? 'set.optional' : 'set.item', { n: num(i + 1) })}</span>
            </button>
          );
        }
        const card = cardOf(it.productId);
        const col = card.colours.find((c) => c.id === it.colourId);
        const shot = (card.shots[it.colourId ?? NO_COLOUR] ?? Object.values(card.shots)[0])?.front;
        return (
          <div key={it.k} className="bs-slot" data-testid="bs-slot">
            {shot ? <ShotPicture shot={shot} garment={card.garment} hex={col?.hex ?? ''} slot="thumb" sizes="96px" alt="" lang={env.lang} ratio="ratio-11" /> : null}
            <div className="bs-slotname" title={card.name}>
              {card.name}
            </div>
            <div className="xs muted bs-slotsub">{[col?.name, sizeName(card, it.sizeId)].filter(Boolean).join(' · ')}</div>
            <button type="button" className="bs-rm" onClick={() => remove(it.k)} aria-label={w('set.remove', { name: card.name, colour: col?.name ?? '', size: sizeName(card, it.sizeId) })} data-testid="bs-rm">
              <Icon name="close" size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );

  const card = (c: BuildCard) => {
    const cu = cards[c.id]!;
    const inSet = picks.filter((p) => p.productId === c.id).length;
    const soldOut = !c.variants.some((v) => v.sellable > 0 && v.priceMinor !== null);
    const full = picks.length >= max;
    const col = c.colours.find((x) => x.id === cu.colour);
    const shot = (c.shots[cu.colour ?? NO_COLOUR] ?? Object.values(c.shots)[0])?.[cu.view];
    const price = cardPrice(c, cu.colour, cu.size);
    const viewWord = w(`card.${nextView(cu.view)}`);
    return (
      <div key={c.id} className="card bs-card" data-testid="bs-card">
        <button type="button" className="bs-look" onClick={() => setCard(c.id, { view: nextView(cu.view) })} aria-label={w('card.look', { name: c.name, view: viewWord })}>
          {shot ? <ShotPicture shot={shot} garment={c.garment} hex={col?.hex ?? ''} slot="main" sizes="(min-width: 1024px) 18vw, (min-width: 768px) 30vw, 46vw" alt="" lang={env.lang} ratio="ratio-45" /> : null}
          {inSet ? <span className="badge-img">{inSet > 1 ? w('card.inSetN', { n: num(inSet) }) : w('card.inSet')}</span> : null}
          {cu.view !== 'front' ? <span className="badge-img bs-vbadge">{w(`card.${cu.view}`)}</span> : null}
        </button>
        <div className="bs-cinfo">
          <div>
            <span className="bs-cname">{c.name}</span>
            {price !== null ? <div className="price bs-cprice">{money(price)}</div> : null}
          </div>
          {c.colours.length ? (
            <div>
              <div className="xs muted bs-lab">
                {w('card.colour')}: <b className="text2">{col?.name ?? ''}</b>
              </div>
              <div className="bs-sws">
                {c.colours.map((x) => {
                  const out = !colourOpen(c, x.id);
                  const on = x.id === cu.colour;
                  return (
                    <button
                      key={x.id}
                      type="button"
                      className={`swatch bs-sw${on ? ' on' : ''}`}
                      style={{ background: x.hex, ...(out ? { opacity: 0.35 } : {}) }}
                      onClick={() => pickColour(c, x.id)}
                      aria-label={out ? w('card.colourOut', { colour: x.name }) : x.name}
                      aria-pressed={on}
                      title={x.name}
                      disabled={out}
                    />
                  );
                })}
              </div>
            </div>
          ) : null}
          {c.sizes.length ? (
            <div>
              <div className="xs muted bs-lab">
                {w('card.size')}
                {cu.size ? (
                  <>
                    : <b className="text2">{sizeName(c, cu.size)}</b>
                  </>
                ) : null}
              </div>
              <div className="bs-pills" role="group" aria-label={w('card.size')}>
                {c.sizes.map((s) => {
                  const out = (variantOf(c, cu.colour, s.id)?.sellable ?? 0) <= 0;
                  const on = cu.size === s.id;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      className={`size-pill bs-pill${on ? ' on' : ''}${out ? ' out' : ''}`}
                      onClick={() => setCard(c.id, { size: s.id, err: '' })}
                      aria-pressed={on}
                      aria-label={out ? w('card.sizeOut', { size: s.label }) : w('card.sizeAria', { size: s.label })}
                      disabled={out}
                    >
                      {s.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
          {cu.err ? (
            <div className="xs sale bold" role="alert">
              {cu.err}
            </div>
          ) : null}
          {soldOut ? (
            <button type="button" className="btn btn-sm btn-block" disabled>
              {w('card.soldOut')}
            </button>
          ) : full ? (
            <button type="button" className="btn btn-sm btn-block" disabled>
              {w('card.full')}
            </button>
          ) : (
            <button type="button" className="btn btn-sm btn-secondary btn-block" onClick={(e) => add(c, e.currentTarget)} data-testid="bs-add">
              <Icon name="plus" size={15} />
              {w('card.add')}
            </button>
          )}
        </div>
      </div>
    );
  };

  const totals = ready ? (
    <>
      {env.showWas && q.savingMinor > 0 ? (
        <div className="row between small">
          <span className="muted">{w('set.regular')}</span>
          <span className="strike">{money(q.regularMinor)}</span>
        </div>
      ) : null}
      <div className="row between mt8">
        <span className="bold">{w('set.price')}</span>
        <span className="price bs-sprice" data-testid="bs-price">
          {money(q.payMinor)}
        </span>
      </div>
      {q.savingMinor > 0 ? (
        <div className="row between mt8 small brandc bold">
          <span>{w('set.save')}</span>
          <span>{money(q.savingMinor)}</span>
        </div>
      ) : null}
    </>
  ) : (
    <>
      <div className="h3 bs-sline">{st.line}</div>
      <div className="small muted mt8">{w('set.showsHere')}</div>
    </>
  );

  const picked = w('set.picked', { n: num(q.count), max: num(max) });
  return (
    <>
      <div className="split-side mt16 bs-split">
        <div className="stack bs-col">
          <div className="card bs-rulecard">
            <div className="eyebrow">{env.ruleName}</div>
            <h2 className="bs-headline" data-testid="bs-headline">
              {headline(env.tiers, w, money, num)}
            </h2>
            <div className="row top small text2 mt8 bs-rnote">
              <span className="muted">
                <Icon name="info" size={16} />
              </span>
              <span>{w('ruleNote')}</span>
            </div>
            {tiers}
          </div>
          <div className="hide-d" data-testid="bs-phone-set">
            <div className="row between mb8">
              <div className="h3 bs-h3">{w('set.title')}</div>
              <span className="xs muted">{picked}</span>
            </div>
            {slots}
          </div>
          <div>
            <div className="sec-hd bs-gridhd" id="bs-grid">
              <h2 className="h2">{w('grid.title')}</h2>
              <span className="small muted">{w(env.cards.length === 1 ? 'grid.one' : 'grid.styles', { n: num(env.cards.length) })}</span>
            </div>
            {env.cards.length ? <div className="grid g4">{env.cards.map(card)}</div> : <div className="card empty">{w('grid.none')}</div>}
          </div>
          {foot}
        </div>
        <aside className="bs-donly sticky-d" aria-label={w('set.title')}>
          <div className="card bs-sum" data-testid="bs-summary">
            <div className="row between">
              <div className="h2">{w('set.title')}</div>
              <span className="xs muted">{picked}</span>
            </div>
            <div className="bar-progress mt12" aria-hidden="true">
              <div style={{ width: `${Math.round((q.count / max) * 100)}%` }} />
            </div>
            <div className="mt16">{slots}</div>
            <div className="mt16 bs-totals">{totals}</div>
            <div className="tint bs-nudge mt12">
              <Icon name="spark" size={16} />
              <span>{st.sub}</span>
            </div>
            <button type="button" className="btn btn-primary btn-block mt16" onClick={toBag} disabled={!ready || busy} data-testid="bs-bag">
              <Icon name="bag" size={18} />
              {w('toBag')}
            </button>
            <p className="xs muted bs-note">{w('note')}</p>
          </div>
        </aside>
      </div>
      <div className="mbar dm-hide bs-mbar" data-testid="bs-mbar">
        <div className="row between bs-mrow">
          <div className="grow bs-mtext">
            <div className="small bold" data-testid="bs-mbar-line">
              {st.line}
            </div>
            <div className="xs brandc bold bs-msub">{st.sub}</div>
          </div>
          <button type="button" className="btn btn-primary" onClick={toBag} disabled={!ready || busy} data-testid="bs-mbag">
            {w('toBag')}
          </button>
        </div>
      </div>
    </>
  );
}
