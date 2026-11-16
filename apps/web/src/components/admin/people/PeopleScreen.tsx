'use client';
// PR 1020 (D12): drawn as the prototype's Team & roles top (m-settings.js renderTeam): the 2-step warning, the Staff table (click a
// row: role, 2-step, last active, turn access off or on) and, under "More options", everything the real People page did (give or take
// several roles, suspend, archive, reset 2-step login, add with a password you choose, show archived).
// S28 · PR 705 — Settings → People: who can sign in, their roles, status and 2-step login. Adding, changing the status,
// resetting the 2-step login and giving or taking a role go through the staff routes that already exist (each checked and
// audited there); nothing is deleted: a person who leaves is "Archived" and their past work stays in the activity log.
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useState } from 'react';
import { t, type Dict } from '@/lib/i18n';
import type { PeopleView, PersonRow } from '@/lib/people';
import { agoParts } from '@/lib/keys-groups';
import { call } from '../api';
import { showToast } from '../lumen/Toast';
import { ConfirmDialog } from '../settings/ConfirmDialog';
import { Drawer } from '../shell/Drawer';
import { ShellIcon } from '../shell/ShellIcon';

type Do = { (): ReturnType<typeof call> };

export interface PeopleScreenProps {
  dict: Dict;
  lang: 'en' | 'bn';
  view: PeopleView;
  canManage: boolean;
  me: string | null;
  /** The server's clock when the page was drawn ("5 min ago" matches on server and browser). */
  now: number;
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
  const tm = (k: string, vars?: Record<string, string | number>) => t(p.dict, `people.team.${k}`, vars);
  const [sel, setSel] = useState<PersonRow | null>(null);
  const [newRole, setNewRole] = useState('');
  const [ask, setAsk] = useState<'role' | 'off' | 'on' | null>(null);
  const noTwo = v.people.filter((x) => x.status === 'ACTIVE' && !x.twoFactor);
  const ago = (iso: string) => {
    const a = agoParts(iso, p.now);
    return tm(`ago.${a.unit}`, { n: a.n });
  };
  const roleBadge = (x: PersonRow) => {
    const r = x.roles[0];
    if (!r) return <span className="a2-pill line">{c('noRole')}</span>;
    return <span className={`a2-pill ${r.key === 'owner' ? 'g' : 'line'}`}>{nameOf(r)}{x.roles.length > 1 ? ` +${x.roles.length - 1}` : ''}</span>;
  };
  const isOwnerRow = (x: PersonRow) => x.roles.some((r) => r.key === 'owner');
  const open = (x: PersonRow) => {
    setSel(x);
    setNewRole(x.roles[0]?.roleId ?? '');
  };
  const errText = (a: { status: number; data: { error?: string } }) => {
    const k = `people.errors.${a.status === 0 ? 'network' : (a.data.error ?? 'server-error')}`;
    const m = t(p.dict, k);
    return m === k ? t(p.dict, 'people.errors.server-error') : m;
  };
  /** The drawer's role change: the old role(s) off, the new one on, with the owner's PIN (prototype: "Change role?"). */
  async function changeRole(x: PersonRow, pin: string): Promise<string | null> {
    for (const r of x.roles) {
      const a = await call('POST', `/api/admin/staff/${x.id}/roles`, { action: 'revoke', assignmentId: r.assignmentId, pin });
      if (!a.data.ok) return errText(a);
    }
    if (newRole) {
      const b = await call('POST', `/api/admin/staff/${x.id}/roles`, { action: 'assign', roleId: newRole, storeId: null, pin });
      if (!b.data.ok) return errText(b);
    }
    showToast({ text: c('roleGiven'), tone: 'ok' });
    setAsk(null);
    setSel(null);
    router.refresh();
    return null;
  }
  async function access(x: PersonRow, on: boolean, pin: string): Promise<string | null> {
    const a = await call('PATCH', `/api/admin/staff/${x.id}`, { status: on ? 'ACTIVE' : 'SUSPENDED', pin });
    if (!a.data.ok) return errText(a);
    showToast({ text: on ? c('activated') : c('suspended'), tone: 'ok' });
    setAsk(null);
    setSel(null);
    router.refresh();
    return null;
  }
  const live = v.people.filter((x) => x.status !== 'ARCHIVED');
  return (
    <>
      {noTwo.length ? (
        <div className="a2-note warn a2-mt12" data-testid="tm-no2fa">
          <ShellIcon name="alert" size={16} />
          <div>
            <b>{noTwo.map((x) => x.name).join(', ')}</b> {tm('no2fa')}{' '}
            <Link className="a2-lnk" href="/admin/settings/security">
              {tm('open')} →
            </Link>
          </div>
        </div>
      ) : null}
      <section className="a2-card a2-mt12" data-testid="pp-staff">
        <h2 className="a2-h4">{tm('staff.title')}</h2>
        <div className="a2-tblw a2-mt6">
          <table className="a2-tbl" data-testid="pp-table">
            <thead>
              <tr>
                <th>{tm('staff.name')}</th>
                <th>{tm('staff.role')}</th>
                <th className="a2-tdx">{tm('staff.twoStep')}</th>
                <th className="a2-tdx">{tm('staff.lastActive')}</th>
                <th className="a2-tdx" />
              </tr>
            </thead>
            <tbody>
              {live.map((x) => (
                <tr key={x.id} data-testid="tm-row" tabIndex={0} onClick={() => open(x)} onKeyDown={(e) => (e.key === 'Enter' ? open(x) : undefined)}>
                  <td className="a2-tdh">
                    <div className="a2-cell">
                      <b>
                        {x.name} {x.id === p.me ? <span className="a2-xs a2-mute">({c('you')})</span> : null}
                      </b>
                      <span>{x.email}</span>
                    </div>
                  </td>
                  <td data-l={tm('staff.role')}>{roleBadge(x)}</td>
                  <td className="a2-tdx">{x.twoFactor ? <span className="a2-pill ok">{tm('staff.on')}</span> : <span className="a2-pill warn">{tm('staff.off')}</span>}</td>
                  <td className="a2-tdx">{x.status !== 'ACTIVE' ? <span className="a2-pill bad">{tm('staff.accessOff')}</span> : <span className="a2-sm">{x.lastLoginAt ? ago(x.lastLoginAt) : tm('staff.never')}</span>}</td>
                  <td className="a2-tdx r a2-mute a2-sm">{tm('staff.activity')} ›</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {sel ? (
        <Drawer
          title={sel.name}
          closeLabel={tm('drawer.close')}
          onClose={() => setSel(null)}
          testId="tm-drawer"
          foot={
            isOwnerRow(sel) || !p.canManage || sel.id === p.me ? null : (
              <>
                {sel.status === 'ACTIVE' ? (
                  <button type="button" className="a2-btn badf" onClick={() => setAsk('off')} data-testid="tm-off">
                    {tm('drawer.off')}
                  </button>
                ) : (
                  <button type="button" className="a2-btn" onClick={() => setAsk('on')} data-testid="tm-on">
                    {tm('drawer.on')}
                  </button>
                )}
                <button type="button" className="a2-btn pri" onClick={() => (newRole !== (sel.roles[0]?.roleId ?? '') ? setAsk('role') : setSel(null))} data-testid="tm-save">
                  {tm('drawer.save')}
                </button>
              </>
            )
          }
        >
          {isOwnerRow(sel) ? null : (
            <div className="a2-card">
              <div className="a2-fld">
                <label className="a2-lbl" htmlFor="tm-role">{tm('staff.role')}</label>
                <select id="tm-role" className="a2-inp" disabled={!p.canManage || sel.id === p.me} value={newRole} onChange={(e) => setNewRole(e.target.value)}>
                  <option value="">{c('noRole')}</option>
                  {v.roles.filter((r) => !r.isOwner).map((r) => (
                    <option key={r.id} value={r.id}>
                      {nameOf(r)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="s28-row between a2-mt12">
                <span>{tm('staff.twoStep')}</span>
                {sel.twoFactor ? <span className="a2-pill ok">{tm('staff.on')}</span> : <span className="a2-pill warn">{tm('staff.off')}</span>}
              </div>
              <div className="s28-row between a2-mt6">
                <span>{tm('staff.lastActive')}</span>
                <span>{sel.lastLoginAt ? ago(sel.lastLoginAt) : tm('staff.never')}</span>
              </div>
            </div>
          )}
          <div className="a2-card a2-mt12">
            <h3 className="a2-h4">{tm('drawer.recent')}</h3>
            <p className="a2-sm a2-mt6">
              <Link className="a2-lnk" href={`/admin/settings/activity?who=${sel.id}`}>
                {tm('drawer.recentLink')} →
              </Link>
            </p>
          </div>
          {isOwnerRow(sel) ? null : <div className="a2-note a2-mt12">{tm('drawer.note')}</div>}
        </Drawer>
      ) : null}
      {ask && sel ? (
        <ConfirmDialog
          testId="tm-pin"
          tone="pri"
          texts={{ title: ask === 'role' ? tm('pin.roleTitle') : ask === 'off' ? tm('pin.offTitle') : tm('pin.onTitle'), effects: [ask === 'role' ? tm('pin.roleEffect', { name: sel.name, role: nameOf(v.roles.find((r) => r.id === newRole) ?? { nameEn: c('noRole'), nameBn: c('noRole') }) }) : sel.name], reason: null, cancel: tm('invite.cancel'), ok: ask === 'role' ? tm('pin.roleOk') : ask === 'off' ? tm('pin.offOk') : tm('pin.onOk'), working: tm('pin.working'), close: tm('drawer.close'), pin: tm('pin.label') }}
          onClose={() => setAsk(null)}
          onConfirm={(_r, pin) => (ask === 'role' ? changeRole(sel, pin) : access(sel, ask === 'on', pin))}
        />
      ) : null}
      <details className="a2-card a2-mt12 a2-more-opts" data-testid="pp-more">
        <summary>
          <b>{tm('more.title')}</b> <span className="a2-xs a2-mute">{tm('more.sub')}</span>
        </summary>
        <div className="s28-grid a2-mt12" data-testid="pp-kpi">
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
      </details>
    </>
  );
}
