'use client';
// S06 · PR 556 — the in-transit duplicate notice (only while the owner's `checkout.transitDuplicate` is on). The moment
// the phone number is whole, the page asks the server once per number (`/api/checkout/transit`, with the campaign this
// visit came from, lib/shop/campaign); a piece of the bag that is already on its way to this customer opens a popup:
// the piece's picture, the earlier order's number and its tracking link (only when the server says that order is his),
// "it's already on its way — no need to order it again", and two buttons. "No need — take it out" takes the line out
// through the bag's own Remove (its API, Undo and redraw); "No, I want another one" keeps it. Either answer is kept once
// for the owner's report; closing the popup keeps the bag as it is. A failed check shows nothing: the form never waits.
// PR 557: a notice of kind 'size' (the same product and colour in another size already on its way, owner's
// `sizeExchange`) asks "not sure about the size?" instead, offers to exchange that parcel on arrival (with the exchange
// policy's link) and its buttons say "exchange on arrival — take this out" / "no, I want both".
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { phoneNormalizeBD } from '@extas/checkout/pure';
import { campaignOfVisit } from '@/lib/shop/campaign';
import { hrefIn, type ShopLang } from '@/lib/shop/lang';
import { PdpModal } from '../product/PdpModal';
import { postJson } from './quote-client';

export const TRANSIT_URL = '/api/checkout/transit';
export const TRANSIT_ANSWER_URL = '/api/checkout/transit/answer';

export interface TransitConfig {
  /** Each bag line's picture, drawn on the server. */
  thumbs: Record<string, ReactNode>;
  /** Each bag line's name · colour · size. */
  names: Record<string, string>;
}

interface Notice {
  eventId: string;
  lineId: string;
  number: string | null;
  href: string | null;
  kind?: 'same' | 'size';
  had?: string | null;
  want?: string | null;
}

export function TransitNotice({ phone, cfg, w, lang, exchangeHref }: { phone: string; cfg: TransitConfig; w: (k: string, vars?: Record<string, string | number>) => string; lang: ShopLang; exchangeHref: string }) {
  const [queue, setQueue] = useState<Notice[]>([]);
  const asked = useRef(new Set<string>());
  const opener = useRef<HTMLElement | null>(null);
  const typed = phoneNormalizeBD(phone);
  const e164 = typed.ok ? typed.e164 : null;

  useEffect(() => {
    if (!e164 || asked.current.has(e164)) return;
    asked.current.add(e164);
    let live = true;
    void postJson<{ ok: boolean; notices?: Notice[] }>(TRANSIT_URL, { phone: e164, ...campaignOfVisit() }).then(({ data }) => {
      if (!live || !data?.ok || !data.notices?.length) return;
      opener.current = document.getElementById('co-phone');
      setQueue(data.notices.filter((n) => n.lineId in cfg.thumbs));
    });
    return () => {
      live = false;
    };
  }, [e164, cfg.thumbs]);

  const now = queue[0] ?? null;
  const next = useCallback(() => setQueue((q) => q.slice(1)), []);
  const answer = useCallback(
    (n: Notice, action: 'removed' | 'kept') => {
      void postJson(TRANSIT_ANSWER_URL, { eventId: n.eventId, action });
      if (action === 'removed') document.querySelector<HTMLButtonElement>(`[data-bag-root] [data-bag-act="remove"][data-id="${CSS.escape(n.lineId)}"]`)?.click();
      next();
    },
    [next],
  );
  if (!now) return null;
  const name = cfg.names[now.lineId] ?? '';
  const size = now.kind === 'size';
  const want = now.want ?? '';
  const text = size
    ? now.number && now.had
      ? w('transit.sizeText', { number: now.number, had: now.had, want })
      : w('transit.sizeTextAnon', { want })
    : now.number
      ? w('transit.text', { number: now.number })
      : w('transit.textAnon');
  return (
    <PdpModal title={w(size ? 'transit.sizeTitle' : 'transit.title')} closeLabel={w('transit.close')} onClose={next} opener={opener} className="co-tr" testId="co-transit">
      <div className="co-tr-it">
        <div className="co-tr-th">{cfg.thumbs[now.lineId]}</div>
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="small bold">{name}</div>
          {now.number ? <div className="xs muted">{size && now.had ? w('transit.sizeOrder', { had: now.had, number: now.number }) : w('transit.order', { number: now.number })}</div> : null}
        </div>
      </div>
      <p className="small mt12" data-testid="co-transit-text" data-kind={size ? 'size' : 'same'}>
        {text}
      </p>
      {now.href && now.number ? (
        <a className="link small co-tr-track" href={hrefIn(lang, now.href)} data-testid="co-transit-track">
          {w('transit.track', { number: now.number })}
        </a>
      ) : null}
      {size ? (
        <a className="link small co-tr-track" href={exchangeHref} data-testid="co-transit-how">
          {w('transit.sizeHow')}
        </a>
      ) : null}
      <div className="co-tr-acts">
        <button type="button" className="btn btn-primary" onClick={() => answer(now, 'removed')} data-testid="co-transit-remove">
          {w(size ? 'transit.sizeRemove' : 'transit.remove')}
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => answer(now, 'kept')} data-testid="co-transit-keep">
          {w(size ? 'transit.sizeKeep' : 'transit.keep')}
        </button>
      </div>
    </PdpModal>
  );
}
