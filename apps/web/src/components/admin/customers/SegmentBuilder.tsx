'use client';
// S14 · PR 287 — the segment builder (CUS-03a; demo V12.4 #/admin/customers/segments/:id): the name, the conditions
// joined with "and" (a field and its value, each with its own picker), the live count with the first people beside it
// (asked again a moment after each change; numbers as this person may see them), and Save. A person without
// `customers.segments.write` sees the same builder to try conditions, with Save disabled; the API checks the key again.
// Every refusal is shown in the page's words (`cus.err.<code>`).
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { SegmentOptions, SegmentPreview } from '@extas/customers';
import { SEGMENT_FIELD_KEYS, SEGMENT_FIELDS, type SegmentField } from '@extas/customers/pure';
import { formatMoney, formatNumber, type Money } from '@/components/admin/products/model';
import { cusError } from '@/lib/admin-customers/words';
import { draftDefinition, rowCondition, startValue, type DraftRow } from '@/lib/admin-customers/segment-draft';
import { t, type Dict } from '@/lib/i18n';

export interface SegmentBuilderProps {
  dict: Dict;
  lang: 'bn' | 'en';
  locale: string;
  money: Money;
  /** null: a new segment. */
  id: string | null;
  version: string | null;
  name: string;
  rows: DraftRow[];
  options: SegmentOptions;
  canWrite: boolean;
  maxConditions: number;
}

const DELAY_MS = 400;

export function SegmentBuilder(p: SegmentBuilderProps) {
  const { dict: d, money } = p;
  const router = useRouter();
  const uid = useId();
  const [name, setName] = useState(p.name);
  const [rows, setRows] = useState<DraftRow[]>(p.rows.length ? p.rows : [{ field: 'ordersMin', value: '' }]);
  const [preview, setPreview] = useState<SegmentPreview | null>(null);
  const [counting, setCounting] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const def = useMemo(() => draftDefinition(rows, money), [rows, money]);
  const key = JSON.stringify(def);
  const ask = useRef(0);
  const n = (x: number) => formatNumber(x, p.locale);
  const nameIn = (o: { nameEn: string; nameBn: string | null }) => (p.lang === 'bn' && o.nameBn ? o.nameBn : o.nameEn);

  useEffect(() => {
    const mine = ++ask.current;
    setCounting(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch('/api/admin/customers/segments/preview', { method: 'POST', credentials: 'same-origin', cache: 'no-store', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ definition: JSON.parse(key) }) });
        const data = (await res.json().catch(() => ({ ok: false }))) as { ok?: boolean; error?: string; preview?: SegmentPreview };
        if (mine !== ask.current) return;
        setPreview(data.ok && data.preview ? data.preview : null);
        if (!data.ok) setMsg({ ok: false, text: cusError(d, data.error) });
      } catch {
        if (mine === ask.current) setMsg({ ok: false, text: cusError(d, 'network') });
      } finally {
        if (mine === ask.current) setCounting(false);
      }
    }, DELAY_MS);
    return () => clearTimeout(timer);
  }, [key, d]);

  const setRow = (i: number, r: Partial<DraftRow>) => setRows((all) => all.map((x, j) => (j === i ? { ...x, ...r } : x)));
  const tooMany = rows.length >= p.maxConditions;

  const save = async () => {
    if (!name.trim()) {
      setMsg({ ok: false, text: t(d, 'cus.seg.b.nameNeeded') });
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(p.id ? `/api/admin/customers/segments/${p.id}` : '/api/admin/customers/segments', {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), definition: def, ...(p.id && p.version ? { version: p.version } : {}) }),
      });
      const data = (await res.json().catch(() => ({ ok: false }))) as { ok?: boolean; error?: string; details?: string[]; segment?: { segment: { id: string } } };
      if (!data.ok || !data.segment) {
        setMsg({ ok: false, text: cusError(d, data.error, (data.details ?? []).join(', ')) });
        return;
      }
      setMsg({ ok: true, text: t(d, 'cus.seg.b.saved') });
      if (p.id) router.refresh();
      else router.push(`/admin/customers/segments/${data.segment.segment.id}`);
    } catch {
      setMsg({ ok: false, text: cusError(d, 'network') });
    } finally {
      setBusy(false);
    }
  };

  const valueInput = (r: DraftRow, i: number) => {
    const kind = SEGMENT_FIELDS[r.field];
    const label = t(d, 'cus.seg.b.value');
    const common = { id: `${uid}-v${i}`, 'aria-label': label, value: r.value, onChange: (e: { target: { value: string } }) => setRow(i, { value: e.target.value }) };
    const select = (opts: { value: string; label: string }[], empty: string) => (
      <select className="a2-sel" {...common} disabled={!opts.length}>
        <option value="">{opts.length ? t(d, 'cus.seg.b.pick') : empty}</option>
        {opts.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    );
    if (kind === 'category') return select(p.options.categories.map((c) => ({ value: c.id, label: nameIn(c) })), t(d, 'cus.seg.b.noCategories'));
    if (kind === 'area') return select(p.options.areas.map((a) => ({ value: a.id, label: nameIn(a) })), t(d, 'cus.seg.b.noAreas'));
    if (kind === 'source') return select(p.options.sources.map((s) => ({ value: s, label: t(d, `orders.source.${s}`) === `orders.source.${s}` ? s : t(d, `orders.source.${s}`) })), t(d, 'cus.seg.b.noSources'));
    if (kind === 'size') return p.options.sizes.length ? select(p.options.sizes.map((s) => ({ value: s, label: s })), '') : <input className="a2-inp" {...common} maxLength={20} />;
    if (kind === 'consent')
      return (
        <select className="a2-sel" {...common}>
          {(['sms', 'whatsapp', 'none'] as const).map((c) => (
            <option key={c} value={c}>
              {t(d, `cus.seg.consent.${c}`)}
            </option>
          ))}
        </select>
      );
    if (kind === 'yesno')
      return (
        <select className="a2-sel" {...common}>
          <option value="true">{t(d, 'cus.seg.yes')}</option>
          <option value="false">{t(d, 'cus.seg.no')}</option>
        </select>
      );
    return <input className="a2-inp" {...common} inputMode="numeric" placeholder={t(d, `cus.seg.unit.${kind}`)} maxLength={14} />;
  };

  return (
    <div className="a2-row a2-r21 a2-mt12" data-testid="seg-builder">
      <section className="a2-card">
        <label className="a2-lbl" htmlFor={`${uid}-name`}>
          {t(d, 'cus.seg.b.name')}
        </label>
        <input id={`${uid}-name`} className="a2-inp" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder={t(d, 'cus.seg.b.namePh')} data-testid="seg-name" />
        <div className="a2-hr" />
        <div className="a2-h4">{t(d, 'cus.seg.b.who')}</div>
        <p className="a2-xs a2-mute a2-mt6">{t(d, 'cus.seg.b.and')}</p>
        <div className="a2-stack a2-mt12" data-testid="seg-conds">
          {rows.map((r, i) => {
            const bad = rowCondition(r, money) === 'bad';
            return (
              <div key={i} className="seg-cond" data-testid="seg-cond">
                <select className="a2-sel" aria-label={t(d, 'cus.seg.b.field')} value={r.field} onChange={(e) => setRow(i, { field: e.target.value as SegmentField, value: startValue(e.target.value as SegmentField) })}>
                  {SEGMENT_FIELD_KEYS.map((f) => (
                    <option key={f} value={f}>
                      {t(d, `cus.seg.field.${f}`)}
                    </option>
                  ))}
                </select>
                {valueInput(r, i)}
                <button type="button" className="a2-icb" aria-label={t(d, 'cus.seg.b.remove')} title={t(d, 'cus.seg.b.remove')} onClick={() => setRows((all) => all.filter((_, j) => j !== i))}>
                  ×
                </button>
                {bad ? (
                  <span className="a2-xs seg-bad" role="alert">
                    {t(d, 'cus.seg.b.bad')}
                  </span>
                ) : null}
              </div>
            );
          })}
        </div>
        <button type="button" className="a2-btn sm a2-mt12" onClick={() => setRows((all) => [...all, { field: 'salesMin', value: '' }])} disabled={tooMany} data-testid="seg-add">
          {t(d, 'cus.seg.b.add')}
        </button>
        {tooMany ? <p className="a2-xs a2-mute a2-mt6">{t(d, 'cus.seg.b.most', { n: n(p.maxConditions) })}</p> : null}
        <div className="a2-hr" />
        <div className="a2-gap8">
          <button type="button" className="a2-btn pri" onClick={save} disabled={busy || !p.canWrite} data-testid="seg-save">
            {busy ? t(d, 'cus.seg.b.saving') : t(d, 'cus.seg.b.save')}
          </button>
          {p.id ? (
            <Link className="a2-btn" href={`/admin/customers?segment=${p.id}`} data-testid="seg-open-list">
              {t(d, 'cus.seg.openList')}
            </Link>
          ) : null}
          <button type="button" className="a2-btn" disabled title={t(d, 'cus.seg.later')}>
            {t(d, 'cus.seg.campaign')}
          </button>
          <button type="button" className="a2-btn" disabled title={t(d, 'cus.seg.later')}>
            {t(d, 'cus.seg.audience')}
          </button>
        </div>
        {!p.canWrite ? <p className="a2-xs a2-mute a2-mt6">{t(d, 'cus.seg.readOnly')}</p> : null}
        {msg ? (
          <p className="a2-xs a2-mt6" role={msg.ok ? 'status' : 'alert'} style={msg.ok ? undefined : { color: 'var(--bad)' }}>
            {msg.text}
          </p>
        ) : null}
      </section>
      <section className="a2-card" aria-live="polite" data-testid="seg-count">
        <div className="seg-big">{preview ? n(preview.count) : '—'}</div>
        <div className="a2-sm a2-mute">{counting ? t(d, 'cus.seg.b.counting') : t(d, 'cus.seg.b.match')}</div>
        <div className="a2-hr" />
        {preview?.members.length ? (
          preview.members.map((m) => (
            <Link key={m.id} className="a2-prow" href={`/admin/customers/${m.id}`} data-testid="seg-member">
              <div className="a2-prt">
                <b>{m.name ?? t(d, 'cus.side.noName')}</b>
                <span>
                  {[m.phone?.text, t(d, 'cus.seg.b.memberLine', { orders: n(m.orders), sales: formatMoney(m.salesMinor, money) })].filter(Boolean).join(' · ')}
                </span>
              </div>
            </Link>
          ))
        ) : (
          <p className="a2-xs a2-mute">{preview ? t(d, 'cus.seg.b.nobody') : ''}</p>
        )}
      </section>
    </div>
  );
}
