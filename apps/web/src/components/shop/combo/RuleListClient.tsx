'use client';
// PR 572 — the two small live parts of a rule's own page: the order chooser (a choice of the link, like every other
// filter, so the page can be shared as it is) and template L4's big card, where a size is picked for the whole pair
// right in the list and the pair goes in the bag with one tap (demo ca_l4card). The bag checks the pair again on the
// server; the card only says what is missing ("Choose a size") and what came back.
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { showLinkToast, showToast } from '../toast';

/** How long the "added to your bag · View bag" message stays (as on the combo page). */
const ADDED_TOAST_MS = 4_500;

export function ListSort({ options, value, label, hrefs }: { options: { value: string; label: string }[]; value: string; label: string; hrefs: Record<string, string> }) {
  const router = useRouter();
  return (
    <label className="ca-sort">
      <span className="sr">{label}</span>
      <select aria-label={label} defaultValue={value} onChange={(e) => router.push(hrefs[e.target.value] ?? '?', { scroll: false })} data-testid="ca-sort">
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export interface L4Size {
  key: string;
  label: string;
  ok: boolean;
  /** The size of each slot of the pair (the slots' own size ids for this size). */
  sizeIds: (string | null)[];
  why: string | null;
}

const newKey = () => {
  const a = new Uint8Array(12);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('');
};

/** L4: one pair's sizes and its "Add both to bag" button (the picture, title and price are drawn on the server). */
export function L4Pick({
  slug,
  colourIds,
  sizes,
  words,
  hrefs,
  behaviour,
}: {
  slug: string;
  colourIds: string[];
  sizes: L4Size[];
  words: { sizeFor: string; add: string; choose: string; added: string; view: string; error: string };
  hrefs: { bag: string; checkout: string };
  behaviour: 'sheet' | 'toast' | 'page';
}) {
  const router = useRouter();
  const [size, setSize] = useState<string | null>(null);
  const [err, setErr] = useState(false);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const picked = sizes.find((s) => s.key === size && s.ok) ?? null;
  const outs = sizes.filter((s) => !s.ok && s.why).map((s) => s.why);
  const add = (from: Element) => {
    if (!picked) {
      setErr(true);
      return;
    }
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    void fetch('/api/bag/sets', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ slug, choices: colourIds.map((colourId, i) => ({ colourId, sizeId: picked.sizeIds[i] ?? null })), addKey: newKey() }),
      credentials: 'same-origin',
    })
      .then(async (r) => {
        const d = (await r.json().catch(() => ({}))) as { ok?: boolean };
        if (!r.ok || !d.ok) return showToast(from, words.error);
        if (behaviour === 'page') return void window.location.assign(hrefs.bag);
        showLinkToast(from, words.added, { href: hrefs.bag, label: words.view, testId: 'ca-toast-bag' }, ADDED_TOAST_MS);
        router.refresh();
      })
      .catch(() => showToast(from, words.error))
      .finally(() => {
        lock.current = false;
        setBusy(false);
      });
  };
  return (
    <>
      <div className="ca-lbl mt12">{words.sizeFor}</div>
      <div className={`ca-sizes n${sizes.length}`} role="group" aria-label={words.sizeFor}>
        {sizes.map((s) => (
          <button
            key={s.key}
            type="button"
            className={`size-pill${s.key === size ? ' on' : ''}${s.ok ? '' : ' out'}`}
            aria-pressed={s.key === size}
            aria-disabled={!s.ok || undefined}
            aria-label={s.ok ? undefined : (s.why ?? s.label)}
            onClick={() => {
              if (!s.ok) return;
              setSize(s.key);
              setErr(false);
            }}
          >
            {s.label}
          </button>
        ))}
      </div>
      {outs.length ? <div className="ca-why">{outs.join(' · ')}</div> : null}
      {err ? (
        <div className="ca-err" role="alert">
          {words.choose}
        </div>
      ) : null}
      <button type="button" className="btn btn-primary btn-block mt12" aria-busy={busy || undefined} onClick={(e) => add(e.currentTarget)} data-testid="ca-l4-add">
        {picked ? words.add : words.choose}
      </button>
    </>
  );
}
