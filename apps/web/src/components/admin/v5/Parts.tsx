'use client';
// S28 · wave 5 (CN-048) — small client parts shared by the inbox and marketing screens of the admin prototype v5: an
// owner's on/off switch (saved with the value the page read; a stale save is refused) and a refusal as words from the
// page's own `w5a.err.<code>` list, never the server's own wording.
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { call, type Answer } from '../api';
import { t, type Dict } from '@/lib/i18n';

/** A refusal as words. */
export function errWords(dict: Dict, a: Answer): string {
  const code = a.status === 0 ? 'network' : (a.data.error ?? 'default');
  const key = `w5a.err.${code}`;
  const text = t(dict, key, { fields: (a.data.details ?? []).join(', ') });
  return text === key ? t(dict, 'w5a.err.default') : text;
}

export function Msg({ m }: { m: { ok: boolean; text: string } | null }) {
  if (!m) return null;
  return (
    <span className="a2-xs" role={m.ok ? 'status' : 'alert'} style={m.ok ? undefined : { color: 'var(--bad)' }}>
      {m.text}
    </span>
  );
}

/** The owner's switch: sends the new value with the value the page showed. `before` is the setting's whole value. */
export function V5Switch({ dict, url, settingKey, before, label, tone = '', testId }: { dict: Dict; url: string; settingKey?: string; before: Record<string, unknown>; label: string; tone?: '' | 'pri'; testId?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const go = async () => {
    setBusy(true);
    const a = await call('POST', url, { ...(settingKey ? { key: settingKey } : {}), before, value: { ...before, enabled: !before.enabled } });
    setBusy(false);
    if (!a.data.ok) return setMsg({ ok: false, text: errWords(dict, a) });
    router.refresh();
  };
  return (
    <span className="a2-stack" style={{ gap: 4 }}>
      <button type="button" className={`a2-btn sm ${tone}`.trim()} onClick={go} disabled={busy} data-testid={testId}>
        {label}
      </button>
      <Msg m={msg} />
    </span>
  );
}

/** A number setting saved on its own (e.g. the longest text): the whole value goes back with one field changed. */
export function V5Number({ dict, url, settingKey, before, field, label, min, max, save, testId }: { dict: Dict; url: string; settingKey?: string; before: Record<string, unknown>; field: string; label: string; min: number; max: number; save: string; testId?: string }) {
  const router = useRouter();
  const [v, setV] = useState(String(before[field] ?? ''));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const go = async () => {
    const n = Number(v);
    if (!Number.isFinite(n) || n < min || n > max) return setMsg({ ok: false, text: t(dict, 'w5a.err.INVALID_INPUT', { fields: field }) });
    setBusy(true);
    const a = await call('POST', url, { ...(settingKey ? { key: settingKey } : {}), before, value: { ...before, [field]: n } });
    setBusy(false);
    if (!a.data.ok) return setMsg({ ok: false, text: errWords(dict, a) });
    setMsg({ ok: true, text: t(dict, 'w5a.saved') });
    router.refresh();
  };
  return (
    <label className="a2-stack" style={{ gap: 4 }}>
      <span className="a2-sm">{label}</span>
      <span className="a2-gap8">
        <input className="a2-inp" type="number" inputMode="numeric" min={min} max={max} value={v} onChange={(e) => setV(e.target.value)} style={{ maxWidth: 120 }} data-testid={testId} />
        <button type="button" className="a2-btn sm" onClick={go} disabled={busy}>
          {save}
        </button>
      </span>
      <Msg m={msg} />
    </label>
  );
}
