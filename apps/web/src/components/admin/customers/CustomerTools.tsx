'use client';
// S14 · PR 286 — the small client parts of one customer's page: Copy and Call for a person allowed the full number
// (each one logged first in "Who looked at this customer", Note 24.1 — if the log cannot be written, nothing is copied
// or called), and "Merge with…": the other profile found by its phone (any way it is written), then both side by side
// in To review, where a person decides. Every refusal is shown in words from the page's messages.
import { useRouter } from 'next/navigation';
import { useId, useState, type FormEvent } from 'react';
import { call } from '@/components/admin/api';
import { cusError } from '@/lib/admin-customers/words';
import { t, type Dict } from '@/lib/i18n';
import { ShellIcon } from '../shell/ShellIcon';

export function PhoneButtons({ dict, customerId, dial }: { dict: Dict; customerId: string; dial: string }) {
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const log = async (action: 'phone.copy' | 'phone.call') => {
    setBusy(true);
    setMsg(null);
    const a = await call('POST', `/api/admin/customers/${customerId}/access`, { action });
    setBusy(false);
    if (!a.data.ok) {
      setMsg({ ok: false, text: a.status === 0 ? cusError(dict, 'network') : cusError(dict, a.data.error) });
      return false;
    }
    return true;
  };
  const copy = async () => {
    if (!(await log('phone.copy'))) return;
    try {
      await navigator.clipboard.writeText(dial);
      setMsg({ ok: true, text: t(dict, 'cus.profile.numbers.copied') });
    } catch {
      setMsg({ ok: true, text: dial });
    }
  };
  const ring = async () => {
    if (await log('phone.call')) window.location.href = `tel:${dial}`;
  };
  return (
    <span className="a2-gap8" data-testid="phone-buttons">
      <button type="button" className="a2-btn sm" onClick={copy} disabled={busy} data-testid="phone-copy">
        {t(dict, 'cus.profile.numbers.copy')}
      </button>
      <button type="button" className="a2-btn sm" onClick={ring} disabled={busy} data-testid="phone-call">
        <ShellIcon name="phone" size={14} />
        {t(dict, 'cus.profile.numbers.call')}
      </button>
      {msg ? (
        <span className={`a2-xs ${msg.ok ? 'a2-mute' : ''}`} role={msg.ok ? 'status' : 'alert'} style={msg.ok ? undefined : { color: 'var(--bad)' }}>
          {msg.text}
        </span>
      ) : null}
    </span>
  );
}

export function MergeWith({ dict, customerId }: { dict: Dict; customerId: string }) {
  const router = useRouter();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const find = async (ev: FormEvent) => {
    ev.preventDefault();
    if (!phone.trim()) return;
    setBusy(true);
    setMsg(null);
    const a = await call('GET', `/api/admin/customers/by-phone?phone=${encodeURIComponent(phone.trim())}`);
    setBusy(false);
    if (!a.data.ok) {
      setMsg(a.status === 0 ? cusError(dict, 'network') : cusError(dict, a.data.error));
      return;
    }
    const match = a.data.match as { id: string; matchedId: string } | null;
    if (!match) setMsg(t(dict, 'cus.profile.mergeWith.none'));
    else if (match.id === customerId) setMsg(t(dict, 'cus.profile.mergeWith.same'));
    else router.push(`/admin/customers/review?a=${encodeURIComponent(customerId)}&b=${encodeURIComponent(match.id)}`);
  };
  if (!open)
    return (
      <button type="button" className="a2-btn" onClick={() => setOpen(true)} data-testid="merge-with">
        <ShellIcon name="users" size={15} />
        {t(dict, 'cus.profile.mergeWith.go')}
      </button>
    );
  return (
    <form className="a2-stack" style={{ gap: 6 }} onSubmit={find} data-testid="merge-with-form">
      <label className="a2-xs a2-mute" htmlFor={`${id}-p`}>
        {t(dict, 'cus.profile.mergeWith.label')}
      </label>
      <span className="a2-gap8">
        <input id={`${id}-p`} className="a2-inp" type="tel" inputMode="tel" value={phone} maxLength={30} onChange={(e) => setPhone(e.target.value)} />
        <button type="submit" className="a2-btn sm pri" disabled={busy}>
          {busy ? t(dict, 'cus.profile.mergeWith.busy') : t(dict, 'cus.profile.mergeWith.find')}
        </button>
        <button type="button" className="a2-btn sm ghost" onClick={() => setOpen(false)} disabled={busy}>
          {t(dict, 'cus.merge.cancel')}
        </button>
      </span>
      {msg ? (
        <span className="a2-xs" role="alert">
          {msg}
        </span>
      ) : null}
    </form>
  );
}
