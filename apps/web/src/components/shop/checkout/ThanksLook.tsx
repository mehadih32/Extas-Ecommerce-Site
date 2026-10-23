'use client';
// PR 128 — "Complete your look" on the thank-you page (demo 52-thanks.js ty_look): the pieces the shop's running combos
// pair with his order, each with its picture, name and price; colour swatches and a size list when it has more than
// one; "Add" while "Add to this parcel" is open (a real order line, PR 127, through /api/account/parcel-add), then
// "Added" with Remove; the tags "Same parcel · no extra delivery" and until when; and "New total due" once something
// is added. After each change the page is read again, so every amount on it is the order's own.
import { useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { fill } from '@/lib/shop/dict';
import { pickVariant, firstChoice } from '@/lib/shop/thanks-look-model';
import { showToast } from '../toast';
import { Icon } from '../Icon';
import { postJson } from './quote-client';

type W = Record<string, string>;

export interface LookRowView {
  key: string;
  kind: 'add' | 'added';
  lineId: string | null;
  name: string;
  href: string;
  /** The picture per colour key ('' for a piece without colours). */
  thumbs: Record<string, ReactNode>;
  colours: { key: string; name: string; hex: string }[];
  sizes: { key: string; label: string }[];
  variants: { id: string; colour: string | null; size: string | null; stock: number; payMinor: number; pay: string }[];
  /** An added line: its colour · size and its amount. */
  detail: string | null;
  amount: string | null;
}

const CLOSED = new Set(['ADD_ON_CLOSED', 'BOOKED', 'CANCEL_PENDING', 'CANCEL_REQUESTED', 'ILLEGAL_TRANSITION', 'NOT_COD']);
const refusal = (code: string | undefined) =>
  !code ? 'ty.lookNet' : CLOSED.has(code) ? 'ty.lookClosed' : code === 'OUT_OF_STOCK' || code === 'NOT_SELLABLE' ? 'ty.lookStock' : code === 'COD_LIMIT' ? 'ty.lookCod' : code === 'ADD_ON_LIMIT' ? 'ty.lookFullShort' : 'err.other';

function Row({ row, number, open, full, words }: { row: LookRowView; number: string; open: boolean; full: boolean; words: W }) {
  const router = useRouter();
  const say = (k: string, vars: Record<string, string> = {}) => fill(words[k] ?? k, vars);
  const start = firstChoice(row);
  const [colour, setColour] = useState(start.colour);
  const [size, setSize] = useState(start.size);
  const [busy, setBusy] = useState(false);
  const v = row.kind === 'add' ? pickVariant(row, colour, size) : null;
  const shown = v?.colour ?? colour ?? '';
  const send = async (el: Element, action: 'parcel-add' | 'parcel-remove', payload: Record<string, unknown>, done: string) => {
    setBusy(true);
    const r = await postJson<{ ok: boolean; error?: string }>(`/api/account/${action}`, { number, ...payload });
    setBusy(false);
    if (r.data?.ok) {
      showToast(el, say(done));
      return router.refresh();
    }
    showToast(el, say(refusal(r.data?.error)));
    if (r.data?.error && CLOSED.has(r.data.error)) router.refresh();
  };
  const choose = row.kind === 'add' && open && !full;
  let act: ReactNode = null;
  if (row.kind === 'added')
    act = (
      <div style={{ textAlign: 'right' }}>
        <span className="tag" data-testid="ty-look-added">
          <Icon name="check" size={12} />
          {say('ty.added')}
        </span>
        {open && row.lineId ? (
          <div>
            <button type="button" className="link" disabled={busy} data-testid="ty-look-remove" onClick={(e) => void send(e.currentTarget, 'parcel-remove', { lineId: row.lineId }, 'ty.lookRemoved')}>
              {say('ty.lookRemove')}
            </button>
          </div>
        ) : null}
      </div>
    );
  else if (choose && v)
    act = (
      <button type="button" className="btn btn-secondary btn-sm" disabled={busy} data-testid="ty-look-add" onClick={(e) => void send(e.currentTarget, 'parcel-add', { variantId: v.id, from: 'thanks' }, 'ty.lookAddedToast')}>
        <Icon name="plus" size={15} />
        {say(busy ? 'mock.wait' : 'ty.lookAdd')}
      </button>
    );
  const sizesHere = row.sizes.filter((s) => row.variants.some((x) => x.colour === shown && x.size === s.key && x.stock > 0));
  return (
    <div className="ty-look" data-testid="ty-look-row" data-kind={row.kind}>
      <a className="co-th" href={row.href} aria-label={row.name}>
        {row.thumbs[shown] ?? row.thumbs[''] ?? Object.values(row.thumbs)[0] ?? null}
      </a>
      <div className="grow" style={{ minWidth: 0 }}>
        <div className="small bold">{row.name}</div>
        <div className="small price">{row.kind === 'added' ? row.amount : v?.pay}</div>
        {row.kind === 'added' && row.detail ? <div className="xs muted">{row.detail}</div> : null}
        {choose && (row.colours.length > 1 || row.sizes.length > 1) ? (
          <div className="row wrap mt8" style={{ gap: 14 }}>
            {row.colours.length > 1 ? (
              <div className="row wrap ty-sws">
                {row.colours.map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    className={`swatch ty-sw${c.key === shown ? ' on' : ''}`}
                    style={{ background: c.hex }}
                    aria-label={c.name}
                    aria-pressed={c.key === shown}
                    onClick={() => setColour(c.key)}
                  />
                ))}
              </div>
            ) : null}
            {row.sizes.length > 1 ? (
              <>
                <label className="sr" htmlFor={`ty-size-${row.key}`}>
                  {say('ty.lookSize')}
                </label>
                <select id={`ty-size-${row.key}`} className="input" value={v?.size ?? ''} onChange={(e) => setSize(e.target.value)} style={{ width: 'auto', padding: '5px 8px', fontSize: 13 }}>
                  {sizesHere.map((s) => (
                    <option key={s.key} value={s.key}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </>
            ) : null}
          </div>
        ) : null}
      </div>
      <div className="shrink0">{act}</div>
    </div>
  );
}

export function ThanksLook({
  number,
  words,
  rows,
  open,
  full,
  until,
  newTotal,
  fullNote,
}: {
  number: string;
  words: W;
  rows: LookRowView[];
  open: boolean;
  full: boolean;
  until: string | null;
  /** "New total due" once a piece is added (the order's Cash on Delivery amount as stored). */
  newTotal: string | null;
  fullNote: string | null;
}) {
  const say = (k: string) => words[k] ?? k;
  return (
    <section className="card p20" data-testid="ty-look">
      <h2 className="h3">{say('ty.lookTitle')}</h2>
      {open ? (
        <div className="row wrap mt8" style={{ gap: 6 }}>
          <span className="tag">
            <Icon name="box" size={12} />
            {say('ty.lookSame')}
          </span>
          {until ? (
            <span className="tag plain">
              <Icon name="clock" size={12} />
              {until}
            </span>
          ) : null}
        </div>
      ) : null}
      <div className="mt12">
        {rows.map((r) => (
          <Row key={r.key} row={r} number={number} open={open} full={full} words={words} />
        ))}
      </div>
      {open && full && fullNote ? <p className="xs muted mt8">{fullNote}</p> : null}
      {newTotal ? (
        <div className="ty-newtot" data-testid="ty-newtot">
          <span className="small bold">{say('ty.lookNewTotal')}</span>
          <span className="price">{newTotal}</span>
        </div>
      ) : null}
    </section>
  );
}
