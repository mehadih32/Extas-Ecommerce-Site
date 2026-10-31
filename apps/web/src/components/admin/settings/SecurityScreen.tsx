'use client';
// S18 · PR 380 — the two cards of Settings › Sign-in & security that are not plain fields: the admin address list (a
// switch and one address a line, "Add my address", saved whole like any card; the server refuses a list that is on
// without the address it is saved from) and "Your logins" (the device list with "Log out" per device and "Log out
// everywhere else" behind a confirm; /api/admin/auth/sessions, PR 15). Words come from the page.
import { useEffect, useId, useState } from 'react';
import { call } from '../api';
import { ShellIcon } from '../shell/ShellIcon';
import { ConfirmDialog } from './ConfirmDialog';
import { deviceName } from '@/lib/admin-security/device';

type Words = Record<string, string>;
const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (m, k: string) => (k in v ? String(v[k]) : m));

export interface AllowlistScreen {
  key: 'allowlist';
  value: { enabled: boolean; entries: string[] };
  version: string;
}

export function AllowlistCard({ screen, ip, breakGlass, canEdit, w }: { screen: AllowlistScreen; ip: string | null; breakGlass: boolean; canEdit: boolean; w: Words }) {
  const id = useId();
  const [base, setBase] = useState(screen);
  const [enabled, setEnabled] = useState(screen.value.enabled);
  const [text, setText] = useState(screen.value.entries.join('\n'));
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<{ text: string; bad: boolean } | null>(null);
  const entries = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  const dirty = enabled !== base.value.enabled || entries.join('\n') !== base.value.entries.join('\n');
  const off = !canEdit || busy;
  const reset = (s: AllowlistScreen) => {
    setBase(s);
    setEnabled(s.value.enabled);
    setText(s.value.entries.join('\n'));
  };
  async function save() {
    setBusy(true);
    const a = await call('PUT', '/api/admin/security', { key: 'allowlist', value: { enabled, entries }, version: base.version });
    setBusy(false);
    const cards = a.data.cards as Record<string, AllowlistScreen> | undefined;
    if (a.status === 200 && cards?.allowlist) {
      reset(cards.allowlist);
      return setSaid({ text: w.saved!, bad: false });
    }
    const code = a.status === 0 ? 'network' : (a.data.error ?? 'other');
    if (code === 'STALE') {
      const g = await call('GET', '/api/admin/security');
      const v = (g.data as { view?: { cards?: Record<string, AllowlistScreen> } }).view;
      if (v?.cards?.allowlist) reset(v.cards.allowlist);
    }
    setSaid({ text: fill(w[`err.${code}`] ?? w['err.other']!, { fields: (a.data.details ?? []).join(', ') }), bad: true });
  }
  return (
    <section className="a2-sc a2-mt12" aria-labelledby={`${id}-h`} data-testid="security-allowlist">
      <div className="a2-sch">
        <div>
          <h2 className="a2-h3" id={`${id}-h`}>
            {w['allowlist.h']}
          </h2>
          <p className="a2-scd">{w['allowlist.d']}</p>
        </div>
      </div>
      {breakGlass ? (
        <div className="a2-note a2-mt12" role="status">
          <ShellIcon name="alert" size={15} />
          <span>{w['allowlist.breakGlass']}</span>
        </div>
      ) : null}
      <div className="a2-fg a2-mt12">
        <div className="a2-swl">
          <span>{w['allowlist.enabled']}</span>
          <button type="button" className={`a2-sw${enabled ? ' on' : ''}`} role="switch" aria-checked={enabled} aria-label={w['allowlist.enabled']} disabled={off} onClick={() => setEnabled(!enabled)} data-testid="security-allowlist-enabled" />
        </div>
        <div className="a2-fld">
          <label className="a2-lbl" htmlFor={`${id}-e`}>
            {w['allowlist.entries']}
          </label>
          <textarea id={`${id}-e`} className="a2-inp" rows={4} value={text} disabled={off} onChange={(e) => setText(e.target.value)} data-testid="security-allowlist-entries" spellCheck={false} />
          <span className="a2-xs a2-mute">
            {ip ? `${fill(w['allowlist.you']!, { ip })} ${entries.length && base.value.entries.includes(ip) ? w['allowlist.youOn'] : w['allowlist.youOff']}` : w['allowlist.unknown']}
          </span>
          {ip && canEdit && !entries.includes(ip) ? (
            <button type="button" className="a2-btn a2-mt6" disabled={off} onClick={() => setText([...entries, ip].join('\n'))} data-testid="security-allowlist-add-mine">
              {w['allowlist.addMine']}
            </button>
          ) : null}
        </div>
      </div>
      <p className="a2-xs a2-mute a2-mt12">{w['allowlist.warn']}</p>
      {!canEdit ? (
        <div className="a2-note">
          <ShellIcon name="lock" size={15} />
          <span>{w.readOnly}</span>
        </div>
      ) : null}
      <div className="a2-scbar">
        <span className={`a2-sm${said?.bad ? '' : ' a2-mute'}`} role="status" aria-live="polite" data-testid="security-allowlist-status">
          {said ? said.text : dirty ? w.unsaved : ''}
        </span>
        {canEdit ? (
          <div className="a2-gap8">
            {dirty ? (
              <button type="button" className="a2-btn" disabled={busy} onClick={() => reset(base)}>
                {w.discard}
              </button>
            ) : null}
            <button type="button" className="a2-btn pri" disabled={busy || !dirty} onClick={save} data-testid="security-allowlist-save">
              {busy ? w.saving : w.save}
            </button>
          </div>
        ) : null}
      </div>
    </section>
  );
}

interface Device {
  id: string;
  current: boolean;
  userAgent: string | null;
  ip: string | null;
  lastSeenAt: string | null;
  createdAt: string;
}

/** The signed-in devices from the sessions API (an empty list when it cannot be read). */
async function fetchDevices(): Promise<Device[]> {
  const a = await call('GET', '/api/admin/auth/sessions');
  return a.status === 200 ? ((a.data.sessions as Device[]) ?? []) : [];
}

export function DevicesCard({ w, locale, timeZone }: { w: Words; locale: string; timeZone: string }) {
  const id = useId();
  const [list, setList] = useState<Device[] | null>(null);
  const [asking, setAsking] = useState(false);
  const [said, setSaid] = useState<string | null>(null);
  const load = async () => setList(await fetchDevices());
  useEffect(() => {
    let live = true;
    fetchDevices().then((l) => live && setList(l));
    return () => {
      live = false;
    };
  }, []);
  const when = (iso: string) => new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short', timeZone }).format(new Date(iso));
  const others = (list ?? []).filter((d) => !d.current);
  async function end(sessionId: string) {
    const a = await call('POST', '/api/admin/auth/sessions', { sessionId });
    setSaid(a.status === 200 ? null : w['devices.error']!);
    await load();
  }
  return (
    <section className="a2-sc a2-mt12" aria-labelledby={`${id}-h`} data-testid="security-devices">
      <div className="a2-sch">
        <div>
          <h2 className="a2-h3" id={`${id}-h`}>
            {w['devices.h']}
          </h2>
          <p className="a2-scd">{w['devices.d']}</p>
        </div>
      </div>
      <ul className="a2-stack a2-mt12" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {(list ?? []).map((d) => (
          <li key={d.id} className="a2-swl" data-testid={d.current ? 'security-device-current' : 'security-device'}>
            <span>
              <b className="a2-blk">
                {deviceName(d.userAgent)}
                {d.current ? ` · ${w['devices.current']}` : ''}
              </b>
              <span className="a2-xs a2-mute">
                {fill(w['devices.seen']!, { when: when(d.lastSeenAt ?? d.createdAt) })}
                {d.ip ? ` ${fill(w['devices.from']!, { ip: d.ip })}` : ''}
              </span>
            </span>
            {!d.current ? (
              <button type="button" className="a2-btn" onClick={() => void end(d.id)}>
                {w['devices.end']}
              </button>
            ) : null}
          </li>
        ))}
      </ul>
      {list && !others.length ? <p className="a2-xs a2-mute a2-mt12">{w['devices.none']}</p> : null}
      <div className="a2-scbar">
        <span className="a2-sm" role="status" aria-live="polite">
          {said ?? ''}
        </span>
        <button type="button" className="a2-btn" disabled={!others.length} onClick={() => setAsking(true)} data-testid="security-devices-all">
          {w['devices.all']}
        </button>
      </div>
      {asking ? (
        <ConfirmDialog
          testId="security-devices-confirm"
          tone="badf"
          texts={{ title: w['devices.confirmTitle']!, effects: [w['devices.confirmText']!], reason: null, cancel: w['devices.cancel']!, ok: w['devices.confirm']!, working: w.saving!, close: w['devices.cancel']! }}
          onClose={() => setAsking(false)}
          onConfirm={async () => {
            const a = await call('POST', '/api/admin/auth/sessions', { all: true });
            if (a.status !== 200) return w['devices.error']!;
            setAsking(false);
            setSaid(fill(w['devices.allDone']!, { n: Number(a.data.revoked ?? 0) }));
            await load();
            return null;
          }}
        />
      ) : null}
    </section>
  );
}
