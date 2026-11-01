'use client';
// S14 · PR 287 — the Segments page's own settings card (`customers.segments`): the switch (off as shipped) and the three
// numbers — most segments kept, most conditions in one, people shown in the builder. Saved with one PUT
// (`customers.segments.write`; audited by the service); a person without the key sees the values only.
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import { cusError } from '@/lib/admin-customers/words';
import { t, type Dict } from '@/lib/i18n';

export interface SegmentSettingsValue {
  enabled: boolean;
  maxSegments: number;
  maxConditions: number;
  previewShown: number;
}

const NUMS = ['maxSegments', 'maxConditions', 'previewShown'] as const;

export function SegmentSettings({ dict: d, value, canWrite }: { dict: Dict; value: SegmentSettingsValue; canWrite: boolean }) {
  const router = useRouter();
  const uid = useId();
  const [v, setV] = useState({ enabled: value.enabled, maxSegments: String(value.maxSegments), maxConditions: String(value.maxConditions), previewShown: String(value.previewShown) });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const save = async () => {
    const nums = Object.fromEntries(NUMS.map((k) => [k, Number(v[k])]));
    if (NUMS.some((k) => !/^\d+$/.test(v[k].trim()))) {
      setMsg({ ok: false, text: cusError(d, 'INVALID_INPUT', NUMS.filter((k) => !/^\d+$/.test(v[k].trim())).map((k) => t(d, `cus.seg.set.${k}`)).join(', ')) });
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch('/api/admin/customers/segments/settings', { method: 'PUT', credentials: 'same-origin', cache: 'no-store', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ enabled: v.enabled, ...nums }) });
      const data = (await res.json().catch(() => ({ ok: false }))) as { ok?: boolean; error?: string; details?: string[] };
      if (!data.ok) {
        setMsg({ ok: false, text: cusError(d, data.error, (data.details ?? []).join(', ')) });
        return;
      }
      setMsg({ ok: true, text: t(d, 'cus.seg.set.saved') });
      router.refresh();
    } catch {
      setMsg({ ok: false, text: cusError(d, 'network') });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="a2-stack" style={{ gap: 10 }} data-testid="seg-settings">
      <label className="a2-ckb">
        <input type="checkbox" checked={v.enabled} disabled={!canWrite} onChange={(e) => setV({ ...v, enabled: e.target.checked })} data-testid="seg-set-on" />
        <span>{t(d, 'cus.seg.set.enabled')}</span>
      </label>
      {NUMS.map((k) => (
        <span key={k} className="a2-stack" style={{ gap: 4 }}>
          <label className="a2-xs a2-mute" htmlFor={`${uid}-${k}`}>
            {t(d, `cus.seg.set.${k}`)}
          </label>
          <input id={`${uid}-${k}`} className="a2-inp" inputMode="numeric" value={v[k]} disabled={!canWrite} maxLength={4} onChange={(e) => setV({ ...v, [k]: e.target.value })} />
        </span>
      ))}
      {canWrite ? (
        <span className="a2-gap8">
          <button type="button" className="a2-btn pri" onClick={save} disabled={busy} data-testid="seg-set-save">
            {busy ? t(d, 'cus.seg.b.saving') : t(d, 'cus.seg.set.save')}
          </button>
        </span>
      ) : (
        <p className="a2-xs a2-mute">{t(d, 'cus.seg.readOnly')}</p>
      )}
      {msg ? (
        <p className="a2-xs" role={msg.ok ? 'status' : 'alert'} style={msg.ok ? undefined : { color: 'var(--bad)' }}>
          {msg.text}
        </p>
      ) : null}
    </div>
  );
}
