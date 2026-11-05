'use client';
// S14 · PR 288 onwards — one card of Customers › Customer settings: one CRM setting (a flat object) as a small form —
// a switch per yes/no field, a box per number, ticks per list of choices — and Save (PUT /api/admin/customers/settings
// with the whole value; the service checks it against the setting's schema and audits it). Words come from the page's
// dictionary: `cus.set.<card>.<field>` and, for a choice, `cus.set.<card>.opt.<value>`. Without `customers.settings` the
// card shows the values only. PR 289: `url` sends the whole value to another page's own settings route (Messages ›
// Automations), and a `lang` field is one line of words in each language ({bn, en}). PR 296: a `money` field is typed in
// whole units of the store's currency and kept in minor units (×100), like the Money section's cards. PR 622: a `words`
// field is an object of several words, each in both languages (`cus.set.<card>.w.<word>`, "(English)/(Bengali)"
// from `cus.set.inLang`).
// PR 534: a `choice` field is one value picked from a list the page gives with its own words (the owner's grades, say).
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import { cusError } from '@/lib/admin-customers/words';
import { t, type Dict } from '@/lib/i18n';

export type CrmField = { name: string; kind: 'bool' } | { name: string; kind: 'int' } | { name: string; kind: 'multi'; options: readonly string[] } | { name: string; kind: 'lang'; max: number } | { name: string; kind: 'money' } | { name: string; kind: 'words'; keys: readonly string[]; max: number } | { name: string; kind: 'choice'; options: readonly { value: string; label: string }[] };
const LANGS = ['bn', 'en'] as const;

export function CrmSettingCard({ dict: d, settingKey, card, fields, value, canWrite, url }: { dict: Dict; settingKey: string; card: string; fields: readonly CrmField[]; value: Record<string, unknown>; canWrite: boolean; url?: string }) {
  const router = useRouter();
  const uid = useId();
  const [v, setV] = useState<Record<string, unknown>>(() => Object.fromEntries(fields.map((f) => [f.name, f.kind === 'int' ? String(value[f.name] ?? '') : f.kind === 'money' ? String(Math.round(Number(value[f.name] ?? 0)) / 100) : value[f.name]])));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const label = (f: string) => t(d, `cus.set.${card}.${f}`);

  const save = async () => {
    const bad = fields.filter((f) => (f.kind === 'int' && !/^\d+$/.test(String(v[f.name]).trim())) || (f.kind === 'money' && !/^\d+(\.\d{1,2})?$/.test(String(v[f.name]).trim())));
    if (bad.length) {
      setMsg({ ok: false, text: cusError(d, 'INVALID_INPUT', bad.map((f) => label(f.name)).join(', ')) });
      return;
    }
    const next = { ...value, ...Object.fromEntries(fields.map((f) => [f.name, f.kind === 'int' ? Number(String(v[f.name]).trim()) : f.kind === 'money' ? Math.round(Number(String(v[f.name]).trim()) * 100) : v[f.name]])) };
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(url ?? '/api/admin/customers/settings', { method: 'PUT', credentials: 'same-origin', cache: 'no-store', headers: { 'content-type': 'application/json' }, body: JSON.stringify(url ? next : { key: settingKey, value: next }) });
      const data = (await res.json().catch(() => ({ ok: false }))) as { ok?: boolean; error?: string; details?: string[] };
      if (!data.ok) {
        setMsg({ ok: false, text: cusError(d, data.error, (data.details ?? []).join(', ')) });
        return;
      }
      setMsg({ ok: true, text: t(d, 'cus.set.saved') });
      router.refresh();
    } catch {
      setMsg({ ok: false, text: cusError(d, 'network') });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="a2-card" data-testid={`crm-card-${card}`}>
      <h2 className="a2-h3">{t(d, `cus.set.${card}.title`)}</h2>
      <p className="a2-xs a2-mute a2-mt6">{t(d, `cus.set.${card}.sub`)}</p>
      <div className="a2-stack a2-mt12" style={{ gap: 10 }}>
        {fields.map((f) =>
          f.kind === 'bool' ? (
            <label key={f.name} className="a2-ckb crm-ck">
              <input type="checkbox" checked={!!v[f.name]} disabled={!canWrite} onChange={(e) => setV({ ...v, [f.name]: e.target.checked })} data-testid={`crm-${card}-${f.name}`} />
              <span>{label(f.name)}</span>
            </label>
          ) : f.kind === 'choice' ? (
            <span key={f.name} className="a2-stack" style={{ gap: 4 }}>
              <label className="a2-xs a2-mute" htmlFor={`${uid}-${f.name}`}>
                {label(f.name)}
              </label>
              <select id={`${uid}-${f.name}`} className="a2-sel" value={String(v[f.name] ?? '')} disabled={!canWrite} onChange={(e) => setV({ ...v, [f.name]: e.target.value })} data-testid={`crm-${card}-${f.name}`}>
                {f.options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </span>
          ) : f.kind === 'lang' ? (
            <span key={f.name} className="a2-stack" style={{ gap: 4 }}>
              {LANGS.map((l) => {
                const cur = (v[f.name] as Record<string, string> | undefined) ?? {};
                return (
                  <span key={l} className="a2-stack" style={{ gap: 4 }}>
                    <label className="a2-xs a2-mute" htmlFor={`${uid}-${f.name}-${l}`}>
                      {label(`${f.name}.${l}`)}
                    </label>
                    <input id={`${uid}-${f.name}-${l}`} className="a2-inp" maxLength={f.max} value={cur[l] ?? ''} disabled={!canWrite} onChange={(e) => setV({ ...v, [f.name]: { ...cur, [l]: e.target.value } })} />
                  </span>
                );
              })}
            </span>
          ) : f.kind === 'words' ? (
            <fieldset key={f.name} className="crm-multi a2-stack" style={{ gap: 8 }}>
              <legend className="a2-xs a2-mute">{label(f.name)}</legend>
              {f.keys.map((k) => {
                const all = (v[f.name] as Record<string, Record<string, string>> | undefined) ?? {};
                const cur = all[k] ?? {};
                return LANGS.map((l) => (
                  <span key={`${k}-${l}`} className="a2-stack" style={{ gap: 4 }}>
                    <label className="a2-xs a2-mute" htmlFor={`${uid}-${f.name}-${k}-${l}`}>
                      {t(d, `cus.set.inLang.${l}`, { label: label(`w.${k}`) })}
                    </label>
                    <input id={`${uid}-${f.name}-${k}-${l}`} className="a2-inp" maxLength={f.max} value={cur[l] ?? ''} disabled={!canWrite} onChange={(e) => setV({ ...v, [f.name]: { ...all, [k]: { ...cur, [l]: e.target.value } } })} data-testid={`crm-${card}-${f.name}-${k}-${l}`} />
                  </span>
                ));
              })}
            </fieldset>
          ) : f.kind === 'int' || f.kind === 'money' ? (
            <span key={f.name} className="a2-stack" style={{ gap: 4 }}>
              <label className="a2-xs a2-mute" htmlFor={`${uid}-${f.name}`}>
                {label(f.name)}
              </label>
              <input id={`${uid}-${f.name}`} className="a2-inp" inputMode={f.kind === 'money' ? 'decimal' : 'numeric'} maxLength={f.kind === 'money' ? 9 : 7} value={String(v[f.name] ?? '')} disabled={!canWrite} onChange={(e) => setV({ ...v, [f.name]: e.target.value })} />
            </span>
          ) : (
            <fieldset key={f.name} className="crm-multi">
              <legend className="a2-xs a2-mute">{label(f.name)}</legend>
              <div className="crm-opts">
                {f.options.map((o) => {
                  const list = (v[f.name] as string[] | undefined) ?? [];
                  return (
                    <label key={o} className="a2-ckb crm-ck">
                      <input type="checkbox" checked={list.includes(o)} disabled={!canWrite} onChange={(e) => setV({ ...v, [f.name]: e.target.checked ? [...list, o] : list.filter((x) => x !== o) })} />
                      <span>{t(d, `cus.set.${card}.opt.${o}`)}</span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
          ),
        )}
        {canWrite ? (
          <span className="a2-gap8">
            <button type="button" className="a2-btn pri" onClick={save} disabled={busy} data-testid={`crm-${card}-save`}>
              {busy ? t(d, 'cus.set.saving') : t(d, 'cus.set.save')}
            </button>
          </span>
        ) : (
          <p className="a2-xs a2-mute">{t(d, 'cus.set.readOnly')}</p>
        )}
        {msg ? (
          <p className="a2-xs" role={msg.ok ? 'status' : 'alert'} style={msg.ok ? undefined : { color: 'var(--bad)' }}>
            {msg.text}
          </p>
        ) : null}
      </div>
    </section>
  );
}
