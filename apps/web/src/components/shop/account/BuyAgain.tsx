'use client';
// PR 622 (CN-034) — "Buy again" on a past order (its page, and its card in My orders when the owner chooses): one tap puts
// the order's lines back in the bag at today's price and stock (POST /api/bag/reorder) and says what went in, what is
// sold out (with the sizes still in stock) and what is no longer sold, with "Go to bag". Nothing is ordered. Every word
// is the owner's (`account.reorder.words`), in the page's language.
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { fillWords as fill } from '@/lib/shop/product-model';
import { Icon } from '../Icon';

export interface BuyAgainWords {
  button: string;
  added: string;
  soldOut: string;
  inStock: string;
  gone: string;
  nothing: string;
  goBag: string;
  error: string;
  off: string;
}

interface Miss {
  nameEn: string;
  nameBn: string | null;
  size: string | null;
  inStock: string[];
}
interface Outcome {
  pieces: number;
  inBag: number;
  again: boolean;
  soldOut: Miss[];
  gone: Miss[];
}

/** The notice's lines for an answer (pure: tested). */
export function buyAgainNotice(r: Outcome, w: BuyAgainWords, lang: string, num: (n: number) => string): { lines: string[]; inBag: boolean } {
  const name = (m: Miss) => (lang === 'bn' && m.nameBn ? m.nameBn : m.nameEn);
  const lines: string[] = [];
  // the same tap again: what it put in before is still in the bag, said the same way
  if (r.pieces > 0 || (r.again && r.inBag > 0)) lines.push(fill(w.added, { n: num(r.again ? r.inBag : r.pieces) }));
  for (const m of r.soldOut) lines.push([fill(w.soldOut, { name: name(m), size: m.size ?? '' }), m.inStock.length ? fill(w.inStock, { sizes: m.inStock.join(', ') }) : ''].filter(Boolean).join(' '));
  for (const m of r.gone) lines.push(fill(w.gone, { name: name(m) }));
  const inBag = r.pieces > 0 || r.again || r.inBag > 0;
  if (!inBag) lines.push(w.nothing);
  return { lines, inBag };
}

export function BuyAgain({ number, words: w, lang, bagHref, compact = false }: { number: string; words: BuyAgainWords; lang: string; bagHref: string; compact?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<{ lines: string[]; inBag: boolean; bad: boolean } | null>(null);
  const num = (n: number) => new Intl.NumberFormat(lang === 'bn' ? 'bn-BD' : 'en-US', { numberingSystem: 'latn' }).format(n);
  const go = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await fetch('/api/bag/reorder', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ number }), credentials: 'same-origin' });
      const d = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string; reorder?: Outcome };
      if (!r.ok || !d.ok || !d.reorder) setSaid({ lines: [d.error === 'NOT_OFFERED' ? w.off : w.error], inBag: false, bad: true });
      else setSaid({ ...buyAgainNotice(d.reorder, w, lang, num), bad: false });
    } catch {
      setSaid({ lines: [w.error], inBag: false, bad: true });
    } finally {
      setBusy(false);
      router.refresh();
    }
  };
  return (
    <div className={compact ? 'reo reo-c' : 'reo'} data-testid="buy-again" data-number={number}>
      <button type="button" className={`btn btn-secondary${compact ? ' btn-sm' : ''} shrink0`} onClick={go} disabled={busy} aria-busy={busy || undefined} data-testid="buy-again-btn">
        <Icon name="bag" size={compact ? 15 : 16} />
        {w.button}
      </button>
      {said ? (
        <div className={`reo-say xs${said.bad ? ' reo-bad' : ''}`} role="status" data-testid="buy-again-said">
          {said.lines.map((l, i) => (
            <div key={i}>{l}</div>
          ))}
          {said.inBag ? (
            <a className="reo-go" href={bagHref} data-testid="buy-again-bag">
              {w.goBag}
              <Icon name="right" size={14} />
            </a>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
