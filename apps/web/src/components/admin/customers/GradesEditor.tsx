'use client';
// S14 · PR 534 — the owner's grades on Customers › More › Customer settings (under the "Customer grading" card): each grade
// with its rule (true deliveries at least, refusals not the shop's fault at most / at least), its place in his order and
// the people holding it since the last run; add, change, archive or bring back (never deleted), and "Grade everyone
// now". Saving needs `customers.settings` (the API checks it again and audits it). Words: `cus.grade.*`.
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import type { GradeRow } from '@extas/customers';
import { cusError } from '@/lib/admin-customers/words';
import { t, type Dict } from '@/lib/i18n';
import { showToast } from '@/components/admin/lumen/Toast';

type Form = { nameEn: string; nameBn: string; minDelivered: string; maxRefused: string; minRefused: string; sortOrder: string };
const EMPTY: Form = { nameEn: '', nameBn: '', minDelivered: '0', maxRefused: '', minRefused: '0', sortOrder: '0' };
const NUMS = ['minDelivered', 'maxRefused', 'minRefused', 'sortOrder'] as const;

const formOf = (g: GradeRow): Form => ({
  nameEn: g.nameEn,
  nameBn: g.nameBn ?? '',
  minDelivered: String(g.criteria?.minDelivered ?? 0),
  maxRefused: g.criteria?.maxRefused == null ? '' : String(g.criteria.maxRefused),
  minRefused: String(g.criteria?.minRefused ?? 0),
  sortOrder: String(g.sortOrder),
});

/** The rule in words: "true deliveries at least 3 · refusals at most 0". */
export function ruleText(d: Dict, g: GradeRow): string {
  const c = g.criteria;
  if (!c) return t(d, 'cus.grade.ruleBroken');
  const refused = c.maxRefused === null ? (c.minRefused ? t(d, 'cus.grade.rule.minRefused', { n: c.minRefused }) : t(d, 'cus.grade.rule.anyRefused')) : c.minRefused ? t(d, 'cus.grade.rule.rangeRefused', { min: c.minRefused, max: c.maxRefused }) : t(d, 'cus.grade.rule.maxRefused', { n: c.maxRefused });
  return `${t(d, 'cus.grade.rule.delivered', { n: c.minDelivered })} · ${refused}`;
}

export function GradesEditor({ dict: d, grades, canWrite, enabled, lang }: { dict: Dict; grades: GradeRow[]; canWrite: boolean; enabled: boolean; lang: string }) {
  const router = useRouter();
  const uid = useId();
  const [editing, setEditing] = useState<string | null>(null); // a grade's id, 'new', or null
  const [f, setF] = useState<Form>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const g = (k: string, p?: Record<string, string | number>) => t(d, `cus.grade.${k}`, p);

  const errText = (code: string | undefined, details: string[] = []) => (code === 'NAME_TAKEN' || code === 'LIMIT_REACHED' ? g(`err.${code}`) : cusError(d, code, details.join(', ')));

  const call = async (url: string, payload: unknown, ok: (data: Record<string, unknown>) => string) => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(url, { method: 'POST', credentials: 'same-origin', cache: 'no-store', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
      const data = (await res.json().catch(() => ({ ok: false }))) as { ok?: boolean; error?: string; details?: string[] } & Record<string, unknown>;
      if (!data.ok) {
        setMsg({ ok: false, text: errText(data.error, data.details) });
        return false;
      }
      showToast({ text: ok(data), tone: 'ok' });
      router.refresh();
      return true;
    } catch {
      setMsg({ ok: false, text: cusError(d, 'network') });
      return false;
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    const bad = NUMS.filter((k) => !(k === 'maxRefused' && f[k].trim() === '') && !/^\d+$/.test(f[k].trim()));
    if (!f.nameEn.trim()) bad.unshift('nameEn' as never);
    if (bad.length) {
      setMsg({ ok: false, text: cusError(d, 'INVALID_INPUT', bad.map((k) => g(`f.${k}`)).join(', ')) });
      return;
    }
    const payload = {
      nameEn: f.nameEn.trim(),
      nameBn: f.nameBn.trim() || null,
      criteria: { minDelivered: Number(f.minDelivered), maxRefused: f.maxRefused.trim() === '' ? null : Number(f.maxRefused), minRefused: Number(f.minRefused) },
      sortOrder: Number(f.sortOrder),
    };
    if (await call(editing === 'new' ? '/api/admin/customers/grades' : `/api/admin/customers/grades/${editing}`, payload, () => g('saved'))) setEditing(null);
  };

  const field = (k: keyof Form, numeric = false) => (
    <span className="a2-stack" style={{ gap: 4 }} key={k}>
      <label className="a2-xs a2-mute" htmlFor={`${uid}-${k}`}>
        {g(`f.${k}`)}
      </label>
      <input id={`${uid}-${k}`} className="a2-inp" inputMode={numeric ? 'numeric' : undefined} maxLength={numeric ? 6 : 40} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} data-testid={`grade-f-${k}`} />
    </span>
  );

  return (
    <section className="a2-card" data-testid="grades-editor">
      <h2 className="a2-h3">{g('title')}</h2>
      <p className="a2-xs a2-mute a2-mt6">{g('sub')}</p>
      {!enabled ? <p className="a2-xs a2-mt6">{g('offNote')}</p> : null}
      <div className="a2-stack a2-mt12" style={{ gap: 8 }}>
        {grades.length === 0 ? <p className="a2-xs a2-mute">{g('none')}</p> : null}
        {grades.map((x) => (
          <div key={x.id} className="a2-gr-row" data-testid="grade-row" data-key={x.key} data-archived={x.archived ? '1' : undefined}>
            <span className="a2-stack" style={{ gap: 2 }}>
              <b className="a2-sm">
                <span className={`a2-pill ${x.archived ? 'line' : 'info'}`}>{(lang === 'bn' && x.nameBn) || x.nameEn}</span>
                {x.archived ? <span className="a2-xs a2-mute"> · {g('archived')}</span> : null}
              </b>
              <span className="a2-xs a2-mute">
                {ruleText(d, x)} · {g('order', { n: x.sortOrder })} · {g('people', { n: x.people })}
              </span>
            </span>
            {canWrite ? (
              <span className="a2-gap8">
                {!x.archived ? (
                  <button
                    type="button"
                    className="a2-btn"
                    disabled={busy}
                    onClick={() => {
                      setEditing(x.id);
                      setF(formOf(x));
                      setMsg(null);
                    }}
                  >
                    {g('edit')}
                  </button>
                ) : null}
                <button type="button" className="a2-btn" disabled={busy} onClick={() => call(`/api/admin/customers/grades/${x.id}/archive`, { archived: !x.archived }, () => g(x.archived ? 'restored' : 'archivedDone'))} data-testid="grade-archive">
                  {g(x.archived ? 'restore' : 'archive')}
                </button>
              </span>
            ) : null}
          </div>
        ))}
      </div>
      {canWrite && editing ? (
        <div className="a2-stack a2-mt12 a2-gr-form" style={{ gap: 10 }} data-testid="grade-form">
          <h3 className="a2-sm">{g(editing === 'new' ? 'newTitle' : 'editTitle')}</h3>
          {field('nameEn')}
          {field('nameBn')}
          {field('minDelivered', true)}
          {field('maxRefused', true)}
          {field('minRefused', true)}
          {field('sortOrder', true)}
          <p className="a2-xs a2-mute">{g('formNote')}</p>
          <span className="a2-gap8">
            <button type="button" className="a2-btn pri" disabled={busy} onClick={save} data-testid="grade-save">
              {busy ? t(d, 'cus.set.saving') : t(d, 'cus.set.save')}
            </button>
            <button type="button" className="a2-btn" disabled={busy} onClick={() => setEditing(null)}>
              {g('cancel')}
            </button>
          </span>
        </div>
      ) : null}
      {canWrite ? (
        <span className="a2-gap8 a2-mt12" style={{ display: 'flex', flexWrap: 'wrap' }}>
          {!editing ? (
            <button
              type="button"
              className="a2-btn"
              disabled={busy}
              onClick={() => {
                setEditing('new');
                setF(EMPTY);
                setMsg(null);
              }}
              data-testid="grade-add"
            >
              {g('add')}
            </button>
          ) : null}
          <button type="button" className="a2-btn" disabled={busy || !enabled} onClick={() => call('/api/admin/customers/grades/run', {}, (data) => { const r = data.run as { people: number; changed: number }; return g('ran', { people: r.people, changed: r.changed }); })} data-testid="grade-run">
            {g('run')}
          </button>
        </span>
      ) : (
        <p className="a2-xs a2-mute a2-mt12">{t(d, 'cus.set.readOnly')}</p>
      )}
      {msg ? (
        <p className="a2-xs a2-mt6" role={msg.ok ? 'status' : 'alert'} style={msg.ok ? undefined : { color: 'var(--bad)' }}>
          {msg.text}
        </p>
      ) : null}
    </section>
  );
}
