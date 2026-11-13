'use client';
// S28 · PR 676 (CN-048, admin prototype v5, Rules) — the one-page Rules screen: search, the groups on the left, every rule as one plain
// sentence with a pill (On, Off, Sample, From date) and, on the right, the editor of the rule picked (a sheet under the row on a
// phone). A setting row edits its setting's own fields; a Smart Rule opens on its own page ("Managed in …"). Money rules ask for the
// owner's PIN before they save. "What changes" shows before → after; More options holds "back to the shipped value".
import Link from 'next/link';
import { useMemo, useState, type ReactNode } from 'react';
import type { HubGroupId, HubField } from '@extas/rules/pure';
import { HUB_GROUPS, formatValue } from '@extas/rules/pure';
import type { HubRowView, HubScreen, HubSettingRowView, HubSmartRowView, HubLinkRowView } from '@extas/rules';
import { call } from '../api';
import { Icon } from '../Icon';
import { say, sayBad } from '../products/useToast';
import { t, type Dict } from '@/lib/i18n';
import { moneyFromInput, moneyToInput, numberFromInput, type Lang, type RulesEnv, rulesRefusal } from './model';

export interface HubRole {
  key: string;
  name: string;
}

export interface RulesHubProps {
  dict: Dict;
  lang: Lang;
  env: Pick<RulesEnv, 'ctx'>;
  hub: HubScreen;
  roles: HubRole[];
  perms: { write: boolean; approve: boolean };
  initialSel: string | null;
  tabs?: ReactNode;
}

type Json = Record<string, unknown>;
const isObj = (v: unknown): v is Json => !!v && typeof v === 'object' && !Array.isArray(v);
const getPath = (v: unknown, path: string): unknown => (path === '' ? v : path.split('.').reduce<unknown>((c, p) => (isObj(c) ? c[p] : undefined), v));
const key = (path: string) => (path === '' ? 'value' : path.replace(/\./g, '_'));
const API = '/api/admin/rules/hub';
const EMPTY_LIMIT = { amountMinor: 0, percent: 0 }; // hardcode-ok: a role ticked with no limit yet
type SavedFn = () => void | Promise<void>; // hardcode-ok: a type, not text

export function RulesHub(props: RulesHubProps) {
  const { dict: d, lang, perms, env } = props;
  const tt = (k: string, vars?: Record<string, string | number>) => t(d, `rulesHub.${k}`, vars);
  const [hub, setHub] = useState(props.hub);
  const [group, setGroup] = useState<'all' | HubGroupId>('all');
  const [q, setQ] = useState('');
  const [onlySample, setOnlySample] = useState(false);
  const [sel, setSel] = useState<string | null>(props.initialSel);
  const [busy, setBusy] = useState(false);

  const money = (v: unknown) => (typeof v === 'number' ? (formatValue('money', v, env.ctx) ?? String(v)) : tt('notSet'));
  const show = (f: HubField, v: unknown, rowId: string): string => {
    if (v === null || v === undefined || v === '') return tt('notSet');
    if (f.type === 'bool') return v === true ? tt('on') : tt('off');
    if (f.type === 'money') return money(v);
    if (f.type === 'choice') {
      const k = `opt.${rowId}.${String(v)}`;
      const s = t(d, `rulesHub.${k}`);
      return s === `rulesHub.${k}` ? String(v) : s;
    }
    if (f.type === 'roster') return Array.isArray(v) ? String(v.length) : '0';
    if (f.type === 'roleLimits') return isObj(v) ? String(Object.keys(v).length) : '0';
    return String(v);
  };
  const vars = (r: HubSettingRowView): Record<string, string | number> => {
    const out: Record<string, string | number> = {};
    for (const f of r.fields) out[key(f.path)] = show(f, getPath(r.value, f.path), r.id);
    return out;
  };
  const titleOf = (r: HubRowView) => (r.type === 'smart' ? (lang === 'bn' && r.nameBn ? r.nameBn : r.nameEn) : tt(`rows.${r.id}.title`));
  const sentenceOf = (r: HubRowView) =>
    r.type === 'smart' ? ((lang === 'bn' ? r.shortBn : r.shortEn) ?? r.shortEn ?? '') : r.type === 'setting' ? tt(`rows.${r.id}.sentence`, vars(r)) : tt(`rows.${r.id}.sentence`);

  const pill = (r: HubRowView): ReactNode => {
    if (r.type === 'link' && r.pill === null) return <span className="rh-pl link">{tt('pill.page')}</span>;
    const p = r.pill as string;
    const label =
      p === 'from' && r.type === 'smart' && r.startsAt
        ? tt('pill.from', { date: new Date(r.startsAt).toLocaleDateString(lang === 'bn' ? 'bn-BD' : 'en-GB', { day: 'numeric', month: 'short' }) })
        : tt(`pill.${p}`);
    return <span className={`rh-pl ${p}`}>{label}</span>;
  };

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const r of hub.rows) c[r.group] = (c[r.group] ?? 0) + 1;
    return c;
  }, [hub.rows]);
  const needle = q.trim().toLowerCase();
  const rows = hub.rows.filter((r) => (group === 'all' || r.group === group) && (!onlySample || r.pill === 'sample') && (!needle || `${titleOf(r)} ${sentenceOf(r)}`.toLowerCase().includes(needle)));
  const selRow = hub.rows.find((r) => r.id === sel && r.type === 'setting') as HubSettingRowView | undefined;

  const open = (id: string | null) => {
    setSel(id);
    try {
      history.replaceState(null, '', id ? `/admin/rules?rule=${id}` : '/admin/rules');
    } catch {
      /* the address stays as it is */
    }
  };
  const reload = async () => {
    const a = await call('GET', API);
    if (a.status === 200 && a.data.hub) setHub(a.data.hub as HubScreen);
  };

  return (
    <div className="rh">
      <div className="ad-hd rl-hd">
        <div className="rl-hd-text">
          <h1 className="ad-h1">{tt('title')}</h1>
          <p className="ad-intro">{tt('intro')}</p>
        </div>
      </div>
      {props.tabs}
      <div className="rh-strip" role="status">
        {hub.sample > 0 ? (
          <button
            type="button"
            className="rh-sp warn"
            onClick={() => {
              setOnlySample(true);
              setGroup('all');
            }}
          >
            {tt('strip.sample', { n: hub.sample })}
          </button>
        ) : (
          <span className="rh-sp good">{tt('strip.allOwn')}</span>
        )}
        {hub.lastChange ? (
          <span className="rh-sp">
            {tt('strip.last', { rule: titleOfId(hub.lastChange.rowId), when: new Date(hub.lastChange.at).toLocaleDateString(lang === 'bn' ? 'bn-BD' : 'en-GB', { day: 'numeric', month: 'short' }) })}
          </span>
        ) : null}
      </div>
      <div className={`rh-l ${selRow ? 'has-ed' : ''}`}>
        <nav className="rh-nav" aria-label={tt('groupsLabel')}>
          <button type="button" className={group === 'all' ? 'on' : ''} onClick={() => setGroup('all')}>
            {tt('groups.all')} <span>{hub.rows.length}</span>
          </button>
          {HUB_GROUPS.filter((g) => counts[g]).map((g) => (
            <button type="button" key={g} className={group === g ? 'on' : ''} onClick={() => setGroup(g)}>
              {tt(`groups.${g}`)} <span>{counts[g]}</span>
            </button>
          ))}
        </nav>
        <div className="rh-main">
          <label className="rh-search">
            <Icon name="search" size={16} />
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={tt('search')} aria-label={tt('search')} />
          </label>
          {onlySample ? (
            <div className="rh-filter">
              {tt('strip.showingSample')}{' '}
              <button type="button" className="rl-link" onClick={() => setOnlySample(false)}>
                {tt('strip.showAll')}
              </button>
            </div>
          ) : null}
          {HUB_GROUPS.map((g) => {
            const list = rows.filter((r) => r.group === g);
            if (!list.length) return null;
            return (
              <section key={g} className="rh-grp" aria-labelledby={`rh-g-${g}`}>
                <h2 id={`rh-g-${g}`}>{tt(`groups.${g}`)}</h2>
                {list.map((r) => {
                  const inner = (
                    <>
                      <div className="rh-rt">
                        <b>{titleOf(r)}</b>
                        <p>{sentenceOf(r)}</p>
                      </div>
                      <div className="rh-st">
                        {pill(r)}
                        <span className="rh-go">{r.type === 'setting' ? tt('edit') : tt('open')}</span>
                      </div>
                    </>
                  );
                  if (r.type === 'setting') {
                    return (
                      <div key={r.id} className={`rh-row ${sel === r.id ? 'sel' : ''}`}>
                        <button type="button" className="rh-rr" onClick={() => open(sel === r.id ? null : r.id)} aria-expanded={sel === r.id}>
                          {inner}
                        </button>
                        {sel === r.id ? <div className="rh-inline">{editor(r)}</div> : null}
                      </div>
                    );
                  }
                  const href = r.type === 'smart' ? `/admin/rules/smart?rule=${r.ruleId}` : (r as HubLinkRowView).href;
                  return (
                    <div key={r.id} className="rh-row">
                      <Link className="rh-rr" href={href}>
                        {inner}
                      </Link>
                    </div>
                  );
                })}
              </section>
            );
          })}
          {!rows.length ? <p className="ad-intro">{tt('noMatch')}</p> : null}
        </div>
        <aside className="rh-side" aria-live="polite">
          {selRow ? editor(selRow) : <p className="rh-hint">{tt('pickOne')}</p>}
        </aside>
      </div>
    </div>
  );

  function titleOfId(id: string | null): string {
    const r = hub.rows.find((x) => x.id === id);
    return r ? titleOf(r) : (id ?? '');
  }

  function editor(r: HubSettingRowView): ReactNode {
    return (
      <HubEditor
        key={`${r.id}-${r.version}`}
        row={r}
        tt={tt}
        d={d}
        lang={lang}
        env={env}
        roles={props.roles}
        canWrite={perms.write}
        canApprove={perms.approve}
        busy={busy}
        setBusy={setBusy}
        show={show}
        titleText={titleOf(r)}
        onClose={() => open(null)}
        onSaved={async () => {
          await reload();
        }}
      />
    );
  }
}

interface EditorProps {
  row: HubSettingRowView;
  tt: (k: string, vars?: Record<string, string | number>) => string;
  d: Dict;
  lang: Lang;
  env: Pick<RulesEnv, 'ctx'>;
  roles: HubRole[];
  canWrite: boolean;
  canApprove: boolean;
  busy: boolean;
  setBusy: (b: boolean) => void;
  show: (f: HubField, v: unknown, rowId: string) => string;
  titleText: string;
  onClose: () => void;
  onSaved: SavedFn;
}

function HubEditor({ row, tt, d, env, roles, canWrite, canApprove, busy, setBusy, show, titleText, onClose, onSaved }: EditorProps) {
  const currency = env.ctx.currency;
  const [vals, setVals] = useState<Record<string, unknown>>(() => Object.fromEntries(row.fields.map((f) => [f.path, getPath(row.value, f.path)])));
  const [pin, setPin] = useState('');
  const [typed, setTyped] = useState<Record<string, string>>({});
  const changed = row.fields.filter((f) => JSON.stringify(vals[f.path] ?? null) !== JSON.stringify(getPath(row.value, f.path) ?? null));
  const blocked = row.money && !canApprove;
  const set = (path: string, v: unknown) => setVals((x) => ({ ...x, [path]: v }));

  const send = async (url: string, method: 'PUT' | 'POST', payload: Record<string, unknown>, done: string) => {
    setBusy(true);
    const a = await call(method, url, payload);
    setBusy(false);
    if (a.status !== 200) return sayBad(rulesRefusal(d, a.data.error, a.data.details ?? []));
    say(tt(done));
    setPin('');
    await onSaved();
  };
  const save = () => {
    const values: Record<string, unknown> = {};
    for (const f of changed) values[f.path] = vals[f.path];
    void send(`${API}/${row.id}`, 'PUT', { version: row.version, values, ...(row.money ? { pin } : {}) }, 'saved');
  };
  const back = () => {
    if (!window.confirm(tt('backConfirm'))) return;
    void send(`${API}/${row.id}/reset`, 'POST', { version: row.version, ...(row.money ? { pin } : {}) }, 'savedBack');
  };

  const number = (f: HubField) => {
    const k = f.path;
    const isMoney = f.type === 'money';
    const text = typed[k] ?? (isMoney ? moneyToInput(vals[k], currency) : vals[k] === null || vals[k] === undefined ? '' : String(vals[k]));
    return (
      <input
        id={`rh-f-${row.id}-${key(k)}`}
        className="ad-input"
        inputMode={isMoney ? 'decimal' : 'numeric'}
        value={text}
        aria-describedby={f.nullable ? `rh-n-${row.id}-${key(k)}` : undefined}
        onChange={(e) => {
          const s = e.target.value;
          setTyped((x) => ({ ...x, [k]: s }));
          const n = isMoney ? moneyFromInput(s, currency) : numberFromInput(s);
          if (n === null) set(k, f.nullable ? null : (vals[k] ?? 0));
          else if (!Number.isNaN(n)) set(k, n);
        }}
      />
    );
  };

  const control = (f: HubField): ReactNode => {
    const label = tt(`fields.${row.id}.${key(f.path)}`);
    const id = `rh-f-${row.id}-${key(f.path)}`;
    if (f.type === 'bool')
      return (
        <label className="rh-sw" key={f.path}>
          <input type="checkbox" checked={vals[f.path] === true} onChange={(e) => set(f.path, e.target.checked)} disabled={!canWrite || blocked} /> <span>{label}</span>
        </label>
      );
    if (f.type === 'choice')
      return (
        <div key={f.path}>
          <label className="ad-label" htmlFor={id}>
            {label}
          </label>
          <select
            id={id}
            className="ad-input"
            value={String(vals[f.path] ?? '')}
            onChange={(e) => set(f.path, typeof f.options?.[0] === 'number' ? Number(e.target.value) : e.target.value)}
            disabled={!canWrite || blocked}
          >
            {f.options?.map((o) => (
              <option key={String(o)} value={String(o)}>
                {show(f, o, row.id)}
              </option>
            ))}
          </select>
        </div>
      );
    if (f.type === 'text')
      return (
        <div key={f.path}>
          <label className="ad-label" htmlFor={id}>
            {label}
          </label>
          <input id={id} className="ad-input" maxLength={f.max} value={String(vals[f.path] ?? '')} onChange={(e) => set(f.path, e.target.value)} disabled={!canWrite} />
        </div>
      );
    if (f.type === 'roster') {
      const list = (Array.isArray(vals[f.path]) ? vals[f.path] : []) as { name: string; task: string; from: string; to: string }[];
      const upd = (i: number, patch: Partial<{ name: string; task: string; from: string; to: string }>) =>
        set(
          f.path,
          list.map((x, j) => (j === i ? { ...x, ...patch } : x)),
        );
      return (
        <fieldset key={f.path} className="rh-roster">
          <legend className="ad-label">{label}</legend>
          {list.map((x, i) => (
            <div className="rh-rrow" key={i}>
              <input className="ad-input" aria-label={tt('roster.name')} placeholder={tt('roster.name')} value={x.name} maxLength={80} onChange={(e) => upd(i, { name: e.target.value })} />
              <input className="ad-input" aria-label={tt('roster.task')} placeholder={tt('roster.task')} value={x.task} maxLength={80} onChange={(e) => upd(i, { task: e.target.value })} />
              <input className="ad-input" type="date" aria-label={tt('roster.from')} value={x.from} onChange={(e) => upd(i, { from: e.target.value })} />
              <input className="ad-input" type="date" aria-label={tt('roster.to')} value={x.to} onChange={(e) => upd(i, { to: e.target.value })} />
              <button
                type="button"
                className="rl-link"
                onClick={() =>
                  set(
                    f.path,
                    list.filter((_, j) => j !== i),
                  )
                }
              >
                {tt('roster.remove')}
              </button>
            </div>
          ))}
          {list.length < 60 ? (
            <button type="button" className="ad-btn ad-btn-ghost ad-btn-sm" onClick={() => set(f.path, [...list, { name: '', task: '', from: '', to: '' }])} disabled={!canWrite}>
              <Icon name="plus" size={14} /> {tt('roster.add')}
            </button>
          ) : null}
        </fieldset>
      );
    }
    if (f.type === 'roleLimits') {
      const lim = (isObj(vals[f.path]) ? vals[f.path] : {}) as Record<string, { amountMinor: number | null; percent: number | null }>;
      const put = (role: string, v: { amountMinor: number | null; percent: number | null } | null) => {
        const next = { ...lim };
        if (v === null) delete next[role];
        else next[role] = v;
        set(f.path, next);
      };
      return (
        <fieldset key={f.path} className="rh-roster">
          <legend className="ad-label">{label}</legend>
          <p className="rh-hint">{tt('roleLimits.hint')}</p>
          {roles.map((r) => {
            const v = lim[r.key];
            return (
              <div className="rh-rrow rl" key={r.key}>
                <label className="rh-sw">
                  <input type="checkbox" checked={!!v} onChange={(e) => put(r.key, e.target.checked ? EMPTY_LIMIT : null)} disabled={!canWrite || blocked} /> <span>{r.name}</span>
                </label>
                {v ? (
                  <>
                    <input
                      className="ad-input"
                      inputMode="decimal"
                      aria-label={tt('roleLimits.amount', { role: r.name })}
                      placeholder={tt('roleLimits.noLimit')}
                      value={typed[`${r.key}.a`] ?? moneyToInput(v.amountMinor, currency)}
                      onChange={(e) => {
                        setTyped((x) => ({ ...x, [`${r.key}.a`]: e.target.value }));
                        const n = moneyFromInput(e.target.value, currency);
                        if (!Number.isNaN(n)) put(r.key, { ...v, amountMinor: n });
                      }}
                    />
                    <input
                      className="ad-input"
                      inputMode="numeric"
                      aria-label={tt('roleLimits.percent', { role: r.name })}
                      placeholder={tt('roleLimits.noLimit')}
                      value={typed[`${r.key}.p`] ?? (v.percent === null ? '' : String(v.percent))}
                      onChange={(e) => {
                        setTyped((x) => ({ ...x, [`${r.key}.p`]: e.target.value }));
                        const n = numberFromInput(e.target.value);
                        if (!Number.isNaN(n)) put(r.key, { ...v, percent: n });
                      }}
                    />
                  </>
                ) : null}
              </div>
            );
          })}
        </fieldset>
      );
    }
    return (
      <div key={f.path}>
        <label className="ad-label" htmlFor={id}>
          {label}
        </label>
        {number(f)}
        {f.nullable ? (
          <div className="rh-hint" id={`rh-n-${row.id}-${key(f.path)}`}>
            {tt('emptyMeansOff')}
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <section className="rh-card" data-rule={row.id}>
      <div className="rh-cardhd">
        <h3>{titleText}</h3>
        <button type="button" className="ad-btn ad-btn-ghost ad-btn-sm" onClick={onClose} aria-label={tt('close')}>
          <Icon name="close" size={14} />
        </button>
      </div>
      {row.pill === 'sample' ? <div className="ad-note warn">{tt('sampleNote')}</div> : null}
      {row.money ? <div className="ad-note">{tt('moneyNote')}</div> : null}
      {blocked ? <div className="ad-note warn">{tt('needsOwner')}</div> : null}
      <div className="rh-fields">{row.fields.map(control)}</div>
      <div className="rh-wc">
        <div className="rh-sub">{tt('whatChanges')}</div>
        {changed.length ? (
          <ul>
            {changed.map((f) => (
              <li key={f.path}>
                {tt(`fields.${row.id}.${key(f.path)}`)}: <s>{show(f, getPath(row.value, f.path), row.id)}</s> → <b>{show(f, vals[f.path], row.id)}</b>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rh-hint">{tt('nothingYet')}</p>
        )}
        <p className="rh-hint">{tt('appliesToNew')}</p>
      </div>
      {row.money ? (
        <div>
          <label className="ad-label" htmlFor={`rh-pin-${row.id}`}>
            {tt('pin')}
          </label>
          <input id={`rh-pin-${row.id}`} className="ad-input rh-pin" type="password" inputMode="numeric" autoComplete="off" value={pin} onChange={(e) => setPin(e.target.value)} disabled={blocked} />
        </div>
      ) : null}
      <div className="rl-actions">
        <button type="button" className="ad-btn ad-btn-primary ad-btn-sm" onClick={save} disabled={busy || !canWrite || blocked || !changed.length || (row.money && pin.trim() === '')}>
          <Icon name="check" size={15} /> {row.money ? tt('savePin') : tt('save')}
        </button>
        <button type="button" className="ad-btn ad-btn-ghost ad-btn-sm" onClick={onClose}>
          {tt('cancel')}
        </button>
      </div>
      <details className="rh-more">
        <summary>{tt('more.title')}</summary>
        <div className="rh-moreb">
          <button type="button" className="ad-btn ad-btn-ghost ad-btn-sm" onClick={back} disabled={busy || !canWrite || blocked || row.isDefault || (row.money && pin.trim() === '')}>
            <Icon name="sync" size={14} /> {tt('more.back')}
          </button>
          {row.more ? (
            <Link className="rl-link" href={row.more}>
              {tt('more.fuller')}
            </Link>
          ) : null}
        </div>
      </details>
    </section>
  );
}
