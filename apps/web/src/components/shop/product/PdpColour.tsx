'use client';
// PR 55 — the colours (Blueprint D3.5 / D3.7, demo 30-product.js pdp_colour, ACT pdp-allcolors / pdp-allpick): "Colour –
// Navy", one swatch per colour on one row (a sold-out colour struck through, still tappable to see it), and "All N
// colours" — after the last swatch, or up on the label line from `pdp.colour.allColoursFrom` colours — which opens a
// sheet with each colour's picture. Picking a colour there goes straight back to the buy buttons (the phone's bar
// wakes) and says so. The colour's own note and the true-colour link are the owner's switches.
import { useCallback, useRef, useState } from 'react';
import { Icon } from '../Icon';
import { showToast } from '../toast';
import { allColoursAt } from '@/lib/shop/pdp-colour';
import { stockOf } from '@/lib/shop/product-model';
import { PdpModal } from './PdpModal';
import { usePdp } from './PdpRoot';
import { sweepClass } from '@/lib/shop/sweep-class';
import { ShotPicture } from './ShotPicture';

/** The phone's buy bar glows for a moment after a pick (demo `woke`). */
export function wakeBar(): void {
  const bar = document.querySelector('.pdp-mbar');
  if (!bar) return;
  bar.classList.remove('woke');
  void (bar as HTMLElement).offsetWidth;
  bar.classList.add('woke');
  setTimeout(() => bar.classList.remove('woke'), 1400);
}

export function PdpColour({ lang }: { lang: 'en' | 'bn' }) {
  const { m, set, choice, w, num, pickColour } = usePdp();
  const [open, setOpen] = useState(false);
  const opener = useRef<HTMLButtonElement | null>(null);
  const close = useCallback(() => setOpen(false), []);
  const n = m.colours.length;
  if (!n) return null;
  const cur = m.colours.find((c) => c.key === choice.colour) ?? m.colours[0]!;
  const at = allColoursAt(n, set.colour);

  const pick = (key: string, el: HTMLElement) => {
    if (key === choice.colour) return;
    const size = m.sizes.find((s) => s.key === choice.size);
    if (size && stockOf(m, key, size.key) <= 0) showToast(el, w('sizeGone', { size: size.label, colour: m.colours.find((c) => c.key === key)?.name ?? key }));
    pickColour(key);
  };

  const all = at ? (
    <button
      ref={opener}
      type="button"
      className={`link pdp-allc pdp-fx${sweepClass(set.sweep.allColours)}`}
      data-fx-max="2"
      data-l="0"
      aria-label={w('seeAll', { n: num(n) })}
      aria-haspopup="dialog"
      onClick={() => setOpen(true)}
    >
      <span className="pf pf0">{w('allColours', { n: num(n) })}</span>
      <span className="pf pf1">{w('nColours', { n: num(n) })}</span>
      <span className="pf pf2">
        <Icon name="grid" size={16} />
        {num(n)}
      </span>
      <span className="pdp-allc-chev">
        <Icon name="right" size={15} />
      </span>
    </button>
  ) : null;

  return (
    <div className={`pdp-sec pdp-colsec${at === 'up' ? ' allc-up' : ' allc-sw'}`}>
      <div className="pdp-lblrow" data-fitrow="">
        <span className={`pdp-lbl pdp-fitt${sweepClass(set.sweep.colourLabel)}`}>
          {w('colour')} <span className="pdp-lblv">{cur.name}</span>
        </span>
        {at === 'up' ? all : null}
      </div>
      {n > 1 ? (
        <div className="pdp-sw mt8" {...(at === 'up' ? {} : { 'data-fitrow': '' })} role="radiogroup" aria-label={w('colour')} style={{ ['--n' as string]: n }}>
          {m.colours.map((c) => {
            const on = c.key === cur.key;
            const so = stockOf(m, c.key) <= 0;
            return (
              <button
                key={c.key}
                type="button"
                className={`swatch${on ? ' on' : ''}${so ? ' so' : ''}`}
                style={{ background: c.hex }}
                role="radio"
                aria-checked={on}
                aria-label={so ? w('soldOutName', { name: c.name }) : c.name}
                title={c.name}
                data-c={c.key}
                onClick={(e) => pick(c.key, e.currentTarget)}
              />
            );
          })}
          {at === 'row' ? all : null}
        </div>
      ) : null}
      {set.colour.note && cur.note ? <div className="xs text2 mt8 pdp-cnote">{cur.note}</div> : null}
      {set.colour.trueColourLink && (m.shots[cur.key] ?? []).some((s) => s.kind === 'trueColour') ? (
        <button
          type="button"
          className="link pdp-ilink"
          onClick={() => {
            const tile = document.querySelector<HTMLElement>('.pdp-page .pdp-tile[data-kind="trueColour"]');
            const trk = tile?.parentElement;
            if (tile && trk) trk.scrollTo({ left: tile.offsetLeft, behavior: 'smooth' });
            document.getElementById('pdp-main')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
          }}
        >
          <Icon name="sun" size={15} />
          {w('trueLink')}
        </button>
      ) : null}
      {open ? (
        <PdpModal title={w('allColours', { n: num(n) })} closeLabel={w('zoom.close')} onClose={close} opener={opener} testId="all-colours">
          <div className="allc-grid">
            {m.colours.map((c) => {
              const so = stockOf(m, c.key) <= 0;
              const on = c.key === cur.key;
              const shot = (m.shots[c.key] ?? [])[0];
              return (
                <button
                  key={c.key}
                  type="button"
                  className={`allc${on ? ' on' : ''}${so ? ' so' : ''}`}
                  disabled={so}
                  onClick={(e) => {
                    const host = e.currentTarget.closest('.shop') ?? document.body;
                    pickColour(c.key);
                    setOpen(false);
                    requestAnimationFrame(() => {
                      document.querySelector('.pdp-mbar')?.scrollIntoView({ block: 'nearest' });
                      wakeBar();
                      showToast(host, w('colourPicked', { name: c.name }));
                    });
                  }}
                >
                  <span className="allc-img">{shot ? <ShotPicture shot={shot} garment={m.garment} hex={c.hex} slot="thumb" sizes="120px" alt="" lang={lang} /> : null}</span>
                  <span className="allc-n">{c.name}</span>
                  <span className="allc-s">{so ? w('allSoldOut') : on ? w('allSelected') : w('allChoose')}</span>
                </button>
              );
            })}
          </div>
          <div className="xs muted mt12">
            <bdi className="hide-d">{w('allHint')}</bdi>
            <bdi className="hide-m">{w('allHintDesk')}</bdi>
          </div>
        </PdpModal>
      ) : null}
    </div>
  );
}
