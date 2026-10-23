'use client';
// PR 49 — the buy buttons (Blueprint D3.5, demo 30-product.js pdp_ctas, the phone's .pdp-mbar, Desktop Batch B's
// dkb_barHTML): "Add to Bag" beside "Order Now" in the buy column; on a phone the same pair held at the bottom of the
// screen (the bottom menu steps aside on this page); on a computer a slim bar that slides in under the header once the
// buttons have scrolled away, repeating the choice (picture, name, colour, size, price). With no size chosen, both
// buttons mark the sizes and bring them into view (A8: one message, beside the boxes). "Call to order" (SIM-F-046,
// off until the owner switches it on) rings the shop's number for a buyer who will not type.
//
// The bag is S04's (PR 105–114): the buttons are its <AddToBag>, which adds through the bag's API and then does what
// `bag.addBehaviour` says (the added-to-bag panel through `?added=<line>`, which the page draws on the server with
// <AddedPanel>; a short message; or the bag page). "Order Now" adds the same way and goes straight to checkout.
import { useEffect, useRef, useState } from 'react';
import { AddToBag, type AddWords } from '../bag/AddToBag';
import { Icon } from '../Icon';
import { NO_COLOUR, priceFor, variantFor } from '@/lib/shop/product-model';
import { Bold } from './Bold';
import { usePdp } from './PdpRoot';
import { ShotPicture } from './ShotPicture';

interface SlotProps {
  /** The chosen piece; null = no size yet (the button asks for one). */
  variantId: string | null;
  behaviour: 'sheet' | 'toast' | 'page';
  bagHref: string;
  words: AddWords;
  source?: string;
  className: string;
  testId: string;
  icon?: boolean;
  /** Pressed with no size chosen. */
  onNeedSize: () => void;
}

/** One buy button: S04's <AddToBag> once a piece is chosen, else a button that asks for the size. */
function AddSlot({ variantId, behaviour, bagHref, words, source, className, testId, icon, onNeedSize }: SlotProps) {
  const mark = icon ? <Icon name="bag" size={18} /> : null;
  if (!variantId)
    return (
      <button type="button" className={className} data-testid={testId} onClick={onNeedSize}>
        {mark}
        {words.label}
      </button>
    );
  return <AddToBag variantId={variantId} behaviour={behaviour} bagHref={bagHref} words={words} source={source} className={className} testId={testId} icon={mark} />;
}

export interface BuyLinks {
  bagHref: string;
  /** `bag.addBehaviour` (S04). */
  behaviour: 'sheet' | 'toast' | 'page';
  /** The bag's messages after a press (S04's `AddWords` without the button's own words). */
  bagWords: Omit<AddWords, 'label'>;
  checkoutHref: string;
  /** "Call to order": the shop's phone link and its hours (null: switched off or no number). */
  call: { href: string; hours: string | null } | null;
  freeDelivery: boolean;
  cod: boolean;
}

function Pair({ where, links }: { where: 'col' | 'bar' | 'desk'; links: BuyLinks }) {
  const { m, set, choice, w, needSize } = usePdp();
  const v = variantFor(m, choice);
  const ids = { col: ['add-to-bag', 'order-now'], bar: ['bar-add', 'bar-order'], desk: ['dkb-add', 'dkb-order'] }[where];
  return (
    <>
      <AddSlot
        variantId={v?.id ?? null}
        behaviour={links.behaviour}
        bagHref={links.bagHref}
        words={{ ...links.bagWords, label: w('buy.add') }}
        className="btn btn-addbag"
        testId={ids[0]!}
        icon
        onNeedSize={needSize}
      />
      {set.buy.orderNow ? (
        <AddSlot
          variantId={v?.id ?? null}
          behaviour="page"
          bagHref={links.checkoutHref}
          words={{ ...links.bagWords, label: w('buy.order') }}
          source="order-now"
          className="btn btn-primary"
          testId={ids[1]!}
          onNeedSize={needSize}
        />
      ) : null}
    </>
  );
}

export function PdpBuy({ links }: { links: BuyLinks }) {
  const { m, set, w } = usePdp();
  if (!m.onSale) return null;
  return (
    <>
      <div className={`pdp-sec pdp-dk pdp-ctas cta1 add-s1${set.buy.orderNow ? '' : ' one'}`}>
        <Pair where="col" links={links} />
      </div>
      {links.call ? (
        <div className="pdp-sec pdp-callsec">
          <a className="btn btn-ghost btn-block pdp-call" href={links.call.href} data-testid="call-to-order">
            <Icon name="phone" size={18} />
            {links.call.hours ? w('buy.callHours', { hours: links.call.hours }) : w('buy.call')}
          </a>
        </div>
      ) : null}
    </>
  );
}

/** The computer's slim bar, drawn at the page's level (inside the sticky buy column the footer painted over it). */
export function PdpDeskBar({ links, lang }: { links: BuyLinks; lang: 'en' | 'bn' }) {
  const { m, set } = usePdp();
  if (!m.onSale || !set.buy.desktopBar) return null;
  return <DeskBar links={links} lang={lang} />;
}

/** The phone's buy bar, held at the bottom of the screen (drawn after the page so it sits over everything). */
export function PdpPhoneBar({ links }: { links: BuyLinks }) {
  const { m, set } = usePdp();
  if (!m.onSale || !set.buy.phoneBar) return null;
  return (
    <div className="mbar dm-hide pdp-mbar" data-testid="pdp-mbar">
      <div className={`pdp-mbar-in cta1 add-s1${set.buy.orderNow ? '' : ' one'}`}>
        <Pair where="bar" links={links} />
      </div>
    </div>
  );
}

function DeskBar({ links, lang }: { links: BuyLinks; lang: 'en' | 'bn' }) {
  const { m, choice, w } = usePdp();
  const bar = useRef<HTMLDivElement>(null);
  const [on, setOn] = useState(false);

  // shown once the column's buttons have scrolled up under the header (demo dkb_barSync); the bar sits right below it
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    let raf = 0;
    const sync = () => {
      raf = 0;
      const el = bar.current;
      if (!el) return;
      if (!mq.matches) return setOn(false);
      const hdr = document.querySelector('.shop .hdr');
      const top = hdr ? Math.max(0, hdr.getBoundingClientRect().bottom) : 0;
      const cta = document.querySelector('.pdp-page .pdp-b .pdp-ctas');
      el.style.top = `${Math.round(top)}px`;
      setOn(!!cta && cta.getClientRects().length > 0 && cta.getBoundingClientRect().bottom < top + 2);
    };
    const kick = () => {
      if (!raf) raf = requestAnimationFrame(sync);
    };
    sync();
    window.addEventListener('scroll', kick, { passive: true });
    window.addEventListener('resize', kick);
    mq.addEventListener('change', kick);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', kick);
      window.removeEventListener('resize', kick);
      mq.removeEventListener('change', kick);
    };
  }, []);

  const colour = m.colours.find((c) => c.key === choice.colour) ?? null;
  const shot = (m.shots[choice.colour ?? NO_COLOUR] ?? [])[0];
  const size = m.sizes.find((s) => s.key === choice.size);
  const p = priceFor(m, choice);
  const one = m.sizes.length <= 1;
  return (
    <div ref={bar} className={`dkb-bar hide-m${on ? ' on' : ''}`} data-testid="dkb-bar" role="region" aria-label={w('buy.bar', { name: m.name })} {...(on ? {} : { inert: true })}>
      <div className="container dkb-in">
        <div className="dkb-th" aria-hidden="true">
          {shot ? <ShotPicture shot={shot} garment={m.garment} hex={colour?.hex ?? ''} slot="thumb" sizes="56px" alt="" lang={lang} ratio="ratio-11" /> : null}
        </div>
        <div className="dkb-id">
          <div className="dkb-nm">{m.name}</div>
          <div className="dkb-ch">
            {colour ? (
              <span className="dkb-chip">
                <i style={{ background: colour.hex }} />
                {colour.name}
              </span>
            ) : null}
            {one ? (
              <span className="dkb-chip">{size?.label || w('oneSize')}</span>
            ) : size ? (
              <span className="dkb-chip">
                <Bold text={w('buy.size', { size: size.label })} />
              </span>
            ) : (
              <button type="button" className="dkb-chip dkb-pick" onClick={() => document.getElementById('pdp-sizes')?.scrollIntoView({ behavior: 'smooth', block: 'center' })}>
                {w('chooseSizeShort')}
              </button>
            )}
          </div>
        </div>
        {links.freeDelivery || links.cod ? (
          <div className="ob-bm">
            {links.freeDelivery ? (
              <span className="ob-bm-i ob-bm-d">
                <Icon name="truck" size={15} />
                {w('price.freeShort')}
              </span>
            ) : null}
            {links.cod ? (
              <span className="ob-bm-i ob-bm-c">
                <Icon name="cash" size={15} />
                {w('price.cod')}
              </span>
            ) : null}
          </div>
        ) : null}
        {p ? (
          <div className="dkb-pr">
            <span className="price">{p.now}</span>
            {p.was ? <span className="strike">{p.was}</span> : null}
          </div>
        ) : null}
        <div className="dkb-btns pdp-ctas cta1 add-s1">
          <Pair where="desk" links={links} />
        </div>
      </div>
    </div>
  );
}
