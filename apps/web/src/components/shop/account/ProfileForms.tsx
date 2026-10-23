'use client';
// PR 131 — Profile's forms (demo 60-account.js acc_tabProfile, acc_addrFields, V12.2): "Your details" (the name, the
// number read only — it is the login — and the delivery addresses, up to `account.addresses.max`, the first being the
// default the checkout fills in), the password (set one, or change it with the current one; hidden when password
// login is off), and Preferences (the language, and offers by SMS and on WhatsApp as two separate answers, B5.7).
// Each form posts to /api/account/<action> and names every refusal in the shop's words (`account.err.*`).
import { useRef, useState } from 'react';
import type { ProfileView } from '@extas/accounts';
import { showToast } from '../toast';
import { Icon } from '../Icon';

export type ProfileWords = Record<string, string>;

const fill = (t: string, v: Record<string, string | number>) => t.replace(/\{(\w+)\}/g, (m, k: string) => (k in v ? String(v[k]) : m));

async function post(action: string, payload: Record<string, unknown>): Promise<{ status: number; data: Record<string, unknown> }> {
  try {
    const res = await fetch(`/api/account/${action}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return { status: res.status, data };
  } catch {
    return { status: 0, data: {} };
  }
}

function Err({ text, id }: { text: string | null; id: string }) {
  return (
    <div id={id} role="alert">
      {text ? (
        <div className="acc-err">
          <Icon name="info" size={16} />
          <span>{text}</span>
        </div>
      ) : null}
    </div>
  );
}

type Addr = { key: number; id: string | null; line: string };

export function DetailsForm({ words, profile, max }: { words: ProfileWords; profile: ProfileView; max: number }) {
  const w = (k: string, v: Record<string, string | number> = {}) => fill(words[k] ?? k, v);
  const seq = useRef(profile.addresses.length + 1);
  const [name, setName] = useState(profile.name ?? '');
  const [addrs, setAddrs] = useState<Addr[]>(profile.addresses.length ? profile.addresses.map((a, i) => ({ key: i, id: a.id, line: a.line })) : [{ key: 0, id: null, line: '' }]);
  const [err, setErr] = useState<{ text: string; field: string | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const label = (i: number) => (addrs.length > 1 ? w(i === 0 ? 'profile.addressDefault' : 'profile.addressN', { n: i + 1 }) : w('profile.address'));

  return (
    <form
      className="stack s12 mt12"
      noValidate
      data-testid="acc-details"
      onSubmit={async (e) => {
        e.preventDefault();
        const form = e.currentTarget; // React clears currentTarget once the handler awaits
        if (!name.trim()) return setErr({ text: w('err.nameShort'), field: 'name' });
        setBusy(true);
        setErr(null);
        const r = await post('profile', { name, addresses: addrs.map((a) => ({ id: a.id, line: a.line })) });
        setBusy(false);
        if (r.status === 200 && r.data.profile) {
          const p = r.data.profile as ProfileView;
          setAddrs(p.addresses.length ? p.addresses.map((a) => ({ key: seq.current++, id: a.id, line: a.line })) : [{ key: seq.current++, id: null, line: '' }]);
          return showToast(form, w('profile.saved'));
        }
        const code = String(r.data.error ?? '');
        const details = Array.isArray(r.data.details) ? (r.data.details as string[]) : [];
        if (r.status === 401) return setErr({ text: w('err.signedOut'), field: null });
        if (code === 'FULL') return setErr({ text: w('err.full', { max: Number(r.data.max ?? max) }), field: null });
        if (code === 'INVALID_INPUT' && details[0]?.startsWith('addresses')) return setErr({ text: w('err.addressShort'), field: details[0] });
        if (code === 'INVALID_INPUT') return setErr({ text: w('err.nameShort'), field: 'name' });
        setErr({ text: w('err.offline'), field: null });
      }}
    >
      <div>
        <label className="label" htmlFor="pf-name">
          {w('profile.name')}
        </label>
        <input id="pf-name" name="name" className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" aria-invalid={err?.field === 'name' || undefined} aria-describedby={err?.field === 'name' ? 'pf-err' : undefined} />
      </div>
      <div>
        <label className="label" htmlFor="pf-phone">
          {w('profile.phone')}
        </label>
        <input id="pf-phone" className="input acc-ro" value={profile.phone ?? ''} readOnly aria-describedby="pf-ph-n" />
        <div id="pf-ph-n" className="xs muted mt8">
          {w('profile.phoneNote')}
        </div>
      </div>
      <div className="acc-addrs" data-testid="acc-addrs">
        {addrs.map((a, i) => (
          <div className="acc-addrow" key={a.key}>
            <div className="row between" style={{ gap: 10, alignItems: 'baseline' }}>
              <label className="label" htmlFor={`pf-addr-${i}`}>
                {label(i)}
              </label>
              {addrs.length > 1 ? (
                <button type="button" className="link xs acc-addr-rm" onClick={() => setAddrs(addrs.filter((x) => x.key !== a.key))}>
                  {w('profile.remove')}
                </button>
              ) : null}
            </div>
            <textarea
              id={`pf-addr-${i}`}
              className="input"
              rows={2}
              autoComplete="street-address"
              placeholder={w('profile.addressPh')}
              value={a.line}
              onChange={(e) => setAddrs(addrs.map((x) => (x.key === a.key ? { ...x, line: e.target.value } : x)))}
              aria-invalid={err?.field === `addresses.${i}` || undefined}
            />
          </div>
        ))}
        {addrs.length < max ? (
          <button type="button" className="acc-addr-add" data-testid="acc-addr-add" onClick={() => setAddrs([...addrs, { key: seq.current++, id: null, line: '' }])}>
            <Icon name="plus" size={16} />
            <span>{w('profile.addAddress')}</span>
          </button>
        ) : null}
      </div>
      <Err id="pf-err" text={err?.text ?? null} />
      <button className="btn btn-primary acc-start" type="submit" disabled={busy} aria-busy={busy || undefined}>
        {w('profile.save')}
      </button>
    </form>
  );
}

export function PasswordForm({ words, has }: { words: ProfileWords; has: boolean }) {
  const w = (k: string, v: Record<string, string | number> = {}) => fill(words[k] ?? k, v);
  const [hasPw, setHasPw] = useState(has);
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <section className="card p20" aria-labelledby="pf-p" data-testid="acc-password">
      <h2 className="h3" id="pf-p">
        {w(hasPw ? 'profile.changeTitle' : 'profile.setTitle')}
      </h2>
      {hasPw ? null : <p className="xs muted" style={{ margin: '4px 0 0' }}>{w('profile.setNote')}</p>}
      <form
        className="stack s12 mt12"
        noValidate
        onSubmit={async (e) => {
          e.preventDefault();
          const form = e.currentTarget;
          if (hasPw && !cur) return setErr(w('err.pwCurrent'));
          setBusy(true);
          setErr(null);
          const r = await post('password', { current: hasPw ? cur : undefined, next });
          setBusy(false);
          if (r.status === 200) {
            setCur('');
            setNext('');
            setHasPw(true);
            return showToast(form, w('profile.pwSaved'));
          }
          const code = String(r.data.error ?? '');
          const details = Array.isArray(r.data.details) ? (r.data.details as string[]) : [];
          if (r.status === 401 && code !== 'WRONG_PASSWORD') return setErr(w('err.signedOut'));
          if (code === 'WRONG_PASSWORD') return setErr(w('err.pwWrongCurrent'));
          if (code === 'INVALID_INPUT' && details.includes('next:phone')) return setErr(w('err.pwPhone'));
          if (code === 'INVALID_INPUT') return setErr(w('err.pwRules', { min: Number(r.data.min ?? 0) }));
          if (code === 'RATE_LIMITED') return setErr(w('err.wait', { minutes: Math.max(1, Math.ceil(Number(r.data.retryAfterSeconds ?? 60) / 60)) }));
          setErr(w('err.offline'));
        }}
      >
        {hasPw ? (
          <div>
            <label className="label" htmlFor="pf-cur">
              {w('profile.current')}
            </label>
            <input id="pf-cur" type="password" className="input" autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} />
          </div>
        ) : null}
        <div>
          <label className="label" htmlFor="pf-new">
            {w('profile.new')}
          </label>
          <input id="pf-new" type="password" className="input" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
        </div>
        <Err id="pf-pw-err" text={err} />
        <button className="btn btn-secondary acc-start" type="submit" disabled={busy} aria-busy={busy || undefined}>
          {w('profile.pwSave')}
        </button>
      </form>
    </section>
  );
}

/** `langs`: the two languages' names and the other language's address of this page; null when Bengali is off. */
export function Preferences({ words, consent, lang, langs }: { words: ProfileWords; consent: ProfileView['consent']; lang: 'en' | 'bn'; langs: { en: string; bn: string; other: string } | null }) {
  const w = (k: string) => words[k] ?? k;
  const [on, setOn] = useState({ sms: consent.sms === true, whatsapp: consent.whatsapp === true });
  const [err, setErr] = useState<string | null>(null);
  const flip = async (el: HTMLElement, k: 'sms' | 'whatsapp') => {
    const want = !on[k];
    setOn({ ...on, [k]: want });
    setErr(null);
    const r = await post('consent', { [k]: want });
    if (r.status !== 200) {
      setOn((o) => ({ ...o, [k]: !want }));
      return setErr(w(r.status === 401 ? 'err.signedOut' : 'err.offline'));
    }
    showToast(el, `${w(k === 'sms' ? 'profile.sms' : 'profile.wa')}: ${w(want ? 'profile.on' : 'profile.off')}`);
  };
  const row = (k: 'sms' | 'whatsapp', title: string, note: string) => (
    <div className="acc-nrow" data-testid={`acc-cons-${k}`}>
      <div>
        <div className="small bold">{title}</div>
        <div className="xs muted">{note}</div>
      </div>
      <button type="button" className={`switch${on[k] ? ' on' : ''}`} aria-pressed={on[k]} aria-label={title} onClick={(e) => void flip(e.currentTarget, k)} />
    </div>
  );
  return (
    <section className="card p20 acc-prefs" aria-labelledby="pf-pr" data-testid="acc-prefs">
      <h2 className="h3" id="pf-pr">
        {w('profile.prefs')}
      </h2>
      {langs ? (
        <div className="acc-nrow" style={{ marginTop: 10 }}>
          <div>
            <div className="small bold">{w('profile.language')}</div>
            <div className="xs muted">{w('profile.languageNote')}</div>
          </div>
          <div className="seg" role="group" aria-label={w('profile.language')}>
            {(['en', 'bn'] as const).map((l) =>
              l === lang ? (
                <span key={l} className="on" aria-current="true" lang={l}>
                  {langs[l]}
                </span>
              ) : (
                <a key={l} href={langs.other} lang={l} hrefLang={l} data-testid="acc-lang">
                  {langs[l]}
                </a>
              ),
            )}
          </div>
        </div>
      ) : null}
      {row('sms', w('profile.sms'), w('profile.smsNote'))}
      {row('whatsapp', w('profile.wa'), w('profile.waNote'))}
      <Err id="pf-cons-err" text={err} />
    </section>
  );
}
