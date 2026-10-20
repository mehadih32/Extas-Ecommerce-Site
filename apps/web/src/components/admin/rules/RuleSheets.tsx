'use client';
// S10 · PR 209, 212, 213, 218, 219 — the sheets of the Smart Rules screen: a new rule (demo "New rule"), adding to
// Applies to / Except, "Preview changes" (what updates where, the money that changes and the owner's OK), the history
// with "bring back", trying the rule on past orders, and a discount's coupons. Each talks to /api/admin/rules itself.
import { useEffect, useState, type FormEvent } from 'react';
import type { CouponView, RulePreview, RuleView, SimulationResult, VersionView } from '@extas/rules';
import { RULE_KINDS, type Param, type RuleContent, type RuleKind, type Target } from '@extas/rules/pure';
import { call, type Answer } from '../api';
import { Icon } from '../Icon';
import { t, type Dict } from '@/lib/i18n';
import { Sheet } from './Sheet';
import { changeText, issueText, keyFromTitle, langCtx, money, nameIn, paramLabels, rulesRefusal, targetKey, when, withText, type Lang, type RulesEnv, type ScopeOption } from './model';
import type { Perms } from './RuleEditor';

export const RULES_API = '/api/admin/rules';

export interface TemplateItem {
  id: string;
  kind: string;
  nameEn: string;
  nameBn: string | null;
  starter: boolean;
  exists: boolean;
  movesMoney: boolean;
}

interface Base {
  d: Dict;
  lang: Lang;
  onClose(): void;
}

/** A short unique suffix for a rule key made from a title that has no latin letters. */
const stamp = () => Date.now().toString(36);

const tr = (d: Dict) => (k: string, vars?: Record<string, string | number>) => t(d, `rules.${k}`, vars);
const refusal = (d: Dict, a: Answer) => rulesRefusal(d, a.data.error, a.data.details ?? []);

// ------------------------------------------------------------------------------------------------ new rule

export function NewRuleSheet({ d, lang, onClose, templates, keys, env, onCreated }: Base & { templates: readonly TemplateItem[]; keys: ReadonlySet<string>; env: RulesEnv; onCreated(v: RuleView): void }) {
  const tt = tr(d);
  const [kind, setKind] = useState<RuleKind>('delivery');
  const [from, setFrom] = useState('');
  const [name, setName] = useState('');
  const [short, setShort] = useState('');
  const [full, setFull] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const forKind = templates.filter((x) => x.kind === kind);
  const tpl = templates.find((x) => x.id === from);
  const max = env.limits.shortMaxChars;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const title = name.trim();
    if (!title) return setErr(tt('newRule.nameNeeded'));
    setBusy(true);
    setErr('');
    let key = keyFromTitle(title, `${kind.toLowerCase()}-${stamp()}`);
    if (tpl && !keys.has(tpl.id)) key = tpl.id;
    else if (keys.has(key)) key = `${key}-${stamp()}`.slice(0, 60);
    const nameEn = lang === 'en' || /^[\x20-\x7e]+$/.test(title) ? title : (tpl?.nameEn ?? title);
    const a = await call('POST', RULES_API, tpl ? { templateId: tpl.id, key, nameEn } : { key, kind, nameEn });
    if (a.status !== 201 || !a.data.rule) {
      setBusy(false);
      return setErr(refusal(d, a));
    }
    let view = a.data.rule as RuleView;
    const base = view.draft ?? view.live;
    if (base && (short.trim() || full.trim() || (lang === 'bn' && nameEn !== title))) {
      let next: RuleContent = base;
      if (lang === 'bn' && nameEn !== title) next = { ...next, nameBn: title };
      if (short.trim()) next = withText(next, 'short', lang, short.trim());
      if (full.trim()) next = withText(next, 'full', lang, full.trim());
      const s = await call('PUT', `${RULES_API}/${view.id}/draft`, { content: next, version: view.version });
      if (s.status === 200 && s.data.rule) view = s.data.rule as RuleView;
    }
    setBusy(false);
    onCreated(view);
  };

  return (
    <Sheet title={tt('newRule.title')} closeLabel={tt('close')} onClose={onClose} onSubmit={submit}>
      <div>
        <label className="ad-label" htmlFor="rl-n-topic">
          {tt('newRule.topic')}
        </label>
        <select
          id="rl-n-topic"
          className="ad-input"
          value={kind}
          onChange={(e) => {
            setKind(e.target.value as RuleKind);
            setFrom('');
          }}
        >
          {RULE_KINDS.map((k) => (
            <option key={k} value={k}>
              {tt(`kinds.${k}`)}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="ad-label" htmlFor="rl-n-from">
          {tt('newRule.start')}
        </label>
        <select id="rl-n-from" className="ad-input" value={from} onChange={(e) => setFrom(e.target.value)}>
          <option value="">{tt('newRule.blank')}</option>
          {forKind.map((x) => (
            <option key={x.id} value={x.id}>
              {x.exists ? tt('newRule.exists', { name: nameIn(x, lang) }) : nameIn(x, lang)}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="ad-label" htmlFor="rl-n-title">
          {tt('newRule.name')}
        </label>
        <input id="rl-n-title" className="ad-input" maxLength={120} value={name} placeholder={tt('newRule.namePlaceholder')} onChange={(e) => setName(e.target.value)} aria-invalid={err === tt('newRule.nameNeeded')} />
      </div>
      <div>
        <label className="ad-label" htmlFor="rl-n-short">
          {tt('newRule.short')} <span className="opt">{tt('newRule.shortHint', { max })}</span>
        </label>
        <input id="rl-n-short" className="ad-input" maxLength={max} value={short} placeholder={tt('newRule.shortPlaceholder')} onChange={(e) => setShort(e.target.value)} />
      </div>
      <div>
        <label className="ad-label" htmlFor="rl-n-full">
          {tt('newRule.full')}
        </label>
        <textarea id="rl-n-full" className="ad-input rl-area" rows={4} value={full} placeholder={tt('newRule.fullPlaceholder')} onChange={(e) => setFull(e.target.value)} />
      </div>
      <div className="rl-ai rl-ai-in">
        <span className="rl-tag gold">
          <Icon name="spark" size={11} />
          {tt('editor.aiTag')}
        </span>
        <div className="ad-mini">
          {tt('newRule.ai')} {tt('editor.aiHint')}
        </div>
      </div>
      {tpl?.movesMoney ? <div className="ad-note warn">{tt('newRule.moneyNote')}</div> : null}
      {err ? (
        <p className="ad-modal-err" role="alert">
          {err}
        </p>
      ) : null}
      <div className="ad-modal-acts rl-acts-left">
        <button type="submit" className="ad-btn ad-btn-primary ad-btn-sm" disabled={busy}>
          {tt('newRule.save')}
        </button>
        <button type="button" className="ad-btn ad-btn-ghost ad-btn-sm" onClick={onClose}>
          {tt('newRule.cancel')}
        </button>
      </div>
    </Sheet>
  );
}

// ------------------------------------------------------------------------------------------------ scope

export function ScopeSheet({ d, lang, onClose, list, cand, scopes, onPick }: Base & { list: 'include' | 'exclude'; cand: RuleContent; scopes: readonly ScopeOption[]; onPick(t: Target): void }) {
  const tt = tr(d);
  const taken = new Set([...cand.scope.include, ...cand.scope.exclude].map(targetKey));
  const left = scopes.filter((s) => !taken.has(targetKey(s)) && !(list === 'exclude' && s.type === 'all'));
  const groups: { key: string; items: ScopeOption[] }[] = [
    { key: 'all', items: left.filter((s) => s.type === 'all') },
    { key: 'categories', items: left.filter((s) => s.type === 'category') },
    { key: 'collections', items: left.filter((s) => s.type === 'collection') },
  ].filter((g) => g.items.length);
  const pick = (s: ScopeOption) => onPick(s.type === 'all' ? { type: 'all' } : ({ type: s.type, id: s.id! } as Target));
  return (
    <Sheet title={tt(list === 'include' ? 'scope.titleApplies' : 'scope.titleExcept')} closeLabel={tt('close')} onClose={onClose}>
      <p className="ad-modal-desc">{tt(list === 'include' ? 'scope.introApplies' : 'scope.introExcept')}</p>
      {groups.length === 0 ? <p className="ad-mini">{tt('scope.none')}</p> : null}
      {groups.map((g) => (
        <div key={g.key}>
          {g.key !== 'all' ? <div className="ad-label">{tt(`scope.${g.key}`)}</div> : null}
          <div className="rl-chips">
            {g.items.map((s) => (
              <button key={targetKey(s)} type="button" className="ad-chip" onClick={() => pick(s)}>
                <Icon name="plus" size={13} />
                {s.type === 'all' ? tt('scope.all') : nameIn(s, lang)}
              </button>
            ))}
          </div>
        </div>
      ))}
    </Sheet>
  );
}

// ------------------------------------------------------------------------------------------------ preview

export function PreviewSheet({ d, lang, onClose, env, name, params, preview, error, perms, busy, onPublish }: Base & { env: RulesEnv; name: string; params: readonly Param[]; preview: RulePreview | null; error: string; perms: Perms; busy: boolean; onPublish(): void }) {
  const tt = tr(d);
  const ctx = langCtx(env.ctx, lang);
  const labels = paramLabels(params, lang);
  const p = preview;
  const blocking = p ? p.issues.filter((i) => i.blocking) : [];
  const before = p?.places.find((x) => x.before !== null)?.before ?? null;
  const after = p ? (p.places.find((x) => x.after !== null)?.after ?? p.texts.short?.[lang]?.text ?? p.texts.short?.en?.text ?? null) : null;
  return (
    <Sheet title={tt('preview.title', { name })} closeLabel={tt('close')} onClose={onClose} wide>
      {error ? (
        <p className="ad-modal-err" role="alert">
          {error}
        </p>
      ) : null}
      {!p && !error ? <p className="ad-mini">{tt('editor.working')}</p> : null}
      {p ? (
        <>
          <div>
            <p className="ad-modal-desc">{tt('preview.intro')}</p>
            {p.places.length ? (
              <div className="rl-places">
                {p.places.map((x) => (
                  <div key={x.placement} className="rl-place">
                    <Icon name="check" size={16} />
                    <span className="rl-grow">{lang === 'bn' ? x.labelBn : x.labelEn}</span>
                    {x.change !== 'same' ? <span className={`rl-tag${x.change === 'removed' ? ' warn' : ' plain'}`}>{tt(`preview.change.${x.change}`)}</span> : null}
                  </div>
                ))}
              </div>
            ) : (
              <p className="ad-mini">{tt('preview.noPlaces')}</p>
            )}
          </div>
          <div>
            <div className="ad-label">{tt('preview.shortText')}</div>
            {before !== null && before !== after ? (
              <>
                <div className="rl-small">
                  <span className="ad-mini">{tt('preview.now')}</span> <s>{before}</s>
                </div>
                <div className="rl-small rl-mt8">
                  <span className="ad-mini">{tt('preview.after')}</span> <b>{after}</b>
                </div>
              </>
            ) : (
              <div className="rl-small">{after ?? tt('editor.notWritten')}</div>
            )}
          </div>
          {p.notLive ? <div className="ad-note warn">{tt('preview.notLive')}</div> : null}
          {p.quotedBy.length ? (
            <div>
              <div className="ad-label">{tt('preview.quotedBy')}</div>
              <ul className="rl-issues">
                {p.quotedBy.map((q) => (
                  <li key={`${q.type}-${q.id}`}>
                    <b>{q.nameEn}</b>: {q.before === q.after ? q.after : `${q.before} → ${q.after}`}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {p.money.length ? (
            <div>
              <div className="ad-label">{tt('preview.money')}</div>
              <ul className="rl-issues">
                {p.money.map((c) => (
                  <li key={c.path}>{changeText(d, c, ctx, labels)}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {p.ownerOkNeeded ? (
            <div className="ad-note warn">
              <Icon name="shield" size={16} />
              <div>
                <b>{tt('preview.ownerOk')}</b> {p.canApprove ? tt('preview.canApprove') : tt('preview.cannotApprove')}
              </div>
            </div>
          ) : null}
          {blocking.length ? (
            <div className="ad-note warn">
              <div>
                <b>{tt('preview.issues')}</b>
                <ul className="rl-issues">
                  {blocking.map((i) => (
                    <li key={`${i.code}@${i.at}:${i.subject ?? ''}`}>{issueText(d, i)}</li>
                  ))}
                </ul>
              </div>
            </div>
          ) : null}
          {p.conflicts.length ? <div className="ad-note">{tt('preview.conflicts', { n: p.conflicts.length })}</div> : null}
          <div className="ad-modal-acts rl-acts-left">
            {perms.publish ? (
              <button type="button" className="ad-btn ad-btn-primary ad-btn-sm" onClick={onPublish} disabled={busy || blocking.length > 0}>
                {tt('preview.publishNow')}
              </button>
            ) : null}
            <button type="button" className="ad-btn ad-btn-ghost ad-btn-sm" onClick={onClose}>
              {tt('preview.keep')}
            </button>
          </div>
          {p.changes.length === 0 ? <p className="ad-mini">{tt('preview.noChanges')}</p> : null}
        </>
      ) : null}
    </Sheet>
  );
}

// ------------------------------------------------------------------------------------------------ history (PR 218)

export function HistorySheet({ d, lang, onClose, env, locale, timeZone, view, name, perms, onRestored }: Base & { env: RulesEnv; locale: string; timeZone: string; view: RuleView; name: string; perms: Perms; onRestored(v: RuleView, version: number): void }) {
  const tt = tr(d);
  const ctx = langCtx(env.ctx, lang);
  const labels = paramLabels((view.draft ?? view.live)?.params ?? [], lang);
  const [versions, setVersions] = useState<VersionView[] | null>(null);
  const [more, setMore] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const take = (a: Answer, before?: number) => {
    if (a.status !== 200) return setErr(refusal(d, a));
    const got = (a.data.versions ?? []) as VersionView[];
    setVersions((v) => [...(before ? (v ?? []) : []), ...got]);
    setMore(a.data.more === true);
  };
  const older = async (before: number) => take(await call('GET', `${RULES_API}/${view.id}/history?before=${before}`), before);
  useEffect(() => {
    let on = true;
    void call('GET', `${RULES_API}/${view.id}/history`).then((a) => {
      if (!on) return;
      if (a.status !== 200) return setErr(rulesRefusal(d, a.data.error, a.data.details ?? []));
      setVersions((a.data.versions ?? []) as VersionView[]);
      setMore(a.data.more === true);
    });
    return () => {
      on = false;
    };
  }, [view.id, d]);
  const bringBack = async (version: number) => {
    setBusy(true);
    const a = await call('POST', `${RULES_API}/${view.id}/history`, { version });
    setBusy(false);
    if (a.status !== 200 || !a.data.rule) return setErr(refusal(d, a));
    onRestored(a.data.rule as RuleView, version);
  };
  const last = versions?.[versions.length - 1]?.version;
  return (
    <Sheet title={tt('history.title', { name })} closeLabel={tt('close')} onClose={onClose} wide>
      <p className="ad-modal-desc">{tt('history.intro')}</p>
      {err ? (
        <p className="ad-modal-err" role="alert">
          {err}
        </p>
      ) : null}
      {versions === null && !err ? <p className="ad-mini">{tt('editor.working')}</p> : null}
      {versions?.length === 0 ? <p className="ad-mini">{tt('history.none')}</p> : null}
      <ol className="rl-hist">
        {(versions ?? []).map((v, i) => (
          <li key={v.version} className="rl-hist-item">
            <div className="rl-tags">
              <b>{tt('history.version', { version: v.version })}</b>
              {v.status ? <span className={`rl-tag${v.status === 'ACTIVE' ? '' : ' warn'}`}>{tt(`status.${v.status}`)}</span> : null}
              {v.money.length ? <span className="rl-tag gold">{tt('history.money')}</span> : null}
              <span className="ad-mini">
                {when(v.at, locale, timeZone)} · {v.actorName ?? tt('history.system')}
              </span>
            </div>
            {v.changeNote ? <div className="ad-mini rl-mt4">{tt('history.note', { note: v.changeNote })}</div> : null}
            {!v.readable ? <div className="ad-mini bad">{tt('history.unreadable')}</div> : null}
            {v.changes.length ? (
              <ul className="rl-issues">
                {v.changes.map((c) => (
                  <li key={c.path}>{changeText(d, c, ctx, labels)}</li>
                ))}
              </ul>
            ) : i === (versions ?? []).length - 1 && !more ? (
              <div className="ad-mini rl-mt4">{tt('history.first')}</div>
            ) : null}
            {perms.write && v.readable && v.version !== view.version && !view.archived ? (
              <button type="button" className="rl-link" onClick={() => bringBack(v.version)} disabled={busy}>
                {tt('history.bringBack')}
              </button>
            ) : null}
          </li>
        ))}
      </ol>
      {more && last ? (
        <button type="button" className="ad-btn ad-btn-ghost ad-btn-sm" onClick={() => void older(last)}>
          {tt('history.older')}
        </button>
      ) : null}
    </Sheet>
  );
}

// ------------------------------------------------------------------------------------------------ simulation (PR 219)

export function SimulateSheet({ d, lang, onClose, env, view, name, cand, dirty, defaultDays }: Base & { env: RulesEnv; view: RuleView; name: string; cand: RuleContent; dirty: boolean; defaultDays: number }) {
  const tt = tr(d);
  const [days, setDays] = useState('');
  const [res, setRes] = useState<SimulationResult | null>(null);
  const [earlier, setEarlier] = useState<SimulationResult[]>([]);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void call('GET', `${RULES_API}/${view.id}/simulate`).then((a) => {
      if (a.status === 200 && Array.isArray(a.data.simulations)) setEarlier(a.data.simulations as SimulationResult[]);
    });
  }, [view.id]);
  const run = async (e: FormEvent) => {
    e.preventDefault();
    const n = days.trim() ? Number(days) : null;
    setBusy(true);
    setErr('');
    const a = await call('POST', `${RULES_API}/${view.id}/simulate`, { ...(n !== null && Number.isInteger(n) ? { days: n } : {}), ...(dirty ? { content: cand } : {}) });
    setBusy(false);
    if (a.status !== 200 || !a.data.simulation) return setErr(refusal(d, a));
    const s = a.data.simulation as SimulationResult;
    setRes(s);
    setEarlier((x) => [s, ...x.filter((y) => y.id !== s.id)]);
  };
  const m = (n: number, signed = false) => money(n, env, lang, signed);
  return (
    <Sheet title={tt('simulate.title', { name })} closeLabel={tt('close')} onClose={onClose} onSubmit={run} wide>
      <p className="ad-modal-desc">{tt('simulate.intro')}</p>
      <div className="rl-simrow">
        <div>
          <label className="ad-label" htmlFor="rl-sim-days">
            {tt('simulate.days')}
          </label>
          <input id="rl-sim-days" className="ad-input rl-num" type="number" inputMode="numeric" min={1} value={days} placeholder={tt('simulate.daysHelp', { n: defaultDays })} onChange={(e) => setDays(e.target.value)} />
        </div>
        <button type="submit" className="ad-btn ad-btn-primary ad-btn-sm" disabled={busy}>
          {busy ? tt('simulate.running') : tt('simulate.run')}
        </button>
      </div>
      {err ? (
        <p className="ad-modal-err" role="alert">
          {err}
        </p>
      ) : null}
      {res ? (
        <div className="rl-sim">
          <div className="rl-small">
            {tt('simulate.orders', { n: res.orders })}
            {res.capped ? ` ${tt('simulate.capped', { n: res.orders })}` : ''}
          </div>
          {res.orders === 0 ? <p className="ad-mini">{tt('simulate.none')}</p> : null}
          <div className="rl-small">{tt('simulate.changed', { n: res.changed })}</div>
          <table className="rl-table">
            <thead>
              <tr>
                <th scope="col" />
                <th scope="col">{tt('simulate.before')}</th>
                <th scope="col">{tt('simulate.after')}</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">{tt('simulate.paid')}</th>
                <td>{m(res.before.totalMinor)}</td>
                <td>{m(res.after.totalMinor)}</td>
              </tr>
              <tr>
                <th scope="row">{tt('simulate.freeDelivery')}</th>
                <td>{res.freeDeliveryBefore}</td>
                <td>{res.freeDeliveryAfter}</td>
              </tr>
              <tr>
                <th scope="row">{tt('simulate.codRefused')}</th>
                <td>{res.codRefusedBefore}</td>
                <td>{res.codRefusedAfter}</td>
              </tr>
            </tbody>
          </table>
          <div className="rl-small">
            {tt('simulate.difference')}: <b>{m(res.differenceMinor, true)}</b>
          </div>
          {res.deliveryUnknown ? <div className="ad-mini">{tt('simulate.unknown', { n: res.deliveryUnknown })}</div> : null}
          {res.biggest.length ? (
            <div>
              <div className="ad-label">{tt('simulate.biggest')}</div>
              <ul className="rl-issues">
                {res.biggest.map((o) => (
                  <li key={o.orderId}>
                    {tt('simulate.order', { number: o.number })}: {m(o.before.totalMinor)} → {m(o.after.totalMinor)} ({m(o.differenceMinor, true)})
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
      {earlier.length ? (
        <div>
          <div className="ad-label">{tt('simulate.earlier')}</div>
          <ul className="rl-issues">
            {earlier.slice(0, 5).map((s) => (
              <li key={s.id}>{tt('simulate.earlierLine', { version: s.version, days: s.days, orders: s.orders, difference: m(s.differenceMinor, true) })}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </Sheet>
  );
}

// ------------------------------------------------------------------------------------------------ coupons (PR 213)

export function CouponsSheet({ d, lang: _lang, onClose, view, name, perms }: Base & { view: RuleView; name: string; perms: Perms }) {
  const tt = tr(d);
  const [list, setList] = useState<CouponView[] | null>(null);
  const [code, setCode] = useState('');
  const [usage, setUsage] = useState('');
  const [per, setPer] = useState('');
  const [err, setErr] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void call('GET', `${RULES_API}/coupons?ruleId=${view.id}`).then((a) => {
      if (a.status === 200 && Array.isArray(a.data.coupons)) setList(a.data.coupons as CouponView[]);
      else setErr(refusal(d, a));
    });
  }, [view.id, d]);
  const replace = (c: CouponView) => setList((l) => (l ?? []).map((x) => (x.id === c.id ? c : x)).filter((x) => !x.archived));
  const add = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr('');
    const num = (s: string) => (s.trim() ? Number(s) : undefined);
    const a = await call('POST', `${RULES_API}/coupons`, { code: code.trim(), ruleId: view.id, ...(num(usage) ? { usageLimit: num(usage) } : {}), ...(num(per) ? { perCustomerLimit: num(per) } : {}) });
    setBusy(false);
    if (a.status !== 201 || !a.data.coupon) return setErr(refusal(d, a));
    setList((l) => [a.data.coupon as CouponView, ...(l ?? [])]);
    setCode('');
    setNote(tt('coupons.added'));
  };
  const act = async (c: CouponView, body: Record<string, unknown>) => {
    setBusy(true);
    setErr('');
    const a = await call('POST', `${RULES_API}/coupons/${c.id}`, body);
    setBusy(false);
    if (a.status !== 200 || !a.data.coupon) return setErr(refusal(d, a));
    replace(a.data.coupon as CouponView);
  };
  return (
    <Sheet title={tt('coupons.title', { name })} closeLabel={tt('close')} onClose={onClose} onSubmit={perms.write ? add : undefined} wide>
      <p className="ad-modal-desc">{tt('coupons.intro')}</p>
      {perms.write ? (
        <div className="rl-sets">
          <div className="rl-wide">
            <label className="ad-label" htmlFor="rl-c-code">
              {tt('coupons.code')} <span className="opt">· {tt('coupons.codeHelp')}</span>
            </label>
            <input id="rl-c-code" className="ad-input" autoCapitalize="characters" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} />
          </div>
          <div>
            <label className="ad-label" htmlFor="rl-c-usage">
              {tt('coupons.usageLimit')}
            </label>
            <input id="rl-c-usage" className="ad-input" type="number" inputMode="numeric" min={1} value={usage} placeholder={tt('coupons.noLimit')} onChange={(e) => setUsage(e.target.value)} />
          </div>
          <div>
            <label className="ad-label" htmlFor="rl-c-per">
              {tt('coupons.perCustomer')}
            </label>
            <input id="rl-c-per" className="ad-input" type="number" inputMode="numeric" min={1} value={per} placeholder={tt('coupons.noLimit')} onChange={(e) => setPer(e.target.value)} />
          </div>
          <div className="rl-wide">
            <button type="submit" className="ad-btn ad-btn-primary ad-btn-sm" disabled={busy || !code.trim()}>
              {tt('coupons.add')}
            </button>
          </div>
        </div>
      ) : null}
      {err ? (
        <p className="ad-modal-err" role="alert">
          {err}
        </p>
      ) : null}
      {note ? (
        <p className="ad-mini ok" role="status">
          {note}
        </p>
      ) : null}
      {list?.length === 0 ? <p className="ad-mini">{tt('coupons.none')}</p> : null}
      <div>
        {(list ?? []).map((c) => (
          <div key={c.id} className="ad-row">
            <div className="ad-row-main">
              <div className="ad-row-name">
                <span className={`ad-dot${c.enabled ? '' : ' off'}`} />
                <span className="rl-code">{c.code}</span>
              </div>
              <div className="ad-mini">
                {c.enabled ? tt('coupons.on') : tt('coupons.off')} · {tt('coupons.used', { n: c.usedCount })}
                {c.usageLimit ? ` ${tt('coupons.of', { n: c.usageLimit })}` : ''}
              </div>
            </div>
            {perms.publish ? (
              <div className="ad-row-acts">
                <button type="button" className="ad-btn ad-btn-ghost ad-btn-sm" disabled={busy} onClick={() => act(c, { enabled: !c.enabled })}>
                  {c.enabled ? tt('coupons.switchOff') : tt('coupons.switchOn')}
                </button>
                {!c.enabled ? (
                  <button type="button" className="ad-btn ad-btn-ghost ad-btn-sm" disabled={busy} onClick={() => act(c, { archived: true })}>
                    {tt('coupons.archive')}
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </Sheet>
  );
}
