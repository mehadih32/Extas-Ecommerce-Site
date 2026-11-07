'use client';
// S08 · PR 554, 179–181 — the small client parts of the courier and fulfilment pages: a button that sends one command to
// the admin API and reloads the page's data (with an optional question first and an optional note field), a form that
// adds a courier account, and the courier-place picker of a courier's page. Every refusal is shown in words from the
// page's messages (`ful.err.<code>`), never the server's own wording. PR 633 (CN-036): the words after a command worked
// are the admin's one toast (showToast, read out by screen readers); a refusal stays beside its button. Follow-up 370:
// a courier account's "Rename" (the name on the screen only; the courier's keys and parcels stay as they are).
import { useRouter } from 'next/navigation';
import { useId, useState, type ReactNode } from 'react';
import { call } from '@/components/admin/api';
import { showToast } from '@/components/admin/lumen/Toast';
import { fulError, type FulSource } from '@/lib/admin-fulfil/words';
import { t, type Dict } from '@/lib/i18n';

export interface ActProps {
  dict: Dict;
  url: string;
  method?: 'POST' | 'PATCH';
  body?: Record<string, unknown>;
  label: string;
  busyLabel?: string;
  /** Asked before sending (a plain yes/no). */
  ask?: string;
  /** A note the person must type first (e.g. why a sticker is printed again); sent as `body[noteField]`. */
  note?: { field: string; label: string; placeholder?: string };
  tone?: 'pri' | 'bad' | 'ghost' | '';
  size?: 'sm' | '';
  testId?: string;
  /** Words shown after it worked, from the answer (else the page just reloads). */
  done?: (answer: Record<string, unknown>) => string | null;
  /** Follow-up 370: fixed words shown after it worked (a server page cannot pass `done`, a function). */
  doneText?: string;
  /** Opens this address after it worked (e.g. a PDF of what was just made). */
  openAfter?: (answer: Record<string, unknown>) => string | null;
  /** Follow-up 465: the screen it is on, for its own refusal words (`ful.err.<source>.<code>` first). */
  errSource?: FulSource;
}

export function Act({ dict, url, method = 'POST', body, label, busyLabel, ask, note, tone = '', size = 'sm', testId, done, doneText, openAfter, errSource }: ActProps) {
  const router = useRouter();
  const id = useId();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const go = async () => {
    if (note && !open) {
      setOpen(true);
      return;
    }
    if (note && !text.trim()) {
      setMsg({ ok: false, text: fulError(dict, 'INVALID_INPUT', note.label) });
      return;
    }
    if (ask && !note && !window.confirm(ask)) return;
    setBusy(true);
    setMsg(null);
    const a = await call(method, url, { ...(body ?? {}), ...(note ? { [note.field]: text.trim() } : {}) });
    setBusy(false);
    if (!a.data.ok) {
      setMsg({ ok: false, text: a.status === 0 ? fulError(dict, 'network') : fulError(dict, a.data.error, (a.data.details ?? []).join(', '), errSource) });
      return;
    }
    setOpen(false);
    setText('');
    const words = done?.(a.data) ?? doneText ?? null;
    if (words) showToast({ text: words, tone: 'ok' });
    const href = openAfter?.(a.data) ?? null;
    if (href) window.open(href, '_blank', 'noopener');
    router.refresh();
  };
  return (
    <span className="a2-stack" style={{ gap: 6 }}>
      {open && note ? (
        <span className="a2-stack" style={{ gap: 4 }}>
          <label className="a2-xs a2-mute" htmlFor={`${id}-n`}>
            {note.label}
          </label>
          <input id={`${id}-n`} className="a2-inp" value={text} maxLength={300} placeholder={note.placeholder} onChange={(e) => setText(e.target.value)} />
        </span>
      ) : null}
      <span className="a2-gap8">
        <button type="button" className={`a2-btn ${size} ${tone}`.trim()} onClick={go} disabled={busy} data-testid={testId}>
          {busy ? (busyLabel ?? label) : label}
        </button>
        {open && note ? (
          <button type="button" className="a2-btn sm ghost" onClick={() => setOpen(false)} disabled={busy}>
            {t(dict, 'ful.cancel')}
          </button>
        ) : null}
      </span>
      {msg ? (
        <span className={`a2-xs ${msg.ok ? 'a2-mute' : ''}`} role={msg.ok ? 'status' : 'alert'} style={msg.ok ? undefined : { color: 'var(--bad)' }}>
          {msg.text}
        </span>
      ) : null}
    </span>
  );
}

/**
 * "Read the list now" for one courier: its words after the press (read now, or queued behind a running read). A client
 * part of its own, since a server page cannot hand `done` (a function) to a client component.
 */
export function ReadNow({ dict, courierId, tone, size }: { dict: Dict; courierId: string; tone?: ActProps['tone']; size?: ActProps['size'] }) {
  return (
    <Act
      dict={dict}
      url={`/api/admin/delivery/couriers/${courierId}/zone-sync`}
      label={t(dict, 'ful.couriers.readNow')}
      busyLabel={t(dict, 'ful.couriers.reading')}
      tone={tone}
      size={size}
      testId="read-now"
      done={(a) => t(dict, a.now ? 'ful.couriers.readDone' : 'ful.couriers.readQueued')}
    />
  );
}

/** "Add a courier": which courier (its adapters) and the name the screens show. */
export function AddCourier({ dict, providers }: { dict: Dict; providers: { key: string; label: string }[] }) {
  const router = useRouter();
  const id = useId();
  const [providerKey, setProvider] = useState(providers[0]?.key ?? '');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const go = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const a = await call('POST', '/api/admin/delivery/couriers', { providerKey, name: name.trim() });
    setBusy(false);
    if (!a.data.ok) {
      setErr(a.status === 0 ? fulError(dict, 'network') : fulError(dict, a.data.error, (a.data.details ?? []).join(', ')));
      return;
    }
    setName('');
    router.refresh();
  };
  return (
    <form className="a2-fbar" onSubmit={go} data-testid="add-courier" style={{ marginBottom: 0 }}>
      <label className="a2-sr" htmlFor={`${id}-p`}>
        {t(dict, 'ful.couriers.addProvider')}
      </label>
      <select id={`${id}-p`} className="a2-sel" value={providerKey} onChange={(e) => setProvider(e.target.value)}>
        {providers.map((p) => (
          <option key={p.key} value={p.key}>
            {p.label}
          </option>
        ))}
      </select>
      <label className="a2-sr" htmlFor={`${id}-n`}>
        {t(dict, 'ful.couriers.addName')}
      </label>
      <input id={`${id}-n`} className="a2-inp" style={{ flex: '1 1 180px', width: 'auto' }} value={name} maxLength={60} placeholder={t(dict, 'ful.couriers.addNamePh')} onChange={(e) => setName(e.target.value)} required />
      <button type="submit" className="a2-btn pri" disabled={busy || !name.trim()}>
        {t(dict, 'ful.couriers.addGo')}
      </button>
      {err ? (
        <span className="a2-xs" role="alert" style={{ color: 'var(--bad)', flexBasis: '100%' }}>
          {err}
        </span>
      ) : null}
    </form>
  );
}

/** Follow-up 370: "Rename" opens the name in place; Save sends it (PATCH), Cancel or Esc closes it unchanged. */
export function CourierRename({ dict, courierId, name }: { dict: Dict; courierId: string; name: string }) {
  const router = useRouter();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(name);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const close = () => {
    setOpen(false);
    setText(name);
    setErr(null);
  };
  const go = async (e: React.FormEvent) => {
    e.preventDefault();
    const next = text.trim();
    if (!next || next === name) return close();
    setBusy(true);
    setErr(null);
    const a = await call('PATCH', `/api/admin/delivery/couriers/${courierId}`, { name: next });
    setBusy(false);
    if (!a.data.ok) {
      setErr(a.status === 0 ? fulError(dict, 'network') : fulError(dict, a.data.error, (a.data.details ?? []).join(', ')));
      return;
    }
    setOpen(false);
    showToast({ text: t(dict, 'ful.couriers.renamed'), tone: 'ok' });
    router.refresh();
  };
  if (!open)
    return (
      <button type="button" className="a2-btn sm ghost" onClick={() => setOpen(true)} data-testid="courier-rename">
        {t(dict, 'ful.couriers.rename')}
      </button>
    );
  return (
    <form className="a2-fbar" onSubmit={go} onKeyDown={(e) => e.key === 'Escape' && close()} data-testid="courier-rename-form" style={{ marginBottom: 0, flexBasis: '100%' }}>
      <label className="a2-sr" htmlFor={`${id}-n`}>
        {t(dict, 'ful.couriers.renameLabel')}
      </label>
      <input id={`${id}-n`} className="a2-inp" style={{ flex: '1 1 160px', width: 'auto', minWidth: 0 }} value={text} maxLength={60} autoFocus onChange={(e) => setText(e.target.value)} required />
      <button type="submit" className="a2-btn sm pri" disabled={busy || !text.trim()}>
        {t(dict, 'ful.couriers.renameSave')}
      </button>
      <button type="button" className="a2-btn sm ghost" onClick={close} disabled={busy}>
        {t(dict, 'ful.cancel')}
      </button>
      {err ? (
        <span className="a2-xs" role="alert" style={{ color: 'var(--bad)', flexBasis: '100%' }}>
          {err}
        </span>
      ) : null}
    </form>
  );
}

interface PlaceHit {
  id: string;
  name: string;
  level: string;
  path: string[];
}

/** A courier's places by name, each with a "pair" button for one shop area. */
export function PlacePicker({ dict, courierId, areaId, children }: { dict: Dict; courierId: string; areaId: string; children?: ReactNode }) {
  const id = useId();
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<PlaceHit[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const search = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!q.trim()) return;
    setErr(null);
    const a = await call('GET', `/api/admin/delivery/couriers/${courierId}/places?q=${encodeURIComponent(q.trim())}`);
    if (!a.data.ok) {
      setErr(fulError(dict, a.data.error));
      return;
    }
    setHits((a.data.places as PlaceHit[]) ?? []);
  };
  if (!open)
    return (
      <span className="a2-gap8">
        {children}
        <button type="button" className="a2-btn sm ghost" onClick={() => setOpen(true)}>
          {t(dict, 'ful.courier.pick')}
        </button>
      </span>
    );
  return (
    <div className="a2-stack" style={{ gap: 8 }}>
      {children ? <span className="a2-gap8">{children}</span> : null}
      <form className="a2-fbar" onSubmit={search} style={{ marginBottom: 0 }}>
        <label className="a2-sr" htmlFor={`${id}-q`}>
          {t(dict, 'ful.courier.pickPh')}
        </label>
        <input id={`${id}-q`} className="a2-inp" style={{ flex: '1 1 160px', width: 'auto' }} value={q} maxLength={80} placeholder={t(dict, 'ful.courier.pickPh')} onChange={(e) => setQ(e.target.value)} />
        <button type="submit" className="a2-btn sm">
          {t(dict, 'ful.courier.pickGo')}
        </button>
      </form>
      {err ? (
        <span className="a2-xs" role="alert" style={{ color: 'var(--bad)' }}>
          {err}
        </span>
      ) : null}
      {hits && !hits.length ? <span className="a2-xs a2-mute">{t(dict, 'ful.courier.pickNone')}</span> : null}
      {hits?.length ? (
        <span className="a2-gap8">
          {hits.map((h) => (
            <Act key={h.id} dict={dict} url={`/api/admin/delivery/couriers/${courierId}/areas`} body={{ areaId, placeId: h.id }} label={t(dict, 'ful.courier.pairWith', { place: [h.name, ...h.path].join(', ') })} />
          ))}
        </span>
      ) : null}
    </div>
  );
}
