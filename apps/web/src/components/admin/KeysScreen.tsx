'use client';
// PR 1020 (D12, owner order: the real admin equals prototype v5 100%) — Settings › Keys & connections as the prototype draws it
// (docs/demo/admin-proto-v5/js/m-settings.js `renderKeys`): the warning line, the Working / Need attention / Not set up cards, then
// seven groups, each row with its name, masked key, status, "used … ago" and Test / Replace / Add key. The real connections the
// prototype does not list sit under "More options" on the same page, grouped the same way, with "Remove a saved key". Rows come
// from the API's list (the catalogue in @extas/adapters), never from markup. A key is typed into a password field with autocomplete
// off, sent once and the field emptied: a saved key is never shown again (only its last 4 characters when it is long enough).
import Link from 'next/link';
import { useCallback, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { t, type Dict } from '@/lib/i18n';
import type { ConnectionView } from '@/lib/integrations';
import { KEY_GROUPS, MAIN_ROWS, MORE_ROWS, agoParts, keyState, maskOf, placeOf, type KeyGroup, type KeyState } from '@/lib/keys-groups';
import { call, errorText, type Answer } from './api';
import { showToast } from './lumen/Toast';
import { useDialogKeys } from './orders/OrderCommands';
import { ShellIcon } from './shell/ShellIcon';

interface Props {
  dict: Dict;
  initial: ConnectionView[];
  canWrite: boolean;
  vaultReady: boolean;
  /** The server's clock when the page was drawn (so "used … ago" matches on server and browser). */
  now: number;
}

export function KeysScreen({ dict, initial, canWrite, vaultReady, now }: Props) {
  const k = (key: string, vars?: Record<string, string | number>) => t(dict, `integrations.keys.${key}`, vars);
  const name = (id: string) => t(dict, `connections.${id}.name`);
  const [rows, setRows] = useState(initial);
  const [open, setOpen] = useState<ConnectionView | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const editable = canWrite && vaultReady;
  const byId = new Map(rows.map((r) => [r.id, r]));

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
    if (a.status !== 200) return showToast({ text: errorText(dict, a), tone: 'bad' });
    const ok = (a.data.test as { ok?: boolean } | undefined)?.ok;
    showToast({ text: ok ? k('toastTest', { name: name(c.id) }) : k('toastTestFail', { name: name(c.id) }), tone: ok ? 'ok' : 'bad' });
  };
  const onRemove = async (c: ConnectionView) => {
    if (!window.confirm(t(dict, 'integrations.removeConfirm', { name: name(c.id) }))) return;
    const a = await act(c, { action: 'remove' });
    showToast({ text: a.status === 200 ? k('toastRemoved') : errorText(dict, a), tone: a.status === 200 ? 'ok' : 'bad' });
  };

  const states = new Map<string, KeyState>(rows.map((r) => [r.id, keyState(r)]));
  const count = (s: KeyState) => rows.filter((r) => placeOf(r.id).more === false && (s === 'none' ? states.get(r.id) === 'none' || states.get(r.id) === 'later' : states.get(r.id) === s)).length;

  const agoText = (c: ConnectionView) => {
    if (!c.lastTest) return '—';
    const p = agoParts(c.lastTest.at, now);
    return k('used', { ago: k(`ago.${p.unit}`, { n: p.n }) });
  };
  const badge = (s: KeyState) =>
    s === 'ok' ? <span className="a2-pill ok">{k('working')}</span> : s === 'err' ? <span className="a2-pill bad">{k('problem')}</span> : <span className="a2-pill line">{k('notSet')}</span>;

  const row = (id: string) => {
    const c = byId.get(id);
    if (!c) return null;
    const s = states.get(id) ?? 'none';
    const err = c.lastTest && !c.lastTest.ok;
    const sub = s === 'none' || s === 'later' ? k('noKey') : err && c.lastTest?.message ? c.lastTest.message : c.keySaved ? maskOf(c.keyHint) : c.builtIn ? t(dict, 'integrations.builtIn') : '';
    const mono = (s === 'ok' || s === 'err') && !err && c.keySaved;
    return (
      <div className="set-key" key={id} id={`ad-key-${id}`} data-connection={id} data-state={s}>
        <div style={{ minWidth: 0 }}>
          <b>{name(id)}</b>
          <div className={`a2-xs a2-mute ${mono ? 'mono' : ''}`}>{sub}</div>
        </div>
        <div className="k2 a2-xs a2-mute">
          {s === 'later' ? <span className="a2-pill line">{k('later')}</span> : badge(s)}
          <br />
          {s === 'none' || s === 'later' ? '—' : agoText(c)}
        </div>
        <div className="set-key-acts">
          {editable && c.adapter && !c.builtIn && !c.managedAt ? (
            <>
              {s !== 'none' ? (
                <button type="button" className="a2-btn sm" disabled={busy !== null} onClick={() => onTest(c)}>
                  {busy === id ? t(dict, 'integrations.busy') : k('test')}
                </button>
              ) : null}
              <button type="button" className={`a2-btn sm ${s === 'ok' ? '' : 'pri'}`} disabled={busy !== null} onClick={() => setOpen(c)}>
                {s === 'none' ? k('addKey') : k('replace')}
              </button>
            </>
          ) : c.managedAt ? (
            <Link className="a2-btn sm" href={c.managedAt}>
              {k('open')} →
            </Link>
          ) : null}
        </div>
      </div>
    );
  };

  const card = (g: KeyGroup, ids: readonly string[], inMore: boolean) => {
    const live = ids.filter((id) => byId.has(id));
    if (!live.length) return null;
    return (
      <section className="a2-card a2-mt12" key={`${inMore ? 'm' : 'g'}-${g}`} data-testid={`keys-group-${inMore ? 'more-' : ''}${g}`}>
        <h2 className="a2-h4">{k(`group.${g}`)}</h2>
        <div>{live.map(row)}</div>
      </section>
    );
  };
  // Anything the table above does not know yet still shows (under More options), so no connection is ever hidden.
  const known = new Set(KEY_GROUPS.flatMap((g) => [...MAIN_ROWS[g], ...MORE_ROWS[g]]));
  const strays = rows.filter((r) => !known.has(r.id)).map((r) => r.id);
  const removable = rows.filter((r) => r.adapter && !r.builtIn && !r.managedAt && r.keySaved);

  return (
    <>
      {!vaultReady ? <div className="a2-note warn a2-mt12">{t(dict, 'integrations.vaultMissing')}</div> : null}
      <div className="a2-note warn a2-mt12" data-testid="keys-warn">
        <ShellIcon name="alert" size={16} />
        <div>
          <b>{k('warnLead')}</b> {k('warnBody')}
        </div>
      </div>
      <div className="a2-kpis k3 a2-mt12" data-testid="keys-kpis">
        <div className="a2-card a2-kpi">
          <div className="a2-kl">{k('working')}</div>
          <div className="a2-kv">{count('ok')}</div>
        </div>
        <div className="a2-card a2-kpi">
          <div className="a2-kl">{k('attention')}</div>
          <div className="a2-kv">{count('err')}</div>
          {count('err') ? <div className="a2-xs a2-mute">{k('attentionSub')}</div> : null}
        </div>
        <div className="a2-card a2-kpi">
          <div className="a2-kl">{k('notSet')}</div>
          <div className="a2-kv">{count('none')}</div>
          <div className="a2-xs a2-mute">{k('notSetSub')}</div>
        </div>
      </div>
      {KEY_GROUPS.map((g) => card(g, MAIN_ROWS[g], false))}
      <details className="a2-card a2-mt12 a2-more-opts" data-testid="keys-more">
        <summary>
          <b>{k('more.title')}</b> <span className="a2-xs a2-mute">{k('more.sub')}</span>
        </summary>
        <p className="a2-xs a2-mute a2-mt6">{k('more.note')}</p>
        {KEY_GROUPS.map((g) => card(g, MORE_ROWS[g], true))}
        {strays.length ? <section className="a2-card a2-mt12">{strays.map(row)}</section> : null}
        <section className="a2-card a2-mt12" data-testid="keys-remove">
          <h2 className="a2-h4">{k('more.remove')}</h2>
          <p className="a2-xs a2-mute">{k('more.removeHint')}</p>
          {removable.length ? (
            <div>
              {removable.map((c) => (
                <div className="set-key set-key-rm" key={c.id}>
                  <b>{name(c.id)}</b>
                  <span />
                  <div className="set-key-acts">
                    <button type="button" className="a2-btn sm" disabled={!editable || busy !== null} onClick={() => onRemove(c)}>
                      {t(dict, 'integrations.remove')}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="a2-sm a2-mute a2-mt6">{k('more.removeNone')}</p>
          )}
        </section>
      </details>
      {open ? (
        <KeyDialog
          dict={dict}
          c={open}
          onClose={() => setOpen(null)}
          onSaved={async (a) => {
            await reload();
            const ok = (a.data.test as { ok?: boolean } | undefined)?.ok;
            setOpen(null);
            showToast({ text: ok ? k('toastSaved', { name: name(open.id) }) : t(dict, 'integrations.toast.savedFailed'), tone: ok ? 'ok' : 'bad' });
          }}
        />
      ) : null}
    </>
  );
}

type Settled = Promise<void>;

/** The key window (prototype: "Key for …", the service's boxes, "Check & save"): the boxes are the connection's own fields. */
function KeyDialog({ dict, c, onClose, onSaved }: { dict: Dict; c: ConnectionView; onClose: () => void; onSaved: (a: Answer) => Settled }) {
  const box = useRef<HTMLDivElement>(null);
  const k = (key: string, vars?: Record<string, string | number>) => t(dict, `integrations.keys.${key}`, vars);
  const [config, setConfig] = useState<Record<string, string>>(() => Object.fromEntries(c.config.map((f) => [f.field, f.value ?? ''])));
  const [secrets, setSecrets] = useState<Record<string, string>>(() => Object.fromEntries(c.secrets.map((f) => [f.field, ''])));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [bad, setBad] = useState<string[]>([]);
  useDialogKeys(box, onClose);
  const label = (field: string) => t(dict, `connections.${c.id}.fields.${field}`);
  const ready = c.secrets.every((f) => (secrets[f.field] ?? '').trim().length > 0 || (f.optional && !(secrets[f.field] ?? '').trim())) && c.config.every((f) => f.optional || (config[f.field] ?? '').trim());
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!ready || busy) return;
    setBusy(true);
    setError('');
    setBad([]);
    const a = await call('POST', `/api/admin/integrations/${encodeURIComponent(c.id)}`, { action: 'save', secrets, config });
    setBusy(false);
    if (a.status === 200) {
      setSecrets(Object.fromEntries(c.secrets.map((f) => [f.field, '']))); // never kept
      await onSaved(a);
      return;
    }
    const details = a.data.details ?? [];
    setBad(details);
    setError(errorText(dict, a, { fields: details.map((d) => label(d.split('.').slice(1).join('.'))).join(', ') }));
  };
  const field = (kind: 'config' | 'secrets', f: { field: string; optional: boolean }) => {
    const id = `ky-${kind}-${f.field}`;
    const secret = kind === 'secrets';
    const set = secret ? setSecrets : setConfig;
    return (
      <div className="a2-fld a2-mt12" key={id}>
        <label className="a2-lbl" htmlFor={id}>
          {label(f.field)} {f.optional ? <span className="a2-xs a2-mute">{t(dict, 'integrations.modal.optional')}</span> : null}
        </label>
        <input id={id} className="a2-inp" type={secret ? 'password' : 'text'} autoComplete="off" spellCheck={false} autoCapitalize="off" value={(secret ? secrets : config)[f.field] ?? ''} aria-invalid={bad.includes(`${kind}.${f.field}`) || undefined} onChange={(e) => set((s) => ({ ...s, [f.field]: e.target.value }))} />
      </div>
    );
  };
  if (typeof document === 'undefined') return null;
  return createPortal(
    <div className="adm2 a2-z a2-ov mid" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={box} className="a2-dlg" role="dialog" aria-modal="true" aria-label={k('sheet.title', { name: t(dict, `connections.${c.id}.name`) })} data-testid="key-sheet">
        <div className="a2-dlgh">
          <h2 className="a2-h3">{k('sheet.title', { name: t(dict, `connections.${c.id}.name`) })}</h2>
          <button type="button" className="a2-icb" onClick={onClose} aria-label={k('sheet.close')}>
            <ShellIcon name="x" size={18} />
          </button>
        </div>
        <form className="a2-dlgb" onSubmit={submit} noValidate autoComplete="off" id="ky-form">
          {c.config.map((f) => field('config', f))}
          {c.secrets.map((f) => field('secrets', f))}
          <p className="a2-xs a2-mute a2-mt12">{k('sheet.hint')}</p>
          {error ? (
            <p className="a2-sm a2-mt6" role="alert" style={{ color: 'var(--lm-bad)' }}>
              {error}
            </p>
          ) : null}
        </form>
        <div className="a2-dlgf">
          <button type="button" className="a2-btn" onClick={onClose}>
            {k('sheet.cancel')}
          </button>
          <button type="submit" form="ky-form" className="a2-btn pri" disabled={!ready || busy} data-ok>
            {busy ? k('sheet.saving') : k('sheet.save')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
