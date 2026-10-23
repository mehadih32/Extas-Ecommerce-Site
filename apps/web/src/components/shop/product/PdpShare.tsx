'use client';
// PR 69 — "Share this product" in the floating rail and the row of tiles it opens (demo 30-product.js pdp_shareRow,
// styles.css 7+8): transparent floating tiles beside the rail, the page visible between them — Facebook, Messenger
// (phones), WhatsApp, Instagram (the phone's share sheet, else the link copied), Copy link. The row closes when a tile
// is used, on a tap anywhere else, on the button again, or by itself after `closeMs`. One record holds its timer and
// its outside-tap listener; every way of closing clears both (TA-2 T8/T9), so a re-opened row gets its full time and
// no stale listener is left behind.
import type { PdpShareSettings } from '@extas/settings';
import { useCallback, useEffect, useRef, useState } from 'react';
import { PHONE_ONLY, shareAction, type ShareTile } from '@/lib/shop/share';
import { Icon, SocialMark } from '../Icon';
import { showToast } from '../toast';

export interface ShareWords {
  open: string;
  group: string;
  on: string;
  copy: string;
  copied: string;
  pasteInsta: string;
  text: string;
  net: Record<'facebook' | 'messenger' | 'whatsapp' | 'instagram', string>;
}

function tileIcon(id: ShareTile) {
  if (id === 'copy') return <Icon name="link" size={20} />;
  if (id === 'messenger') return <Icon name="chat" size={21} />;
  return <SocialMark id={id} size={21} />;
}

async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function PdpShare({ set, words }: { set: PdpShareSettings; words: ShareWords }) {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const rec = useRef<{ t0?: ReturnType<typeof setTimeout>; t?: ReturnType<typeof setTimeout>; close?: (e: Event) => void }>({});

  const stop = useCallback(() => {
    const r = rec.current;
    clearTimeout(r.t0);
    clearTimeout(r.t);
    if (r.close) document.removeEventListener('click', r.close, true);
    rec.current = {};
  }, []);

  const close = useCallback(() => {
    stop();
    setOpen(false);
  }, [stop]);

  useEffect(() => {
    if (!open) return;
    const r = rec.current;
    // the listener goes on after this tap has finished, so the tap that opened the row does not close it
    r.t0 = setTimeout(() => {
      r.close = (e: Event) => {
        const t = e.target as Element | null;
        if (t?.closest?.('.shr-bar') || t?.closest?.('[data-testid="rail-share"]')) return;
        close();
      };
      document.addEventListener('click', r.close, true);
      r.t = setTimeout(close, set.closeMs);
    }, 0);
    return stop;
  }, [open, set.closeMs, close, stop]);

  const tiles = set.tiles.filter((x) => x.on).map((x) => x.id);
  const act = async (id: ShareTile, el: Element) => {
    const url = location.href;
    const a = shareAction(id, url, words.text);
    if (a.kind === 'copy') {
      if (await copy(url)) showToast(el, words.copied);
    } else if (a.kind === 'native') {
      if (typeof navigator.share === 'function') await navigator.share({ url, text: words.text }).catch(() => undefined);
      else if (await copy(url)) showToast(el, words.pasteInsta);
    }
    close();
  };

  return (
    <>
      <button
        ref={btn}
        type="button"
        className="pdp-act"
        aria-label={words.open}
        title={words.open}
        aria-expanded={open}
        data-testid="rail-share"
        onClick={() => (open ? close() : setOpen(true))}
      >
        <Icon name="share" size={24} />
      </button>
      {open ? (
        <div className="shr-bar" role="group" aria-label={words.group} data-testid="share-row">
          {tiles.map((id) => {
            const a = shareAction(id, typeof location === 'undefined' ? '' : location.href, words.text);
            const label = id === 'copy' ? words.copy : words.on.replace('{network}', words.net[id]);
            const cls = `shr-b ${id}${PHONE_ONLY.has(id) ? ' hide-d' : ''}`;
            return a.kind === 'link' ? (
              <a key={id} className={cls} href={a.href} target="_blank" rel="noopener" title={label} aria-label={label} onClick={() => setTimeout(close, 60)}>
                {tileIcon(id)}
              </a>
            ) : (
              <button key={id} type="button" className={cls} title={label} aria-label={label} onClick={(e) => void act(id, e.currentTarget)}>
                {tileIcon(id)}
              </button>
            );
          })}
        </div>
      ) : null}
    </>
  );
}
