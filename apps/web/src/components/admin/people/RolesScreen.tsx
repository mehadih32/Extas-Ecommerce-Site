'use client';
// S28 · PR 705 — Settings → Roles: every role with the permission tree (a group box is ticked when all its pages are on, half when
// some are), save, a new role copied from another, and archive or restore. Changes go through the role routes that already exist
// (checked and audited there: nobody can give a role more than they hold themselves). The owner role always holds everything.
// A role is never deleted: archiving makes it grant nothing.
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { t, type Dict } from '@/lib/i18n';
import { diffKeys, toggleGroup, triOf, type RolesView } from '@/lib/people';
import { call } from '../api';
import { showToast } from '../lumen/Toast';

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
  const [nEn, setNEn] = useState('');
  const [nBn, setNBn] = useState('');
  const [from, setFrom] = useState(live.find((r) => !r.isOwner)?.id ?? '');
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
      <div className="s28-row a2-mt12" role="tablist" data-testid="rl-tabs">
        {live.map((r) => (
          <button key={r.id} type="button" className="s28-chip" aria-current={r.id === role?.id ? 'true' : undefined} style={r.id === role?.id ? { fontWeight: 700 } : undefined} onClick={() => pick(r.id)}>
            {nameOf(r)} <span className="a2-xs a2-mute">{r.people}</span>
            {r.archived ? <span className="a2-xs a2-mute"> ({c('archivedTag')})</span> : null}
          </button>
        ))}
      </div>
      {role ? (
        <section className="a2-card a2-mt12" data-testid="rl-tree">
          <div className="s28-row between">
            <h2 className="a2-h3">{nameOf(role)}</h2>
            <span className="a2-xs a2-mute">{role.isOwner ? c('ownerNote') : role.archived ? c('archivedNote') : c('people', { n: role.people })}</span>
          </div>
          <p className="a2-xs a2-mute">{c('tickNote')}</p>
          <div className="s28-list a2-mt6">
            {p.view.tree.map((b) => {
              const keys = b.keys.map((k) => k.key);
              return (
                <details key={b.group} className="a2-mt6" open={triOf(keys, held) !== 'none'}>
                  <summary>
                    <Box state={role.isOwner ? 'all' : triOf(keys, held)} label={lab(b.label)} disabled={locked} onChange={(on) => setHeld(toggleGroup(held, keys, on))} />
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
          </div>
          {said ? <p className="a2-sm a2-mt6 s28-bad" role="alert">{said}</p> : null}
          {p.canManage && !role.isOwner ? (
            <div className="s28-row a2-mt12">
              {!role.archived ? (
                <>
                  <button type="button" className="a2-btn" disabled={busy || !changes} onClick={() => go(() => call('PATCH', `/api/admin/roles/${role.id}`, { permissions: [...held] }), c('saved'))} data-testid="rl-save">{c('save')}</button>
                  <button type="button" className="a2-btn" disabled={busy || !changes} onClick={() => setHeld(new Set(role.permissions))}>{c('undo')}</button>
                  <span className="a2-xs a2-mute">{changes ? c('changes', { a: d.added.length, r: d.removed.length }) : c('noChanges')}</span>
                </>
              ) : null}
              <span className="grow" />
              <button type="button" className="a2-btn" disabled={busy} onClick={() => go(() => call('PATCH', `/api/admin/roles/${role.id}`, { archived: !role.archived }), role.archived ? c('restored') : c('archived'))}>{role.archived ? c('restore') : c('archive')}</button>
            </div>
          ) : null}
        </section>
      ) : null}
      {p.canManage ? (
        <section className="a2-card a2-mt12" data-testid="rl-new">
          <h2 className="a2-h3">{c('new.title')}</h2>
          <div className="s28-row a2-mt6">
            <label>{c('new.nameEn')}<input className="a2-inp" value={nEn} onChange={(e) => setNEn(e.target.value)} /></label>
            <label>{c('new.nameBn')}<input className="a2-inp" value={nBn} onChange={(e) => setNBn(e.target.value)} /></label>
            <label>{c('new.from')}
              <select className="a2-inp" value={from} onChange={(e) => setFrom(e.target.value)}>
                {live.filter((r) => !r.isOwner && !r.archived).map((r) => <option key={r.id} value={r.id}>{nameOf(r)}</option>)}
              </select>
            </label>
          </div>
          <button type="button" className="a2-btn a2-mt6" disabled={busy || !nEn.trim() || !nBn.trim()} onClick={() => go(() => call('POST', '/api/admin/roles', { nameEn: nEn.trim(), nameBn: nBn.trim(), permissions: live.find((r) => r.id === from)?.permissions ?? [] }), c('created'))} data-testid="rl-create">{c('new.go')}</button>
        </section>
      ) : null}
    </>
  );
}
