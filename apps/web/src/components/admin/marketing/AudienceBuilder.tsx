'use client';
// S13 · PR 262 (Blueprint C6.2 point 3, demo 97u-adm2-customers.js "Segment builder") — one audience: its name and its
// conditions (each "keep" or "leave out", with the owner's days, a size or a grade where the condition needs one), the
// live count of people beside them (asked again a moment after each change; a few masked names for a person allowed to
// see customers), and its steps: Save (counts and keeps the size), Count again, Archive (asks once more), Restore.
// Saving sends the version it was read at (STALE = read again). Nothing here sends a list to an ad platform (that is
// AudiencePush). Without `marketing.audiences.write` everything is read-only.
// PR 263: a lookalike audience has no conditions — only the owner's number of days for its seed (the people delivered
// to in that window, each valued by his delivered sales); its count is the seed's.
import { useRouter } from 'next/navigation';
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { t, type Dict } from '@/lib/i18n';
import { AUDIENCE_DAYS_MAX, AUDIENCE_RULES, AUDIENCE_RULES_MAX, RULE_NEEDS, type AudienceAction, type AudienceRuleKind, type AudienceState } from '@/lib/marketing/audience-model';
import { call } from '../api';

export interface EditorAudience {
  id: string | null;
  kind: 'BUILDER' | 'LOOKALIKE';
  seedDays: number | null;
  name: string;
  state: AudienceState;
  rules: { kind: AudienceRuleKind; days: number | null; ref: string | null; exclude: boolean }[];
  countedLine: string | null;
  campaigns: number;
  version: string | null;
}
interface Draft {
  key: number;
  kind: AudienceRuleKind;
  days: string;
  ref: string;
  exclude: boolean;
}
interface Count {
  size: number;
  unavailable: string[];
  sample: { name: string | null; phone: string }[] | null;
}

const API = '/api/admin/marketing/audiences';
/** How long the count waits after the last change before asking (a typing pause, not a business number). */
const COUNT_WAIT_MS = 600; // hardcode-ok: a typing pause

/** The conditions as the API takes them, or null while one is not filled in. */
function ready(rules: Draft[]) {
  const out = [];
  for (const r of rules) {
    const need = RULE_NEEDS[r.kind];
    const d = r.days.trim();
    const n = d ? Number(d) : null;
    if (n != null && (!Number.isInteger(n) || n < 1 || n > AUDIENCE_DAYS_MAX)) return null;
    if (need.days === 'need' && n == null) return null;
    if (need.ref && !r.ref) return null;
    out.push({ kind: r.kind, days: need.days === 'none' ? null : n, ref: need.ref ? r.ref : null, exclude: r.exclude });
  }
  return out.length && out.some((r) => !r.exclude) ? out : null;
}

export function AudienceBuilder(p: { words: Dict; audience: EditorAudience; sizes: { id: string; label: string }[]; grades: { id: string; name: string }[]; canWrite: boolean; listHref: string }) {
  const id = useId();
  const router = useRouter();
  const a = (k: string, vars?: Record<string, string | number>) => t(p.words, `au.${k}`, vars);
  const au = p.audience;
  const seq = useRef(au.rules.length + 1);
  const [name, setName] = useState(au.name);
  const isLal = au.kind === 'LOOKALIKE';
  const [seed, setSeed] = useState(au.seedDays == null ? '' : String(au.seedDays));
  const [rules, setRules] = useState<Draft[]>(au.rules.length ? au.rules.map((r, i) => ({ key: i + 1, kind: r.kind, days: r.days == null ? '' : String(r.days), ref: r.ref ?? '', exclude: r.exclude })) : [{ key: 1, kind: 'ordered', days: '', ref: '', exclude: false }]);
  /** The last answer, with the conditions it was for (an answer for older conditions is not shown). */
  const [answer, setAnswer] = useState<{ key: string; count: Count | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [ask, setAsk] = useState<AudienceAction | null>(null);
  const [dirty, setDirty] = useState(!au.id);
  const [said, setSaid] = useState<{ text: string; bad: boolean } | null>(null);
  const ro = !p.canWrite || au.state === 'ARCHIVED';
  const off = ro || busy;
  const seedDays = /^\d+$/.test(seed) && Number(seed) >= 1 && Number(seed) <= AUDIENCE_DAYS_MAX ? Number(seed) : null;
  const def = useMemo(() => (isLal ? null : ready(rules)), [isLal, rules]);
  const ok = isLal ? seedDays != null : !!def;
  const defKey = isLal ? `lal:${seedDays}` : JSON.stringify(def);

  const count = answer && answer.key === defKey ? answer.count : null;
  const counting = ok && (!answer || answer.key !== defKey);

  useEffect(() => {
    if (!ok) return;
    let live = true;
    const timer = setTimeout(async () => {
      const q = isLal ? `lookalike=${encodeURIComponent(JSON.stringify({ seedDays }))}` : `definition=${encodeURIComponent(JSON.stringify({ rules: def }))}`;
      const r = await call('GET', `${API}/count?${q}`);
      if (live) setAnswer({ key: defKey, count: r.status === 200 ? (r.data.count as Count) : null });
    }, COUNT_WAIT_MS);
    return () => {
      live = false;
      clearTimeout(timer);
    };
    // the count follows the filled-in conditions only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defKey]);

  const change = (key: number, patch: Partial<Draft>) => {
    setRules((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
    setDirty(true);
    setAsk(null);
  };
  const add = () => {
    setRules((rs) => [...rs, { key: seq.current++, kind: 'ordered', days: '', ref: '', exclude: false }]);
    setDirty(true);
  };
  const remove = (key: number) => {
    setRules((rs) => rs.filter((r) => r.key !== key));
    setDirty(true);
  };

  function errText(r: { status: number; data: { error?: string; details?: string[] } }) {
    if (r.status === 0) return a('err.network');
    if (r.status === 401) return a('err.unauthorized');
    if (r.status === 403) return a('err.forbidden');
    const k = `err.${r.data.error ?? 'other'}`;
    const fields = [...new Set((r.data.details ?? []).map((f) => f.split('.').pop() ?? f))].map((f) => a(`field.${f}`)).join(', ');
    const txt = a(k, { fields });
    return txt === `au.${k}` ? a('err.other') : txt;
  }

  async function save() {
    if (!ok) return setSaid({ text: a(isLal ? 'lal.fix' : 'countFix'), bad: true });
    setBusy(true);
    setSaid(null);
    const payload = isLal ? { kind: 'LOOKALIKE', name, definition: { seedDays }, version: au.version } : { name, definition: { rules: def }, version: au.version };
    const r = await call(au.id ? 'PUT' : 'POST', au.id ? `${API}/${au.id}` : API, payload);
    setBusy(false);
    if (r.status === 200 || r.status === 201) {
      setDirty(false);
      setSaid({ text: a('saved'), bad: false });
      const nid = (r.data.audience as { id?: string } | undefined)?.id;
      if (!au.id && nid) return router.replace(`${p.listHref}/${nid}`);
      return router.refresh();
    }
    setSaid({ text: errText(r), bad: true });
    if (r.status === 409 && r.data.error === 'STALE') router.refresh();
  }

  async function step(s: AudienceAction) {
    if (dirty) return setSaid({ text: a('unsavedFirst'), bad: true });
    if (s === 'archive' && ask !== s) return setAsk(s);
    setAsk(null);
    setBusy(true);
    const r = await call('POST', `${API}/${au.id}`, { action: s, version: au.version });
    setBusy(false);
    if (r.status === 200) {
      setSaid({ text: a(`stepDone.${s}`), bad: false });
      return router.refresh();
    }
    setSaid({ text: errText(r), bad: true });
    if (r.status === 409 && r.data.error === 'STALE') router.refresh();
  }

  const fld = (key: string, label: string, el: ReactNode, help?: string) => (
    <div className="a2-fld">
      <label className="a2-lbl" htmlFor={`${id}-${key}`}>
        {label}
      </label>
      {el}
      {help ? <div className="a2-help a2-xs a2-mute">{help}</div> : null}
    </div>
  );
  const steps: AudienceAction[] = au.state === 'ARCHIVED' ? ['restore'] : ['recount', 'archive'];

  return (
    <div className="lp-grid a2-mt12">
      <div className="lp-stack">
        <section className="a2-card a2-sc" aria-labelledby={`${id}-who`} data-testid="au-who">
          <h2 className="a2-h3" id={`${id}-who`}>
            {a('who')}
          </h2>
          <p className="a2-cs">{a(isLal ? 'lal.whoSub' : 'whoSub')}</p>
          <div className="a2-mt12">{fld('nm', a('name'), <input id={`${id}-nm`} className="a2-inp" value={name} maxLength={120} disabled={off} onChange={(e) => (setName(e.target.value), setDirty(true))} data-testid="au-name" />)}</div>
          {isLal ? (
            <div className="a2-mt12">
              {fld('seed', a('lal.days'), <input id={`${id}-seed`} className="a2-inp" inputMode="numeric" value={seed} disabled={off} onChange={(e) => (setSeed(e.target.value.replace(/\D/g, '')), setDirty(true), setAsk(null))} data-testid="au-seed-days" />, a('lal.daysHelp'))}
            </div>
          ) : (
          <ol className="au-rules a2-mt12">
            {rules.map((r, i) => {
              const need = RULE_NEEDS[r.kind];
              const k = `${id}-r${r.key}`;
              return (
                <li key={r.key} className="au-rule" data-testid="au-rule">
                  <div className="a2-fld">
                    <label className="a2-lbl" htmlFor={`${k}-kind`}>
                      {a('condition', { n: i + 1 })}
                    </label>
                    <select id={`${k}-kind`} className="a2-sel" value={r.kind} disabled={off} onChange={(e) => change(r.key, { kind: e.target.value as AudienceRuleKind, ref: '', days: RULE_NEEDS[e.target.value as AudienceRuleKind].days === 'none' ? '' : r.days })} data-testid="au-kind">
                      {AUDIENCE_RULES.map((x) => (
                        <option key={x} value={x}>
                          {a(`rule.${x}`)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="au-row">
                    <div className="a2-fld">
                      <label className="a2-lbl" htmlFor={`${k}-mode`}>
                        {a('mode')}
                      </label>
                      <select id={`${k}-mode`} className="a2-sel" value={r.exclude ? 'out' : 'in'} disabled={off} onChange={(e) => change(r.key, { exclude: e.target.value === 'out' })} data-testid="au-mode">
                        <option value="in">{a('modeIn')}</option>
                        <option value="out">{a('modeOut')}</option>
                      </select>
                    </div>
                    {need.days !== 'none' ? (
                      <div className="a2-fld">
                        <label className="a2-lbl" htmlFor={`${k}-days`}>
                          {need.days === 'need' ? a('days') : a('daysAny')}
                        </label>
                        <input id={`${k}-days`} className="a2-inp" inputMode="numeric" value={r.days} disabled={off} onChange={(e) => change(r.key, { days: e.target.value.replace(/\D/g, '') })} data-testid="au-days" />
                      </div>
                    ) : null}
                    {need.ref ? (
                      <div className="a2-fld">
                        <label className="a2-lbl" htmlFor={`${k}-ref`}>
                          {a(need.ref)}
                        </label>
                        <select id={`${k}-ref`} className="a2-sel" value={r.ref} disabled={off} onChange={(e) => change(r.key, { ref: e.target.value })} data-testid="au-ref">
                          <option value="">{a('pick')}</option>
                          {(need.ref === 'size' ? p.sizes.map((x) => ({ id: x.id, name: x.label })) : p.grades).map((x) => (
                            <option key={x.id} value={x.id}>
                              {x.name}
                            </option>
                          ))}
                        </select>
                        {(need.ref === 'size' ? p.sizes : p.grades).length ? null : <div className="a2-help a2-xs a2-mute">{a(need.ref === 'size' ? 'sizesNone' : 'gradesNone')}</div>}
                      </div>
                    ) : null}
                    {!ro && rules.length > 1 ? (
                      <button type="button" className="a2-btn au-rm" disabled={busy} onClick={() => remove(r.key)} data-testid="au-remove">
                        {a('remove')}
                      </button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ol>
          )}
          {!isLal && !ro && rules.length < AUDIENCE_RULES_MAX ? (
            <button type="button" className="a2-btn a2-mt12" disabled={busy} onClick={add} data-testid="au-add">
              {a('add')}
            </button>
          ) : null}
        </section>

        <div className="lp-acts" data-testid="au-actions">
          {!ro ? (
            <button type="button" className="a2-btn pri" disabled={busy || !name.trim()} onClick={save} data-testid="au-save">
              {busy ? a('saving') : au.id ? a('save') : a('create')}
            </button>
          ) : null}
          {p.canWrite && au.id
            ? steps.map((s) => (
                <button key={s} type="button" className={`a2-btn${ask === s ? ' pri' : ''}`} disabled={busy} onClick={() => step(s)} data-testid={`au-step-${s}`}>
                  {ask === s ? a(`stepAsk.${s}`) : a(`step.${s}`)}
                </button>
              ))
            : null}
        </div>
        {said ? (
          <p className={`a2-sm lp-said ${said.bad ? 'bk-warn' : 'a2-mute'}`} role={said.bad ? 'alert' : 'status'} data-testid="au-said">
            {said.text}
          </p>
        ) : null}
        {!p.canWrite ? <p className="a2-xs a2-mute">{a('readOnly')}</p> : null}
        {au.countedLine ? <p className="a2-xs a2-mute">{au.countedLine}</p> : null}
        {au.id ? <p className="a2-xs a2-mute">{a('usedBy', { n: au.campaigns })}</p> : null}
      </div>

      <div className="lp-stack">
        <section className="a2-card a2-sc" aria-labelledby={`${id}-count`} data-testid="au-count" aria-live="polite">
          <h2 className="a2-h3" id={`${id}-count`}>
            {a('countTitle')}
          </h2>
          {ok ? (
            <>
              <div className="au-big a2-num" data-testid="au-size">
                {count ? count.size : '…'}
              </div>
              <p className="a2-sm a2-mute">{counting ? a('counting') : a(isLal ? 'lal.countSub' : 'countSub')}</p>
              {count?.unavailable.includes('vip') ? <p className="a2-sm bk-warn">{a('vipUnset')}</p> : null}
              {count?.sample?.length ? (
                <>
                  <h3 className="a2-h4 a2-mt12">{a('sampleTitle')}</h3>
                  <ul className="au-sample" data-testid="au-sample">
                    {count.sample.map((x) => (
                      <li key={x.phone}>
                        <span>{x.name ?? a('sampleNoName')}</span>
                        <span className="a2-mono a2-xs a2-mute">{x.phone}</span>
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
            </>
          ) : (
            <p className="a2-sm a2-mute a2-mt12">{a(isLal ? 'lal.fix' : 'countFix')}</p>
          )}
        </section>
        <div className="a2-note" role="note">
          {a('note')}
        </div>
      </div>
    </div>
  );
}
