'use client';
// S28 · PR 705 — Settings → Roles: every role with the permission tree (a group box is ticked when all its pages are on, half when
// some are), save, a new role copied from another, and archive or restore. Changes go through the role routes that already exist
// (checked and audited there: nobody can give a role more than they hold themselves). The owner role always holds everything.
// A role is never deleted: archiving makes it grant nothing.
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { t, type Dict } from '@/lib/i18n';
import { diffKeys, toggleGroup, triOf, type RolesView } from '@/lib/people';
import { call } from '../api';
import { ConfirmDialog } from '../settings/ConfirmDialog';
import { ShellIcon } from '../shell/ShellIcon';
import { useDialogKeys } from '../orders/OrderCommands';
import { showToast } from '../lumen/Toast';

const noSubscribe = () => () => {};

/** PR 841: the "New role" window (prototype m-settings.js, the New role chip): the role's names, which role to start from, Create. */
function NewRoleDialog({ c, from, roles, nameOf, busy, onClose, onCreate }: { c: (k: string) => string; from: string; roles: { id: string; nameEn: string; nameBn: string }[]; nameOf: (r: { nameEn: string; nameBn: string }) => string; busy: boolean; onClose: () => void; onCreate: (nEn: string, nBn: string, from: string) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const [nEn, setNEn] = useState('');
  const [nBn, setNBn] = useState('');
  const [src, setSrc] = useState(from);
  const mounted = useSyncExternalStore(noSubscribe, () => true, () => false);
  useDialogKeys(box, onClose);
  if (!mounted) return null;
  return createPortal(
    <div className="adm2 a2-z a2-ov mid" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={box} className="a2-dlg" role="dialog" aria-modal="true" aria-label={c('new.title')} data-testid="rl-new">
        <div className="a2-dlgh">
          <h2 className="a2-h3">{c('new.title')}</h2>
          <button type="button" className="a2-icb" onClick={onClose} aria-label={c('new.close')}>
            <ShellIcon name="x" size={18} />
          </button>
        </div>
        <div className="a2-dlgb">
          <div className="a2-fld">
            <label className="a2-lbl">{c('new.nameEn')}</label>
            <input className="a2-inp" value={nEn} onChange={(e) => setNEn(e.target.value)} placeholder={c('new.example')} />
          </div>
          <div className="a2-fld a2-mt12">
            <label className="a2-lbl">{c('new.nameBn')}</label>
            <input className="a2-inp" value={nBn} onChange={(e) => setNBn(e.target.value)} />
          </div>
          <div className="a2-fld a2-mt12">
            <label className="a2-lbl">{c('new.from')}</label>
            <select className="a2-inp" value={src} onChange={(e) => setSrc(e.target.value)}>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {nameOf(r)}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="a2-dlgf">
          <button type="button" className="a2-btn" onClick={onClose}>
            {c('new.cancel')}
          </button>
          <button type="button" className="a2-btn pri" data-ok disabled={busy || !nEn.trim() || !nBn.trim()} onClick={() => onCreate(nEn.trim(), nBn.trim(), src)} data-testid="rl-create">
            {c('new.go')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

type Do = { (): ReturnType<typeof call> };

export interface RolesScreenProps {
  dict: Dict;
  lang: 'en' | 'bn';
  view: RolesView;
  canManage: boolean;
}

function Box({ state, label, disabled, onChange }: { state: 'all' | 'some' | 'none'; label: string; disabled: boolean; onChange: (on: boolean) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = state === 'some';
  }, [state]);
  return (
    <label className="s28-row">
      <input ref={ref} type="checkbox" checked={state === 'all'} disabled={disabled} onChange={(e) => onChange(e.target.checked)} /> {label}
    </label>
  );
}

export function RolesScreen(p: RolesScreenProps) {
  const router = useRouter();
  const c = (k: string, vars?: Record<string, string | number>) => t(p.dict, `people.roles.${k}`, vars);
  const live = p.view.roles;
  const [id, setId] = useState(live.find((r) => !r.archived)?.id ?? live[0]?.id ?? '');
  const role = live.find((r) => r.id === id) ?? live[0];
  const nameOf = (r: { nameEn: string; nameBn: string }) => (p.lang === 'bn' ? r.nameBn : r.nameEn);
  const lab = (l: { en: string; bn: string }) => (p.lang === 'bn' ? l.bn : l.en);
  const [held, setHeld] = useState<Set<string>>(() => new Set(role?.permissions ?? []));
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [askPin, setAskPin] = useState(false);
  const from = live.find((r) => !r.isOwner && !r.archived)?.id ?? '';
  const locked = !p.canManage || !role || role.isOwner || role.archived;
  const base = new Set(role?.permissions ?? []);
  const d = diffKeys(base, held);
  const changes = d.added.length + d.removed.length;
  const pick = (rid: string) => {
    setId(rid);
    setHeld(new Set(live.find((r) => r.id === rid)?.permissions ?? []));
    setSaid(null);
  };
  function fail(status: number, error?: string) {
    const k = `people.errors.${status === 0 ? 'network' : (error ?? 'server-error')}`;
    const m = t(p.dict, k);
    setSaid(m === k ? t(p.dict, 'people.errors.server-error') : m);
  }
  async function go(fn: Do, done: string) {
    setBusy(true);
    setSaid(null);
    const a = await fn();
    setBusy(false);
    if (a.data.ok) {
      showToast({ text: done, tone: 'ok' });
      router.refresh();
    } else fail(a.status, a.data.error);
  }
  return (
    <>
      <section className="a2-card a2-mt12" data-testid="rl-tree">
        <h2 className="a2-h4">{c('cardTitle')}</h2>
        <div className="s28-row between a2-mt6">
          <div className="s28-row" role="tablist" data-testid="rl-tabs">
            {live.map((r) => (
              <button key={r.id} type="button" className="s28-chip" aria-current={r.id === role?.id ? 'true' : undefined} style={r.id === role?.id ? { fontWeight: 700 } : undefined} onClick={() => pick(r.id)}>
                {nameOf(r)} <span className="a2-xs a2-mute">{r.people}</span>
                {r.archived ? <span className="a2-xs a2-mute"> ({c('archivedTag')})</span> : null}
              </button>
            ))}
            {p.canManage ? (
              <button type="button" className="s28-chip" onClick={() => setShowNew(true)} data-testid="rl-new-chip">
                <ShellIcon name="plus" size={14} /> {c('new.chip')}
              </button>
            ) : null}
          </div>
          <span className="a2-xs a2-mute">{c('ownerAlways')}</span>
        </div>
        {role ? (
          <>
            <p className="a2-xs a2-mute a2-mt6">{role.isOwner ? c('ownerNote') : role.archived ? c('archivedNote') : c('people', { n: role.people })}</p>
            <div className="s28-list a2-mt6">
              {p.view.tree.map((b) => {
                const keys = b.keys.map((k) => k.key);
                return (
                  <details key={b.group} className="a2-mt6" open={triOf(keys, held) !== 'none'}>
                    <summary className="s28-sum">
                      <Box state={role.isOwner ? 'all' : triOf(keys, held)} label={lab(b.label)} disabled={locked} onChange={(on) => setHeld(toggleGroup(held, keys, on))} />
                      <span className="a2-xs a2-mute"> {keys.filter((k) => role.isOwner || held.has(k)).length}/{keys.length}</span>
                    </summary>
                    <div className="a2-mt6" style={{ paddingLeft: 24 }}>
                      {b.keys.map((k) => (
                        <label key={k.key} className="s28-row">
                          <input type="checkbox" checked={role.isOwner || held.has(k.key)} disabled={locked} onChange={(e) => setHeld(toggleGroup(held, [k.key], e.target.checked))} /> {lab(k.label)}
                        </label>
                      ))}
                    </div>
                  </details>
                );
              })}
              <details className="a2-mt6" data-testid="rl-system">
                <summary className="s28-sum">
                  {c('systemGroup')} <span className="a2-pill dark">{c('ownerOnly')}</span>
                </summary>
              </details>
            </div>
            <div className="s28-row between a2-mt12">
              <span className="a2-xs a2-mute">{c('tickNote')}</span>
              {said ? <p className="a2-sm s28-bad" role="alert">{said}</p> : null}
              {p.canManage && !role.isOwner ? (
                <div className="s28-row">
                  {!role.archived ? (
                    <>
                      <button type="button" className="a2-btn" disabled={busy || !changes} onClick={() => setHeld(new Set(role.permissions))} data-testid="rl-undo">{c('undo')}</button>
                      <button type="button" className="a2-btn pri" disabled={busy || !changes} onClick={() => setAskPin(true)} data-testid="rl-save">{c('save')}</button>
                      <span className="a2-xs a2-mute">{changes ? c('changes', { a: d.added.length, r: d.removed.length }) : c('noChanges')}</span>
                    </>
                  ) : null}
                  <button type="button" className="a2-btn" disabled={busy} onClick={() => go(() => call('PATCH', `/api/admin/roles/${role.id}`, { archived: !role.archived }), role.archived ? c('restored') : c('archived'))}>{role.archived ? c('restore') : c('archive')}</button>
                </div>
              ) : null}
            </div>
          </>
        ) : null}
      </section>
      {showNew ? (
        <NewRoleDialog
          c={c}
          from={from}
          roles={live.filter((r) => !r.isOwner && !r.archived)}
          nameOf={nameOf}
          busy={busy}
          onClose={() => setShowNew(false)}
          onCreate={(nEn, nBn, src) => {
            setShowNew(false);
            void go(() => call('POST', '/api/admin/roles', { nameEn: nEn, nameBn: nBn, permissions: live.find((r) => r.id === src)?.permissions ?? [] }), c('created'));
          }}
        />
      ) : null}
      {askPin && role ? (
        <ConfirmDialog
          testId="rl-pin"
          tone="pri"
          texts={{ title: c('pin.title'), effects: [c('pin.effect', { name: nameOf(role) })], reason: null, cancel: c('new.cancel'), ok: c('pin.ok'), working: c('pin.working'), close: c('new.close'), pin: c('pin.label') }}
          onClose={() => setAskPin(false)}
          onConfirm={async (_reason, pin) => {
            const a = await call('PATCH', `/api/admin/roles/${role.id}`, { permissions: [...held], pin });
            if (a.data.ok) {
              setAskPin(false);
              showToast({ text: c('saved'), tone: 'ok' });
              router.refresh();
              return null;
            }
            const k = `people.errors.${a.status === 0 ? 'network' : (a.data.error ?? 'server-error')}`;
            const m = t(p.dict, k);
            return m === k ? t(p.dict, 'people.errors.server-error') : m;
          }}
        />
      ) : null}
    </>
  );
}
