'use client';
// PR 130 — the login form (demo 60-account.js PAGES.login, V12.2; SIM-F-039): the mobile number, then the SMS code.
// A customer who set his own password may use it instead ("Log in with a password instead"); on a device the account has
// not seen, the password is followed by the code. Every refusal is named in words from the shop dictionary
// (`account.err.*`) and tied to its field. While the SMS sender is the mock (no gateway key yet), the code step says to
// message the shop on WhatsApp if nothing arrives — the code itself is never shown on the page.
import { useEffect, useRef, useState } from 'react';
import { phoneNormalizeBD } from '@/lib/phone-bd';
import { humanSignals, watchHumanInput } from '@/lib/security/human-signals';
import { Icon, WaGlyph } from '../Icon';

export type LoginWords = Record<string, string>;

type Step = { kind: 'phone' } | { kind: 'code'; phone: string; length: number; mock: boolean; newDevice: boolean } | { kind: 'password' };

const fill = (t: string, v: Record<string, string | number>) => t.replace(/\{(\w+)\}/g, (m, k: string) => (k in v ? String(v[k]) : m));

async function post(action: string, payload: Record<string, unknown>): Promise<{ status: number; data: Record<string, unknown> }> {
  // PR 379: the quiet bot check's signals ride along (counts only; nothing is shown or asked)
  const res = await fetch(`/api/account/${action}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...payload, human: humanSignals() }) });
  let data: Record<string, unknown> = {};
  try {
    data = (await res.json()) as Record<string, unknown>;
  } catch {
    // an empty answer is handled as a failure below
  }
  return { status: res.status, data };
}

export function LoginForm({ words, lang, next, wa, passwordOn }: { words: LoginWords; lang: 'en' | 'bn'; next: string; wa: string | null; passwordOn: boolean }) {
  const w = (k: string, v: Record<string, string | number> = {}) => fill(words[k] ?? k, v);
  const [step, setStep] = useState<Step>({ kind: 'phone' });
  const [err, setErr] = useState<{ text: string; field: 'phone' | 'code' | 'password' | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [wait, setWait] = useState(0);
  const [showPw, setShowPw] = useState(false);
  const phoneRef = useRef<HTMLInputElement>(null);
  const codeRef = useRef<HTMLInputElement>(null);
  const pwRef = useRef<HTMLInputElement>(null);
  const [typed, setTyped] = useState('');

  useEffect(() => {
    if (wait <= 0) return;
    const id = window.setTimeout(() => setWait((s) => s - 1), 1000);
    return () => window.clearTimeout(id);
  }, [wait]);
  useEffect(() => {
    if (step.kind === 'code') codeRef.current?.focus();
  }, [step.kind]);
  useEffect(() => watchHumanInput(), []);

  const refusal = (data: Record<string, unknown>, status: number): { text: string; field: 'phone' | 'code' | 'password' | null } => {
    const code = String(data.error ?? '');
    const retry = Number(data.retryAfterSeconds ?? 0);
    if (code === 'INVALID_INPUT' && Array.isArray(data.details) && data.details.includes('phone')) return { text: w('err.phoneBad'), field: 'phone' };
    if (code === 'INVALID_INPUT') return { text: w('err.codeEmpty'), field: 'code' };
    if (code === 'WRONG_CODE') return Number(data.left ?? 0) > 0 ? { text: w('err.codeWrong', { left: Number(data.left) }), field: 'code' } : { text: w('err.codeDead'), field: 'code' };
    if (code === 'WRONG_PASSWORD') return { text: w('err.pwWrong'), field: 'password' };
    if (code === 'NOT_ALLOWED') return { text: w('err.pwOff'), field: null };
    if (code === 'RATE_LIMITED') return retry > 0 && retry <= 120 ? { text: w('err.waitSeconds', { seconds: retry }), field: null } : { text: w('err.wait', { minutes: Math.max(1, Math.ceil(retry / 60)) }), field: null };
    if (code === 'SMS_FAILED') return { text: w('err.sms'), field: null };
    void status;
    return { text: w('err.offline'), field: null };
  };

  const readPhone = (): string | null => {
    const r = phoneNormalizeBD(phoneRef.current?.value ?? typed);
    if (!r.ok) {
      if (phoneRef.current && r.reason !== 'empty') phoneRef.current.value = r.digits;
      setErr({ text: w(r.reason === 'empty' ? 'err.phoneEmpty' : 'err.phoneBad'), field: 'phone' });
      phoneRef.current?.focus();
      return null;
    }
    if (phoneRef.current) phoneRef.current.value = r.digits;
    setTyped(r.digits);
    return r.digits;
  };

  const sendCode = async (phone: string) => {
    setBusy(true);
    setErr(null);
    try {
      const { status, data } = await post('code', { phone, lang });
      if (data.ok) {
        setStep({ kind: 'code', phone: String(data.phone ?? phone), length: Number(data.length ?? 6), mock: data.mock === true, newDevice: false });
        setWait(Number(data.resendSeconds ?? 0));
      } else {
        const r = refusal(data, status);
        setErr(r);
        if (data.error === 'RATE_LIMITED' && Number(data.retryAfterSeconds ?? 0) <= 120) setWait(Number(data.retryAfterSeconds ?? 0));
      }
    } catch {
      setErr({ text: w('err.offline'), field: null });
    } finally {
      setBusy(false);
    }
  };

  const signIn = async (payload: Record<string, unknown>) => {
    setBusy(true);
    setErr(null);
    try {
      const { status, data } = await post('login', { ...payload, lang, next });
      if (data.ok && data.step === 'code') {
        setStep({ kind: 'code', phone: String(data.phone ?? typed), length: Number(data.length ?? 6), mock: data.mock === true, newDevice: true });
        setWait(Number(data.resendSeconds ?? 0));
      } else if (data.ok && typeof data.next === 'string') {
        window.location.assign(data.next);
        return;
      } else setErr(refusal(data, status));
    } catch {
      setErr({ text: w('err.offline'), field: null });
    } finally {
      setBusy(false);
    }
  };

  const onPhone = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const phone = readPhone();
    if (phone) void sendCode(phone);
  };
  const onCode = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const code = (codeRef.current?.value ?? '').replace(/\D/g, '');
    if (!code) {
      setErr({ text: w('err.codeEmpty'), field: 'code' });
      codeRef.current?.focus();
      return;
    }
    void signIn({ phone: typed, code });
  };
  const onPassword = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const phone = readPhone();
    if (!phone) return;
    const password = pwRef.current?.value ?? '';
    if (!password) {
      setErr({ text: w('err.pwEmpty'), field: 'password' });
      pwRef.current?.focus();
      return;
    }
    void signIn({ phone, password });
  };

  const errBox = err ? (
    <div className="acc-err" id="lg-err" role="alert" data-testid="login-error">
      <Icon name="info" size={16} />
      <span>{err.text}</span>
    </div>
  ) : (
    <div id="lg-err" role="alert" />
  );
  const bad = (f: 'phone' | 'code' | 'password') => (err?.field === f ? { 'aria-invalid': true as const, 'aria-describedby': 'lg-err' } : {});
  const phoneField = (
    <div>
      <label className="label" htmlFor="lg-phone">
        {w('login.phone')}
      </label>
      <input
        id="lg-phone"
        ref={phoneRef}
        name="phone"
        className="input"
        type="tel"
        inputMode="numeric"
        autoComplete="tel"
        placeholder={w('login.phonePh')}
        defaultValue={typed}
        data-testid="login-phone"
        {...bad('phone')}
        onChange={(e) => setTyped(e.currentTarget.value)}
      />
    </div>
  );

  if (step.kind === 'code')
    return (
      <form className="acc-form" noValidate onSubmit={onCode} data-testid="login-code-form">
        <div>
          <div className="h3">{w('login.codeTitle')}</div>
          <p className="acc-sent" data-testid="login-sent">
            {step.newDevice ? `${w('login.newDevice')} ` : ''}
            {w('login.codeSent', { length: step.length, phone: '\u0000' })
              .split('\u0000')
              .flatMap((part, i) => (i ? [<b key={i}>{step.phone}</b>, part] : [part]))}
          </p>
        </div>
        <div>
          <label className="label" htmlFor="lg-code">
            {w('login.code')}
          </label>
          <input
            id="lg-code"
            ref={codeRef}
            name="code"
            className="input acc-code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={step.length}
            pattern="[0-9]*"
            data-testid="login-code"
            {...bad('code')}
          />
        </div>
        {errBox}
        <button className="btn btn-primary btn-block" type="submit" disabled={busy} aria-busy={busy || undefined} data-testid="login-submit">
          {w('login.submit')}
        </button>
        <div className="acc-links">
          <button type="button" className="link" disabled={busy || wait > 0} onClick={() => void sendCode(typed)} data-testid="login-resend">
            {wait > 0 ? w('login.resendIn', { seconds: wait }) : w('login.resend')}
          </button>
          <button
            type="button"
            className="link"
            onClick={() => {
              setStep({ kind: 'phone' });
              setErr(null);
            }}
          >
            {w('login.change')}
          </button>
        </div>
        {step.mock ? (
          <div className="acc-note" data-testid="login-nosms">
            {wa ? <WaGlyph size={17} /> : <Icon name="chat" size={17} />}
            <span>
              {wa ? w('login.noSms') : w('login.noSmsPlain')}{' '}
              {wa ? (
                <a className="link" href={wa} target="_blank" rel="noopener">
                  {w('login.wa')}
                </a>
              ) : null}
            </span>
          </div>
        ) : null}
      </form>
    );

  if (step.kind === 'password')
    return (
      <form className="acc-form" noValidate onSubmit={onPassword} data-testid="login-password-form">
        {phoneField}
        <div>
          <label className="label" htmlFor="lg-pw">
            {w('login.passwordLabel')}
          </label>
          <div className="acc-pw">
            <input id="lg-pw" ref={pwRef} name="password" className="input" type={showPw ? 'text' : 'password'} autoComplete="current-password" data-testid="login-password" {...bad('password')} />
            <button type="button" className="acc-pw-t" aria-label={showPw ? w('login.hidePw') : w('login.showPw')} aria-pressed={showPw} onClick={() => setShowPw((v) => !v)}>
              {showPw ? w('login.hide') : w('login.show')}
            </button>
          </div>
        </div>
        {errBox}
        <button className="btn btn-primary btn-block" type="submit" disabled={busy} aria-busy={busy || undefined} data-testid="login-submit">
          {w('login.submit')}
        </button>
        <div className="acc-links">
          <button
            type="button"
            className="link"
            onClick={() => {
              setStep({ kind: 'phone' });
              setErr(null);
            }}
          >
            {w('login.withCode')}
          </button>
        </div>
        <p className="xs text2" style={{ margin: 0 }}>
          {w('login.forgot')}
        </p>
      </form>
    );

  return (
    <form className="acc-form" noValidate onSubmit={onPhone} data-testid="login-form">
      {phoneField}
      {errBox}
      <button className="btn btn-primary btn-block" type="submit" disabled={busy || wait > 0} aria-busy={busy || undefined} data-testid="login-send">
        {wait > 0 ? w('login.resendIn', { seconds: wait }) : w('login.send')}
      </button>
      {passwordOn ? (
        <div className="acc-links">
          <button
            type="button"
            className="link"
            data-testid="login-with-password"
            onClick={() => {
              setStep({ kind: 'password' });
              setErr(null);
            }}
          >
            {w('login.withPassword')}
          </button>
        </div>
      ) : null}
    </form>
  );
}
