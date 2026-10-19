'use client';
// PR 500 — the admin sign-in on the existing API (PR 15): e-mail + password → the two-step code when the account has
// it → the person's own password when the first one must be changed → the page they came for. Passwords live only in
// this form's memory and are cleared as soon as they are used.
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { t, type Dict } from '@/lib/i18n';
import { call, errorText, type Answer } from './api';

type Step = 'login' | 'code' | 'password' | 'twofactor';
interface Task {
  (): Promise<void>;
}

export function LoginForm({ dict, next, initialStep, locale, timeZone, disabled }: { dict: Dict; next: string; initialStep: 'login' | 'password'; locale: string; timeZone: string; disabled: boolean }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>(initialStep);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [current, setCurrent] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [pw1, setPw1] = useState('');
  const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const fail = (a: Answer) => {
    const retry = typeof a.data.retryAt === 'string' ? new Date(a.data.retryAt) : null;
    const time = retry ? new Intl.DateTimeFormat(locale, { timeStyle: 'short', timeZone }).format(retry) : '';
    setError(errorText(dict, a, { time }));
  };

  /** After a session cookie: check what is still to do, then go on. */
  const signedIn = async (usedPassword: string | null) => {
    const me = await call('GET', '/api/admin/auth/me');
    if (me.status !== 200) return fail(me);
    if (me.data.mustChangePassword) {
      setCurrent(usedPassword);
      setStep('password');
      return;
    }
    if (me.data.mustSetUpTwoFactor) return setStep('twofactor');
    router.replace(next);
    router.refresh();
  };

  const answer = async (a: Answer, usedPassword: string | null) => {
    if (a.status === 200 && a.data.twoFactor) {
      setCurrent(usedPassword);
      setStep('code');
      return;
    }
    if (a.status === 200 && a.data.ok) return signedIn(usedPassword);
    fail(a);
  };

  const run = (fn: Task) => async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  const onLogin = run(async () => {
    const used = password;
    setPassword('');
    await answer(await call('POST', '/api/admin/auth/login', { email: email.trim(), password: used }), used);
  });
  const onCode = run(async () => {
    const used = code.trim();
    setCode('');
    await answer(await call('POST', '/api/admin/auth/2fa', { code: used }), current);
  });
  const onPassword = run(async () => {
    if (pw1 !== pw2) return setError(t(dict, 'login.mismatch'));
    const a = await call('POST', '/api/admin/auth/password', { current: current ?? password, next: pw1 });
    if (a.status !== 200) return fail(a);
    setPw1('');
    setPw2('');
    setPassword('');
    setCurrent(null);
    await signedIn(null);
  });

  const err = error ? (
    <p className="ad-err" role="alert">
      {error}
    </p>
  ) : null;
  const submit = (label: string) => (
    <button type="submit" className="ad-btn ad-btn-primary ad-btn-block" disabled={busy || disabled}>
      {busy ? t(dict, 'login.busy') : label}
    </button>
  );

  if (step === 'twofactor') {
    return (
      <>
        <h1 className="ad-h1">{t(dict, 'login.codeTitle')}</h1>
        <div className="ad-note warn" role="status">
          <div>{t(dict, 'login.twoFactorSetup')}</div>
        </div>
      </>
    );
  }
  if (step === 'code') {
    return (
      <form onSubmit={onCode} noValidate>
        <h1 className="ad-h1">{t(dict, 'login.codeTitle')}</h1>
        <p className="ad-intro">{t(dict, 'login.codeSub')}</p>
        <div>
          <label className="ad-label" htmlFor="ad-code">{t(dict, 'login.code')}</label>
          <input id="ad-code" className="ad-input" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} required autoFocus />
        </div>
        {err}
        {submit(t(dict, 'login.verify'))}
        <button type="button" className="ad-linkbtn" onClick={() => { setStep('login'); setCurrent(null); setError(''); }}>
          {t(dict, 'login.back')}
        </button>
      </form>
    );
  }
  if (step === 'password') {
    return (
      <form onSubmit={onPassword} noValidate>
        <h1 className="ad-h1">{t(dict, 'login.pwTitle')}</h1>
        <p className="ad-intro">{t(dict, 'login.pwSub')}</p>
        {current === null ? (
          <div>
            <label className="ad-label" htmlFor="ad-cur">{t(dict, 'login.current')}</label>
            <input id="ad-cur" className="ad-input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
        ) : null}
        <div>
          <label className="ad-label" htmlFor="ad-pw1">{t(dict, 'login.newPassword')}</label>
          <input id="ad-pw1" className="ad-input" type="password" autoComplete="new-password" value={pw1} onChange={(e) => setPw1(e.target.value)} required />
        </div>
        <div>
          <label className="ad-label" htmlFor="ad-pw2">{t(dict, 'login.repeat')}</label>
          <input id="ad-pw2" className="ad-input" type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} required />
        </div>
        {err}
        {submit(t(dict, 'login.savePw'))}
      </form>
    );
  }
  return (
    <form onSubmit={onLogin} noValidate>
      <div>
        <h1 className="ad-h1">{t(dict, 'login.title')}</h1>
        <p className="ad-intro">{disabled ? t(dict, 'login.noDb') : t(dict, 'login.sub')}</p>
      </div>
      <div>
        <label className="ad-label" htmlFor="ad-email">{t(dict, 'login.email')}</label>
        <input id="ad-email" className="ad-input" type="email" autoComplete="username" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} required disabled={disabled} />
      </div>
      <div>
        <label className="ad-label" htmlFor="ad-password">{t(dict, 'login.passwordLabel')}</label>
        <input id="ad-password" className="ad-input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required disabled={disabled} />
      </div>
      {err}
      {submit(t(dict, 'login.submit'))}
    </form>
  );
}
