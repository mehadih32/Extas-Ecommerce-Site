'use client';
// S28 · PR 705 — Settings → People: who can sign in, their roles, status and 2-step login. Adding, changing the status,
// resetting the 2-step login and giving or taking a role go through the staff routes that already exist (each checked and
// audited there); nothing is deleted: a person who leaves is "Archived" and their past work stays in the activity log.
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { t, type Dict } from '@/lib/i18n';
import type { PeopleView, PersonRow } from '@/lib/people';
import { call } from '../api';
import { showToast } from '../lumen/Toast';

type Do = { (): ReturnType<typeof call> };

export interface PeopleScreenProps {
  dict: Dict;
  lang: 'en' | 'bn';
  view: PeopleView;
  canManage: boolean;
  me: string | null;
}

const STATUS_TONE: Record<string, string> = { ACTIVE: 's28-good', SUSPENDED: 's28-warn', ARCHIVED: 'a2-mute' };

export function PeopleScreen(p: PeopleScreenProps) {
  const router = useRouter();
  const c = (k: string, vars?: Record<string, string | number>) => t(p.dict, `people.${k}`, vars);
  const v = p.view;
  const nameOf = (r: { nameEn: string; nameBn: string }) => (p.lang === 'bn' ? r.nameBn : r.nameEn);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [role, setRole] = useState('');
  const [pick, setPick] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<string | null>(null);
  const [show, setShow] = useState<'ACTIVE' | 'all'>('ACTIVE');
  const fail = (status: number, error?: string) => {
    const k = `people.errors.${status === 0 ? 'network' : (error ?? 'server-error')}`;
    const m = t(p.dict, k);
    setSaid(m === k ? t(p.dict, 'people.errors.server-error') : m);
  };
  async function run(fn: Do, done: string) {
    setBusy(true);
    setSaid(null);
    const a = await fn();
    setBusy(false);
    if (a.data.ok) {
      showToast({ text: done, tone: 'ok' });
      router.refresh();
      return true;
    }
    fail(a.status, a.data.error);
    return false;
  }
  async function add() {
    setBusy(true);
    setSaid(null);
    const a = await call('POST', '/api/admin/staff', { email: email.trim(), displayName: name.trim(), password: pw });
    const id = (a.data as { staff?: { id?: string } }).staff?.id;
    if (a.data.ok && id && role) {
      const b = await call('POST', `/api/admin/staff/${id}/roles`, { action: 'assign', roleId: role, storeId: null });
      if (!b.data.ok) fail(b.status, b.data.error);
    }
    setBusy(false);
    if (a.data.ok) {
      setName('');
      setEmail('');
      setPw('');
      setRole('');
      showToast({ text: c('added'), tone: 'ok' });
      router.refresh();
    } else fail(a.status, a.data.error);
  }
  const rows = v.people.filter((x) => show === 'all' || x.status === 'ACTIVE');
  const row = (x: PersonRow) => {
    const free = v.roles.filter((r) => !x.roles.some((h) => h.roleId === r.id));
    return (
      <div key={x.id} className="a2-card a2-mt6" data-testid="pp-row">
        <div className="s28-row between">
          <div>
            <b>{x.name}</b> {x.id === p.me ? <span className="a2-xs a2-mute">({c('you')})</span> : null}
            <div className="a2-xs a2-mute">{x.email}</div>
          </div>
          <div className="s28-row">
            <span className={`s28-chip ${STATUS_TONE[x.status] ?? ''}`}>{c(`status.${x.status}`)}</span>
            <span className={`a2-xs ${x.twoFactor ? 's28-good' : 's28-warn'}`}>{x.twoFactor ? c('twoFactorOn') : c('twoFactorOff')}</span>
          </div>
        </div>
        <div className="s28-row a2-mt6">
          {x.roles.length ? x.roles.map((r) => (
            <span key={r.assignmentId} className="s28-chip">
              {nameOf(r)}
              {p.canManage && x.id !== p.me ? <button type="button" className="a2-xs" style={{ marginLeft: 6 }} aria-label={`${c('take')} ${nameOf(r)}`} disabled={busy} onClick={() => run(() => call('POST', `/api/admin/staff/${x.id}/roles`, { action: 'revoke', assignmentId: r.assignmentId }), c('roleTaken'))}>x</button> : null}
            </span>
          )) : <span className="a2-xs a2-mute">{c('noRole')}</span>}
        </div>
        <div className="a2-xs a2-mute a2-mt6">{x.lastLoginAt ? c('lastLogin', { d: x.lastLoginAt.slice(0, 10) }) : c('neverLogin')}{x.mustChangePassword ? ` · ${c('mustChange')}` : ''}</div>
        {p.canManage && x.id !== p.me ? (
          <div className="s28-row a2-mt6">
            {free.length ? (
              <>
                <select className="a2-inp" aria-label={c('giveRole')} value={pick[x.id] ?? ''} onChange={(e) => setPick({ ...pick, [x.id]: e.target.value })}>
                  <option value="">{c('giveRole')}</option>
                  {free.map((r) => <option key={r.id} value={r.id}>{nameOf(r)}</option>)}
                </select>
                <button type="button" className="a2-btn" disabled={busy || !pick[x.id]} onClick={() => run(() => call('POST', `/api/admin/staff/${x.id}/roles`, { action: 'assign', roleId: pick[x.id], storeId: null }), c('roleGiven'))}>{c('give')}</button>
              </>
            ) : null}
            {x.status === 'ACTIVE' ? <button type="button" className="a2-btn" disabled={busy} onClick={() => run(() => call('PATCH', `/api/admin/staff/${x.id}`, { status: 'SUSPENDED' }), c('suspended'))}>{c('suspend')}</button> : null}
            {x.status === 'SUSPENDED' ? <button type="button" className="a2-btn" disabled={busy} onClick={() => run(() => call('PATCH', `/api/admin/staff/${x.id}`, { status: 'ACTIVE' }), c('activated'))}>{c('activate')}</button> : null}
            {x.status !== 'ARCHIVED' ? <button type="button" className="a2-btn" disabled={busy} onClick={() => run(() => call('PATCH', `/api/admin/staff/${x.id}`, { status: 'ARCHIVED' }), c('archived'))}>{c('archive')}</button> : <button type="button" className="a2-btn" disabled={busy} onClick={() => run(() => call('PATCH', `/api/admin/staff/${x.id}`, { status: 'ACTIVE' }), c('activated'))}>{c('activate')}</button>}
            {x.twoFactor ? <button type="button" className="a2-btn" disabled={busy} onClick={() => run(() => call('PATCH', `/api/admin/staff/${x.id}`, { resetTwoFactor: true }), c('twoFactorReset'))}>{c('resetTwoFactor')}</button> : null}
          </div>
        ) : null}
      </div>
    );
  };
  return (
    <>
      <div className="s28-grid" data-testid="pp-kpi">
        <div className="a2-card"><div className="a2-xs a2-mute">{c('kpi.active')}</div><b className="a2-h3">{v.counts.active}</b></div>
        <div className="a2-card"><div className="a2-xs a2-mute">{c('kpi.suspended')}</div><b className="a2-h3">{v.counts.suspended}</b></div>
        <div className="a2-card"><div className="a2-xs a2-mute">{c('kpi.noTwoFactor')}</div><b className={`a2-h3 ${v.counts.noTwoFactor ? 's28-warn' : ''}`}>{v.counts.noTwoFactor}</b></div>
      </div>
      <div className="s28-row a2-mt12" role="tablist">
        <button type="button" className="s28-chip" aria-current={show === 'ACTIVE' ? 'true' : undefined} onClick={() => setShow('ACTIVE')}>{c('show.active')}</button>
        <button type="button" className="s28-chip" aria-current={show === 'all' ? 'true' : undefined} onClick={() => setShow('all')}>{c('show.all')}</button>
      </div>
      {said ? <p className="a2-sm a2-mt6 s28-bad" role="alert">{said}</p> : null}
      <div data-testid="pp-list">{rows.length ? rows.map(row) : <p className="a2-sm a2-mute a2-mt12">{c('empty')}</p>}</div>
      {p.canManage ? (
        <section className="a2-card a2-mt12" data-testid="pp-add">
          <h2 className="a2-h3">{c('add.title')}</h2>
          <div className="s28-row a2-mt6">
            <label>{c('add.name')}<input className="a2-inp" value={name} onChange={(e) => setName(e.target.value)} /></label>
            <label>{c('add.email')}<input className="a2-inp" type="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
            <label>{c('add.password')}<input className="a2-inp" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} /></label>
            <label>{c('add.role')}
              <select className="a2-inp" value={role} onChange={(e) => setRole(e.target.value)}>
                <option value="">{c('add.noRole')}</option>
                {v.roles.filter((r) => !r.isOwner).map((r) => <option key={r.id} value={r.id}>{nameOf(r)}</option>)}
              </select>
            </label>
          </div>
          <p className="a2-xs a2-mute">{c('add.note')}</p>
          <button type="button" className="a2-btn a2-mt6" disabled={busy || !name.trim() || !email.trim() || !pw} onClick={add} data-testid="pp-add-go">{c('add.go')}</button>
        </section>
      ) : null}
    </>
  );
}
