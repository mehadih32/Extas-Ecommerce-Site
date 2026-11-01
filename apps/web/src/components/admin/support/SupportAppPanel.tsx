'use client';
// S22 · PR 435 — the support app on this device: install (the browser's own prompt on Android and desktop Chrome/Edge;
// words for iPhone and the rest), notifications on or off for this device (the browser asks once; the subscription
// goes to the shop with the push key it gave), a test, and the person's devices. Every button is one 44 px target.
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import type { SupportAppState } from '@extas/support';

export interface SupportAppTexts {
  install: Record<'h' | 'd' | 'button' | 'done' | 'ios' | 'other' | 'standalone', string>;
  notify: Record<'h' | 'd' | 'pushOff' | 'practice' | 'on' | 'off' | 'isOn' | 'isOffHere' | 'test' | 'tested' | 'testedPractice' | 'denied' | 'unsupported' | 'failed', string>;
  devices: Record<'h' | 'none' | 'since' | 'last' | 'failing' | 'unnamed', string>;
  err: Record<string, string>;
}

interface InstallPrompt extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const fill = (s: string, vars: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));

/** The VAPID public key as the browser takes it. */
function keyBytes(b64url: string): Uint8Array<ArrayBuffer> {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (b64url.length % 4)) % 4);
  const raw = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/** A short name for this device from its browser ("Android · Chrome"). */
function deviceLabel(): string {
  const ua = navigator.userAgent;
  const os = /iPhone|iPad/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /Mac/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : '';
  const br = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : '';
  return [os, br].filter(Boolean).join(' · ');
}

const still = () => () => undefined;
/** A fact of this browser (read on the device, a fixed answer while the page is drawn on the server). */
const useBrowser = <T,>(read: () => T, server: T): T => useSyncExternalStore(still, read, () => server);
const readStandalone = () => window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
const readIos = () => /iPhone|iPad|iPod/.test(navigator.userAgent);
const readSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

export function SupportAppPanel({ api, worker, scope, initial, locale, texts }: { api: string; worker: string; scope: string; initial: SupportAppState; locale: string; texts: SupportAppTexts }) {
  const [state, setState] = useState(initial);
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [installed, setInstalled] = useState(false);
  const standalone = useBrowser(readStandalone, false);
  const ios = useBrowser(readIos, false);
  const [here, setHere] = useState<PushSubscription | null>(null);
  const [broken, setBroken] = useState(false);
  const supported = useBrowser(readSupported, true) && !broken;
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPrompt(e as InstallPrompt);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    if (readSupported())
      void navigator.serviceWorker
        .register(worker, { scope })
        .then((reg) => reg.pushManager.getSubscription())
        .then(setHere)
        .catch(() => setBroken(true));
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, [worker, scope]);

  const call = useCallback(
    async (input: Record<string, unknown>): Promise<Record<string, unknown> | null> => {
      try {
        const res = await fetch(api, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input) });
        const out = (await res.json().catch(() => ({}))) as Record<string, unknown>;
        if (!res.ok || out.ok !== true) {
          const code = typeof out.error === 'string' ? out.error : res.status === 401 ? 'unauthorized' : res.status === 403 ? 'forbidden' : 'other';
          setNote(texts.err[code] ?? texts.err.other!);
          return null;
        }
        if (out.app) setState(out.app as SupportAppState);
        return out;
      } catch {
        setNote(texts.err.network!);
        return null;
      }
    },
    [api, texts],
  );

  async function install() {
    if (!prompt) return;
    await prompt.prompt();
    const choice = await prompt.userChoice.catch(() => null);
    if (choice?.outcome === 'accepted') setInstalled(true);
    setPrompt(null);
  }

  async function turnOn() {
    setBusy(true);
    setNote(null);
    try {
      const allowed = await Notification.requestPermission();
      if (allowed !== 'granted') {
        setNote(texts.notify.denied);
        return;
      }
      const reg = await navigator.serviceWorker.register(worker, { scope });
      await navigator.serviceWorker.ready;
      if (!state.publicKey) {
        // practice mode: no key to subscribe with; the device shows a local notification so the person sees it works
        await reg.showNotification(texts.notify.isOn, { body: texts.notify.practice, tag: 'practice' });
        setNote(texts.notify.practice);
        return;
      }
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(state.publicKey) }));
      const json = sub.toJSON();
      if (await call({ action: 'on', endpoint: json.endpoint, keys: json.keys, label: deviceLabel() })) setHere(sub);
    } catch (e) {
      setNote(fill(texts.notify.failed, { why: e instanceof Error ? e.message : String(e) }));
    } finally {
      setBusy(false);
    }
  }

  async function turnOff() {
    if (!here) return;
    setBusy(true);
    setNote(null);
    const endpoint = here.endpoint;
    await here.unsubscribe().catch(() => false);
    if (await call({ action: 'off', endpoint })) setHere(null);
    setBusy(false);
  }

  async function test() {
    setBusy(true);
    setNote(null);
    const out = await call({ action: 'test' });
    if (out) setNote(out.practice ? texts.notify.testedPractice : fill(texts.notify.tested, { n: Number(out.sent ?? 0) }));
    setBusy(false);
  }

  const date = (iso: string) => new Date(iso).toLocaleString(locale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const subscribed = !!here && state.devices.length > 0;

  return (
    <div className="sp-app">
      <section className="a2-sc a2-mt12 sp-app-card" data-testid="support-app-install">
        <h2 className="a2-h3">{texts.install.h}</h2>
        <p className="a2-mute">{texts.install.d}</p>
        {standalone ? (
          <p className="sp-app-ok">{texts.install.standalone}</p>
        ) : installed ? (
          <p className="sp-app-ok">{texts.install.done}</p>
        ) : prompt ? (
          <button type="button" className="a2-btn pri" onClick={() => void install()} data-testid="support-app-install-go">
            {texts.install.button}
          </button>
        ) : (
          <p>{ios ? texts.install.ios : texts.install.other}</p>
        )}
      </section>

      <section className="a2-sc a2-mt12 sp-app-card" data-testid="support-app-notify">
        <h2 className="a2-h3">{texts.notify.h}</h2>
        <p className="a2-mute">{texts.notify.d}</p>
        {!state.push ? (
          <p>{texts.notify.pushOff}</p>
        ) : !supported ? (
          <p>{texts.notify.unsupported}</p>
        ) : (
          <>
            {state.practice ? <p className="a2-note">{texts.notify.practice}</p> : null}
            <p className={subscribed ? 'sp-app-ok' : 'a2-mute'} data-testid="support-app-here">
              {subscribed ? texts.notify.isOn : texts.notify.isOffHere}
            </p>
            <div className="sp-app-row">
              {subscribed ? (
                <button type="button" className="a2-btn" disabled={busy} onClick={() => void turnOff()} data-testid="support-app-off-go">
                  {texts.notify.off}
                </button>
              ) : (
                <button type="button" className="a2-btn pri" disabled={busy} onClick={() => void turnOn()} data-testid="support-app-on-go">
                  {texts.notify.on}
                </button>
              )}
              <button type="button" className="a2-btn" disabled={busy || !state.devices.length} onClick={() => void test()} data-testid="support-app-test">
                {texts.notify.test}
              </button>
            </div>
          </>
        )}
        {note ? (
          <p className="sp-app-note" role="status">
            {note}
          </p>
        ) : null}
      </section>

      <section className="a2-sc a2-mt12 sp-app-card" data-testid="support-app-devices">
        <h2 className="a2-h3">{texts.devices.h}</h2>
        {state.devices.length ? (
          <ul className="sp-app-list">
            {state.devices.map((d) => (
              <li key={d.id}>
                <b>{d.label || texts.devices.unnamed}</b>
                <span className="a2-mute">{fill(texts.devices.since, { date: date(d.since) })}</span>
                {d.lastPushAt ? <span className="a2-mute">{fill(texts.devices.last, { date: date(d.lastPushAt) })}</span> : null}
                {d.failCount ? <span className="sp-app-bad">{fill(texts.devices.failing, { n: d.failCount })}</span> : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="a2-mute">{texts.devices.none}</p>
        )}
      </section>
    </div>
  );
}
