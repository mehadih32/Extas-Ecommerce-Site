'use client';
// S28 · PR 677 (CN-048, admin prototype v5, Rules › Offers & discounts) — Offers & Discounts 360: offers, coupons, built-in price
// rules, the online-payment reward, points and wallet in one list, with what each cost and brought; a calendar, the offers waiting
// for the owner's OK and the history; and the seven-step wizard (Type, Value, Where, Who, When, Limits, Preview). An offer never goes
// live from this screen without the owner's OK and PIN. Points and wallet credit offers can be written and sent, but cannot go live
// until their award job exists (the preview says so).
import Link from 'next/link';
import { useMemo, useState, type ReactNode } from 'react';
import { formatValue, offerIssues, OFFER_KINDS, type OfferInput, type OfferIssue, type OfferKindName, type OfferStateName } from '@extas/rules/pure';
import type { OfferListRow, OfferView, OffersScreen as OffersData } from '@extas/rules';
import { call } from '../api';
import { Icon } from '../Icon';
import { say, sayBad } from '../products/useToast';
import { t, type Dict } from '@/lib/i18n';
import { isoToLocalInput, localInputToIso, moneyFromInput, moneyToInput, numberFromInput, type Lang, type RulesEnv, type ScopeOption, rulesRefusal } from './model';

export interface OffersScreenProps {
  dict: Dict;
  lang: Lang;
  env: Pick<RulesEnv, 'ctx'>;
  screen: OffersData;
  scopes: ScopeOption[];
  perms: { write: boolean; approve: boolean };
  tabs?: ReactNode;
}

type TFn = (k: string, v?: Record<string, string | number>) => string;
type SetFn = (p: Partial<Form>) => void;
type StepFn = (n: number) => void;
type ToInputFn = (f: Form) => OfferInput;
type MoneyFn = (n: number) => string;
type Noop = () => void;
type SaveFn = (send: boolean) => void;
const API = '/api/admin/rules/offers';
type Tab = 'all' | 'calendar' | 'awaiting' | 'history';
type Form = {
  id: string | null;
  kind: OfferKindName;
  trigger: 'ANY' | 'PAY_ONLINE';
  nameEn: string;
  nameBn: string;
  percent: string;
  maxMinor: string;
  amountMinor: string;
  points: string;
  creditMinor: string;
  scopeType: 'all' | 'category' | 'collection' | 'product';
  scopeId: string;
  audience: 'ALL' | 'GUESTS' | 'MEMBERS';
  firstOrderOnly: boolean;
  code: string;
  startsAt: string;
  endsAt: string;
  minOrder: string;
  usageLimit: string;
  perCustomerLimit: string;
  budget: string;
};
const BLANK: Form = {
  id: null,
  kind: 'PERCENT',
  trigger: 'ANY',
  nameEn: '',
  nameBn: '',
  percent: '',
  maxMinor: '',
  amountMinor: '',
  points: '',
  creditMinor: '',
  scopeType: 'all',
  scopeId: '',
  audience: 'ALL',
  firstOrderOnly: false,
  code: '',
  startsAt: '',
  endsAt: '',
  minOrder: '',
  usageLimit: '',
  perCustomerLimit: '',
  budget: '',
};
const STEPS = ['type', 'value', 'where', 'who', 'when', 'limits', 'preview'] as const;

export function OffersScreen(props: OffersScreenProps) {
  const { dict: d, lang, env, perms } = props;
  const tt = (k: string, vars?: Record<string, string | number>) => t(d, `rulesHub.offers.${k}`, vars);
  const tz = env.ctx.timeZone;
  const cur = env.ctx.currency;
  const [screen, setScreen] = useState(props.screen);
  const [tab, setTab] = useState<Tab>('all');
  const [wizard, setWizard] = useState<Form | null>(null);
  const [step, setStep] = useState(0);
  const [detail, setDetail] = useState<string | null>(null);
  const [info, setInfo] = useState<{ offer: OfferView; history: { action: string; at: string; note: string | null }[] } | null>(null);
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);

  const money = (v: number) => formatValue('money', v, env.ctx) ?? String(v);
  const date = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(lang === 'bn' ? 'bn-BD' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '');
  const nameOf = (r: OfferListRow) => (lang === 'bn' && r.nameBn ? r.nameBn : r.nameEn);
  const reload = async () => {
    const a = await call('GET', API);
    if (a.status === 200 && a.data.offers) setScreen(a.data.offers as OffersData);
  };
  const act = async (url: string, method: 'POST' | 'PUT', payload: Record<string, unknown>, done: string, then?: () => void) => {
    setBusy(true);
    const a = await call(method, url, payload);
    setBusy(false);
    if (a.status >= 300) {
      const det = (a.data.details ?? []) as string[];
      return sayBad(a.data.error === 'OFFER_INVALID' && det.length ? det.map((c) => tt(`issues.${c}`)).join(' ') : rulesRefusal(d, a.data.error, a.data.details ?? []));
    }
    say(tt(done));
    setPin('');
    await reload();
    if (detail && a.data.offer) await openDetail(detail);
    then?.();
  };

  const openDetail = async (offerId: string) => {
    setDetail(offerId);
    const a = await call('GET', `${API}/${offerId}`);
    if (a.status === 200) setInfo({ offer: a.data.offer as OfferView, history: a.data.history as never });
  };

  const rows = useMemo(() => {
    const live = (r: OfferListRow) => r.state === 'LIVE' || r.state === 'SCHEDULED';
    if (tab === 'awaiting') return screen.rows.filter((r) => r.state === 'AWAITING_OK');
    if (tab === 'history') return screen.rows.filter((r) => r.state === 'ENDED');
    if (tab === 'calendar')
      return screen.rows.filter((r) => (r.startsAt || r.endsAt) && r.state !== 'DRAFT').sort((a, b) => (a.startsAt ?? a.endsAt ?? '').localeCompare(b.startsAt ?? b.endsAt ?? ''));
    return screen.rows.filter((r) => r.state !== 'ENDED' || live(r));
  }, [screen.rows, tab]);
  const running = screen.rows.filter((r) => r.state === 'LIVE').length;
  const best = [...screen.rows].filter((r) => r.results && r.results.orders > 0).sort((a, b) => (b.results?.salesMinor ?? 0) - (a.results?.salesMinor ?? 0))[0];

  // ------------------------------------------------------------------ the wizard's form <-> an offer
  const toInput = (f: Form): OfferInput => {
    const m = (s: string) => {
      const n = moneyFromInput(s, cur);
      return n === null || Number.isNaN(n) ? null : n;
    };
    const n = (s: string) => {
      const x = numberFromInput(s);
      return x === null || Number.isNaN(x) ? null : x;
    };
    return {
      kind: f.kind,
      trigger: f.trigger,
      nameEn: f.nameEn.trim(),
      nameBn: f.nameBn.trim() || null,
      value: {
        ...(f.kind === 'PERCENT' ? { percent: n(f.percent), maxMinor: m(f.maxMinor) } : {}),
        ...(f.kind === 'FLAT' ? { amountMinor: m(f.amountMinor) } : {}),
        ...(f.kind === 'POINTS' ? { points: n(f.points) } : {}),
        ...(f.kind === 'WALLET_CREDIT' ? { creditMinor: m(f.creditMinor) } : {}),
      },
      scope: f.scopeType === 'all' || !f.scopeId ? { type: 'all' } : { type: f.scopeType, id: f.scopeId },
      who: { audience: f.audience, firstOrderOnly: f.firstOrderOnly },
      code: f.code.trim() || null,
      startsAt: localInputToIso(f.startsAt, tz),
      endsAt: localInputToIso(f.endsAt, tz),
      limits: { minOrderMinor: m(f.minOrder), usageLimit: n(f.usageLimit), perCustomerLimit: n(f.perCustomerLimit), budgetMinor: m(f.budget) },
    };
  };
  const fromOffer = (o: OfferView): Form => ({
    id: o.id,
    kind: o.kind,
    trigger: o.trigger,
    nameEn: o.nameEn,
    nameBn: o.nameBn ?? '',
    percent: o.value.percent ? String(o.value.percent) : '',
    maxMinor: o.value.maxMinor ? moneyToInput(o.value.maxMinor, cur) : '',
    amountMinor: o.value.amountMinor ? moneyToInput(o.value.amountMinor, cur) : '',
    points: o.value.points ? String(o.value.points) : '',
    creditMinor: o.value.creditMinor ? moneyToInput(o.value.creditMinor, cur) : '',
    scopeType: o.scope.type,
    scopeId: 'id' in o.scope ? o.scope.id : '',
    audience: o.who.audience,
    firstOrderOnly: o.who.firstOrderOnly,
    code: o.code ?? '',
    startsAt: isoToLocalInput(o.startsAt, tz),
    endsAt: isoToLocalInput(o.endsAt, tz),
    minOrder: o.limits.minOrderMinor ? moneyToInput(o.limits.minOrderMinor, cur) : '',
    usageLimit: o.limits.usageLimit ? String(o.limits.usageLimit) : '',
    perCustomerLimit: o.limits.perCustomerLimit ? String(o.limits.perCustomerLimit) : '',
    budget: o.limits.budgetMinor ? moneyToInput(o.limits.budgetMinor, cur) : '',
  });

  const pill = (s: OfferListRow['state']) => <span className={`rh-pl ofs-${s}`}>{tt(`state.${s}`)}</span>;
  const valueText = (r: OfferListRow) => (r.kind ? tt(`kinds.${r.kind}`) : tt(`sources.${r.source}`));

  const save = async (andSend: boolean) => {
    if (!wizard) return;
    const input = toInput(wizard);
    setBusy(true);
    const a = wizard.id ? await call('PUT', `${API}/${wizard.id}`, { offer: input }) : await call('POST', API, { offer: input });
    if (a.status >= 300) {
      setBusy(false);
      return sayBad(rulesRefusal(d, a.data.error, a.data.details ?? []));
    }
    const id = (a.data.offer as OfferView).id;
    if (andSend) {
      const b = await call('POST', `${API}/${id}/submit`, {});
      setBusy(false);
      if (b.status >= 300) {
        await reload();
        setWizard(null);
        return sayBad(tt('savedNotSent', { why: ((b.data.details ?? []) as string[]).map((c) => tt(`issues.${c}`)).join(' ') || rulesRefusal(d, b.data.error, b.data.details ?? []) }));
      }
      say(tt('sent'));
    } else {
      setBusy(false);
      say(tt('draftSaved'));
    }
    setWizard(null);
    await reload();
  };

  const wizardEl = wizard ? (
    <Wizard
      f={wizard}
      step={step}
      setStep={setStep}
      set={(patch) => setWizard((x) => (x ? { ...x, ...patch } : x))}
      tt={tt}
      scopes={props.scopes}
      lang={lang}
      toInput={toInput}
      money={money}
      busy={busy}
      canWrite={perms.write}
      onClose={() => setWizard(null)}
      onSave={save}
    />
  ) : null;

  return (
    <div className="rh of">
      <div className="ad-hd rl-hd">
        <div className="rl-hd-text">
          <h1 className="ad-h1">{tt('title')}</h1>
          <p className="ad-intro">{tt('intro')}</p>
        </div>
        {perms.write ? (
          <button
            type="button"
            className="ad-btn ad-btn-primary ad-btn-sm"
            onClick={() => {
              setWizard({ ...BLANK });
              setStep(0);
            }}
          >
            <Icon name="plus" size={15} /> {tt('new')}
          </button>
        ) : null}
      </div>
      {props.tabs}
      <div className="of-kpis">
        <div className="of-kpi">
          <span>{tt('kpi.running')}</span>
          <b>{running}</b>
        </div>
        <div className="of-kpi">
          <span>{tt('kpi.given')}</span>
          <b>{money(screen.discount30.discountMinor)}</b>
          <small>{tt('kpi.orders', { n: screen.discount30.orders })}</small>
        </div>
        <div className="of-kpi">
          <span>{tt('kpi.awaiting')}</span>
          <b>{screen.awaiting}</b>
        </div>
        <div className="of-kpi">
          <span>{tt('kpi.best')}</span>
          <b>{best ? nameOf(best) : '—'}</b>
          {best?.results ? <small>{money(best.results.salesMinor)}</small> : null}
        </div>
      </div>
      <div className="of-tabs" role="tablist" aria-label={tt('tabs.label')}>
        {(['all', 'calendar', 'awaiting', 'history'] as Tab[]).map((x) => (
          <button type="button" role="tab" aria-selected={tab === x} key={x} className={tab === x ? 'on' : ''} onClick={() => setTab(x)}>
            {tt(`tabs.${x}`)}
            {x === 'awaiting' && screen.awaiting ? <span className="n">{screen.awaiting}</span> : null}
          </button>
        ))}
      </div>
      <p className="rh-hint">{tt(`tabHint.${tab}`)}</p>
      {wizardEl}
      <div className="of-list">
        {rows.length ? (
          <div className="of-wrap">
            <table className="of-tbl">
              <thead>
                <tr>
                  <th>{tt('col.name')}</th>
                  <th>{tt('col.type')}</th>
                  <th>{tt('col.state')}</th>
                  <th>{tt('col.when')}</th>
                  <th className="num">{tt('col.orders')}</th>
                  <th className="num">{tt('col.given')}</th>
                  <th className="num">{tt('col.delivered')}</th>
                  <th className="num">{tt('col.returned')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className={detail === r.offerId && r.offerId ? 'sel' : ''}>
                    <td data-l={tt('col.name')}>
                      {r.offerId ? (
                        <button type="button" className="rl-link" onClick={() => void openDetail(r.offerId!)}>
                          {nameOf(r)}
                        </button>
                      ) : r.href ? (
                        <Link className="rl-link" href={r.href}>
                          {nameOf(r)}
                        </Link>
                      ) : (
                        nameOf(r)
                      )}
                      {r.code ? <code className="of-code">{r.code}</code> : null}
                    </td>
                    <td data-l={tt('col.type')}>{valueText(r)}</td>
                    <td data-l={tt('col.state')}>{pill(r.state)}</td>
                    <td data-l={tt('col.when')}>{r.startsAt || r.endsAt ? `${date(r.startsAt) || tt('now')} – ${date(r.endsAt) || tt('noEnd')}` : tt('always')}</td>
                    <td className="num" data-l={tt('col.orders')}>
                      {r.results ? r.results.orders : '—'}
                    </td>
                    <td className="num" data-l={tt('col.given')}>
                      {r.results ? money(r.results.discountMinor) : '—'}
                    </td>
                    <td className="num" data-l={tt('col.delivered')}>
                      {r.results ? money(r.results.deliveredMinor) : '—'}
                    </td>
                    <td className="num" data-l={tt('col.returned')}>
                      {r.results ? r.results.returned : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="ad-intro">{tt('empty')}</p>
        )}
        <p className="rh-hint">{tt('resultsNote')}</p>
      </div>
      {detail && info ? (
        <section className="rh-card of-detail" aria-label={tt('detail.title')}>
          <div className="rh-cardhd">
            <h3>{lang === 'bn' && info.offer.nameBn ? info.offer.nameBn : info.offer.nameEn}</h3>
            <button
              type="button"
              className="ad-btn ad-btn-ghost ad-btn-sm"
              onClick={() => {
                setDetail(null);
                setInfo(null);
              }}
              aria-label={tt('close')}
            >
              <Icon name="close" size={14} />
            </button>
          </div>
          <p>
            {pill(info.offer.state)} {tt(`kinds.${info.offer.kind}`)}
            {info.offer.trigger === 'PAY_ONLINE' ? ` · ${tt('trigger.PAY_ONLINE')}` : ''}
          </p>
          {info.offer.issues.length ? (
            <div className="ad-note warn">
              <ul>
                {info.offer.issues.map((c: OfferIssue) => (
                  <li key={c}>{tt(`issues.${c}`)}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <div className="rh-sub">{tt('detail.history')}</div>
          <ul className="of-hist">
            {info.history.map((h, i) => (
              <li key={i}>
                <b>{tt(`event.${h.action}`)}</b> <span>{date(h.at)}</span>
                {h.note ? <em> — {h.note}</em> : null}
              </li>
            ))}
          </ul>
          <div className="rl-actions">
            {info.offer.state === 'DRAFT' && perms.write ? (
              <>
                <button
                  type="button"
                  className="ad-btn ad-btn-ghost ad-btn-sm"
                  onClick={() => {
                    setWizard(fromOffer(info.offer));
                    setStep(0);
                  }}
                >
                  {tt('detail.edit')}
                </button>
                <button
                  type="button"
                  className="ad-btn ad-btn-primary ad-btn-sm"
                  disabled={busy || info.offer.issues.length > 0}
                  onClick={() => void act(`${API}/${info.offer.id}/submit`, 'POST', {}, 'sent')}
                >
                  {tt('detail.send')}
                </button>
              </>
            ) : null}
          </div>
          {perms.approve && ['AWAITING_OK', 'LIVE', 'PAUSED'].includes(info.offer.state) ? (
            <div className="of-pin">
              <label className="ad-label" htmlFor="of-pin">
                {tt('detail.pin')}
              </label>
              <input id="of-pin" className="ad-input rh-pin" type="password" inputMode="numeric" autoComplete="off" value={pin} onChange={(e) => setPin(e.target.value)} />
              <div className="rl-actions">
                {info.offer.state === 'AWAITING_OK' ? (
                  <>
                    <button
                      type="button"
                      className="ad-btn ad-btn-primary ad-btn-sm"
                      disabled={busy || !pin.trim()}
                      onClick={() => void act(`${API}/${info.offer.id}/approve`, 'POST', { pin }, 'approved')}
                    >
                      {tt('detail.approve')}
                    </button>
                    <button
                      type="button"
                      className="ad-btn ad-btn-ghost ad-btn-sm"
                      disabled={busy}
                      onClick={() => void act(`${API}/${info.offer.id}/send-back`, 'POST', { note: window.prompt(tt('detail.sendBackNote')) ?? '' }, 'sentBack')}
                    >
                      {tt('detail.sendBack')}
                    </button>
                  </>
                ) : null}
                {info.offer.state === 'LIVE' ? (
                  <button
                    type="button"
                    className="ad-btn ad-btn-ghost ad-btn-sm"
                    disabled={busy || !pin.trim()}
                    onClick={() => void act(`${API}/${info.offer.id}/state`, 'POST', { action: 'pause', pin }, 'paused')}
                  >
                    {tt('detail.pause')}
                  </button>
                ) : null}
                {info.offer.state === 'PAUSED' ? (
                  <button
                    type="button"
                    className="ad-btn ad-btn-primary ad-btn-sm"
                    disabled={busy || !pin.trim()}
                    onClick={() => void act(`${API}/${info.offer.id}/state`, 'POST', { action: 'resume', pin }, 'resumed')}
                  >
                    {tt('detail.resume')}
                  </button>
                ) : null}
                {info.offer.state === 'LIVE' || info.offer.state === 'PAUSED' ? (
                  <button
                    type="button"
                    className="ad-btn ad-btn-ghost ad-btn-sm"
                    disabled={busy || !pin.trim()}
                    onClick={() => {
                      if (window.confirm(tt('detail.endConfirm'))) void act(`${API}/${info.offer.id}/state`, 'POST', { action: 'end', pin }, 'ended');
                    }}
                  >
                    {tt('detail.end')}
                  </button>
                ) : null}
              </div>
            </div>
          ) : info.offer.state === 'AWAITING_OK' ? (
            <div className="ad-note">{tt('detail.waitingOwner')}</div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

function Wizard({
  f,
  step,
  setStep,
  set,
  tt,
  scopes,
  lang,
  toInput,
  money,
  busy,
  canWrite,
  onClose,
  onSave,
}: {
  f: Form;
  step: number;
  setStep: StepFn;
  set: SetFn;
  tt: TFn;
  scopes: ScopeOption[];
  lang: Lang;
  toInput: ToInputFn;
  money: MoneyFn;
  busy: boolean;
  canWrite: boolean;
  onClose: Noop;
  onSave: SaveFn;
}) {
  const input = toInput(f);
  const issues = offerIssues(input);
  const s = STEPS[step]!;
  const online = f.trigger === 'PAY_ONLINE';
  const field = (id: string, label: string, value: string, onChange: (v: string) => void, hint?: string) => (
    <div>
      <label className="ad-label" htmlFor={`of-${id}`}>
        {label}
      </label>
      <input id={`of-${id}`} className="ad-input" inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value)} />
      {hint ? <div className="rh-hint">{hint}</div> : null}
    </div>
  );
  const scopeList = scopes.filter((x) => x.type === f.scopeType);
  const summary = (): string[] => {
    const v = input.value;
    const out: string[] = [tt(`kinds.${input.kind}`) + (online ? ` · ${tt('trigger.PAY_ONLINE')}` : '')];
    if (v.percent) out.push(tt('sum.percent', { n: v.percent }) + (v.maxMinor ? ` (${tt('sum.upTo', { v: money(v.maxMinor) })})` : ''));
    if (v.amountMinor) out.push(tt('sum.amount', { v: money(v.amountMinor) }));
    if (v.points) out.push(tt('sum.points', { n: v.points }));
    if (v.creditMinor) out.push(tt('sum.credit', { v: money(v.creditMinor) }));
    const sc = scopes.find((x) => 'id' in input.scope && x.id === input.scope.id);
    out.push(`${tt('step.where')}: ${input.scope.type === 'all' ? tt('where.all') : sc ? (lang === 'bn' && sc.nameBn ? sc.nameBn : sc.nameEn) : input.scope.type}`);
    out.push(`${tt('step.who')}: ${tt(`who.${input.who.audience}`)}${input.who.firstOrderOnly ? `, ${tt('who.first')}` : ''}`);
    if (input.code) out.push(`${tt('code')}: ${input.code}`);
    out.push(`${tt('step.when')}: ${f.startsAt || tt('now')} – ${f.endsAt || tt('noEnd')}`);
    const l = input.limits;
    if (l.minOrderMinor) out.push(tt('sum.min', { v: money(l.minOrderMinor) }));
    if (l.usageLimit) out.push(tt('sum.uses', { n: l.usageLimit }));
    if (l.perCustomerLimit) out.push(tt('sum.perCustomer', { n: l.perCustomerLimit }));
    if (l.budgetMinor) out.push(tt('sum.budget', { v: money(l.budgetMinor) }));
    return out;
  };
  return (
    <section className="rh-card of-wiz" aria-label={tt('wizard.title')}>
      <div className="rh-cardhd">
        <h3>{f.id ? tt('wizard.edit') : tt('wizard.title')}</h3>
        <button type="button" className="ad-btn ad-btn-ghost ad-btn-sm" onClick={onClose} aria-label={tt('close')}>
          <Icon name="close" size={14} />
        </button>
      </div>
      <ol className="of-steps" aria-label={tt('wizard.steps')}>
        {STEPS.map((x, i) => (
          <li key={x} className={i === step ? 'on' : i < step ? 'done' : ''} aria-current={i === step ? 'step' : undefined}>
            <button type="button" onClick={() => setStep(i)}>
              {i + 1}. {tt(`step.${x}`)}
            </button>
          </li>
        ))}
      </ol>
      <div className="rh-fields">
        {s === 'type' ? (
          <>
            <div className="of-kinds" role="radiogroup" aria-label={tt('step.type')}>
              {OFFER_KINDS.map((k) => (
                <button
                  type="button"
                  role="radio"
                  aria-checked={f.kind === k}
                  key={k}
                  className={f.kind === k ? 'on' : ''}
                  onClick={() => set({ kind: k, ...(k === 'POINTS' || k === 'WALLET_CREDIT' ? { trigger: 'ANY' as const } : {}) })}
                >
                  <b>{tt(`kinds.${k}`)}</b>
                  <span>{tt(`kindHint.${k}`)}</span>
                </button>
              ))}
            </div>
            <div>
              <label className="ad-label" htmlFor="of-trigger">
                {tt('trigger.label')}
              </label>
              <select id="of-trigger" className="ad-input" value={f.trigger} onChange={(e) => set({ trigger: e.target.value as Form['trigger'] })}>
                <option value="ANY">{tt('trigger.ANY')}</option>
                <option value="PAY_ONLINE" disabled={f.kind === 'POINTS' || f.kind === 'WALLET_CREDIT'}>
                  {tt('trigger.PAY_ONLINE')}
                </option>
              </select>
              {online ? <div className="rh-hint">{tt('trigger.onlineHint')}</div> : null}
            </div>
            <div>
              <label className="ad-label" htmlFor="of-name">
                {tt('nameEn')}
              </label>
              <input id="of-name" className="ad-input" maxLength={120} value={f.nameEn} onChange={(e) => set({ nameEn: e.target.value })} />
            </div>
            <div>
              <label className="ad-label" htmlFor="of-namebn">
                {tt('nameBn')}
              </label>
              <input id="of-namebn" className="ad-input" maxLength={120} value={f.nameBn} onChange={(e) => set({ nameBn: e.target.value })} />
            </div>
          </>
        ) : null}
        {s === 'value' ? (
          <>
            {f.kind === 'PERCENT' ? (
              <>
                {field('percent', tt('value.percent'), f.percent, (v) => set({ percent: v }), tt('value.percentHint'))}
                {field('max', tt('value.max'), f.maxMinor, (v) => set({ maxMinor: v }), tt('value.maxHint'))}
              </>
            ) : null}
            {f.kind === 'FLAT' ? field('amount', tt('value.amount'), f.amountMinor, (v) => set({ amountMinor: v })) : null}
            {f.kind === 'POINTS' ? field('points', tt('value.points'), f.points, (v) => set({ points: v })) : null}
            {f.kind === 'WALLET_CREDIT' ? field('credit', tt('value.credit'), f.creditMinor, (v) => set({ creditMinor: v })) : null}
            {f.kind === 'FREE_DELIVERY' ? <p className="rh-hint">{tt('value.freeDelivery')}</p> : null}
          </>
        ) : null}
        {s === 'where' ? (
          online ? (
            <p className="rh-hint">{tt('where.onlineAll')}</p>
          ) : (
            <>
              <div>
                <label className="ad-label" htmlFor="of-scope">
                  {tt('where.label')}
                </label>
                <select id="of-scope" className="ad-input" value={f.scopeType} onChange={(e) => set({ scopeType: e.target.value as Form['scopeType'], scopeId: '' })}>
                  <option value="all">{tt('where.all')}</option>
                  <option value="category">{tt('where.category')}</option>
                  <option value="collection">{tt('where.collection')}</option>
                </select>
              </div>
              {f.scopeType !== 'all' ? (
                <div>
                  <label className="ad-label" htmlFor="of-scopeid">
                    {tt(`where.${f.scopeType}`)}
                  </label>
                  <select id="of-scopeid" className="ad-input" value={f.scopeId} onChange={(e) => set({ scopeId: e.target.value })}>
                    <option value="" />
                    {scopeList.map((x) => (
                      <option key={x.id ?? ''} value={x.id ?? ''}>
                        {lang === 'bn' && x.nameBn ? x.nameBn : x.nameEn}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
            </>
          )
        ) : null}
        {s === 'who' ? (
          online ? (
            <p className="rh-hint">{tt('who.onlineAll')}</p>
          ) : (
            <>
              <div>
                <label className="ad-label" htmlFor="of-aud">
                  {tt('who.label')}
                </label>
                <select id="of-aud" className="ad-input" value={f.audience} onChange={(e) => set({ audience: e.target.value as Form['audience'] })}>
                  <option value="ALL">{tt('who.ALL')}</option>
                  <option value="GUESTS">{tt('who.GUESTS')}</option>
                  <option value="MEMBERS">{tt('who.MEMBERS')}</option>
                </select>
              </div>
              <label className="rh-sw">
                <input type="checkbox" checked={f.firstOrderOnly} onChange={(e) => set({ firstOrderOnly: e.target.checked })} /> <span>{tt('who.first')}</span>
              </label>
              <div>
                <label className="ad-label" htmlFor="of-code">
                  {tt('code')}
                </label>
                <input id="of-code" className="ad-input" maxLength={40} value={f.code} onChange={(e) => set({ code: e.target.value.toUpperCase() })} />
                <div className="rh-hint">{tt('codeHint')}</div>
              </div>
            </>
          )
        ) : null}
        {s === 'when' ? (
          online ? (
            <p className="rh-hint">{tt('when.onlineNow')}</p>
          ) : (
            <div className="rh-fields two">
              <div>
                <label className="ad-label" htmlFor="of-from">
                  {tt('when.from')}
                </label>
                <input id="of-from" className="ad-input" type="datetime-local" value={f.startsAt} onChange={(e) => set({ startsAt: e.target.value })} />
              </div>
              <div>
                <label className="ad-label" htmlFor="of-to">
                  {tt('when.until')}
                </label>
                <input id="of-to" className="ad-input" type="datetime-local" value={f.endsAt} onChange={(e) => set({ endsAt: e.target.value })} />
              </div>
            </div>
          )
        ) : null}
        {s === 'limits' ? (
          online ? (
            <p className="rh-hint">{tt('limits.onlineNone')}</p>
          ) : (
            <>
              {field('min', tt('limits.min'), f.minOrder, (v) => set({ minOrder: v }), tt('limits.emptyNone'))}
              {field('uses', tt('limits.uses'), f.usageLimit, (v) => set({ usageLimit: v }), tt('limits.needsCode'))}
              {field('per', tt('limits.perCustomer'), f.perCustomerLimit, (v) => set({ perCustomerLimit: v }), tt('limits.needsCode'))}
              {field('budget', tt('limits.budget'), f.budget, (v) => set({ budget: v }), tt('limits.budgetHint'))}
            </>
          )
        ) : null}
        {s === 'preview' ? (
          <>
            <div className="rh-sub">{tt('preview.title')}</div>
            <ul className="of-sum">
              {summary().map((x, i) => (
                <li key={i}>{x}</li>
              ))}
            </ul>
            {f.nameEn.trim() === '' ? <div className="ad-note warn">{tt('preview.noName')}</div> : null}
            {issues.length ? (
              <div className="ad-note warn">
                <ul>
                  {issues.map((c) => (
                    <li key={c}>{tt(`issues.${c}`)}</li>
                  ))}
                </ul>
              </div>
            ) : (
              <div className="ad-note">{tt('preview.ok')}</div>
            )}
            <p className="rh-hint">{tt('preview.needsOk')}</p>
          </>
        ) : null}
      </div>
      <div className="rl-actions">
        <button type="button" className="ad-btn ad-btn-ghost ad-btn-sm" onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0}>
          {tt('wizard.back')}
        </button>
        {step < STEPS.length - 1 ? (
          <button type="button" className="ad-btn ad-btn-primary ad-btn-sm" onClick={() => setStep(step + 1)}>
            {tt('wizard.next')}
          </button>
        ) : (
          <>
            <button type="button" className="ad-btn ad-btn-ghost ad-btn-sm" disabled={busy || !canWrite || f.nameEn.trim() === ''} onClick={() => onSave(false)}>
              {tt('wizard.saveDraft')}
            </button>
            <button type="button" className="ad-btn ad-btn-primary ad-btn-sm" disabled={busy || !canWrite || f.nameEn.trim() === '' || issues.length > 0} onClick={() => onSave(true)}>
              {tt('wizard.saveSend')}
            </button>
          </>
        )}
      </div>
    </section>
  );
}
