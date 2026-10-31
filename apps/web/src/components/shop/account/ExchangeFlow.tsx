'use client';
// S08 · PR 186 — the exchange steps on /account/orders/<number>/exchange (demo 61-exchange.js PAGES.exchange, V12.2):
// 1 the item, 2 the reason (too small, too big, or faulty / damaged / wrong with its photo; on a size exchange "Did we
// send the wrong size?" with a note and a label photo), 3 the new size and one of the pieces the exchange rules offer
// (POST /api/account/exchange {action: 'choices'}: strictly the first tier with stock), 4 the swap and the money as the
// shop will store it, then "Confirm exchange" (multipart, with the photos). Done steps fold shut with "Change"; the phone
// has the Back / Next bar at the bottom, the desktop the same buttons under each step and the summary on the side.
//
// Nothing is decided here: the request waits for staff, the engine checks everything again under the order's lock, and
// every word comes from the shop dictionary (`account.exchange.*`).
import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
import type { ImageSource } from '@extas/media';
import { engineReason, lineOpen, canProblem, canSize, priceDiff, sizeOrder, stepsOk, UI_REASONS, type FlowLine, type Hint, type UiReason } from '@/lib/shop/exchange-model';
import { formatMoney, type ShopLang } from '@/lib/shop/lang';
import { newOrderKey } from '../checkout/draft';
import { Icon } from '../Icon';
import { ProductPicture } from '../ProductPicture';
import { showToast } from '../toast';

const fill = (t: string, v: Record<string, string | number>) => t.replace(/\{(\w+)\}/g, (m, k: string) => (k in v ? String(v[k]) : m));
/** The same, with pieces that are elements (a bold number inside a translated line). */
const fillNodes = (t: string, v: Record<string, ReactNode>): ReactNode[] =>
  t.split(/(\{\w+\})/g).map((part, i) => {
    const k = /^\{(\w+)\}$/.exec(part)?.[1];
    return k && k in v ? <Fragment key={i}>{v[k]}</Fragment> : part;
  });

export interface ExchangeLineView extends FlowLine {
  name: string;
  /** Colour · size, in the page's words. */
  detail: string;
  sizeLabel: string | null;
  paidMinor: number;
  sizes: { key: string; label: string }[];
  currentSizeKey: string | null;
  thumb: ReactNode;
}

interface Option {
  variantId: string;
  productName: string;
  colourName: string | null;
  sizeLabel: string | null;
  priceMinor: number;
  tier: number;
  money: { differenceMinor: number; chargeMinor: number; codMinor: number; creditMinor: number; chargeState: string };
}

interface Choices {
  closed: string | null;
  tier: number | null;
  options: Option[];
  pictures: Record<string, { garment: string | null; hex: string; photo: ImageSource | null }>;
}

interface Done {
  number: string;
  claimState: string | null;
  option: Option;
  line: ExchangeLineView;
  reason: UiReason;
}

export interface ExchangeFlowProps {
  words: Record<string, string>;
  number: string;
  orderHref: string;
  waHref: string | null;
  money: { currency: string; lang: ShopLang; bnDigits: boolean };
  lines: ExchangeLineView[];
  problemReason: string | null;
  rules: { claim: boolean; claimPhoto: boolean; problemPhoto: boolean; maxPhotos: number; photoMaxMb: number };
  initialLine: string | null;
  /** The page's title and order strip, drawn above the steps until the request is sent (the done view replaces them). */
  head?: ReactNode;
}

const REASON_ICON = { small: 'up', big: 'down', problem: 'shield' } as const;

export function ExchangeFlow({ words: w, number, orderHref, waHref, money, lines, problemReason, rules, initialLine, head = null }: ExchangeFlowProps) {
  const m = (minor: number) => formatMoney(minor, money.currency, money.lang, money.bnDigits);
  const open = lines.filter((l) => lineOpen(l, problemReason));
  const first = open.find((l) => l.lineId === initialLine) ?? (open.length === 1 ? open[0]! : null);
  const [step, setStep] = useState(1);
  const [lineId, setLineId] = useState<string | null>(first?.lineId ?? null);
  const [reason, setReason] = useState<UiReason | null>(null);
  const [photos, setPhotos] = useState<File[]>([]);
  const [note, setNote] = useState('');
  const [claimOn, setClaimOn] = useState(false);
  const [claimNote, setClaimNote] = useState('');
  const [claimPhotos, setClaimPhotos] = useState<File[]>([]);
  const [sizeKey, setSizeKey] = useState<string | null>(null);
  const [choices, setChoices] = useState<Choices | null>(null);
  const [loading, setLoading] = useState(false);
  const [optionId, setOptionId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<Done | null>(null);
  // one key per request, made on the first press and kept for a retry (the same press twice is the same exchange)
  const key = useRef<string | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  // The phone's step bar grows a line when it says what is missing. The shell keeps room under the page for a fixed
  // bar only on a resize (ShellEffects bottomBarPad), so a change of the bar's own height is told to it as one — or
  // the footer's last row would sit under the bar.
  useEffect(() => {
    const el = bar.current;
    if (!el || typeof ResizeObserver !== 'function') return;
    let h = el.offsetHeight;
    const ro = new ResizeObserver(() => {
      if (el.offsetHeight === h) return;
      h = el.offsetHeight;
      window.dispatchEvent(new Event('resize'));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const line = lines.find((l) => l.lineId === lineId) ?? null;
  const problem = reason === 'problem';
  const st = stepsOk(
    { line, reason, photos: photos.length, sizeKey, optionId, claim: { on: claimOn && !problem, note: claimNote, photos: claimPhotos.length } },
    { problemReason, problemPhoto: rules.problemPhoto, claim: rules.claim, claimPhoto: rules.claimPhoto },
  );
  const option = choices?.options.find((o) => o.variantId === optionId) ?? null;
  const say = (text: string) => root.current && showToast(root.current, text);
  const errText = (code: unknown) => (typeof code === 'string' && w[`err.${code}`]) || w['err.default']!;

  const load = async (l: ExchangeLineView, r: UiReason, size: string | null) => {
    const engine = engineReason(r, problemReason);
    if (!engine) return;
    setLoading(true);
    setChoices(null);
    setOptionId(null);
    try {
      const res = await fetch('/api/account/exchange', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'choices', number, orderItemId: l.lineId, reason: engine, ...(size ? { sizeKey: size } : {}) }) });
      const b = (await res.json()) as Choices & { ok: boolean; error?: string };
      if (!b.ok) {
        say(errText(b.error));
        return;
      }
      setChoices(b);
      // tier 1 or 2 with one piece: it is the only answer, picked for him (demo exc_model)
      if (b.options.length === 1) setOptionId(b.options[0]!.variantId);
    } catch {
      say(w['err.offline']!);
    } finally {
      setLoading(false);
    }
  };

  const pickLine = (id: string) => {
    setLineId(id);
    setReason(null);
    setSizeKey(null);
    setChoices(null);
    setOptionId(null);
    setPhotos([]);
  };
  const pickReason = (r: UiReason) => {
    setReason(r);
    setSizeKey(null);
    setChoices(null);
    setOptionId(null);
    if (r !== 'problem') setPhotos([]);
  };
  const pickSize = (k: string) => {
    setSizeKey(k);
    if (line && reason) void load(line, reason, k);
  };
  const go = (n: number) => {
    setStep(n);
    // a problem's replacement is the same size: its options are read as the step opens
    if (n === 3 && problem && line && !choices && !loading) void load(line, 'problem', null);
    requestAnimationFrame(() => root.current?.querySelector('.exc-step.cur')?.scrollIntoView({ block: 'start', behavior: 'smooth' }));
  };
  const okAt = (n: number) => (n === 1 ? st.ok1 : n === 2 ? st.ok2 : n === 3 ? st.ok3 : true);
  const hintAt = (n: number): Hint | null => (n >= 1 && n <= 3 ? st.missing[n - 1]! : null);
  const next = () => {
    if (!okAt(step)) {
      const h = hintAt(step);
      say(h ? w[`hint.${h}`]! : w['err.default']!);
      return;
    }
    go(Math.min(4, step + 1));
  };

  const confirm = async () => {
    if (!line || !reason || !option || !st.ok3) return;
    const engine = engineReason(reason, problemReason);
    if (!engine) return;
    setBusy(true);
    const form = new FormData();
    form.set('action', 'request');
    form.set('number', number);
    form.set('orderItemId', line.lineId);
    form.set('reason', engine);
    form.set('newVariantId', option.variantId);
    key.current ??= newOrderKey();
    form.set('key', key.current);
    if (problem && note.trim()) form.set('note', note.trim());
    if (problem) for (const p of photos) form.append('photo', p);
    if (!problem && claimOn && claimNote.trim()) {
      form.set('claimNote', claimNote.trim());
      for (const p of claimPhotos) form.append('claimPhoto', p);
    }
    try {
      const res = await fetch('/api/account/exchange', { method: 'POST', body: form });
      const b = (await res.json()) as { ok: boolean; error?: string; number?: string; claimState?: string | null };
      if (!b.ok) {
        say(errText(b.error));
        if (b.error === 'NOT_OFFERED') go(3);
        return;
      }
      setDone({ number: b.number ?? '', claimState: b.claimState ?? null, option, line, reason });
      window.scrollTo(0, 0);
    } catch {
      say(w['err.offline']!);
    } finally {
      setBusy(false);
    }
  };

  const moneyBox = (o: Option, l: ExchangeLineView, free: boolean) => {
    const mo = o.money;
    const row = (k: ReactNode, v: string, cls = '') => (
      <div className={`exc-mrow${cls ? ` ${cls}` : ''}`}>
        <span>{k}</span>
        <span className="v">{v}</span>
      </div>
    );
    const diff = mo.differenceMinor === 0 ? m(0) : mo.differenceMinor > 0 ? `+${m(mo.differenceMinor)}` : `−${m(-mo.differenceMinor)}`;
    return (
      <div className="exc-money" aria-label={w['money.label']} data-testid="exc-money">
        {row(w['money.old'], m(l.paidMinor))}
        {row(w['money.new'], m(o.priceMinor))}
        {row(w['money.diff'], diff)}
        {row(
          <>
            {w['money.charge']} {free ? <span className="xs muted">({w['money.free']})</span> : null}
          </>,
          m(mo.chargeMinor),
        )}
        {mo.codMinor > 0 || mo.creditMinor === 0
          ? row(
              <>
                {w['money.pay']}
                <span className="sub">{mo.codMinor > 0 ? w['money.paySub'] : w['money.nothing']}</span>
              </>,
              m(mo.codMinor),
              'exc-mfinal',
            )
          : null}
        {mo.creditMinor > 0
          ? row(
              <>
                {w['money.wallet']}
                <span className="sub">{w['money.walletSub']}</span>
              </>,
              m(mo.creditMinor),
              'exc-mfinal',
            )
          : null}
      </div>
    );
  };
  const swap = (l: ExchangeLineView, o: Option) => (
    <div className="exc-swap">
      <div className="exc-mini">
        <span className="shrink0" style={{ width: 48 }}>
          {l.thumb}
        </span>
        <div className="xs" style={{ minWidth: 0 }}>
          <div className="muted">{w.sendBack}</div>
          <div className="bold small">{l.name}</div>
          <div className="text2">{l.detail}</div>
        </div>
      </div>
      <span className="exc-arrow" aria-hidden="true">
        <Icon name="swap" size={20} />
      </span>
      <div className="exc-mini">
        <div className="xs" style={{ minWidth: 0 }}>
          <div className="muted">{w.get}</div>
          <div className="bold small">{o.productName}</div>
          <div className="text2">{[o.colourName, o.sizeLabel].filter(Boolean).join(' · ')}</div>
        </div>
      </div>
    </div>
  );

  if (done) {
    const tl = ['requested', 'approved', 'swap', 'done'];
    return (
      <section className="card exc-done" aria-labelledby="exd-h" data-testid="exc-done" ref={root as never}>
        <span className="exc-done-check">
          <Icon name="check" size={32} />
        </span>
        <h1 className="h1 mt16" id="exd-h">
          {w.doneTitle}
        </h1>
        <div className="text2 mt8">
          {fillNodes(w.doneLine!, { exchange: <b data-testid="exc-id">{done.number}</b>, number })}
        </div>
        <ol className="exc-dtl" aria-label={w.list}>
          {tl.map((s, i) => (
            <li key={s} className={i === 0 ? 'done' : ''}>
              <span className={`tl-dot${i === 0 ? ' done' : i === 1 ? ' now' : ''}`}>{i === 0 ? <Icon name="check" size={13} /> : i + 1}</span>
              <span>{w[`tl.${s}`]}</span>
            </li>
          ))}
        </ol>
        <div style={{ textAlign: 'left' }}>
          {swap(done.line, done.option)}
          <div className="mt16">{moneyBox(done.option, done.line, done.reason === 'problem')}</div>
        </div>
        <p className="small text2" style={{ margin: '18px 0 0' }}>
          {w.doneText}
        </p>
        {done.claimState === 'PENDING' ? (
          <p className="small text2" style={{ margin: '8px 0 0' }} data-testid="exc-claim-sent">
            {w.claimSent}
          </p>
        ) : null}
        <div className="row wrap mt16" style={{ justifyContent: 'center', gap: 10 }}>
          <a className="btn btn-primary" href={orderHref} data-testid="exc-back-order">
            {w.back}
          </a>
          {waHref ? (
            <a className="btn btn-secondary" href={waHref} target="_blank" rel="noopener noreferrer">
              {w.wa}
            </a>
          ) : null}
        </div>
      </section>
    );
  }

  const nav = (n: number) => {
    const ok = okAt(n);
    const h = ok ? null : hintAt(n);
    return (
      <div className="exc-dnav">
        {n > 1 ? (
          <button type="button" className="btn btn-ghost" onClick={() => go(n - 1)}>
            <Icon name="back" size={16} />
            {w.prev}
          </button>
        ) : (
          <a className="btn btn-ghost" href={orderHref}>
            {w.cancel}
          </a>
        )}
        <div className="row" style={{ gap: 14 }}>
          {h ? <span className="exc-hint">{w[`hint.${h}`]}</span> : null}
          {n < 4 ? (
            <button type="button" className="btn btn-primary" onClick={next} disabled={!ok} data-testid={`exc-next-${n}`}>
              {w.next}
              <Icon name="right" size={16} />
            </button>
          ) : (
            <button type="button" className="btn btn-primary" onClick={confirm} disabled={busy} data-testid="exc-confirm">
              <Icon name="check" size={16} />
              {busy ? w.sending : w.confirm}
            </button>
          )}
        </div>
      </div>
    );
  };

  const fileBox = (files: File[], set: (f: File[]) => void, required: boolean, testId: string) => (
    <div className="exc-photo-row">
      {files.map((f, i) => (
        <span key={`${f.name}-${i}`} className="exc-photo has" data-testid={`${testId}-has`}>
          <Icon name="camera" size={22} />
          <span className="xs">{w.photoAdded}</span>
          <button type="button" className="ord-photo-x" aria-label={w.photoRemove} onClick={() => set(files.filter((_, j) => j !== i))}>
            <Icon name="close" size={14} />
          </button>
        </span>
      ))}
      {files.length + (testId === 'exc-photo' ? claimPhotos.length : photos.length) < rules.maxPhotos ? (
        <label className="exc-photo">
          <Icon name="camera" size={22} />
          <span>{w.photo}</span>
          <span className="xs muted" style={{ fontWeight: 500 }}>
            {required ? w.photoRequired : w.photoOptional}
          </span>
          <input
            type="file"
            accept="image/*"
            className="sr"
            data-testid={testId}
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (!f) return;
              if (f.size > rules.photoMaxMb * 1_024 * 1_024) {
                say(w['err.TOO_LARGE']!);
                return;
              }
              set([...files, f]);
            }}
          />
        </label>
      ) : null}
    </div>
  );

  const body1 = () => (
    <>
      <p className="small text2" style={{ margin: '0 0 12px' }}>
        {w.whichItem}
      </p>
      <fieldset className="exc-fs">
        <legend className="sr">{w['step.1']}</legend>
        {lines.map((l) => {
          const can = lineOpen(l, problemReason);
          const on = l.lineId === lineId;
          const why = !can ? (l.size ?? l.problem ?? 'NOT_COVERED') : null;
          return (
            <label key={l.lineId} className={`exc-opt${on ? ' on' : ''}${can ? '' : ' dis'}`} data-testid="exc-line">
              <input type="radio" name="exc-line" value={l.lineId} checked={on} disabled={!can} onChange={() => pickLine(l.lineId)} />
              <span className="shrink0" style={{ width: 48 }}>
                {l.thumb}
              </span>
              <span className="grow" style={{ minWidth: 0 }}>
                <span className="bold small" style={{ display: 'block' }}>
                  {l.name}
                </span>
                <span className="xs text2" style={{ display: 'block' }}>
                  {why ? (w[`why.${why}`] ?? w['why.NOT_COVERED']) : l.detail}
                </span>
              </span>
              <span className="small bold shrink0">{m(l.paidMinor)}</span>
            </label>
          );
        })}
      </fieldset>
      {nav(1)}
    </>
  );

  const body2 = () => {
    if (!line) return null;
    return (
      <>
        <p className="small text2" style={{ margin: '0 0 12px' }}>
          {fill(w.reasonAsk!, { name: line.name, size: line.sizeLabel ?? '' })}
        </p>
        <fieldset className="exc-fs">
          <legend className="sr">{w['step.2']}</legend>
          {UI_REASONS.map((r) => {
            const can = r === 'problem' ? canProblem(line, problemReason) : canSize(line);
            const on = reason === r;
            const sub = !can ? (r === 'problem' ? w[`why.${line.problem ?? 'REASON'}`] : line.sizes.length < 2 ? w['why.ONE_SIZE'] : w[`why.${line.size ?? 'NOT_COVERED'}`]) : w[`reason.${r}Sub`];
            return (
              <label key={r} className={`exc-opt${on ? ' on' : ''}${can ? '' : ' dis'}`} data-testid={`exc-reason-${r}`}>
                <input type="radio" name="exc-reason" value={r} checked={on} disabled={!can} onChange={() => pickReason(r)} />
                <span className="exc-ri">
                  <Icon name={REASON_ICON[r]} size={18} />
                </span>
                <span className="grow">
                  <span className="bold small" style={{ display: 'block' }}>
                    {w[`reason.${r}`]}
                  </span>
                  <span className="xs text2">{sub}</span>
                </span>
              </label>
            );
          })}
        </fieldset>
        {problem ? (
          <div className="tint p16 mt12">
            <div className="row top" style={{ gap: 10, alignItems: 'flex-start' }}>
              <span className="brandc shrink0" style={{ marginTop: 2 }}>
                <Icon name="shield" size={18} />
              </span>
              <div>
                <div className="bold small">{w.freeTitle}</div>
                <div className="xs text2" style={{ marginTop: 2 }}>
                  {w.freeText}
                </div>
              </div>
            </div>
            {fileBox(photos, setPhotos, rules.problemPhoto, 'exc-photo')}
            <span className="xs text2" style={{ display: 'block', marginTop: 8 }}>
              {w.photoHint}
            </span>
            <label className="label mt12" htmlFor="exc-note">
              {w.note} <span className="muted" style={{ fontWeight: 400 }}>{w.optional}</span>
            </label>
            <textarea id="exc-note" className="input" rows={2} maxLength={1000} value={note} placeholder={w.notePh} onChange={(e) => setNote(e.target.value)} />
          </div>
        ) : reason && rules.claim ? (
          <div className="soft p16 mt12" data-testid="exc-claim">
            <label className="row" style={{ gap: 10, alignItems: 'flex-start', cursor: 'pointer', minHeight: 44 }}>
              <input type="checkbox" checked={claimOn} onChange={(e) => setClaimOn(e.target.checked)} style={{ width: 18, height: 18, marginTop: 2, accentColor: 'var(--brand)' }} data-testid="exc-claim-on" />
              <span>
                <span className="bold small" style={{ display: 'block' }}>
                  {w.claimAsk}
                </span>
                <span className="xs text2">{w.claimText}</span>
              </span>
            </label>
            {claimOn ? (
              <>
                <label className="label mt12" htmlFor="exc-claim-note">
                  {w.claimNote}
                </label>
                <textarea id="exc-claim-note" className="input" rows={2} maxLength={1000} value={claimNote} placeholder={w.claimPh} onChange={(e) => setClaimNote(e.target.value)} data-testid="exc-claim-note" />
                {fileBox(claimPhotos, setClaimPhotos, rules.claimPhoto, 'exc-claim-photo')}
              </>
            ) : null}
          </div>
        ) : null}
        <div className="xs muted mt12 row top" style={{ gap: 6, alignItems: 'flex-start' }}>
          <span className="shrink0" style={{ marginTop: 2 }}>
            <Icon name="info" size={14} />
          </span>
          <span>{w.rules}</span>
        </div>
        {nav(2)}
      </>
    );
  };

  const options = () => {
    if (loading) return <p className="small text2 mt16">{w.loading}</p>;
    if (!choices) return null;
    if (!choices.options.length) {
      return (
        <div className="exc-opts" data-tier="0" style={problem ? { borderTop: 0, paddingTop: 0 } : undefined}>
          <div className="exc-opts-hd">
            <span className="exc-opts-i warn">
              <Icon name="info" size={18} />
            </span>
            <div>
              <div className="h3">{w.none}</div>
              <div className="small text2" style={{ marginTop: 2 }}>
                {w.noneText}
              </div>
            </div>
          </div>
          {waHref ? (
            <a className="btn btn-secondary mt16" href={waHref} target="_blank" rel="noopener noreferrer">
              {w.wa}
            </a>
          ) : null}
        </div>
      );
    }
    const tier = choices.tier ?? 1;
    return (
      <div className="exc-opts" data-tier={tier} style={problem ? { borderTop: 0, paddingTop: 0 } : undefined} data-testid="exc-options">
        <div className="exc-opts-hd">
          <span className={`exc-opts-i${tier === 1 ? '' : ' warn'}`}>
            <Icon name={tier === 1 ? 'check' : 'swap'} size={18} />
          </span>
          <div>
            <div className="h3">{w[`tier.${tier}`]}</div>
          </div>
        </div>
        <div className={`exc-ogrid ${tier <= 2 ? 'c3' : 'list'}`} role="radiogroup" aria-label={w['step.3']}>
          {choices.options.map((o) => {
            const on = o.variantId === optionId;
            const pic = choices.pictures[o.variantId];
            const d = line ? priceDiff(o.priceMinor, line.paidMinor) : { kind: 'same' as const, amountMinor: 0 };
            return (
              <button type="button" key={o.variantId} className={`exc-ocard${on ? ' on' : ''}`} role="radio" aria-checked={on} onClick={() => setOptionId(o.variantId)} data-testid="exc-option">
                <ProductPicture garment={pic?.garment ?? null} hex={pic?.hex ?? ''} photo={pic?.photo ?? null} ratio="ratio-11" alt={o.productName} lang={money.lang} sizes="(min-width: 1024px) 200px, 45vw" />
                <span className="exc-radio" aria-hidden="true">
                  {on ? <Icon name="check" size={13} /> : null}
                </span>
                <span className="exc-oinfo">
                  <span className="bold small" style={{ display: 'block' }}>
                    {o.colourName ?? o.productName}
                  </span>
                  <span className="xs text2" style={{ display: 'block' }}>
                    {o.productName} · {fill(w.sizeX!, { size: o.sizeLabel ?? '' })}
                  </span>
                  <span className="xs exc-diff" style={{ display: 'block', marginTop: 3 }}>
                    {d.kind === 'same' ? w.same : fill(w[d.kind === 'more' ? 'more' : 'less']!, { amount: m(d.amountMinor) })}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
        <p className="small exc-only">
          <span className="shrink0" style={{ marginTop: 2 }}>
            <Icon name="info" size={16} />
          </span>
          <span>{w['tier.note']}</span>
        </p>
      </div>
    );
  };

  const body3 = () => {
    if (!line) return null;
    return (
      <>
        {!problem && reason ? (
          <>
            <p className="small text2" style={{ margin: '0 0 2px' }}>
              {fill(w.sizeAsk!, { name: line.name })}
            </p>
            <div className="xs muted" style={{ marginBottom: 12 }}>
              {reason === 'big' ? w.sizeBig : w.sizeSmall}
            </div>
            <div className="exc-sizes" role="group" aria-label={w['step.3']}>
              {sizeOrder(line.sizes, line.currentSizeKey, reason === 'big' ? 'big' : 'small').map((s) =>
                s.current ? (
                  <button key={s.key} type="button" className="size-pill exc-sp cur" disabled>
                    <span>{s.label}</span>
                    <span className="m">{w.yourSize}</span>
                  </button>
                ) : (
                  <button key={s.key} type="button" className={`size-pill exc-sp${sizeKey === s.key ? ' on' : ''}`} aria-pressed={sizeKey === s.key} onClick={() => pickSize(s.key)} data-testid="exc-size">
                    <span>{s.label}</span>
                  </button>
                ),
              )}
            </div>
          </>
        ) : null}
        <div className={problem ? '' : 'mt24'}>{options()}</div>
        {nav(3)}
      </>
    );
  };

  const body4 = () => {
    if (!line || !option) return null;
    return (
      <>
        {swap(line, option)}
        <div className="mt16">{moneyBox(option, line, problem)}</div>
        <div className="mt24">
          <div className="h3">{w.how}</div>
          <ul className="exc-how">
            {[
              ['truck', w.how1],
              ['box', problem ? w.how2problem : w.how2],
              ['wallet', w.how3],
              ['chat', w.how4],
            ].map(([icon, text]) => (
              <li key={icon}>
                <span className="i">
                  <Icon name={icon as 'truck'} size={16} />
                </span>
                <span>{text}</span>
              </li>
            ))}
          </ul>
        </div>
        {nav(4)}
      </>
    );
  };

  const card = (n: number, title: string, summary: string, body: () => ReactNode) => {
    const state = n < step ? 'done' : n === step ? 'cur' : 'todo';
    return (
      <section className={`exc-step ${state}`} data-step={n} aria-current={state === 'cur' ? 'step' : undefined} aria-labelledby={`exc-s${n}`} data-testid={`exc-step-${n}`}>
        <div className="exc-step-hd">
          <span className="exc-num" aria-hidden="true">
            {state === 'done' ? <Icon name="check" size={14} /> : n}
          </span>
          <div className="grow">
            <h2 className="h3" id={`exc-s${n}`}>
              <span className="sr">{fill(w['step.sr']!, { n })}</span>
              {title}
            </h2>
            {state === 'done' && summary ? <div className="exc-step-sum">{summary}</div> : null}
          </div>
          {state === 'done' ? (
            <button type="button" className="link exc-chg" onClick={() => go(n)}>
              {w.change}
            </button>
          ) : null}
        </div>
        {state === 'cur' ? <div className="exc-step-bd">{body()}</div> : null}
      </section>
    );
  };

  const s1 = line ? `${line.name} · ${line.detail}` : '';
  const s2 = reason ? `${w[`reason.${reason}`]}${problem && photos.length ? ` · ${w.photoAdded}` : ''}` : '';
  const s3 = option ? `${problem ? (line?.sizeLabel ?? '') : fill(w.sizeX!, { size: option.sizeLabel ?? '' })} · ${option.productName}${option.colourName ? `, ${option.colourName}` : ''}` : '';
  const barOk = okAt(step);
  const barHint = barOk ? null : hintAt(step);

  return (
    <div ref={root}>
      {head}
      <div className="split-side">
        <div className="exc-steps">
          {card(1, w['step.1']!, s1, body1)}
          {card(2, w['step.2']!, s2, body2)}
          {card(3, problem ? w['step.3problem']! : w['step.3']!, s3, body3)}
          {card(4, w['step.4']!, '', body4)}
        </div>
        <aside className="exc-side" aria-label={w.title}>
          <div className="sticky-d">
            <section className="card">
              <div className="exc-sum-hd">
                <div className="eyebrow">{w.title}</div>
              </div>
              {line ? (
                <>
                  <div className="exc-sum-item">
                    <span className="shrink0" style={{ width: 54 }}>
                      {line.thumb}
                    </span>
                    <div className="small" style={{ minWidth: 0 }}>
                      <div className="bold">{line.name}</div>
                      <div className="text2">{line.detail}</div>
                      <div className="xs muted">{m(line.paidMinor)}</div>
                    </div>
                  </div>
                  <dl className="exc-dl">
                    <div>
                      <dt>{w['step.2']}</dt>
                      <dd>{reason ? w[`reason.${reason}`] : '—'}</dd>
                    </div>
                    <div>
                      <dt>{w['step.3']}</dt>
                      <dd>{problem ? (line.sizeLabel ?? '—') : (line.sizes.find((s) => s.key === sizeKey)?.label ?? '—')}</dd>
                    </div>
                    <div>
                      <dt>{w.newItem}</dt>
                      <dd>{option ? `${option.productName}${option.colourName ? `, ${option.colourName}` : ''}` : '—'}</dd>
                    </div>
                  </dl>
                  {option ? <div className="exc-sum-money">{moneyBox(option, line, problem)}</div> : null}
                </>
              ) : null}
              <div className="exc-sum-ft xs text2">{w.rules}</div>
            </section>
          </div>
        </aside>
      </div>
      <div className="mbar dm-hide exc-mbar" ref={bar}>
        {barHint ? (
          <div className="exc-hint" style={{ marginBottom: 8 }}>
            {w[`hint.${barHint}`]}
          </div>
        ) : step === 4 && option ? (
          <div className="row between small" style={{ marginBottom: 8 }}>
            <span className="text2">{option.money.codMinor > 0 || option.money.creditMinor === 0 ? w['money.pay'] : w['money.wallet']}</span>
            <b className="price">{m(option.money.codMinor > 0 || option.money.creditMinor === 0 ? option.money.codMinor : option.money.creditMinor)}</b>
          </div>
        ) : null}
        <div className="row" style={{ gap: 10 }}>
          {step > 1 ? (
            <button type="button" className="btn btn-ghost" style={{ padding: '12px 16px' }} onClick={() => go(step - 1)}>
              <Icon name="back" size={16} />
              {w.prev}
            </button>
          ) : (
            <a className="btn btn-ghost" href={orderHref} style={{ padding: '12px 16px' }}>
              {w.cancel}
            </a>
          )}
          {step < 4 ? (
            <button type="button" className="btn btn-primary grow" onClick={next} disabled={!barOk} data-testid="exc-bar-next">
              {w.next}
              <Icon name="right" size={16} />
            </button>
          ) : (
            <button type="button" className="btn btn-primary grow" onClick={confirm} disabled={busy} data-testid="exc-bar-confirm">
              <Icon name="check" size={16} />
              {busy ? w.sending : w.confirm}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
