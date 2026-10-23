'use client';
// PR 58 — Find My Size (Blueprint D3.8, demo 30-product.js pdp_fmsCard / pdp_finderHTML / pdp_stepper): the card under
// the sizes ("Find my size · Just your height and weight", or "Your size: L · From 5'7" · 66 kg" once answered), and
// its popup — two steppers (height in feet and inches with the centimetres beside, weight in kilograms; hold a button
// to repeat), "Show my size", then the size from this product's own chart with the reasons in plain words (the measure
// it needs, the room this fit gives, the length for the height), "Between sizes? Take XL", whether it is in stock in
// this colour (else the colours that have it), and "Select size L". `?finder=1` opens it (the bag's "Help me pick my
// size"; on T3 it brings the card's own finder into view). Each answer is kept, with no name or phone, for the size
// reports (PR 59) while `pdp.finder.record` is on.
import { lazy, Suspense, useCallback, useEffect, useRef } from 'react';
import type { Recommendation } from '@extas/catalogue/size-finder';
import type { PdpFinderSettings } from '@extas/settings';
import { Icon } from '../Icon';
import { showToast } from '../toast';
import { holdRepeat, type HoldRepeat } from '@/lib/shop/hold-repeat';
import { whenIdle } from '@/lib/shop/later';
import { bodyWords, canStep, feetInches, FINDER_QUERY, heightCm, reasonLines, stepBody, type FitBody } from '@/lib/shop/pdp-finder';
import { stockOf } from '@/lib/shop/product-model';
import { usePdp } from './PdpRoot';

const API = '/api/size-finder';

const loadSheet = () => import('./PdpFinderSheet');
const FinderSheet = lazy(() => loadSheet().then((x) => ({ default: x.FinderSheet })));

/** Keeps the answer for the size reports (PR 59); the server works the size out again from its own copy of the chart. */
export async function recordAnswer(productId: string, b: FitBody): Promise<string | null> {
  try {
    const r = await fetch(API, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ productId, ...b }) });
    const j = (await r.json()) as { ok?: boolean; id?: string };
    return j.ok && j.id ? j.id : null;
  } catch {
    return null;
  }
}

/** The size the shopper then took (once per answer). */
export function recordChoice(id: string | null, size: string): void {
  if (!id) return;
  try {
    void fetch(API, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id, size }), keepalive: true }).catch(() => {});
  } catch {
    /* the report misses one choice; the shopper is not held up */
  }
}

/** The page's words for an answer: its size's label, the height and weight, and the reasons. */
export function useAnswerWords() {
  const { m, w, num, unit, lang, words, finder } = usePdp();
  const label = useCallback((k: string) => m.sizes.find((s) => s.key === k)?.label ?? k, [m.sizes]);
  const reasons = useCallback(
    (rec: Recommendation, b: FitBody) =>
      m.chart && finder
        ? reasonLines(rec, m.chart, {
            w,
            has: (k) => k in words,
            num,
            unit,
            label,
            low: (l) => (lang === 'bn' ? l : l.toLowerCase()),
            ...bodyWords(b, w, num),
            garment: m.garment,
            lengthField: finder.length.field,
          })
        : [],
    [m.chart, m.garment, finder, w, words, num, unit, label, lang],
  );
  return { label, reasons };
}

/** The card under the sizes (T1, T2), on its own switch (`pdp.finder.card`). */
export function FinderCard() {
  const { finder, yours, body, w, num, openFinder } = usePdp();
  const { label } = useAnswerWords();
  if (!finder?.card) return null;
  const bw = body ? bodyWords(body, w, num) : null;
  const subs = yours && bw ? [0, 1, 2].map((i) => w(`finder.yoursSub${i}`, bw)) : [0, 1, 2].map((i) => w(`finder.cardSub${i}`));
  return (
    <div className="pdp-sec pdp-fmssec">
      <button type="button" className="pdp-fms" data-testid="fms-card" aria-haspopup="dialog" onClick={(e) => openFinder(e.currentTarget)}>
        <span className="ic">
          <Icon name="ruler" size={20} />
        </span>
        <span className="grow">
          <span className="t" style={{ display: 'block' }}>
            {yours ? w('finder.yours', { size: label(yours.size) }) : w('finder.card')}
          </span>
          <span className="s pdp-fx pdp-fitt" style={{ display: 'block' }} data-fitrow="" data-fx-max="2" data-l="0">
            {subs.map((x, i) => (
              <span key={i} className={`pf pf${i}`}>
                {x}
              </span>
            ))}
          </span>
        </span>
        <Icon name="right" size={18} />
      </button>
    </div>
  );
}

/** One − / + button: a tap steps once, a held press repeats (`holdMs`, then every `repeatMs`), letting go stops it. */
type Step = 1 | -1;
type StepFn = (d: Step) => boolean;
interface StepButtonProps {
  d: Step;
  label: string;
  can: boolean;
  onStep: StepFn;
  set: Pick<PdpFinderSettings, 'holdMs' | 'repeatMs'>;
}

function StepButton({ d, label, can, onStep, set }: StepButtonProps) {
  const latest = useRef(onStep);
  useEffect(() => {
    latest.current = onStep;
  }, [onStep]);
  const ctl = useRef<HoldRepeat | null>(null);
  useEffect(() => {
    const h = holdRepeat({ holdMs: set.holdMs, repeatMs: set.repeatMs, step: () => latest.current(d) });
    ctl.current = h;
    return () => h.cancel();
  }, [set.holdMs, set.repeatMs, d]);
  return (
    <button
      type="button"
      aria-label={label}
      aria-disabled={!can || undefined}
      onPointerDown={(e) => {
        if (e.button === 0) ctl.current?.press();
      }}
      onPointerUp={() => ctl.current?.release()}
      onPointerLeave={() => ctl.current?.cancel()}
      onPointerCancel={() => ctl.current?.cancel()}
      onContextMenu={(e) => e.preventDefault()}
      onClick={() => ctl.current?.click()}
    >
      <Icon name={d < 0 ? 'minus' : 'plus'} size={18} />
    </button>
  );
}

function Stepper({ k, text, aria, value, onChange, f }: { k: 'ft' | 'in' | 'kg'; text: string; aria: string; value: FitBody; onChange: (b: FitBody) => void; f: PdpFinderSettings }) {
  const { w } = usePdp();
  // the value a held press steps from (a repeat runs between renders)
  const cur = useRef(value);
  useEffect(() => {
    cur.current = value;
  }, [value]);
  const onStep = useCallback(
    (d: 1 | -1) => {
      const n = stepBody(cur.current, k, d, f);
      if (n.heightIn === cur.current.heightIn && n.weightKg === cur.current.weightKg) return false;
      cur.current = n;
      onChange(n);
      return true;
    },
    [k, f, onChange],
  );
  return (
    <div className="pdp-step" role="group" aria-label={aria}>
      <StepButton d={-1} label={w('finder.less', { what: aria })} can={canStep(value, k, -1, f)} onStep={onStep} set={f} />
      <output aria-live="polite" data-testid={`finder-${k}`}>
        {text}
      </output>
      <StepButton d={1} label={w('finder.more', { what: aria })} can={canStep(value, k, 1, f)} onStep={onStep} set={f} />
    </div>
  );
}

/** Height (feet, inches, the centimetres beside) and weight, for the popup and the T3 card. */
export function FinderSteps({ value, onChange }: { value: FitBody; onChange: (b: FitBody) => void }) {
  const { finder, w, num } = usePdp();
  if (!finder) return null;
  const { ft, inch } = feetInches(value.heightIn);
  return (
    <div className="stack s16">
      <div>
        <div className="label">{w('finder.height')}</div>
        <div className="row wrap" style={{ gap: 10 }}>
          <Stepper k="ft" text={w('finder.ft', { n: num(ft) })} aria={w('finder.ftAria')} value={value} onChange={onChange} f={finder} />
          <Stepper k="in" text={w('finder.in', { n: num(inch) })} aria={w('finder.inAria')} value={value} onChange={onChange} f={finder} />
          <span className="xs muted" data-testid="finder-cm">
            {w('finder.cmLine', { n: num(heightCm(value.heightIn)) })}
          </span>
        </div>
      </div>
      <div>
        <div className="label">{w('finder.weight')}</div>
        <div className="row" style={{ gap: 10 }}>
          <Stepper k="kg" text={w('finder.kg', { n: num(value.weightKg) })} aria={w('finder.kgAria')} value={value} onChange={onChange} f={finder} />
        </div>
      </div>
    </div>
  );
}

/** "L is in stock in Navy", or the colours that have it. */
export function FinderStock({ size }: { size: string }) {
  const { m, choice, w, pickColour } = usePdp();
  const { label } = useAnswerWords();
  const colour = m.colours.find((c) => c.key === choice.colour) ?? null;
  const s = label(size);
  if (stockOf(m, choice.colour, size) > 0)
    return (
      <div className="xs brandc bold row mt12" style={{ gap: 6 }} data-testid="finder-stock">
        <Icon name="check" size={14} />
        {colour ? w('finder.inStock', { size: s, colour: colour.name }) : w('finder.inStockPlain', { size: s })}
      </div>
    );
  const alt = m.colours.filter((c) => c.key !== choice.colour && stockOf(m, c.key, size) > 0);
  return (
    <div className="warnbox p16 small mt12" data-testid="finder-stock">
      {colour ? w('finder.outIn', { size: s, colour: colour.name }) : w('finder.outPlain', { size: s })}{' '}
      {alt.length ? (
        <>
          {w('finder.otherColours')}
          <div className="row wrap mt8" style={{ gap: 8 }}>
            {alt.map((c) => (
              <button key={c.key} type="button" className="chip" onClick={() => pickColour(c.key)}>
                <span className="swatch sm" style={{ background: c.hex }} />
                {c.name}
              </button>
            ))}
          </div>
        </>
      ) : (
        w('finder.outAsk')
      )}
    </div>
  );
}

/** Takes a size the finder answered: chosen when this colour has it, and the answer kept on this phone. */
export function useTakeSize() {
  const { m, choice, w, pickSize, keepBody, finder } = usePdp();
  const { label } = useAnswerWords();
  return useCallback(
    (size: string, b: FitBody, from: Element | null) => {
      keepBody(b);
      const host = from?.closest('.shop') ?? document.body;
      const colour = m.colours.find((c) => c.key === choice.colour)?.name ?? '';
      if (stockOf(m, choice.colour, size) > 0) {
        pickSize(size);
        showToast(host, w(finder?.remember ? 'finder.picked' : 'finder.pickedNoSave', { size: label(size) }));
        return true;
      }
      showToast(host, w('finder.savedOut', { size: label(size), colour }));
      return false;
    },
    [m, choice.colour, w, pickSize, keepBody, finder, label],
  );
}

/** The popup, drawn once per page; the card, the size chart and `?finder=1` open it. PR 88: its window (PdpFinderSheet)
 * is its own chunk, fetched once the page is idle (so a tap opens it at once) or on the first open. */
export function FinderPopup() {
  const { m, finder, finderOpen, openFinder } = usePdp();
  // `?finder=1` opens it once, and the address loses the mark (a reload does not open it again)
  useEffect(() => {
    if (!finder) return;
    try {
      const q = new URLSearchParams(window.location.search);
      if (q.get(FINDER_QUERY) !== '1') return;
      q.delete(FINDER_QUERY);
      const rest = q.toString();
      window.history.replaceState(window.history.state, '', `${window.location.pathname}${rest ? `?${rest}` : ''}${window.location.hash}`);
      // T3 has the finder in its card: bring the card into view and flash it instead (demo 30-product.js query.finder)
      const inline = document.querySelector('.pdp-t3-top');
      if (inline) {
        inline.scrollIntoView({ block: 'center' });
        inline.classList.add('pdp-hl');
        return;
      }
      openFinder(null);
    } catch {
      /* the address stays as it is */
    }
  }, [finder, openFinder]);

  const offered = Boolean(finder && m.chart);
  useEffect(() => (offered ? whenIdle(() => void loadSheet().catch(() => undefined)) : undefined), [offered]);

  if (!finder || !finderOpen || !m.chart) return null;
  return (
    <Suspense fallback={null}>
      <FinderSheet />
    </Suspense>
  );
}
