'use client';
// PR 500 — the "Connections" card of Keys & connections (demo 89v-admin-server.js: PAGES['admin-integrations'],
// ZV_KEYS rows, the add-key sheet zv_keyHTML). Rows come from the API's list (the catalogue in @extas/adapters), never
// from markup. A key is typed into a password field with autocomplete off, sent once, and the field is emptied: a saved
// key is never shown again. Save runs the test; only a pass takes a connection out of mock (the server decides).
import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import type { ConnectionView } from '@/lib/integrations';
import { t, type Dict } from '@/lib/i18n';
import { call, errorText, type Answer } from './api';
import { Icon } from './Icon';

interface Props {
  dict: Dict;
  initial: ConnectionView[];
  canWrite: boolean;
  vaultReady: boolean;
  locale: string;
  timeZone: string;
}

const TOAST_MS = 3200;
const MIN_KEY_CHARS = 1;

export function Integrations({ dict, initial, canWrite, vaultReady, locale, timeZone }: Props) {
  const [rows, setRows] = useState(initial);
  const [open, setOpen] = useState<ConnectionView | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState('');
  const opener = useRef<HTMLButtonElement | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const name = (id: string) => t(dict, `connections.${id}.name`);
  const when = (iso: string) => new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short', timeZone }).format(new Date(iso));
  const say = (text: string) => {
    clearTimeout(toastTimer.current);
    setToast(text);
    toastTimer.current = setTimeout(() => setToast(''), TOAST_MS);
  };
  useEffect(() => () => clearTimeout(toastTimer.current), []);

  const reload = useCallback(async () => {
    const a = await call('GET', '/api/admin/integrations');
    if (a.status === 200 && Array.isArray(a.data.connections)) setRows(a.data.connections as ConnectionView[]);
  }, []);

  const act = async (c: ConnectionView, body: Record<string, unknown>): Promise<Answer> => {
    setBusy(c.id);
    try {
      const a = await call('POST', `/api/admin/integrations/${encodeURIComponent(c.id)}`, body);
      if (a.status === 200) await reload();
      return a;
    } finally {
      setBusy(null);
    }
  };

  const onTest = async (c: ConnectionView) => {
    const a = await act(c, { action: 'test' });
    if (a.status !== 200) return say(errorText(dict, a));
    say(t(dict, (a.data.test as { ok?: boolean } | undefined)?.ok ? 'integrations.toast.testOk' : 'integrations.toast.testFail'));
  };
  const onRemove = async (c: ConnectionView) => {
    if (!window.confirm(t(dict, 'integrations.removeConfirm', { name: name(c.id) }))) return;
    const a = await act(c, { action: 'remove' });
    say(a.status === 200 ? t(dict, 'integrations.toast.removed') : errorText(dict, a));
  };
  const close = () => {
    setOpen(null);
    opener.current?.focus();
  };

  const live = (c: ConnectionView) => (c.builtIn ? c.inUse : c.enabled && c.mode !== null && c.mode !== 'MOCK');
  const dot = (c: ConnectionView) => (live(c) ? 'ad-dot' : c.keySaved ? 'ad-dot warn' : 'ad-dot off');
  const editable = canWrite && vaultReady;

  return (
    <>
      {!vaultReady ? (
        <div className="ad-note warn ad-note-top">
          <Icon name="info" size={16} />
          <div>{t(dict, 'integrations.vaultMissing')}</div>
        </div>
      ) : null}
      <section className="ad-card" aria-labelledby="ad-conn-h">
        <h2 id="ad-conn-h">{t(dict, 'integrations.cardTitle')}</h2>
        <div className="ad-sub">{t(dict, 'integrations.cardSub')}</div>
        {rows.map((c) => (
          <div className="ad-row" key={c.id} id={`ad-key-${c.id}`} data-connection={c.id}>
            <div className="ad-row-main">
              <div className="ad-row-name">
                <span className={dot(c)} aria-hidden="true" />
                {name(c.id)}
              </div>
              <div className="ad-mini">{t(dict, `connections.${c.id}.desc`)}</div>
              {!c.adapter ? (
                <div className="ad-mini">
                  {t(dict, 'integrations.notConnected')} · {t(dict, 'integrations.later')}
                </div>
              ) : c.builtIn ? (
                <div className="ad-mini">
                  {t(dict, 'integrations.builtIn')} · {t(dict, c.inUse ? 'integrations.inUse' : 'integrations.standby')}
                </div>
              ) : c.keySaved ? (
                <>
                  <div className="ad-mini">
                    <Icon name="lock" size={11} />
                    {t(dict, 'integrations.saved')}
                  </div>
                  <div className="ad-mini">{t(dict, `integrations.mode.${c.mode ?? 'MOCK'}`)}</div>
                </>
              ) : (
                <div className="ad-mini">{t(dict, 'integrations.notConnected')}</div>
              )}
              {c.adapter && !c.builtIn && c.lastTest ? (
                <div className={`ad-mini ${c.lastTest.ok ? 'ok' : 'bad'}`} suppressHydrationWarning>
                  {t(dict, c.lastTest.ok ? 'integrations.lastTestOk' : 'integrations.lastTestFail', { time: when(c.lastTest.at) })}
                  {!c.lastTest.ok && c.lastTest.message ? (
                    <span lang="en" translate="no">
                      {' '}
                      — {c.lastTest.message}
                    </span>
                  ) : null}
                </div>
              ) : null}
            </div>
            {editable && c.adapter && !c.builtIn ? (
              <div className="ad-row-acts">
                {c.keySaved ? (
                  <>
                    <button type="button" className="ad-btn ad-btn-sm ad-btn-ghost" disabled={busy !== null} onClick={() => onTest(c)}>
                      {busy === c.id ? t(dict, 'integrations.busy') : t(dict, 'integrations.test')}
                    </button>
                    <button type="button" className="ad-btn ad-btn-sm ad-btn-ghost" disabled={busy !== null} onClick={() => onRemove(c)}>
                      {t(dict, 'integrations.remove')}
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="ad-btn ad-btn-sm ad-btn-primary"
                    disabled={busy !== null}
                    onClick={(e) => {
                      opener.current = e.currentTarget;
                      setOpen(c);
                    }}
                  >
                    <Icon name="plus" size={14} />
                    {t(dict, 'integrations.add')}
                  </button>
                )}
              </div>
            ) : null}
          </div>
        ))}
      </section>
      {open ? (
        <KeySheet
          dict={dict}
          connection={open}
          onClose={close}
          onSaved={async (a) => {
            await reload();
            setOpen(null);
            opener.current?.focus();
            const ok = (a.data.test as { ok?: boolean } | undefined)?.ok;
            say(ok ? t(dict, 'integrations.toast.connected', { name: name(open.id) }) : t(dict, 'integrations.toast.savedFailed'));
          }}
        />
      ) : null}
      <div className="ad-toast-slot" aria-live="polite" role="status">
        {toast ? <div className="ad-toast">{toast}</div> : null}
      </div>
    </>
  );
}

/** The add-key sheet: plain settings first (shown again when saved), then the keys (never shown again). */
interface SheetProps {
  dict: Dict;
  connection: ConnectionView;
  onClose(): void;
  onSaved(a: Answer): Promise<void>;
}

function KeySheet({ dict, connection: c, onClose, onSaved }: SheetProps) {
  const [config, setConfig] = useState<Record<string, string>>(() => Object.fromEntries(c.config.map((f) => [f.field, f.value ?? ''])));
  const [secrets, setSecrets] = useState<Record<string, string>>(() => Object.fromEntries(c.secrets.map((f) => [f.field, ''])));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [bad, setBad] = useState<string[]>([]);
  const box = useRef<HTMLDivElement>(null);
  const label = (field: string) => t(dict, `connections.${c.id}.fields.${field}`);
  const title = t(dict, 'integrations.modal.title', { name: t(dict, `connections.${c.id}.name`) });

  useEffect(() => {
    box.current?.querySelector<HTMLElement>('input')?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const ready = c.secrets.every((f) => (secrets[f.field] ?? '').trim().length >= MIN_KEY_CHARS) && c.config.every((f) => f.optional || (config[f.field] ?? '').trim());

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!ready || busy) return;
    setBusy(true);
    setError('');
    setBad([]);
    const a = await call('POST', `/api/admin/integrations/${encodeURIComponent(c.id)}`, { action: 'save', secrets, config });
    setBusy(false);
    if (a.status === 200) {
      // Never kept: the typed keys leave this form's memory as soon as they are saved.
      setSecrets(Object.fromEntries(c.secrets.map((f) => [f.field, ''])));
      await onSaved(a);
      return;
    }
    const details = a.data.details ?? [];
    setBad(details);
    setError(errorText(dict, a, { fields: details.map((d) => label(d.split('.').slice(1).join('.'))).join(', ') }));
  };

  /** Escape closes; Tab stays inside the sheet. */
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== 'Tab' || !box.current) return;
    const items = [...box.current.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled])')];
    const first = items[0];
    const last = items[items.length - 1];
    if (!first || !last) return;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  const field = (kind: 'config' | 'secrets', f: { field: string; optional: boolean }) => {
    const id = `ad-${kind}-${f.field}`;
    const isSecret = kind === 'secrets';
    const value = (isSecret ? secrets : config)[f.field] ?? '';
    const set = isSecret ? setSecrets : setConfig;
    return (
      <div key={id}>
        <label className="ad-label" htmlFor={id}>
          {label(f.field)} {f.optional ? <span className="opt">{t(dict, 'integrations.modal.optional')}</span> : null}
        </label>
        <input
          id={id}
          className="ad-input"
          type={isSecret ? 'password' : 'text'}
          autoComplete="off"
          spellCheck={false}
          autoCapitalize="off"
          placeholder={isSecret ? t(dict, 'integrations.modal.paste') : undefined}
          value={value}
          aria-invalid={bad.includes(`${kind}.${f.field}`) || undefined}
          onChange={(e) => set((s) => ({ ...s, [f.field]: e.target.value }))}
        />
      </div>
    );
  };

  return (
    <div className="ad-modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="ad-modal" role="dialog" aria-modal="true" aria-labelledby="ad-sheet-h" ref={box} onKeyDown={onKey}>
        <div className="ad-modal-hd">
          <h2 id="ad-sheet-h">{title}</h2>
          <button type="button" className="ad-iconbtn" aria-label={t(dict, 'integrations.modal.close')} onClick={onClose}>
            <Icon name="close" />
          </button>
        </div>
        <form className="ad-modal-bd" onSubmit={submit} noValidate autoComplete="off">
          <div className="ad-modal-desc">
            {t(dict, `connections.${c.id}.desc`)}
          </div>
          {c.config.map((f) => field('config', f))}
          {c.secrets.map((f) => field('secrets', f))}
          <div className="ad-mini">
            <Icon name="lock" size={11} />
            {t(dict, 'integrations.modal.lock')}
          </div>
          {error ? (
            <p className="ad-modal-err" role="alert">
              {error}
            </p>
          ) : null}
          <div className="ad-modal-acts">
            <button type="button" className="ad-btn ad-btn-ghost" onClick={onClose}>
              {t(dict, 'integrations.modal.cancel')}
            </button>
            <button type="submit" className="ad-btn ad-btn-primary" disabled={!ready || busy}>
              <Icon name="check" size={15} />
              {busy ? t(dict, 'integrations.modal.saving') : t(dict, 'integrations.modal.save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
