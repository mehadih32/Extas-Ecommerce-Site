'use client';
// S14 · PR 289 — one automation's builder (Messages › Automations › a journey): its name; what starts it (days after a
// delivered order of one category or any — the product-life reminder; days without an order; days after joining); its
// steps in order (wait days, check one condition of the segment builder, send a template on a channel), each movable and
// removable; "leave when he orders again". Saved with one POST (`messages.automations.write`; the API checks the
// templates and the conditions again). A new journey is saved off; the page's switch turns it on.
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import type { JourneyPlan, JourneyTrigger, SegmentOptions } from '@extas/customers';
import { JOURNEY_CHANNELS, JOURNEY_TRIGGERS, SEGMENT_FIELD_KEYS, SEGMENT_FIELDS, type JourneyChannel, type JourneyTriggerType, type SegmentField } from '@extas/customers/pure';
import type { Money } from '@/components/admin/products/model';
import { cusError } from '@/lib/admin-customers/words';
import { rowCondition, startValue, draftRows, type DraftRow } from '@/lib/admin-customers/segment-draft';
import { t, type Dict } from '@/lib/i18n';

type DraftStep = { kind: 'wait'; days: string } | { kind: 'check'; row: DraftRow } | { kind: 'send'; channel: JourneyChannel; template: string };

export interface JourneyBuilderProps {
  dict: Dict;
  lang: 'en' | 'bn';
  money: Money;
  id: string | null;
  version: string | null;
  name: string;
  trigger: JourneyTrigger | null;
  plan: JourneyPlan | null;
  templates: { key: string; channel: string }[];
  options: SegmentOptions;
  maxSteps: number;
  canWrite: boolean;
}

const START: JourneyPlan['steps'] = [{ kind: 'send', channel: 'SMS', template: '' }];

function draftOf(plan: JourneyPlan | null, money: Money): DraftStep[] {
  return (plan?.steps ?? START).map((s): DraftStep => (s.kind === 'wait' ? { kind: 'wait', days: String(s.days) } : s.kind === 'check' ? { kind: 'check', row: draftRows({ v: 1, all: [s.condition] }, money)[0]! } : { ...s }));
}

export function JourneyBuilder(p: JourneyBuilderProps) {
  const d = p.dict;
  const uid = useId();
  const router = useRouter();
  const [name, setName] = useState(p.name);
  const [type, setType] = useState<JourneyTriggerType>(p.trigger?.type ?? 'delivered');
  const [days, setDays] = useState(String(p.trigger?.days ?? 30)); // hardcode-ok: the builder's first suggestion; the owner types his own
  const [category, setCategory] = useState(p.trigger?.type === 'delivered' ? (p.trigger.category ?? '') : '');
  const [steps, setSteps] = useState<DraftStep[]>(() => draftOf(p.plan, p.money));
  const [exitOnOrder, setExitOnOrder] = useState(p.plan?.exitOnOrder ?? true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const nameIn = (x: { nameEn: string; nameBn: string | null }) => (p.lang === 'bn' ? x.nameBn || x.nameEn : x.nameEn);
  const x = (k: string, v?: Record<string, string>) => t(d, `cus.auto.b.${k}`, v);
  const setStep = (i: number, s: DraftStep) => setSteps((all) => all.map((o, j) => (j === i ? s : o)));
  const move = (i: number, by: -1 | 1) =>
    setSteps((all) => {
      const next = [...all];
      const [s] = next.splice(i, 1);
      next.splice(i + by, 0, s!);
      return next;
    });
  const keysFor = (ch: string) => p.templates.filter((tp) => tp.channel === ch).map((tp) => tp.key);

  const save = async () => {
    const bad: string[] = [];
    const out = steps.map((s, i) => {
      if (s.kind === 'wait') {
        if (!/^\d+$/.test(s.days.trim()) || Number(s.days) < 1) bad.push(x('stepN', { n: String(i + 1) }));
        return { kind: 'wait', days: Number(s.days) };
      }
      if (s.kind === 'check') {
        const c = rowCondition(s.row, p.money);
        if (!c || c === 'bad') bad.push(x('stepN', { n: String(i + 1) }));
        return { kind: 'check', condition: c };
      }
      if (!s.template) bad.push(x('stepN', { n: String(i + 1) }));
      return s;
    });
    if (!/^\d+$/.test(days.trim())) bad.push(x('days'));
    if (bad.length) {
      setMsg({ ok: false, text: cusError(d, 'INVALID_INPUT', bad.join(', ')) });
      return;
    }
    const trigger = type === 'delivered' ? { type, days: Number(days), category: category || null } : { type, days: Number(days) };
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/admin/messages/automations${p.id ? `/${p.id}` : ''}`, {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), trigger, plan: { v: 1, steps: out, exitOnOrder }, ...(p.version ? { version: p.version } : {}) }),
      });
      const data = (await res.json().catch(() => ({ ok: false }))) as { ok?: boolean; error?: string; details?: string[]; editor?: { journey: { id: string } } };
      if (!data.ok) {
        setMsg({ ok: false, text: cusError(d, data.error, (data.details ?? []).join(', ')) });
        return;
      }
      setMsg({ ok: true, text: x('saved') });
      if (!p.id && data.editor) router.push(`/admin/messages/automations/${data.editor.journey.id}`);
      else router.refresh();
    } catch {
      setMsg({ ok: false, text: cusError(d, 'network') });
    } finally {
      setBusy(false);
    }
  };

  const valueInput = (s: Extract<DraftStep, { kind: 'check' }>, i: number) => {
    const kind = SEGMENT_FIELDS[s.row.field];
    const common = { 'aria-label': t(d, 'cus.seg.b.value'), value: s.row.value, disabled: !p.canWrite, onChange: (e: { target: { value: string } }) => setStep(i, { kind: 'check', row: { ...s.row, value: e.target.value } }) };
    const select = (opts: { value: string; label: string }[]) => (
      <select className="a2-sel" {...common}>
        <option value="">{t(d, 'cus.seg.b.pick')}</option>
        {opts.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    );
    if (kind === 'category') return select(p.options.categories.map((c) => ({ value: c.id, label: nameIn(c) })));
    if (kind === 'area') return select(p.options.areas.map((a) => ({ value: a.id, label: nameIn(a) })));
    if (kind === 'source') return select(p.options.sources.map((v) => ({ value: v, label: v })));
    if (kind === 'consent') return select((['sms', 'whatsapp', 'none'] as const).map((c) => ({ value: c, label: t(d, `cus.seg.consent.${c}`) })));
    if (kind === 'yesno') return select([{ value: 'true', label: t(d, 'cus.seg.yes') }, { value: 'false', label: t(d, 'cus.seg.no') }]);
    return <input className="a2-inp" {...common} inputMode={kind === 'size' ? 'text' : 'numeric'} placeholder={kind === 'size' ? '' : t(d, `cus.seg.unit.${kind}`)} maxLength={14} />;
  };

  return (
    <section className="a2-card a2-mt12" data-testid="auto-builder">
      <label className="a2-lbl" htmlFor={`${uid}-name`}>
        {x('name')}
      </label>
      <input id={`${uid}-name`} className="a2-inp" value={name} maxLength={80} disabled={!p.canWrite} onChange={(e) => setName(e.target.value)} placeholder={x('namePh')} data-testid="auto-name" />
      <div className="a2-hr" />
      <div className="a2-h4">{x('when')}</div>
      <div className="auto-line a2-mt6">
        <select className="a2-sel" aria-label={x('when')} value={type} disabled={!p.canWrite} onChange={(e) => setType(e.target.value as JourneyTriggerType)} data-testid="auto-trigger">
          {JOURNEY_TRIGGERS.map((k) => (
            <option key={k} value={k}>
              {t(d, `cus.auto.trigger.${k}`)}
            </option>
          ))}
        </select>
        <input className="a2-inp" aria-label={x('days')} inputMode="numeric" value={days} maxLength={4} disabled={!p.canWrite} onChange={(e) => setDays(e.target.value)} data-testid="auto-days" />
        <span className="a2-sm a2-mute">{x('daysAfter')}</span>
        {type === 'delivered' ? (
          <select className="a2-sel" aria-label={x('category')} value={category} disabled={!p.canWrite} onChange={(e) => setCategory(e.target.value)} data-testid="auto-category">
            <option value="">{x('anyCategory')}</option>
            {p.options.categories.map((c) => (
              <option key={c.id} value={c.id}>
                {nameIn(c)}
              </option>
            ))}
          </select>
        ) : null}
      </div>
      <p className="a2-xs a2-mute a2-mt6">{t(d, `cus.auto.triggerHelp.${type}`)}</p>
      <div className="a2-hr" />
      <div className="a2-h4">{x('steps')}</div>
      <ol className="auto-steps a2-mt6" data-testid="auto-steps">
        {steps.map((s, i) => (
          <li key={i} className="auto-step" data-testid="auto-step" data-kind={s.kind}>
            <span className="auto-num">{i + 1}</span>
            <select
              className="a2-sel"
              aria-label={x('kind')}
              value={s.kind}
              disabled={!p.canWrite}
              onChange={(e) => {
                const k = e.target.value as DraftStep['kind'];
                setStep(i, k === 'wait' ? { kind: 'wait', days: '7' } : k === 'check' ? { kind: 'check', row: { field: 'ordersMax', value: startValue('ordersMax') } } : { kind: 'send', channel: 'SMS', template: '' });
              }}
            >
              {(['wait', 'check', 'send'] as const).map((k) => (
                <option key={k} value={k}>
                  {t(d, `cus.auto.kind.${k}`)}
                </option>
              ))}
            </select>
            {s.kind === 'wait' ? (
              <>
                <input className="a2-inp" aria-label={x('days')} inputMode="numeric" value={s.days} maxLength={3} disabled={!p.canWrite} onChange={(e) => setStep(i, { kind: 'wait', days: e.target.value })} />
                <span className="a2-sm a2-mute">{x('daysWord')}</span>
              </>
            ) : s.kind === 'check' ? (
              <>
                <select className="a2-sel" aria-label={t(d, 'cus.seg.b.field')} value={s.row.field} disabled={!p.canWrite} onChange={(e) => setStep(i, { kind: 'check', row: { field: e.target.value as SegmentField, value: startValue(e.target.value as SegmentField) } })}>
                  {SEGMENT_FIELD_KEYS.map((f) => (
                    <option key={f} value={f}>
                      {t(d, `cus.seg.field.${f}`)}
                    </option>
                  ))}
                </select>
                {valueInput(s, i)}
              </>
            ) : (
              <>
                <select className="a2-sel" aria-label={x('channel')} value={s.channel} disabled={!p.canWrite} onChange={(e) => setStep(i, { ...s, channel: e.target.value as JourneyChannel, template: '' })}>
                  {JOURNEY_CHANNELS.map((c) => (
                    <option key={c} value={c}>
                      {t(d, `cus.auto.channel.${c}`)}
                    </option>
                  ))}
                </select>
                <select className="a2-sel" aria-label={x('template')} value={s.template} disabled={!p.canWrite} onChange={(e) => setStep(i, { ...s, template: e.target.value })} data-testid="auto-template">
                  <option value="">{keysFor(s.channel).length ? x('pickTemplate') : x('noTemplates')}</option>
                  {keysFor(s.channel).map((k) => (
                    <option key={k} value={k}>
                      {k}
                    </option>
                  ))}
                </select>
              </>
            )}
            {p.canWrite ? (
              <span className="auto-tools">
                <button type="button" className="a2-icb" aria-label={x('up')} title={x('up')} disabled={i === 0} onClick={() => move(i, -1)}>
                  ↑
                </button>
                <button type="button" className="a2-icb" aria-label={x('down')} title={x('down')} disabled={i === steps.length - 1} onClick={() => move(i, 1)}>
                  ↓
                </button>
                <button type="button" className="a2-icb" aria-label={x('remove')} title={x('remove')} disabled={steps.length === 1} onClick={() => setSteps((all) => all.filter((_, j) => j !== i))}>
                  ×
                </button>
              </span>
            ) : null}
          </li>
        ))}
      </ol>
      {p.canWrite ? (
        <span className="a2-gap8 a2-mt12">
          {(['wait', 'check', 'send'] as const).map((k) => (
            <button
              key={k}
              type="button"
              className="a2-btn sm"
              disabled={steps.length >= p.maxSteps}
              onClick={() => setSteps((all) => [...all, k === 'wait' ? { kind: 'wait', days: '7' } : k === 'check' ? { kind: 'check', row: { field: 'ordersMax', value: '1' } } : { kind: 'send', channel: 'SMS', template: '' }])}
              data-testid={`auto-add-${k}`}
            >
              {t(d, `cus.auto.add.${k}`)}
            </button>
          ))}
        </span>
      ) : null}
      {steps.length >= p.maxSteps ? <p className="a2-xs a2-mute a2-mt6">{x('most', { n: String(p.maxSteps) })}</p> : null}
      <label className="a2-ckb a2-mt12">
        <input type="checkbox" checked={exitOnOrder} disabled={!p.canWrite} onChange={(e) => setExitOnOrder(e.target.checked)} data-testid="auto-exit" />
        <span>{x('exitOnOrder')}</span>
      </label>
      <p className="a2-xs a2-mute a2-mt6">{x('offerNote')}</p>
      <div className="a2-hr" />
      {p.canWrite ? (
        <button type="button" className="a2-btn pri" onClick={save} disabled={busy} data-testid="auto-save">
          {busy ? x('saving') : x('save')}
        </button>
      ) : (
        <p className="a2-xs a2-mute">{x('readOnly')}</p>
      )}
      {msg ? (
        <p className="a2-xs a2-mt6" role={msg.ok ? 'status' : 'alert'} style={msg.ok ? undefined : { color: 'var(--bad)' }}>
          {msg.text}
        </p>
      ) : null}
    </section>
  );
}
