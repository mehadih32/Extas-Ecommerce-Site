'use client';
// PR 41 · follow-up 21 (demo 97-desk-a.js deskCard, D-013; r12-zzdesk-a.css §10) — the product cards on a computer with
// a mouse: the back view fades in under the mouse, and "Quick add" shows the sizes in stock in the card's colour over
// the bottom of the picture; a click is the bag's own Add button (AddToBag), so the page then opens its added-to-bag
// panel (AddedPanel), says it, or goes to the bag, as `bag.addBehaviour` says.
// - Only ≥ 1024 px with a real mouse ((hover:hover) and (pointer:fine), pointerType 'mouse': a phone's tap fires a
//   mouse-like event with no leave, lessons R15); the keyboard reaches it the same way (focus inside a card), and
//   CSS shows it only on hover or :focus-visible inside the card — the mouse leaving or focus going hides it again.
// - Nothing is read while the page loads: a card's quick view is fetched the first time the mouse or focus reaches
//   it (`/api/shop/card/<id>`), so the phone and the first paint pay nothing; a card drawn again in another colour
//   (a colour filter) is read again.
// - AUTO ADJUST (never two lines): the label and every size; then no label and slimmer buttons; then the sizes that
//   fit and "+n" to the product page.
// - A sliding row's copy (aria-hidden) gets the back view only: no buttons inside a hidden copy.
// - Follow-up 113 (`pdp.usualSize`, off): the size this browser keeps as his usual one (usual-size.ts, tops and
//   bottoms apart) is marked on the card's size buttons ("Your size", read out too), and a card add of a product with
//   more than one size is kept as the usual size, as the product page's own add is.
import type { CardDeskSettings } from '@extas/settings';
import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { QuickCard } from '@/lib/shop/card-quick';
import { formatNumber, type ShopLang } from '@/lib/shop/lang';
import { keepUsual, loadUsual, readUsual, saveUsual, sizeGroupOf } from '@/lib/shop/usual-size';
import { AddToBag, BAG_ADDED_EVENT, type AddWords } from './bag/AddToBag';
import { ProductPicture } from './ProductPicture';

export interface QuickWords {
  label: string;
  /** "{name}" */
  group: string;
  /** "{size}" */
  add: string;
  soldOut: string;
  /** "{n}" */
  more: string;
  bag: Omit<AddWords, 'label'>;
}

/** Follow-up 113: "Your size" on the cards while `pdp.usualSize` is on (null: off). */
export interface CardUsual {
  days: number;
  /** `catalogue.sizeCharts.diagramFor`: which garment types are bottoms. */
  diagramFor: Readonly<Record<string, string>>;
  /** "{label}, your size" (the mark itself is the button's ring, AUTO ADJUST: no extra word on the row). */
  aria: string;
}

interface Live {
  key: string;
  w: HTMLElement;
  alt: HTMLElement | null;
  qa: HTMLElement | null;
  card: QuickCard;
  name: string;
  href: string;
}

const DESK = '(min-width: 1024px)';
const MOUSE = '(hover: hover) and (pointer: fine)';
const fill = (s: string, vars: Record<string, string>) => s.replace(/\{(\w+)\}/g, (m, k: string) => vars[k] ?? m);

function QuickRow({ live, words, behaviour, bagHref, num, usual }: { live: Live; words: QuickWords; behaviour: 'sheet' | 'toast' | 'page'; bagHref: string; num: (n: number) => string; usual: CardUsual | null }) {
  const row = useRef<HTMLSpanElement>(null);
  const [hidden, setHidden] = useState(0);
  const sizes = live.card.sizes;
  const group = usual ? sizeGroupOf(live.card.garment, usual.diagramFor) : null;
  // drawn only after the mouse or focus reached the card, so reading this browser's storage here never meets the server
  const [kept, setKept] = useState<string | null>(() =>
    usual && group && !live.card.oneSize ? readUsual(loadUsual(), group, usual.days, Date.now(), sizes.map((x) => x.key)) : null,
  );
  useEffect(() => {
    if (!usual || !group || live.card.oneSize) return;
    const onAdded = (e: Event) => {
      const id = (e as CustomEvent<{ variantId?: string }>).detail?.variantId;
      const s = sizes.find((x) => x.variantId === id);
      if (!s) return;
      saveUsual(keepUsual(loadUsual(), group, s.key, Date.now()));
      setKept(s.key);
    };
    window.addEventListener(BAG_ADDED_EVENT, onAdded);
    return () => window.removeEventListener(BAG_ADDED_EVENT, onAdded);
  }, [usual, group, sizes, live.card.oneSize]);
  // AUTO ADJUST: measured on the real words once drawn (the panel is laid out while it is still invisible)
  useLayoutEffect(() => {
    const qa = live.qa;
    const r = row.current;
    if (!qa || !r) return;
    const over = () => qa.scrollWidth > qa.clientWidth + 1 || r.scrollWidth > r.clientWidth + 1;
    if (hidden === 0) {
      qa.classList.remove('qa-tight');
      if (!over()) return;
      qa.classList.add('qa-tight');
      if (over() && sizes.length > 1) setHidden(1);
      return;
    }
    if (over() && sizes.length - hidden > 1) setHidden(hidden + 1);
  }, [hidden, live.qa, sizes.length]);
  if (!sizes.length) return <span className="pcard-qa-l">{words.soldOut}</span>;
  const shown = sizes.slice(0, sizes.length - hidden);
  return (
    <>
      <span className="pcard-qa-l">{words.label}</span>
      <span className="pcard-qa-s" ref={row}>
        {shown.map((s) => (
          <AddToBag
            key={s.key}
            variantId={s.variantId}
            behaviour={behaviour}
            bagHref={bagHref}
            words={{ ...words.bag, label: s.label }}
            ariaLabel={usual && kept === s.key ? fill(usual.aria, { label: fill(words.add, { size: s.label }) }) : fill(words.add, { size: s.label })}
            source="card"
            className={usual && kept === s.key ? 'pcard-qa-b is-usual' : 'pcard-qa-b'}
            testId="qa-add"
          />
        ))}
        {hidden ? (
          <a className="pcard-qa-more" href={live.href} aria-label={fill(words.more, { n: num(hidden) })}>
            +{num(hidden)}
          </a>
        ) : null}
      </span>
    </>
  );
}

export function CardDesk({
  set,
  words,
  behaviour,
  bagHref,
  lang,
  sizes,
  bnDigits,
  usual = null,
}: {
  set: CardDeskSettings;
  words: QuickWords;
  behaviour: 'sheet' | 'toast' | 'page';
  bagHref: string;
  lang: ShopLang;
  /** The card photo's `sizes` (ProductCard's CARD_SIZES). */
  sizes: string;
  bnDigits: boolean;
  usual?: CardUsual | null;
}) {
  const [live, setLive] = useState<Live[]>([]);
  const num = (n: number) => formatNumber(n, lang, bnDigits);

  useEffect(() => {
    if (!set.altView && !set.quickAdd) return;
    const desk = window.matchMedia(DESK);
    const mouse = window.matchMedia(MOUSE);
    const reads = new Map<string, Promise<QuickCard | null>>();
    const read = (pid: string, colour: string) => {
      const k = `${pid}|${colour}`;
      let p = reads.get(k);
      if (!p) {
        p = fetch(`/api/shop/card/${encodeURIComponent(pid)}${colour ? `?c=${encodeURIComponent(colour)}` : ''}`, { credentials: 'same-origin' })
          .then((r) => (r.ok ? (r.json() as Promise<{ ok?: boolean; card?: QuickCard }>) : null))
          .then((d) => (d?.ok && d.card ? d.card : null))
          .catch(() => null);
        reads.set(k, p);
        // a failed read may be tried again on the next visit to the card
        void p.then((c) => (c ? undefined : reads.delete(k)));
      }
      return p;
    };
    const drop = (w: HTMLElement) => {
      w.querySelectorAll(':scope .pcard-alt, :scope .pcard-qa').forEach((n) => n.remove());
      delete w.dataset.dk;
    };
    const take = (w: HTMLElement) => {
      const pid = w.dataset.pid;
      if (!pid) return;
      const colour = w.dataset.c ?? '';
      const key = `${pid}|${colour}`;
      if (w.dataset.dk === key) return;
      if (w.dataset.dk) {
        drop(w);
        setLive((l) => l.filter((x) => x.w !== w));
      }
      w.dataset.dk = key;
      void read(pid, colour).then((card) => {
        if (!card || !w.isConnected || w.dataset.dk !== key) {
          if (w.dataset.dk === key) delete w.dataset.dk;
          return;
        }
        const box = w.querySelector<HTMLElement>(':scope > .pcard');
        const img = box?.querySelector<HTMLElement>(':scope > .pimg');
        if (!box || !img) return;
        const copy = !!w.closest('[aria-hidden="true"], [data-clone]');
        let alt: HTMLElement | null = null;
        if (set.altView && (card.back || card.drawBack)) {
          alt = document.createElement('div');
          alt.className = 'pcard-alt';
          alt.setAttribute('aria-hidden', 'true');
          // first: the badge and the heart stay on top of it
          img.insertBefore(alt, img.firstChild);
        }
        let qa: HTMLElement | null = null;
        const name = w.querySelector('.pname')?.textContent?.trim() ?? '';
        if (set.quickAdd && !copy) {
          qa = document.createElement('div');
          qa.className = 'pcard-qa';
          qa.setAttribute('role', 'group');
          qa.setAttribute('aria-label', fill(words.group, { name }));
          qa.dataset.testid = 'pcard-qa';
          qa.style.setProperty('--qa-bottom', `${img.offsetTop + img.offsetHeight}px`);
          box.appendChild(qa);
        }
        if (!alt && !qa) return;
        const href = box.querySelector('a.pcard-lnk')?.getAttribute('href') ?? '';
        setLive((l) => [...l.filter((x) => x.w.isConnected && x.w !== w), { key, w, alt, qa, card, name, href }]);
      });
    };
    const card = (t: EventTarget | null) => (t instanceof Element ? t.closest<HTMLElement>('.pcard-w') : null);
    const onOver = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' || !desk.matches || !mouse.matches) return;
      const w = card(e.target);
      if (w) take(w);
    };
    const onFocus = (e: FocusEvent) => {
      if (!desk.matches || !mouse.matches) return;
      const w = card(e.target);
      if (w && !w.closest('[aria-hidden="true"]')) take(w);
    };
    document.addEventListener('pointerover', onOver, { passive: true });
    document.addEventListener('focusin', onFocus);
    return () => {
      document.removeEventListener('pointerover', onOver);
      document.removeEventListener('focusin', onFocus);
      document.querySelectorAll<HTMLElement>('.pcard-w[data-dk]').forEach(drop);
      setLive([]);
    };
  }, [set.altView, set.quickAdd, words.group]);

  return (
    <>
      {live
        .filter((l) => l.w.isConnected)
        .map((l) => (
          <Fragment key={l.key}>
            {l.alt
              ? createPortal(
                  <ProductPicture garment={l.card.garment} hex={l.card.hex} photo={l.card.back} view="back" alt="" lang={lang} sizes={sizes} />,
                  l.alt,
                )
              : null}
            {l.qa ? createPortal(<QuickRow live={l} words={words} behaviour={behaviour} bagHref={bagHref} num={num} usual={usual} />, l.qa) : null}
          </Fragment>
        ))}
    </>
  );
}
