'use client';
// PR 629 (CN-036, LUMEN-SPEC §3 item 5) — form + live preview (Add product, later Combo, Campaign, Page): the fields on
// the left; on the right a sticky "Ready to publish?" checklist and a shop preview, both following what the owner
// types. Publish stays off until every check passes; the page's API checks everything again when it is pressed
// (lib/admin-lumen/form.ts only shows what is missing). Below 1024 px the checklist and the preview sit under the
// fields. The fields, checks and preview come from the page as plain data, so any page can use the pattern; the
// values are sent to the page's own admin API (safety.ts: never another site). Publishing is not one of the guarded
// actions (money, refunds, COD, prices, discounts, blocking, deleting): a page that needs one keeps its own step.
import { useRouter } from 'next/navigation';
import { useId, useMemo, useState } from 'react';
import { ShellIcon } from '@/components/admin/shell/ShellIcon';
import { readiness, type FormCheck } from '@/lib/admin-lumen/form';
import { callAllowed, runCall, withBody, type LmCall } from '@/lib/admin-lumen/safety';
import { useLumen } from './context';
import { showToast } from './Toast';

export interface FormField {
  name: string;
  label: string;
  kind: 'text' | 'textarea' | 'number' | 'select';
  hint?: string;
  required?: boolean;
  options?: readonly { value: string; label: string }[];
  min?: number;
  max?: number;
  /** A unit after a number (৳, days, %). */
  unit?: string;
  maxLength?: number;
}

/** Which field fills which part of the shop preview card. */
export interface PreviewMap {
  title?: string;
  text?: string;
  /** A field holding an amount in whole currency units, written with `priceFormat`. */
  price?: string;
  badge?: string;
  /** A field holding an image address (only a same-site path or https is drawn). */
  image?: string;
}

export interface FormPreviewProps {
  fields: readonly FormField[];
  checks: readonly FormCheck[];
  preview: PreviewMap;
  initial?: Record<string, string>;
  /** How a price is written in the preview. */
  priceFormat?: { locale: string; currency: string };
  publish: { label: string; call: LmCall; done: string; next?: string };
  /** The preview's own heading ("In the shop"). */
  previewTitle?: string;
  testId?: string;
}

const safeImage = (v: string | undefined) => (v && (/^\/(?!\/)/.test(v) || /^https:\/\//.test(v)) ? v : null);

function priceText(v: string | undefined, f?: { locale: string; currency: string }): string | null {
  const n = Number(v);
  if (!v || !Number.isFinite(n) || !f) return v || null;
  try {
    return new Intl.NumberFormat(f.locale, { style: 'currency', currency: f.currency, currencyDisplay: 'narrowSymbol', numberingSystem: 'latn', maximumFractionDigits: 0 }).format(n);
  } catch {
    return v;
  }
}

export function FormPreview({ fields, checks, preview, initial = {}, priceFormat, publish, previewTitle, testId = 'lm-form' }: FormPreviewProps) {
  const { lt } = useLumen();
  const router = useRouter();
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const [values, setValues] = useState<Record<string, string>>(() => ({ ...initial }));
  const [busy, setBusy] = useState(false);
  const ready = useMemo(() => readiness(checks, values), [checks, values]);
  const canPublish = ready.ready && !busy && callAllowed(publish.call);
  const set = (k: string, v: string) => setValues((s) => ({ ...s, [k]: v }));

  const send = async () => {
    if (!canPublish) return;
    setBusy(true);
    const ok = await runCall(withBody(publish.call, { values }));
    setBusy(false);
    if (!ok) {
      showToast({ text: lt('failed'), tone: 'bad' });
      return;
    }
    showToast({ text: publish.done });
    if (publish.next && /^\/admin(\/|\?|$)/.test(publish.next)) router.push(publish.next);
    else router.refresh();
  };

  const img = preview.image ? safeImage(values[preview.image]) : null;
  const title = preview.title ? values[preview.title] : '';
  const price = preview.price ? priceText(values[preview.price], priceFormat) : null;

  return (
    <div className="lm-form" data-testid={testId}>
      <form
        className="lm-card lm-form-f"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
        noValidate
      >
        {fields.map((f) => {
          const id = `${uid}-${f.name}`;
          const hint = f.hint ? `${id}-h` : undefined;
          const v = values[f.name] ?? '';
          return (
            <div key={f.name} className="lm-fl">
              <label htmlFor={id}>
                {f.label}
                {f.required ? <span aria-hidden="true"> *</span> : null}
              </label>
              {f.kind === 'textarea' ? (
                <textarea id={id} className="lm-inp" rows={4} value={v} maxLength={f.maxLength} aria-describedby={hint} aria-required={f.required} onChange={(e) => set(f.name, e.target.value)} />
              ) : f.kind === 'select' ? (
                <select id={id} className="lm-inp" value={v} aria-describedby={hint} aria-required={f.required} onChange={(e) => set(f.name, e.target.value)}>
                  <option value="">{lt('choose')}</option>
                  {(f.options ?? []).map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="lm-inp-w">
                  <input id={id} className="lm-inp" type={f.kind === 'number' ? 'number' : 'text'} inputMode={f.kind === 'number' ? 'decimal' : undefined} min={f.min} max={f.max} maxLength={f.maxLength} value={v} aria-describedby={hint} aria-required={f.required} onChange={(e) => set(f.name, e.target.value)} />
                  {f.unit ? <span className="lm-unit">{f.unit}</span> : null}
                </span>
              )}
              {f.hint ? (
                <small id={hint} className="lm-hint">
                  {f.hint}
                </small>
              ) : null}
            </div>
          );
        })}
      </form>
      <aside className="lm-form-side" aria-label={lt('readyTitle')}>
        <section className="lm-card lm-ready" data-testid={`${testId}-ready`}>
          <h2 className="lm-h2">{lt('readyTitle')}</h2>
          <p className="lm-sub">{lt('readyCount', { n: ready.done, of: ready.list.length })}</p>
          <span className="lm-meter" aria-hidden="true">
            <i style={{ width: `${ready.list.length ? Math.round((ready.done / ready.list.length) * 100) : 0}%` }} />
          </span>
          <ul>
            {ready.list.map((c) => (
              <li key={c.id} className={c.ok ? 'ok' : undefined} data-testid={`${testId}-check`}>
                <span className="lm-ck" aria-hidden="true">
                  <ShellIcon name={c.ok ? 'check' : 'clock'} size={14} />
                </span>
                <span>{c.label}</span>
                <span className="lm-vh">{c.ok ? lt('checkDone') : lt('checkMissing')}</span>
              </li>
            ))}
          </ul>
          <button type="button" className="lm-btn pri lm-pub" disabled={!canPublish} onClick={send} aria-busy={busy} data-testid={`${testId}-publish`}>
            {publish.label}
          </button>
          {!ready.ready ? <small className="lm-hint">{lt('publishOff')}</small> : null}
        </section>
        <section className="lm-card lm-prev" aria-label={previewTitle ?? lt('preview')} data-testid={`${testId}-preview`}>
          <h2 className="lm-h2">{previewTitle ?? lt('preview')}</h2>
          <div className="lm-prev-card">
            <div className="lm-prev-img">
              {/* eslint-disable-next-line @next/next/no-img-element -- a live preview of what the owner typed, not a page image */}
              {img ? <img src={img} alt="" /> : <ShellIcon name="shirt" size={34} />}
              {preview.badge && values[preview.badge] ? <span className="lm-prev-badge">{values[preview.badge]}</span> : null}
            </div>
            <b className={title ? undefined : 'none'}>{title || lt('previewEmpty')}</b>
            {price ? <span className="lm-prev-price">{price}</span> : null}
            {preview.text && values[preview.text] ? <p>{values[preview.text]}</p> : null}
          </div>
        </section>
      </aside>
    </div>
  );
}
