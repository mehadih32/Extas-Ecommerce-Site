'use client';
// PR 1020 (D12) — Settings › Team & roles: the "Invite staff" button of the page head and its window (prototype m-settings.js
// `#tm-inv`: Name, Email or phone, Role, Send invite). The account is made through the staff route that already exists (checked and
// audited there); the person gets a one-time temporary password, shown here once, and must set their own (and the 2-step login) at
// the first sign-in. Nothing is sent from here: the owner hands the email and the temporary password over.
import { useRouter } from 'next/navigation';
import { useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { t, type Dict } from '@/lib/i18n';
import type { RoleChoice } from '@/lib/people';
import { call } from '../api';
import { useDialogKeys } from '../orders/OrderCommands';
import { showToast } from '../lumen/Toast';
import { ShellIcon } from '../shell/ShellIcon';

const noSubscribe = () => () => {};
const ALPHABET = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // hardcode-ok: letters and digits that cannot be mixed up when read out
const TEMP_LENGTH = 16; // hardcode-ok: the temporary password's own length, it is replaced at the first sign-in

/** A random temporary password from the browser's own secure random numbers. */
function tempPassword(): string {
  const a = new Uint32Array(TEMP_LENGTH);
  crypto.getRandomValues(a);
  return [...a].map((n) => ALPHABET[n % ALPHABET.length]).join('') + '-9a';
}

export function InviteStaff({ dict, lang, roles }: { dict: Dict; lang: 'en' | 'bn'; roles: RoleChoice[] }) {
  const c = (k: string, vars?: Record<string, string | number>) => t(dict, `people.team.invite.${k}`, vars);
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const mounted = useSyncExternalStore(noSubscribe, () => true, () => false);
  const box = useRef<HTMLDivElement>(null);
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('');
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<string | null>(null);
  const [made, setMade] = useState<{ email: string; pw: string } | null>(null);
  const choices = roles.filter((r) => !r.isOwner);
  const close = () => {
    setOpen(false);
    setMade(null);
    setSaid(null);
    setName('');
    setContact('');
    setEmail('');
  };
  useDialogKeys(box, close);
  const isMail = contact.includes('@');
  const needEmail = contact.trim() !== '' && !isMail;
  const nameOf = (r: RoleChoice) => (lang === 'bn' ? r.nameBn : r.nameEn);
  async function send() {
    const mail = (isMail ? contact : email).trim();
    if (!name.trim() || !contact.trim() || !mail.includes('@')) return setSaid(c('missing'));
    setBusy(true);
    setSaid(null);
    const pw = tempPassword();
    const a = await call('POST', '/api/admin/staff', { email: mail, displayName: name.trim(), password: pw, ...(needEmail ? { phone: contact.trim() } : {}) });
    const id = (a.data as { staff?: { id?: string } }).staff?.id;
    if (a.data.ok && id && role) {
      const b = await call('POST', `/api/admin/staff/${id}/roles`, { action: 'assign', roleId: role, storeId: null });
      if (!b.data.ok) setSaid(t(dict, `people.errors.${b.data.error ?? 'server-error'}`));
    }
    setBusy(false);
    if (a.data.ok) {
      setMade({ email: mail, pw });
      router.refresh();
    } else {
      const k = `people.errors.${a.status === 0 ? 'network' : (a.data.error ?? 'server-error')}`;
      const m = t(dict, k);
      setSaid(m === k ? t(dict, 'people.errors.server-error') : m);
    }
  }
  return (
    <>
      <button type="button" className="a2-btn pri" onClick={() => setOpen(true)} data-testid="tm-invite">
        <ShellIcon name="plus" size={14} /> {c('button')}
      </button>
      {open && mounted
        ? createPortal(
            <div className="adm2 a2-z a2-ov mid" onMouseDown={(e) => e.target === e.currentTarget && close()}>
              <div ref={box} className="a2-dlg" role="dialog" aria-modal="true" aria-label={c('title')} data-testid="tm-invite-dlg">
                <div className="a2-dlgh">
                  <h2 className="a2-h3">{c('title')}</h2>
                  <button type="button" className="a2-icb" onClick={close} aria-label={c('close')}>
                    <ShellIcon name="x" size={18} />
                  </button>
                </div>
                {made ? (
                  <div className="a2-dlgb" data-testid="tm-invite-done">
                    <p className="a2-sm">{c('doneText', { name: name.trim() })}</p>
                    <div className="a2-fld a2-mt12">
                      <span className="a2-lbl">{c('email')}</span>
                      <b>{made.email}</b>
                    </div>
                    <div className="a2-fld a2-mt12">
                      <span className="a2-lbl">{c('temp')}</span>
                      <b className="a2-mono" data-testid="tm-invite-pw">{made.pw}</b>
                    </div>
                    <p className="a2-xs a2-mute a2-mt12">{c('doneNote')}</p>
                  </div>
                ) : (
                  <div className="a2-dlgb">
                    <div className="a2-fld">
                      <label className="a2-lbl">{c('name')}</label>
                      <input className="a2-inp" value={name} onChange={(e) => setName(e.target.value)} />
                    </div>
                    <div className="a2-fld a2-mt12">
                      <label className="a2-lbl">{c('contact')}</label>
                      <input className="a2-inp" value={contact} autoComplete="off" onChange={(e) => setContact(e.target.value)} />
                    </div>
                    {needEmail ? (
                      <div className="a2-fld a2-mt12">
                        <label className="a2-lbl">{c('email')}</label>
                        <input className="a2-inp" type="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} />
                      </div>
                    ) : null}
                    <div className="a2-fld a2-mt12">
                      <label className="a2-lbl">{c('role')}</label>
                      <select className="a2-inp" value={role} onChange={(e) => setRole(e.target.value)}>
                        <option value="">{t(dict, 'people.add.noRole')}</option>
                        {choices.map((r) => (
                          <option key={r.id} value={r.id}>
                            {nameOf(r)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <p className="a2-xs a2-mute a2-mt12">{c('hint')}</p>
                    {said ? (
                      <p className="a2-sm a2-mt6 s28-bad" role="alert">
                        {said}
                      </p>
                    ) : null}
                  </div>
                )}
                <div className="a2-dlgf">
                  <button type="button" className="a2-btn" onClick={close}>
                    {made ? c('done') : c('cancel')}
                  </button>
                  {made ? (
                    <button
                      type="button"
                      className="a2-btn pri"
                      onClick={() => {
                        void navigator.clipboard?.writeText(`${made.email}\n${made.pw}`);
                        showToast({ text: c('copied'), tone: 'ok' });
                      }}
                    >
                      {c('copy')}
                    </button>
                  ) : (
                    <button type="button" className="a2-btn pri" disabled={busy} onClick={send} data-testid="tm-invite-go">
                      {c('send')}
                    </button>
                  )}
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
