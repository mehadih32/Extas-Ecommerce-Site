'use client';
// S03 · PR 571 — "+ Make a combo" (demo acw_wizard): eight short steps — what (categories or products), 2 or 3 pieces,
// how they pair (and colours to leave out), the price, no single pieces, "add 1 more → 3 pcs", the preview of every
// pair, and the name, link, season, dates and page designs. The live count under the steps is the server's answer
// (the same generator that makes the pairs), so what the wizard says is what the shop gets. A price needs
// `combos.prices`: without it the rule saves as a draft for the owner to price.
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { AutoRuleView, CategoryOption, PairView, ProductOption, RulePreview } from '@extas/combos';
import { eachMinor, LIST_TEMPLATES, PAGE_TEMPLATES, rulePath } from '@extas/combos/pure';
import { call, errorText } from '../api';
import { Icon } from '../Icon';
import { t, type Dict } from '@/lib/i18n';
import { COMBOS_API } from './ComboEditor';
import { MoneyBox, Switch } from './parts';
import { nameIn, saveWords, type Lang } from './model';
import { autoKey, autoTitle, emptyRuleForm, formFromRule, previewInput, priceBad, ruleInput, stepOk, WIZARD_STEPS, type Pairing, type RuleForm } from './rule-form';
import { SetArt } from './SetArt';

const PREVIEW_MS = 300;

export interface WizardProps {
  dict: Dict;
  lang: Lang;
  locale: string;
  fmt(minor: number | null): string;
  symbol: string;
  /** The rule being changed; null = a new one. */
  rule: AutoRuleView | null;
  /** Its "add 1 more" rule, for that price. */
  upsellRule: AutoRuleView | null;
  categories: CategoryOption[];
  products: ProductOption[];
  seasons: { key: string; en: string; bn?: string | null }[];
  perms: { write: boolean; publish: boolean; prices: boolean };
  /** The store's rounding step for a "% off" price (minor units). */
  roundingStepMinor: number;
  hrefOf(tab: string, rule?: string): string;
  onSaved(r: AutoRuleView): void;
}

export function RuleWizard(p: WizardProps) {
  const { dict: d, lang, fmt } = p;
  const tt = (k: string, vars?: Record<string, string | number>) => t(d, `combos.${k}`, vars);
  const num = (n: number) => n.toLocaleString(p.locale);
  const [form, setForm] = useState<RuleForm>(() => (p.rule ? formFromRule(p.rule, p.upsellRule) : emptyRuleForm()));
  const [step, setStep] = useState(1);
  const [mode, setMode] = useState<'cat' | 'prod'>(() => (p.rule && !p.rule.categoryIds.length ? 'prod' : 'cat'));
  const [q, setQ] = useState('');
  const [preview, setLive] = useState<RulePreview | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<AutoRuleView | null>(null);
  const [keyEdited, setKeyEdited] = useState(Boolean(p.rule));
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const set = (patch: Partial<RuleForm>) => {
    setErr('');
    setForm((f) => ({ ...f, ...patch }));
  };

  const catName = useMemo(() => new Map(p.categories.map((c) => [c.id, nameIn(lang, c.nameEn, c.nameBn)])), [p.categories, lang]);
  const prodName = useMemo(() => new Map(p.products.map((x) => [x.id, nameIn(lang, x.nameEn, x.nameBn)])), [p.products, lang]);
  const chosen = [...form.categoryIds.map((id) => catName.get(id) ?? ''), ...form.productIds.map((id) => prodName.get(id) ?? '')].filter(Boolean);
  const title = form.titleEn || autoTitle(chosen);
  const key = keyEdited ? form.key : autoKey(title, form.pieces);
  const upName = { upsellNameEn: tt('wizard.s6.upsellName', { name: form.nameEn || title }), upsellNameBn: form.nameBn ? tt('wizard.s6.upsellName', { name: form.nameBn }) : null };

  const bound = form.categoryIds.length + form.productIds.length > 0;
  /** The server's last answer; nothing bound = nothing to count. */
  const live = bound ? preview : null;

  useEffect(() => {
    clearTimeout(timer.current);
    if (!form.categoryIds.length && !form.productIds.length) return;
    timer.current = setTimeout(async () => {
      const a = await call('POST', `${COMBOS_API}/rules/preview`, { rule: previewInput(form) });
      if (a.data.ok) setLive(a.data.preview as RulePreview);
    }, PREVIEW_MS);
    return () => clearTimeout(timer.current);
  }, [form]);

  const go = (n: number) => {
    for (let s = step; s < n; s++) {
      if (!stepOk(s, form, live && { products: live.counts.products, made: live.counts.made }, p.perms.prices)) {
        setStep(s);
        setErr(tt(s === 1 ? 'wizard.errWhat' : s === 3 ? 'wizard.errPairing' : 'wizard.errPrice'));
        return;
      }
    }
    setErr('');
    setStep(Math.max(1, Math.min(WIZARD_STEPS, n)));
  };

  const save = async () => {
    setErr('');
    if (!live?.counts.made) return setErr(tt('wizard.errPairing'));
    const input = ruleInput({ ...form, key, titleEn: form.titleEn, nameEn: form.nameEn || title }, upName);
    setBusy(true);
    let a = p.rule ? await call('PUT', `${COMBOS_API}/rules/${p.rule.id}`, { rule: input, version: p.rule.version }) : await call('POST', `${COMBOS_API}/rules`, { rule: input });
    if (a.data.ok && !p.rule && p.perms.publish && !(a.data.rule as AutoRuleView).blocking.length) a = await call('POST', `${COMBOS_API}/rules/${(a.data.rule as AutoRuleView).id}/active`, { on: true });
    setBusy(false);
    if (!a.data.ok) return setErr(errorText(d, a));
    const r = a.data.rule as AutoRuleView;
    p.onSaved(r);
    if (p.rule) return;
    setSaved(r);
  };

  if (saved) {
    const link = typeof window === 'undefined' ? saved.path : `${window.location.origin}${saved.path}`;
    const isLive = saved.state === 'live';
    return (
      <section className="ad-card cb-done" data-testid="cb-wiz-done">
        <div className="cb-done-ok" aria-hidden="true">
          <Icon name="check" size={26} />
        </div>
        <h2 className="cb-h2">{tt(isLive ? 'wizard.done.live' : 'wizard.done.draft', { name: nameIn(lang, saved.nameEn, saved.nameBn) })}</h2>
        <p className="ad-intro">{isLive ? tt('wizard.done.count', { n: num(saved.counts.withStock) }) : tt('wizard.done.draftHelp')}</p>
        <div className="cb-link cb-link-big">
          <code>{link}</code>
        </div>
        <div className="cb-done-acts">
          <button type="button" className="ad-btn ad-btn-primary" onClick={() => void navigator.clipboard?.writeText(link).catch(() => undefined)} data-testid="cb-wiz-copy">
            <Icon name="link" size={16} />
            {tt('rule.copy')}
          </button>
          <Link className="ad-btn ad-btn-ghost" href={p.hrefOf('auto')}>
            {tt('wizard.done.all')}
          </Link>
        </div>
      </section>
    );
  }

  const steps = Array.from({ length: WIZARD_STEPS }, (_, i) => i + 1);
  return (
    <div className="cb-wiz" data-testid="cb-wiz" data-step={step}>
      {p.rule ? (
        <div className="cb-info">
          <Icon name="edit" size={18} />
          <div>{tt('wizard.editing', { name: nameIn(lang, p.rule.nameEn, p.rule.nameBn) })}</div>
        </div>
      ) : null}
      <ol className="cb-steps" aria-label={tt('wizard.stepsLabel')}>
        {steps.map((n) => (
          <li key={n} className={n < step ? 'done' : n === step ? 'now' : ''}>
            <button type="button" onClick={() => go(n)} aria-current={n === step ? 'step' : undefined}>
              <span className="cb-sn">{n < step ? <Icon name="check" size={12} /> : num(n)}</span>
              <span className="cb-sl">{tt(`wizard.steps.${n}`)}</span>
            </button>
          </li>
        ))}
      </ol>
      <section className="ad-card cb-wiz-body">
        <div className="cb-stephd">
          <span className="ad-mini">{tt('wizard.stepOf', { n: num(step), total: num(WIZARD_STEPS) })}</span>
          <h2 className="cb-h2">{tt(`wizard.steps.${step}`)}</h2>
        </div>
        {step === 1 ? <Step1 {...p} form={form} set={set} mode={mode} setMode={setMode} q={q} setQ={setQ} chosen={chosen} live={live} /> : null}
        {step === 2 ? <Step2 {...p} form={form} set={set} live={live} /> : null}
        {step === 3 ? <Step3 {...p} form={form} set={set} live={live} /> : null}
        {step === 4 ? <Step4 {...p} form={form} set={set} live={live} /> : null}
        {step === 5 ? <Tick on={form.noSinglePiece} label={tt('wizard.s5.tick')} hint={tt('wizard.s5.tickHint')} help={tt('wizard.s5.help')} onChange={(v) => set({ noSinglePiece: v })} testId="cb-wiz-nosingle" /> : null}
        {step === 6 ? <Step6 {...p} form={form} set={set} live={live} /> : null}
        {step === 7 ? <Step7 {...p} live={live} /> : null}
        {step === 8 ? <Step8 {...p} form={form} set={set} live={live} title={title} keyValue={key} onKey={(v) => (setKeyEdited(true), set({ key: v }))} /> : null}
      </section>
      <div className="cb-wiz-foot">
        <div className="cb-live" data-testid="cb-wiz-live" aria-live="polite">
          <b>{tt('wizard.live', { n: num(live?.counts.made ?? 0) })}</b>
          <span className="ad-mini">{tt('wizard.liveSub', { stock: num(live?.counts.withStock ?? 0), products: num(live?.counts.products ?? 0) })}</span>
        </div>
        <div className="cb-wiz-btns">
          {step > 1 ? (
            <button type="button" className="ad-btn ad-btn-ghost" onClick={() => go(step - 1)}>
              <Icon name="back" size={15} />
              {tt('wizard.back')}
            </button>
          ) : (
            <Link className="ad-btn ad-btn-ghost" href={p.hrefOf('auto')}>
              {tt('cancel')}
            </Link>
          )}
          {step < WIZARD_STEPS ? (
            <button type="button" className="ad-btn ad-btn-primary" onClick={() => go(step + 1)} data-testid="cb-wiz-next">
              {tt('wizard.next')}
              <Icon name="right" size={15} />
            </button>
          ) : (
            <button type="button" className="ad-btn ad-btn-primary" onClick={() => void save()} disabled={busy || !p.perms.write} data-testid="cb-wiz-save">
              <Icon name="check" size={16} />
              {p.rule ? tt('editor.saveChanges') : p.perms.publish && p.perms.prices ? tt('wizard.saveOn') : tt('wizard.saveDraft')}
            </button>
          )}
        </div>
      </div>
      {err ? (
        <div className="ad-modal-err" role="alert">
          {err}
        </div>
      ) : null}
    </div>
  );
}

type StepProps = WizardProps & { form: RuleForm; set(patch: Partial<RuleForm>): void; live: RulePreview | null };

/** A count in the screen's language (Bengali digits in Bengali). */
const numIn = (locale: string) => (n: number) => n.toLocaleString(locale);

function Step1(p: StepProps & { mode: 'cat' | 'prod'; setMode(m: 'cat' | 'prod'): void; q: string; setQ(v: string): void; chosen: string[] }) {
  const { dict: d, lang, form, set } = p;
  const tt = (k: string, vars?: Record<string, string | number>) => t(d, `combos.${k}`, vars);
  const toggle = (k: 'categoryIds' | 'productIds', id: string) => set({ [k]: form[k].includes(id) ? form[k].filter((x) => x !== id) : [...form[k], id] });
  const cats = p.categories.filter((c) => c.products > 0);
  const path = (c: CategoryOption) => {
    const parent = c.parentId ? p.categories.find((x) => x.id === c.parentId) : undefined;
    return parent ? `${nameIn(lang, parent.nameEn, parent.nameBn)} › ${nameIn(lang, c.nameEn, c.nameBn)}` : nameIn(lang, c.nameEn, c.nameBn);
  };
  const ql = p.q.trim().toLowerCase();
  const prods = p.products.filter((x) => x.colours.length && (!ql || `${x.nameEn} ${x.nameBn ?? ''}`.toLowerCase().includes(ql)));
  return (
    <div className="cb-step">
      <p className="cb-help">{tt('wizard.s1.help')}</p>
      <div className="cb-seg" role="group">
        {(['cat', 'prod'] as const).map((m) => (
          <button key={m} type="button" aria-pressed={p.mode === m} onClick={() => p.setMode(m)}>
            {tt(m === 'cat' ? 'wizard.s1.byCat' : 'wizard.s1.byProd')}
          </button>
        ))}
      </div>
      {p.mode === 'cat' ? (
        cats.length ? (
          <div className="cb-picks">
            {cats.map((c) => (
              <button key={c.id} type="button" className="cb-pick" aria-pressed={form.categoryIds.includes(c.id)} onClick={() => toggle('categoryIds', c.id)}>
                <span className="cb-cb" aria-hidden="true">
                  <Icon name="check" size={13} />
                </span>
                <span className="cb-pick-t">
                  <b>{path(c)}</b>
                  <span className="ad-mini">{tt('wizard.s1.products', { n: numIn(p.locale)(c.products) })}</span>
                </span>
              </button>
            ))}
          </div>
        ) : (
          <div className="cb-empty">{tt('wizard.s1.noCats')}</div>
        )
      ) : (
        <>
          <input className="ad-input" type="search" value={p.q} placeholder={tt('wizard.s1.search')} aria-label={tt('wizard.s1.search')} onChange={(e) => p.setQ(e.target.value)} />
          <div className="cb-picks cb-picks-scroll">
            {prods.map((x) => (
              <button key={x.id} type="button" className="cb-pick" aria-pressed={form.productIds.includes(x.id)} onClick={() => toggle('productIds', x.id)}>
                <span className="cb-cb" aria-hidden="true">
                  <Icon name="check" size={13} />
                </span>
                <span className="cb-pick-t">
                  <b>{nameIn(lang, x.nameEn, x.nameBn)}</b>
                  <span className="ad-mini">
                    {tt('wizard.s1.colours', { n: numIn(p.locale)(x.colours.length) })}
                    {x.priceMinor !== null ? ` · ${p.fmt(x.priceMinor)}` : ''}
                    {x.inCombos ? '' : ` · ${tt('wizard.s1.notTicked')}`}
                    {x.published ? '' : ` · ${tt('editor.notPublished')}`}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </>
      )}
      <div className="cb-chosen">
        <span className="ad-mini">{tt('wizard.s1.chosen')}</span>
        {p.chosen.length ? p.chosen.map((n, i) => <span key={i} className="cb-tag plain">{n}</span>) : <span className="ad-mini">{tt('wizard.s1.nothing')}</span>}
      </div>
      {p.live ? <div className="ad-mini">{tt('wizard.s1.count', { products: numIn(p.locale)(p.live.counts.products), colours: numIn(p.locale)(p.live.colours.length) })}</div> : null}
    </div>
  );
}

function Step2(p: StepProps) {
  const tt = (k: string, vars?: Record<string, string | number>) => t(p.dict, `combos.${k}`, vars);
  return (
    <div className="cb-step">
      <p className="cb-help">{tt('wizard.s2.help')}</p>
      <div className="cb-bigs">
        {([2, 3] as const).map((n) => (
          <button key={n} type="button" className="cb-big" aria-pressed={p.form.pieces === n} onClick={() => p.set({ pieces: n, ...(n === 3 ? { upsell: false } : {}) })} data-testid={`cb-wiz-p${n}`}>
            <span className={`cb-art-drawn cb-big-art n${n}`} aria-hidden="true">
              {Array.from({ length: n }, (_, i) => (
                <span key={i} className="cb-art-pc" />
              ))}
            </span>
            <b>{tt('wizard.s2.option', { n: numIn(p.locale)(n) })}</b>
            <span>{tt(n === 2 ? 'wizard.s2.together2' : 'wizard.s2.together3')}</span>
            <span className="ad-mini">{tt('wizard.s2.count', { n: numIn(p.locale)(p.live?.byPieces[String(n) as '2' | '3'] ?? 0) })}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function Step3(p: StepProps) {
  const { dict: d, lang, form, set, live } = p;
  const tt = (k: string, vars?: Record<string, string | number>) => t(d, `combos.${k}`, vars);
  return (
    <div className="cb-step">
      <p className="cb-help">{tt('wizard.s3.help')}</p>
      <div className="cb-picks">
        {(['STYLE', 'ACROSS', 'ANY'] as Pairing[]).map((k) => {
          const off = k === 'ACROSS' && live !== null && live.styles < form.pieces;
          return (
            <button key={k} type="button" className="cb-pick" aria-pressed={form.pairing === k} disabled={off} onClick={() => set({ pairing: k })}>
              <span className="cb-cb" aria-hidden="true">
                <Icon name="check" size={13} />
              </span>
              <span className="cb-pick-t">
                <b>{tt(`pairing.${k}.name`)}</b>
                <span className="ad-mini">
                  {tt(`pairing.${k}.hint`)}
                  {off ? ` · ${tt('wizard.s3.needs', { n: numIn(p.locale)(form.pieces) })}` : ''}
                </span>
              </span>
              <b className="cb-pick-n">{numIn(p.locale)(live?.byPairing[k] ?? 0)}</b>
            </button>
          );
        })}
      </div>
      <div className="cb-row">
        <span className="cb-row-l">{tt('wizard.s3.same')}</span>
        <Switch on={form.sameColour} label={tt('wizard.s3.same')} onChange={(v) => set({ sameColour: v })} />
      </div>
      {live?.colours.length ? (
        <div className="cb-sub">
          <div className="cb-howt">{tt('wizard.s3.colours')}</div>
          <div className="ad-mini">{tt('wizard.s3.coloursHelp')}</div>
          <div className="cb-cols">
            {live.colours.map((c) => {
              const on = !form.excludeColourIds.includes(c.id);
              return (
                <button key={c.id} type="button" className="cb-col" aria-pressed={on} onClick={() => set({ excludeColourIds: on ? [...form.excludeColourIds, c.id] : form.excludeColourIds.filter((x) => x !== c.id) })}>
                  <i style={{ background: c.hex }} aria-hidden="true" />
                  {nameIn(lang, c.nameEn, c.nameBn)}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function PriceBox({ p, mode, value, onMode, onValue, id, label, testId }: { p: StepProps; mode: 'FIXED' | 'PERCENT'; value: string; onMode(m: 'FIXED' | 'PERCENT'): void; onValue(v: string): void; id: string; label: string; testId: string }) {
  const tt = (k: string) => t(p.dict, `combos.${k}`);
  return (
    <>
      <div className="cb-seg" role="group" aria-label={label}>
        {(['FIXED', 'PERCENT'] as const).map((m) => (
          <button key={m} type="button" aria-pressed={mode === m} disabled={!p.perms.prices} onClick={() => onMode(m)}>
            {tt(m === 'FIXED' ? 'wizard.s4.fixed' : 'wizard.s4.percent')}
          </button>
        ))}
      </div>
      <label className="ad-label" htmlFor={id}>
        {mode === 'FIXED' ? label : tt('wizard.s4.percentLabel')}
      </label>
      <MoneyBox id={id} symbol={mode === 'FIXED' ? p.symbol : '%'} value={value} label={label} disabled={!p.perms.prices} invalid={priceBad(mode, value)} onChange={onValue} testId={testId} />
      {!p.perms.prices ? <div className="ad-mini">{tt('editor.priceOwner')}</div> : null}
    </>
  );
}

function Example({ p, pair }: { p: StepProps; pair: PairView | undefined | null }) {
  const tt = (k: string, vars?: Record<string, string | number>) => t(p.dict, `combos.${k}`, vars);
  if (!pair || pair.pricing.regularMinor === null) return null;
  const w = saveWords(pair.pricing, p.fmt);
  return (
    <div className="cb-ex">
      <SetArt variant="thumb" pieces={pair.pieces.map((x) => ({ hex: x.hex, name: x.colourNameEn }))} alt={pairTitle(p.lang, pair)} />
      <div className="cb-ex-t">
        <div className="cb-howt">{pairTitle(p.lang, pair)}</div>
        {pair.pricing.offer && pair.pricing.payMinor !== null ? (
          <>
            <div>
              <s>{p.fmt(pair.pricing.regularMinor)}</s> {tt('rule.arrow')} <b>{p.fmt(pair.pricing.payMinor)}</b> <span className="cb-pill ok">{tt('wizard.s4.save', { saving: p.fmt(pair.pricing.savingMinor) })}</span>
            </div>
            <div className="ad-mini">{tt('wizard.s4.example', { pieces: numIn(p.locale)(pair.pieces.length), regular: p.fmt(pair.pricing.regularMinor), pay: p.fmt(pair.pricing.payMinor), each: p.fmt(eachMinor(pair.pricing.payMinor, pair.pieces.length)) })}</div>
          </>
        ) : w.tone === 'warn' ? (
          <div className="cb-save warn">{tt('wizard.s4.warn', { regular: p.fmt(pair.pricing.regularMinor) })}</div>
        ) : null}
      </div>
    </div>
  );
}

const pairTitle = (lang: Lang, pair: PairView) => pair.pieces.map((x) => nameIn(lang, x.colourNameEn, x.colourNameBn)).join(' + ');

function Step4(p: StepProps) {
  const tt = (k: string, vars?: Record<string, string | number>) => t(p.dict, `combos.${k}`, vars);
  return (
    <div className="cb-step">
      <p className="cb-help">{tt('wizard.s4.help')}</p>
      <PriceBox p={p} mode={p.form.priceMode} value={p.form.price} onMode={(m) => p.set({ priceMode: m, price: '' })} onValue={(v) => p.set({ price: v })} id="cb-wiz-price" label={tt('wizard.s4.label')} testId="cb-wiz-price" />
      <Example p={p} pair={p.live?.pairs[0]} />
      <div className="ad-mini">{tt('wizard.s4.rounding', { step: p.fmt(p.roundingStepMinor) })}</div>
    </div>
  );
}

function Tick({ on, label, hint, help, onChange, testId }: { on: boolean; label: string; hint: string; help: string; onChange(v: boolean): void; testId: string }) {
  return (
    <div className="cb-step">
      <p className="cb-help">{help}</p>
      <button type="button" className="cb-pick cb-tick" aria-pressed={on} onClick={() => onChange(!on)} data-testid={testId}>
        <span className="cb-cb" aria-hidden="true">
          <Icon name="check" size={14} />
        </span>
        <span className="cb-pick-t">
          <b>{label}</b>
          <span className="ad-mini">{hint}</span>
        </span>
      </button>
    </div>
  );
}

function Step6(p: StepProps) {
  const tt = (k: string, vars?: Record<string, string | number>) => t(p.dict, `combos.${k}`, vars);
  if (p.form.pieces !== 2)
    return (
      <div className="cb-step">
        <p className="cb-help">{tt('wizard.s6.three')}</p>
      </div>
    );
  const two = p.live?.pairs[0];
  const three = p.live?.upsell?.top;
  return (
    <>
      <Tick on={p.form.upsell} label={tt('wizard.s6.tick')} hint={tt('wizard.s6.tickHint')} help={tt('wizard.s6.help')} onChange={(v) => p.set({ upsell: v })} testId="cb-wiz-upsell" />
      {p.form.upsell ? (
        <div className="cb-sub">
          <div className="cb-howt">{tt('wizard.s6.price')}</div>
          <PriceBox p={p} mode={p.form.upPriceMode} value={p.form.upPrice} onMode={(m) => p.set({ upPriceMode: m, upPrice: '' })} onValue={(v) => p.set({ upPrice: v })} id="cb-wiz-up" label={tt('wizard.s6.price')} testId="cb-wiz-up" />
          {two?.pricing.payMinor != null && three?.pricing.payMinor != null ? (
            <div className="ad-mini">{tt('wizard.s6.example', { pay2: p.fmt(two.pricing.payMinor), pay3: p.fmt(three.pricing.payMinor), each: p.fmt(eachMinor(three.pricing.payMinor, 3)), n: numIn(p.locale)(p.live?.upsell?.made ?? 0) })}</div>
          ) : null}
        </div>
      ) : null}
    </>
  );
}

function Step7(p: WizardProps & { live: RulePreview | null }) {
  const { dict: d, lang, fmt, live } = p;
  const tt = (k: string, vars?: Record<string, string | number>) => t(d, `combos.${k}`, vars);
  const pairs = live?.pairs ?? [];
  return (
    <div className="cb-step">
      <p className="cb-help">{tt('wizard.s7.help')}</p>
      {pairs.length ? (
        <div className="cb-pvg" data-testid="cb-wiz-preview">
          {pairs.map((x) => (
            <div key={x.pieceKey} className={`cb-pv${x.openSizes ? '' : ' out'}`}>
              <SetArt pieces={x.pieces.map((c) => ({ hex: c.hex, name: c.colourNameEn }))} alt={pairTitle(lang, x)} />
              <div className="cb-pv-t">
                <div className="cb-howt">{pairTitle(lang, x)}</div>
                <div className="ad-mini">{nameIn(lang, x.pieces[0]!.productNameEn, x.pieces[0]!.productNameBn)}</div>
                {x.pricing.payMinor !== null ? (
                  <div>
                    <b>{fmt(x.pricing.payMinor)}</b> {x.pricing.offer && x.pricing.regularMinor !== null ? <s className="ad-mini">{fmt(x.pricing.regularMinor)}</s> : null}
                  </div>
                ) : null}
                <div className="ad-mini">
                  {x.openSizes ? <SizeWords dict={d} sizes={x.sizes} /> : tt('wizard.s7.soldOut')}
                  {x.isNew ? ` · ${tt('wizard.s7.new')}` : ''}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="cb-empty">{tt('wizard.s7.empty')}</div>
      )}
      {live && pairs.length < live.counts.made ? <div className="ad-mini">{tt('wizard.s7.more', { n: numIn(p.locale)(pairs.length), total: numIn(p.locale)(live.counts.made) })}</div> : null}
    </div>
  );
}

function SizeWords({ dict, sizes }: { dict: Dict; sizes: PairView['sizes'] }) {
  const ok = sizes.filter((s) => s.ok);
  if (!ok.length) return <>{t(dict, 'combos.sizes.soldOut')}</>;
  if (ok.length === sizes.length) return <>{t(dict, 'combos.sizes.all', { from: sizes[0]!.label, to: sizes[sizes.length - 1]!.label })}</>;
  return <>{t(dict, 'combos.sizes.some', { labels: ok.map((s) => s.label).join(' · ') })}</>;
}

function Step8(p: StepProps & { title: string; keyValue: string; onKey(v: string): void }) {
  const { dict: d, lang, form, set } = p;
  const tt = (k: string, vars?: Record<string, string | number>) => t(d, `combos.${k}`, vars);
  const chips = (k: 'season' | 'listTemplateKey' | 'pageTemplateKey', values: { v: string; label: string }[]) => (
    <div className="cb-chips">
      {values.map((x) => (
        <button key={x.v || 'none'} type="button" className="ad-chip" aria-pressed={form[k] === x.v} onClick={() => set({ [k]: x.v })}>
          {form[k] === x.v ? <Icon name="check" size={13} /> : null}
          {x.label}
        </button>
      ))}
    </div>
  );
  return (
    <div className="cb-step">
      <p className="cb-help">{tt('wizard.s8.help')}</p>
      <div className="cb-f2">
        <div>
          <label className="ad-label" htmlFor="cb-wiz-title">
            {tt('wizard.s8.title')}
          </label>
          <input id="cb-wiz-title" className="ad-input" value={form.titleEn || p.title} maxLength={80} placeholder={tt('wizard.s8.titlePh')} onChange={(e) => set({ titleEn: e.target.value })} />
        </div>
        <div>
          <label className="ad-label" htmlFor="cb-wiz-name">
            {tt('wizard.s8.name')}
          </label>
          <input id="cb-wiz-name" className="ad-input" value={form.nameEn} maxLength={120} placeholder={tt('wizard.s8.namePh')} onChange={(e) => set({ nameEn: e.target.value })} data-testid="cb-wiz-name" />
        </div>
        <div>
          <label className="ad-label" htmlFor="cb-wiz-name-bn">
            {tt('wizard.s8.nameBn')} <span className="opt">{tt('optional')}</span>
          </label>
          <input id="cb-wiz-name-bn" className="ad-input" value={form.nameBn} maxLength={120} onChange={(e) => set({ nameBn: e.target.value })} />
        </div>
        <div>
          <label className="ad-label" htmlFor="cb-wiz-key">
            {tt('wizard.s8.key')}
          </label>
          <input id="cb-wiz-key" className="ad-input" value={p.keyValue} maxLength={80} disabled={Boolean(p.rule)} onChange={(e) => p.onKey(e.target.value)} />
          <div className="ad-mini">{tt('wizard.s8.keyFixed')}</div>
        </div>
      </div>
      <div className="ad-label">{tt('wizard.s8.season')}</div>
      {chips('season', [{ v: '', label: tt('season.none') }, ...p.seasons.map((s) => ({ v: s.key, label: lang === 'bn' && s.bn ? s.bn : s.en }))])}
      <div className="ad-label">
        {tt('wizard.s8.dates')} <span className="opt">{tt('optional')}</span>
      </div>
      <div className="cb-f2">
        <label className="ad-mini">
          {tt('dates.starts')}
          <input type="date" className="ad-input" value={form.startsOn} onChange={(e) => set({ startsOn: e.target.value })} />
        </label>
        <label className="ad-mini">
          {tt('dates.ends')}
          <input type="date" className="ad-input" value={form.endsOn} onChange={(e) => set({ endsOn: e.target.value })} />
        </label>
      </div>
      <div className="ad-mini">{form.startsOn || form.endsOn ? tt('dates.endsHelp') : tt('dates.alwaysHelp')}</div>
      <div className="ad-label">{tt('wizard.s8.listTpl')}</div>
      {chips('listTemplateKey', [{ v: '', label: tt('listTpl.default') }, ...LIST_TEMPLATES.map((v) => ({ v, label: tt(`listTpl.${v}`) }))])}
      <div className="ad-label">{tt('wizard.s8.pageTpl')}</div>
      {chips('pageTemplateKey', [{ v: '', label: tt('pageTpl.default') }, ...PAGE_TEMPLATES.map((v) => ({ v, label: tt(`pageTpl.${v}`) }))])}
      <div className="cb-sub">
        <div className="cb-howt">{tt('wizard.s8.promote')}</div>
        <div className="cb-link">
          <code>{rulePath(p.keyValue)}</code>
        </div>
        <div className="ad-mini">{tt(form.noSinglePiece ? 'wizard.s8.promoteHelp' : 'wizard.s8.promoteSingles', { n: numIn(p.locale)(p.live?.counts.made ?? 0) })}</div>
      </div>
    </div>
  );
}
