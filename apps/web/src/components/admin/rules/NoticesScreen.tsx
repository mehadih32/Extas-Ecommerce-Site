'use client';
// S10 · PR 216 — Notices & pop-ups: the announcement bar, banners, notes on a page and pop-ups, each with where it shows,
// when a pop-up opens and how often, the rule it belongs to, and its text with a live "Customers see:" line (the text
// quotes rules by token, so a number is never written twice). Built like the Smart Rules screen: the list, and the
// editor beside it on a desktop or under the tapped card on a phone. A new notice is always off; switching one on
// checks the pop-up rules (never on arrival, a limit on how often) and that every quoted value is set.
import { useState, type ReactNode } from 'react';
import type { NoticeView } from '@extas/rules';
import { checkNotice, noticeInputSchema, render, ruleLookup, type NoticeLimits, type Rule } from '@extas/rules/pure';
import { call } from '../api';
import { Icon } from '../Icon';
import { useToast } from '../products/useToast';
import { t, type Dict } from '@/lib/i18n';
import { RULES_API } from './RuleSheets';
import { langCtx, nameIn, othersMap, rulesRefusal, type Lang, type PlaceOption, type RulesEnv } from './model';
import { blankNotice, formOf, inputOf, NOTICE_POSITIONS, type NoticeForm } from './notice-form';
import type { Perms } from './RuleEditor';

export interface NoticeRuleOption {
  id: string;
  key: string;
  nameEn: string;
  nameBn: string | null;
  params: Rule['params'];
}

export interface NoticesScreenProps {
  dict: Dict;
  lang: Lang;
  timeZone: string;
  env: RulesEnv;
  notices: NoticeView[];
  rules: NoticeRuleOption[];
  places: PlaceOption[];
  limits: NoticeLimits;
  perms: Perms;
  /** The Rules pages' tabs (desktop), drawn under the head. */
  tabs?: ReactNode;
}

const NEW = 'new';
const KINDS = ['bar', 'banner', 'inline', 'popup'] as const;
const TRIGGERS = ['time', 'scroll', 'exit', 'click'] as const;
const CAPS = ['visit', 'day', 'week', 'ever'] as const;

export function NoticesScreen(props: NoticesScreenProps) {
  const { dict: d, lang, env, timeZone, perms } = props;
  const tt = (k: string, vars?: Record<string, string | number>) => t(d, `rules.notices.${k}`, vars);
  const [list, setList] = useState(props.notices);
  const [fromServer, setFromServer] = useState(props.notices);
  if (fromServer !== props.notices) {
    setFromServer(props.notices);
    setList(props.notices);
  }
  const [sel, setSel] = useState<string | null>(props.notices[0]?.id ?? null);
  const [selM, setSelM] = useState<string | null>(null);
  const [forms, setForms] = useState<Record<string, NoticeForm>>({});
  const [archivedOn, setArchivedOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, say] = useToast();

  const formFor = (id: string): NoticeForm => {
    if (forms[id]) return forms[id];
    const n = list.find((x) => x.id === id);
    return n ? formOf(n, timeZone) : blankNotice();
  };
  const patch = (id: string, p: Partial<NoticeForm>) => setForms((f) => ({ ...f, [id]: { ...formFor(id), ...p } }));
  const put = (n: NoticeView) => setList((l) => (l.some((x) => x.id === n.id) ? l.map((x) => (x.id === n.id ? n : x)) : [n, ...l]));
  const fail = (a: { data: { error?: string; details?: string[] } }) => {
    const codes = (a.data.details ?? []).map((c) => t(d, `rules.notices.issues.${c}`)).filter((s) => !s.startsWith('rules.'));
    say(a.data.error === 'NOTICE_INVALID' && codes.length ? codes.join(' ') : rulesRefusal(d, a.data.error, a.data.details ?? []));
  };

  const live = (text: string, ruleId: string) => {
    const owner = props.rules.find((r) => r.id === ruleId);
    return render(text, ruleLookup(owner ?? { params: [] }, { others: othersMap(env) }), langCtx(env.ctx, lang)).text;
  };

  const save = async (id: string) => {
    const f = formFor(id);
    const body = inputOf(f, env.ctx.timeZone);
    setBusy(true);
    const n = list.find((x) => x.id === id);
    const a = id === NEW ? await call('POST', `${RULES_API}/notices`, body) : await call('PUT', `${RULES_API}/notices/${id}`, { notice: body, version: n?.version });
    setBusy(false);
    if ((a.status !== 200 && a.status !== 201) || !a.data.notice) return fail(a);
    const v = a.data.notice as NoticeView;
    put(v);
    setForms((x) => {
      const { [id]: _a, [v.id]: _b, ...rest } = x;
      return rest;
    });
    if (id === NEW) {
      setSel(v.id);
      setSelM(v.id);
    }
    say(tt(id === NEW ? 'created' : 'saved'));
  };

  const post = async (id: string, body: Record<string, unknown>, ok: string) => {
    setBusy(true);
    const a = await call('POST', `${RULES_API}/notices/${id}`, body);
    setBusy(false);
    if (a.status !== 200 || !a.data.notice) return fail(a);
    put(a.data.notice as NoticeView);
    say(tt(ok));
  };

  const shown = list.filter((n) => n.archived === archivedOn);

  const editor = (id: string, sfx: 'd' | 'm') => {
    const n = list.find((x) => x.id === id);
    const f = formFor(id);
    const idp = `nt-${sfx}-${id}`;
    const canEdit = perms.write && !(n?.archived ?? false) && (!n?.enabled || perms.publish);
    const parsed = noticeInputSchema.safeParse(inputOf(f, env.ctx.timeZone));
    const issues = parsed.success ? checkNotice(parsed.data, props.limits) : [];
    const popup = f.kind === 'popup';
    const text = lang === 'bn' && f.contentBn.trim() ? f.contentBn : f.contentEn;
    const title = lang === 'bn' && f.titleBn.trim() ? f.titleBn : f.titleEn;
    const dirty = !!forms[id];
    const field = (k: keyof NoticeForm, label: string, opts: { area?: boolean; type?: string; hint?: string; max?: number } = {}) => (
      <div className={opts.area ? 'rl-wide' : undefined}>
        <label className="ad-label" htmlFor={`${idp}-${k}`}>
          {label}
          {opts.hint ? <span className="opt"> · {opts.hint}</span> : null}
        </label>
        {opts.area ? (
          <textarea id={`${idp}-${k}`} className="ad-input rl-area" rows={3} maxLength={opts.max} value={String(f[k])} onChange={(e) => patch(id, { [k]: e.target.value })} />
        ) : (
          <input id={`${idp}-${k}`} className="ad-input" type={opts.type ?? 'text'} maxLength={opts.max} value={String(f[k])} onChange={(e) => patch(id, { [k]: e.target.value })} />
        )}
      </div>
    );
    return (
      <div className={`rl-ed rl-ed-${sfx}`}>
        <div className="rl-ed-hd">
          <div className="rl-ed-title">
            <div className="rl-tags">
              <span className="rl-tag plain">{tt(`kinds.${f.kind}`)}</span>
              {n ? <span className={`rl-tag${n.enabled ? '' : ' warn'}`}>{n.enabled ? tt('on') : tt('off')}</span> : null}
              {dirty ? <span className="rl-tag gold">{t(d, 'rules.tags.unsaved')}</span> : null}
            </div>
            <h2 className="rl-h2">{(lang === 'bn' && f.nameBn) || f.nameEn || tt('new')}</h2>
          </div>
        </div>
        <fieldset className="rl-fs" disabled={!canEdit}>
          <div className="rl-sec rl-sets">
            {id === NEW ? field('key', tt('fields.key'), { hint: tt('fields.keyHelp'), max: 60 }) : null}
            <div>
              <label className="ad-label" htmlFor={`${idp}-kind`}>
                {tt('fields.kind')}
              </label>
              <select id={`${idp}-kind`} className="ad-input" value={f.kind} onChange={(e) => patch(id, { kind: e.target.value as NoticeForm['kind'] })}>
                {KINDS.map((k) => (
                  <option key={k} value={k}>
                    {tt(`kinds.${k}`)}
                  </option>
                ))}
              </select>
            </div>
            {field('nameEn', tt('fields.name'), { max: 120 })}
            {field('titleEn', tt('fields.titleEn'), { hint: tt('fields.optional'), max: 120 })}
            {field('titleBn', tt('fields.titleBn'), { hint: tt('fields.optional'), max: 120 })}
            {field('contentEn', tt('fields.contentEn'), { area: true, max: 600 })}
            {field('contentBn', tt('fields.contentBn'), { area: true, max: 600 })}
            <div className="rl-wide">
              <div className="ad-label">{tt('customersSee')}</div>
              <div className="rl-nt-prev">
                {title ? <b>{live(title, f.ruleId)}</b> : null}
                {text ? live(text, f.ruleId) : <span className="ad-mini">{t(d, 'rules.editor.notWritten')}</span>}
                {f.ctaLabelEn && f.ctaHref ? <span className="rl-nt-cta">{lang === 'bn' && f.ctaLabelBn ? f.ctaLabelBn : f.ctaLabelEn}</span> : null}
              </div>
            </div>
            {field('ctaLabelEn', tt('fields.ctaLabelEn'), { hint: tt('fields.optional'), max: 40 })}
            {field('ctaLabelBn', tt('fields.ctaLabelBn'), { hint: tt('fields.optional'), max: 40 })}
            <div className="rl-wide">{field('ctaHref', tt('fields.ctaHref'), { max: 300 })}</div>
          </div>

          <div className="rl-sec">
            <div className="ad-label">{tt('fields.pages')}</div>
            <div className="rl-checks">
              <label className="rl-check">
                <input type="checkbox" checked={f.pages.includes('all')} onChange={(e) => patch(id, { pages: e.target.checked ? ['all'] : [] })} /> {tt('fields.allPages')}
              </label>
              {props.places.map((p) => (
                <label key={p.key} className="rl-check">
                  <input
                    type="checkbox"
                    disabled={f.pages.includes('all')}
                    checked={f.pages.includes(p.key)}
                    onChange={(e) => patch(id, { pages: e.target.checked ? [...f.pages.filter((x) => x !== 'all'), p.key] : f.pages.filter((x) => x !== p.key) })}
                  />{' '}
                  {lang === 'bn' ? p.bn : p.en}
                </label>
              ))}
            </div>
          </div>

          <div className="rl-sec rl-sets">
            <div>
              <label className="ad-label" htmlFor={`${idp}-pos`}>
                {tt('fields.position')}
              </label>
              <select id={`${idp}-pos`} className="ad-input" value={f.position} onChange={(e) => patch(id, { position: e.target.value as NoticeForm['position'] })}>
                {NOTICE_POSITIONS.map((p) => (
                  <option key={p || 'none'} value={p}>
                    {tt(`positions.${p || 'none'}`)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="ad-label" htmlFor={`${idp}-rule`}>
                {tt('fields.rule')}
              </label>
              <select id={`${idp}-rule`} className="ad-input" value={f.ruleId} onChange={(e) => patch(id, { ruleId: e.target.value })}>
                <option value="">{tt('fields.noRule')}</option>
                {props.rules.map((r) => (
                  <option key={r.id} value={r.id}>
                    {nameIn(r, lang)}
                  </option>
                ))}
              </select>
            </div>
            {popup ? (
              <>
                <div>
                  <label className="ad-label" htmlFor={`${idp}-trigger`}>
                    {tt('fields.trigger')}
                  </label>
                  <select id={`${idp}-trigger`} className="ad-input" value={f.trigger} onChange={(e) => patch(id, { trigger: e.target.value as NoticeForm['trigger'] })}>
                    <option value="" />
                    {TRIGGERS.map((x) => (
                      <option key={x} value={x}>
                        {tt(`triggers.${x}`)}
                      </option>
                    ))}
                  </select>
                </div>
                {f.trigger === 'time' ? field('delay', tt('fields.delay'), { type: 'number' }) : null}
                {f.trigger === 'scroll' ? field('scroll', tt('fields.scroll'), { type: 'number' }) : null}
                {f.trigger === 'click' ? field('clickKey', tt('fields.clickKey'), { max: 40 }) : null}
                <div>
                  <label className="ad-label" htmlFor={`${idp}-cap`}>
                    {tt('fields.cap')}
                  </label>
                  <div className="rl-two">
                    <input id={`${idp}-cap`} className="ad-input" type="number" min={1} max={20} aria-label={tt('fields.capTimes')} value={f.capTimes} onChange={(e) => patch(id, { capTimes: e.target.value })} />
                    <select className="ad-input" aria-label={tt('fields.cap')} value={f.capPer} onChange={(e) => patch(id, { capPer: e.target.value as NoticeForm['capPer'] })}>
                      <option value="" />
                      {CAPS.map((x) => (
                        <option key={x} value={x}>
                          {tt(`capPer.${x}`)}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </>
            ) : null}
            {field('priority', t(d, 'rules.editor.priority'), { type: 'number' })}
            {field('startsAt', tt('fields.startsAt'), { type: 'datetime-local', hint: tt('fields.optional') })}
            {field('endsAt', tt('fields.endsAt'), { type: 'datetime-local', hint: tt('fields.optional') })}
          </div>
        </fieldset>

        {issues.length || (n && n.issues.length) ? (
          <div className="ad-note warn">
            <Icon name="info" size={16} />
            <ul className="rl-issues">
              {[...new Set([...issues, ...(dirty ? [] : (n?.issues ?? []))])].map((c) => (
                <li key={c}>{tt(`issues.${c}`)}</li>
              ))}
            </ul>
          </div>
        ) : n ? (
          <div className="ad-note">{tt('canOn')}</div>
        ) : null}

        <div className="rl-actions">
          {perms.write ? (
            <button type="button" className="ad-btn ad-btn-primary ad-btn-sm" onClick={() => void save(id)} disabled={busy || !canEdit || (!dirty && id !== NEW)}>
              <Icon name="check" size={15} />
              {id === NEW ? tt('create') : tt('save')}
            </button>
          ) : null}
          {n && perms.publish && !n.archived ? (
            <button type="button" className="ad-btn ad-btn-ghost ad-btn-sm" onClick={() => void post(id, { enabled: !n.enabled }, n.enabled ? 'switchedOff' : 'switchedOn')} disabled={busy || dirty || (!n.enabled && n.issues.length > 0)}>
              {n.enabled ? tt('switchOff') : tt('switchOn')}
            </button>
          ) : null}
          {n && perms.publish ? (
            <button type="button" className="rl-link" onClick={() => void post(id, { archived: !n.archived }, n.archived ? 'saved' : 'archived')} disabled={busy}>
              {n.archived ? tt('restore') : tt('archive')}
            </button>
          ) : null}
          {dirty ? (
            <button type="button" className="rl-link" onClick={() => setForms(({ [id]: _x, ...rest }) => rest)}>
              {t(d, 'rules.editor.discard')}
            </button>
          ) : null}
        </div>
      </div>
    );
  };

  const card = (n: NoticeView) => (
    <div key={n.id} className={`rl-card${sel === n.id ? ' on' : ''}`} id={`nt-card-${n.id}`}>
      <button
        type="button"
        className="rl-cardbtn"
        aria-expanded={selM === n.id}
        onClick={() => {
          setSel(n.id);
          setSelM((m) => (m === n.id ? null : n.id));
        }}
      >
        <span className="rl-tags">
          <span className="rl-tag plain">{tt(`kinds.${n.kind}`)}</span>
          <span className={`rl-tag${n.enabled ? '' : ' warn'}`}>{n.archived ? t(d, 'rules.status.archived') : n.enabled ? tt('on') : tt('off')}</span>
          {forms[n.id] ? <span className="rl-tag gold">{t(d, 'rules.tags.unsaved')}</span> : null}
          {n.issues.length ? <span className="rl-tag warn">{tt(`issues.${n.issues[0]}`)}</span> : null}
        </span>
        <span className="rl-h3">{nameIn(n, lang) || n.key}</span>
        <span className="rl-short">{lang === 'bn' && n.preview.bn ? n.preview.bn : n.preview.en}</span>
      </button>
      {selM === n.id ? <div className="rl-phone">{editor(n.id, 'm')}</div> : null}
    </div>
  );

  const selInView = sel && (sel === NEW || shown.some((n) => n.id === sel)) ? sel : (shown[0]?.id ?? null);

  return (
    <div className="rl">
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
              setArchivedOn(false);
              setSel(NEW);
              setSelM(NEW);
            }}
          >
            <Icon name="plus" size={15} />
            {tt('new')}
          </button>
        ) : null}
      </div>
      {props.tabs}
      <div className="ad-note ad-note-top">
        <Icon name="info" size={16} />
        <div>{tt('standing')}</div>
      </div>
      {list.some((n) => n.archived) ? (
        <div className="rl-topics">
          <button type="button" className="ad-chip rl-chip-quiet" aria-pressed={archivedOn} onClick={() => setArchivedOn((x) => !x)}>
            {archivedOn ? t(d, 'rules.hideArchived') : t(d, 'rules.showArchived')}
          </button>
        </div>
      ) : null}
      <div className="rl-grid">
        <div className="rl-list">
          {selM === NEW ? <div className="rl-card on rl-phone">{editor(NEW, 'm')}</div> : null}
          {shown.length ? shown.map(card) : <div className="ad-card rl-empty">{tt('empty')}</div>}
        </div>
        <div className="rl-desk">{selInView ? editor(selInView, 'd') : <div className="ad-card rl-empty">{tt('pick')}</div>}</div>
      </div>
      <div className="ad-toast-slot" aria-live="polite" role="status">
        {toast ? <div className="ad-toast">{toast}</div> : null}
      </div>
    </div>
  );
}
