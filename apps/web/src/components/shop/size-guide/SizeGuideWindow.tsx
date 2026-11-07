'use client';
// Follow-up 155 (PR 58, 75) — the size guide window on any page (demo 10-size-guide.js): 1. what are you buying (every
// category Find My Size can answer for; a new one appears by itself), 2. height and weight (the same steppers as the
// product page: feet, inches with the centimetres beside, kilograms; hold to repeat), 3. the size from that category's
// chart with the reasons, "Between sizes? Take XL", "saved as your top size" and a link to shop the category. The height
// and weight are kept exactly as the product page keeps them (the `extas_fit` cookie, while `pdp.finder.remember` is
// on), so the next product page opens with the size chosen. Its own chunk: fetched with its data only when someone opens
// it (components/shop/size-guide/open.tsx), never part of a page's first load.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { recommendSize, type Recommendation } from '@extas/catalogue/size-finder';
import type { PdpFinderSettings } from '@extas/settings';
import { holdRepeat, type HoldRepeat } from '@/lib/shop/hold-repeat';
import {
  bodyWords,
  canStep,
  feetInches,
  finderChart,
  finderRules,
  FIT_COOKIE,
  fitCookieValue,
  heightCm,
  readFit,
  reasonLines,
  startBody,
  stepBody,
  type FitBody,
} from '@/lib/shop/pdp-finder';
import { digitsOf, fillWords } from '@/lib/shop/product-model';
import type { SizeGuideAnswer } from '@/lib/shop/size-guide-api';
import type { GuideEntry } from '@/lib/shop/size-guide';
import { GarmentIcon, Icon } from '../Icon';
import { Bold } from '../product/Bold';
import { PdpModal } from '../product/PdpModal';
import './size-guide.css';

type K = 'ft' | 'in' | 'kg';

/** The kept answer from this phone's cookie (none, or a damaged one: the setting's first answer). */
function keptBody(f: PdpFinderSettings): FitBody | null {
  if (!f.remember) return null;
  const m = document.cookie.split('; ').find((x) => x.startsWith(`${FIT_COOKIE}=`));
  return m ? readFit(m.slice(FIT_COOKIE.length + 1), f) : null;
}

function keepBody(b: FitBody, f: PdpFinderSettings): void {
  if (!f.remember) return;
  try {
    const secure = location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = `${FIT_COOKIE}=${fitCookieValue(b)}; Path=/; Max-Age=${f.rememberDays * 86400}; SameSite=Lax${secure}`;
  } catch {
    /* a browser that refuses cookies asks again next time */
  }
}

function StepButton({ d, label, can, onStep, f }: { d: 1 | -1; label: string; can: boolean; onStep: (d: 1 | -1) => boolean; f: PdpFinderSettings }) {
  const latest = useRef(onStep);
  useEffect(() => {
    latest.current = onStep;
  }, [onStep]);
  const ctl = useRef<HoldRepeat | null>(null);
  useEffect(() => {
    const h = holdRepeat({ holdMs: f.holdMs, repeatMs: f.repeatMs, step: () => latest.current(d) });
    ctl.current = h;
    return () => h.cancel();
  }, [f.holdMs, f.repeatMs, d]);
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

function Stepper({ k, text, aria, value, onChange, f, w }: { k: K; text: string; aria: string; value: FitBody; onChange: (b: FitBody) => void; f: PdpFinderSettings; w: W }) {
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
      <StepButton d={-1} label={w('finder.less', { what: aria })} can={canStep(value, k, -1, f)} onStep={onStep} f={f} />
      <output aria-live="polite" data-testid={`sg-${k}`}>
        {text}
      </output>
      <StepButton d={1} label={w('finder.more', { what: aria })} can={canStep(value, k, 1, f)} onStep={onStep} f={f} />
    </div>
  );
}

type W = (key: string, vars?: Record<string, string | number>) => string;

interface Props {
  data: SizeGuideAnswer & { finder: PdpFinderSettings };
  opener: HTMLElement | null;
  onClose: () => void;
}

export function SizeGuideWindow({ data, opener, onClose }: Props) {
  const f = data.finder;
  const { words, lang } = data;
  const w = useCallback<W>((key, vars = {}) => fillWords(words[key] ?? key, vars), [words]);
  const num = useCallback((n: number | string) => digitsOf(n, data.bnDigits), [data.bnDigits]);
  const back = useRef<HTMLElement | null>(opener);
  const [entry, setEntry] = useState<GuideEntry | null>(data.entries.length === 1 ? data.entries[0]! : null);
  const [body, setBody] = useState<FitBody>(() => startBody(keptBody(f), f));
  const [answer, setAnswer] = useState<{ b: FitBody; rec: Recommendation } | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const step = !entry ? 'pick' : answer ? 'result' : 'ask';

  // each step's first choice takes the focus (the keyboard and a screen reader start there)
  useEffect(() => {
    const el = box.current?.querySelector<HTMLElement>('[data-sg-first]');
    el?.focus({ preventScroll: true });
  }, [step]);

  const rules = useMemo(() => finderRules(f), [f]);
  const show = () => {
    if (!entry) return;
    const rec = recommendSize(finderChart(entry.chart), body.heightIn, body.weightKg, rules, entry.garment);
    if (!rec) return;
    keepBody(body, f);
    setAnswer({ b: body, rec });
  };
  const label = (e: GuideEntry, k: string) => e.labels[k] ?? k;

  const { ft, inch } = feetInches(body.heightIn);
  return (
    <PdpModal title={w('finder.title')} closeLabel={w('finder.close')} onClose={onClose} opener={back} className="pdp-sheet sg-win" testId="size-guide-modal">
      <div ref={box}>
        {step === 'pick' ? (
          <>
            <div className="small text2">{w('sizeGuide.pick')}</div>
            <div className="sg-cats mt16" data-testid="sg-cats">
              {data.entries.map((e, i) => (
                <button key={e.slug} type="button" className="sg-cat" data-sg-first={i === 0 ? '' : undefined} onClick={() => setEntry(e)}>
                  <GarmentIcon garment={e.garment} size={22} />
                  <span>{e.name}</span>
                </button>
              ))}
            </div>
          </>
        ) : null}
        {step === 'ask' && entry ? (
          <>
            <div className="small text2">
              <Bold text={w('finder.intro', { chart: entry.chart.name })} />
            </div>
            <div className="sg-steps mt16">
              <div>
                <div className="label">{w('finder.height')}</div>
                <div className="sg-row">
                  <Stepper k="ft" text={w('finder.ft', { n: num(ft) })} aria={w('finder.ftAria')} value={body} onChange={setBody} f={f} w={w} />
                  <Stepper k="in" text={w('finder.in', { n: num(inch) })} aria={w('finder.inAria')} value={body} onChange={setBody} f={f} w={w} />
                  <span className="xs muted" data-testid="sg-cm">
                    {w('finder.cmLine', { n: num(heightCm(body.heightIn)) })}
                  </span>
                </div>
              </div>
              <div>
                <div className="label">{w('finder.weight')}</div>
                <div className="sg-row">
                  <Stepper k="kg" text={w('finder.kg', { n: num(body.weightKg) })} aria={w('finder.kgAria')} value={body} onChange={setBody} f={f} w={w} />
                </div>
              </div>
            </div>
            <button type="button" className="btn btn-primary btn-block sg-go" data-testid="sg-show" data-sg-first="" onClick={show}>
              {w('finder.show')}
            </button>
            <div className="sg-foot mt12">
              {data.entries.length > 1 ? (
                <button type="button" className="sg-link xs" onClick={() => setEntry(null)}>
                  <Icon name="back" size={14} /> {w('sizeGuide.back')}
                </button>
              ) : (
                <span />
              )}
              <span className="xs muted">{w(f.remember ? 'finder.privacy' : 'finder.privacyNoSave')}</span>
            </div>
          </>
        ) : null}
        {step === 'result' && entry && answer ? (
          <>
            <div className="pdp-res" data-testid="sg-result">
              <div className="eyebrow">{w('sizeGuide.yourSize', { name: entry.name })}</div>
              <div className="pdp-res-size mt8" data-testid="sg-size">
                {label(entry, answer.rec.size)}
              </div>
              <div className="small text2 mt8">{w(f.remember ? (entry.bottom ? 'sizeGuide.savedBottom' : 'sizeGuide.savedTop') : 'sizeGuide.notSaved', bodyWords(answer.b, w, num))}</div>
              <ul className="pdp-why">
                {reasonLines(answer.rec, entry.chart, {
                  w: (k, v) => w(k === 'cm' || k === 'inch' ? `pdp.${k}` : k, v),
                  has: (k) => k in words,
                  num,
                  unit: 'inch',
                  label: (k) => label(entry, k),
                  low: (l) => (lang === 'bn' ? l : l.toLowerCase()),
                  ...bodyWords(answer.b, w, num),
                  garment: entry.garment,
                  lengthField: f.length.field,
                }).map((x) => (
                  <li key={x}>
                    <Icon name="check" size={16} />
                    <span>
                      <Bold text={x} />
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            {answer.rec.next && answer.rec.next !== answer.rec.size ? (
              <div className="sg-tip small mt12">
                <Bold text={w('sizeGuide.between', { size: label(entry, answer.rec.next) })} />
              </div>
            ) : null}
            <div className="sg-acts mt16">
              <button type="button" className="btn btn-ghost" onClick={() => setAnswer(null)}>
                {w('finder.change')}
              </button>
              <a className="btn btn-primary grow" href={entry.href} data-testid="sg-shop" data-sg-first="">
                {w('sizeGuide.shop', { name: lang === 'bn' ? entry.name : entry.name.toLowerCase(), size: label(entry, answer.rec.size) })}
              </a>
            </div>
          </>
        ) : null}
      </div>
    </PdpModal>
  );
}
