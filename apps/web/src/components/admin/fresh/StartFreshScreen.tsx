'use client';
// S28 · PR 706 — Settings → Start fresh: the preview (cleared / kept), the switch, and the one-time run (backup, real
// products, the words, the PIN). Writes go to /api/admin/start-fresh/*; every refusal is text from the messages file.
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import { t, type Dict } from '@/lib/i18n';
import type { FreshView } from '@/lib/start-fresh';
import { call } from '../api';
import { showToast } from '../lumen/Toast';

const WORDS = 'START FRESH'; // hardcode-ok: the phrase the owner types, shown in the field's hint
const when = (iso: string) => iso.slice(0, 16).replace('T', ' ');

export function StartFreshScreen({ dict, view }: { dict: Dict; view: FreshView }) {
  const id = useId();
  const router = useRouter();
  const c = (k: string, vars?: Record<string, string | number>) => t(dict, `startFresh.${k}`, vars);
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState(false);
  const [remove, setRemove] = useState(false);
  const [words, setWords] = useState('');
  const [pin, setPin] = useState('');
  const [swPin, setSwPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<string | null>(null);

  const say = (a: Awaited<ReturnType<typeof call>>) => {
    const k = `startFresh.errors.${a.status === 0 ? 'network' : (a.data.error ?? 'server-error')}`;
    const v = t(dict, k);
    setSaid(v === k ? c('errors.server-error') : v);
  };
  async function post(path: string, body: unknown) {
    setBusy(true);
    setSaid(null);
    const a = await call('POST', `/api/admin/start-fresh${path}`, body);
    setBusy(false);
    return a;
  }
  async function backup() {
    const a = await post('/backup', {});
    if (a.status === 201) {
      showToast({ text: c('backupOpen'), tone: 'ok' });
      router.refresh();
    } else say(a);
  }
  async function toggle(enabled: boolean) {
    const a = await post('/switch', { enabled, pin: swPin });
    if (a.data.ok) {
      setSwPin('');
      router.refresh();
    } else say(a);
  }
  async function run() {
    const a = await post('', { words, pin, removeProducts: remove });
    if (a.data.ok) {
      showToast({ text: c('doneTitle'), tone: 'ok' });
      router.refresh();
    } else say(a);
  }

  if (view.done) {
    return (
      <section className="a2-card a2-mt12" data-testid="fresh-done">
        <h2 className="a2-h3">{c('doneTitle')}</h2>
        <p className="a2-sm">{c('done', { when: when(view.done.at) })}</p>
        <div className="s28-list a2-mt12">
          {view.done.kinds.map((k) => (
            <div key={k.id} className="s28-row">
              <span>{c(`kinds.${k.id}`)}</span>
              <b>{k.count}</b>
              <span className="a2-xs a2-mute">{c(`how.${k.how}`)}</span>
            </div>
          ))}
        </div>
        {view.done.status === 'PARTIAL' ? <p className="a2-xs a2-mute a2-mt6">{c('doneNote')}</p> : null}
      </section>
    );
  }
  if (!view.isOwner) return <p className="a2-sm a2-mt12" data-testid="fresh-owner-only">{c('ownerOnly')}</p>;

  const canRun = view.enabled && view.backup.ok && words.trim() === WORDS && /^\d{4,12}$/.test(pin.trim()) && !busy;
  return (
    <>
      <section className="a2-card a2-mt12" aria-labelledby={`${id}-t`} data-testid="fresh-card">
        <h2 className="a2-h3" id={`${id}-t`}>{c('card.title')}</h2>
        <p className="a2-cs">{c('card.lead')}</p>
        <div className="s28-grid a2-mt12">
          <div>
            <b className="a2-sm">{c('clear')}</b>
            <div className="s28-list">
              {view.preview.kinds.map((k) => (
                <div key={k.id} className="s28-row">
                  <span>{c(`kinds.${k.id}`)}</span>
                  <b>{k.count}</b>
                </div>
              ))}
            </div>
          </div>
          <div>
            <b className="a2-sm">{c('keep')}</b>
            <div className="s28-list">
              {(['settings', 'policies', 'staff', 'keys', 'things'] as const).map((k) => (
                <div key={k} className="s28-row">
                  <span>{c(`kept.${k}`)}</span>
                </div>
              ))}
              <div className="s28-row">
                <span>{c('products', { n: view.preview.products })}</span>
                <span className="s28-chip">{c('youChoose')}</span>
              </div>
            </div>
          </div>
        </div>
        <p className="a2-xs a2-mute a2-mt6">{c('card.guard')}</p>
        <div className="s28-row a2-mt12">
          <button type="button" className="a2-btn" onClick={() => setPreview((v) => !v)} data-testid="fresh-preview">{c('preview')}</button>
          <button type="button" className="a2-btn" disabled={!view.enabled} onClick={() => setOpen((v) => !v)} data-testid="fresh-open">{c('start')}</button>
        </div>
        {preview ? (
          <p className="a2-sm a2-mt6" role="status" data-testid="fresh-preview-text">
            {c('previewTitle')} {c('previewTotal', { n: view.preview.total })}
          </p>
        ) : null}
      </section>

      <section className="a2-card a2-mt12" data-testid="fresh-switch">
        <p className="a2-sm">{view.enabled ? c('switch.on') : c('switch.off')}</p>
        <div className="s28-row a2-mt6">
          <input className="a2-inp" type="password" inputMode="numeric" autoComplete="off" maxLength={12} value={swPin} placeholder={c('pin')} onChange={(e) => setSwPin(e.target.value)} aria-label={c('pin')} style={{ maxWidth: 160 }} data-testid="fresh-switch-pin" />
          <button type="button" className="a2-btn" disabled={busy || !swPin.trim()} onClick={() => toggle(!view.enabled)}>{view.enabled ? c('switch.turnOff') : c('switch.turnOn')}</button>
        </div>
      </section>

      {open && view.enabled ? (
        <section className="a2-card a2-mt12" data-testid="fresh-run">
          <div className="s28-row">
            <b className="grow">{c('step1')}</b>
            {view.backup.ok ? <span className="s28-good">{c('backupOk', { when: when(view.backup.finishedAt ?? '') })}</span> : view.backup.open ? <span className="s28-warn">{c('backupOpen')}</span> : <span className="s28-warn">{view.backup.finishedAt ? c('backupOld') : ''}</span>}
            {!view.backup.ok && !view.backup.open ? <button type="button" className="a2-btn" disabled={busy} onClick={backup}>{c('backupNow')}</button> : null}
          </div>
          <div className="a2-mt12">
            <b>{c('step2')}</b>
            <label className="s28-row a2-mt6"><input type="radio" name={`${id}-p`} checked={!remove} onChange={() => setRemove(false)} /> {c('keepProducts', { n: view.preview.products })}</label>
            <label className="s28-row"><input type="radio" name={`${id}-p`} checked={remove} onChange={() => setRemove(true)} /> {c('removeProducts')}</label>
          </div>
          <label className="a2-mt12" style={{ display: 'block' }}>
            <b>{c('step3')}</b>
            <input className="a2-inp" value={words} autoComplete="off" placeholder={WORDS} onChange={(e) => setWords(e.target.value)} data-testid="fresh-words" />
          </label>
          <label className="a2-mt12" style={{ display: 'block' }}>
            <b>{c('step4')}</b>
            <input className="a2-inp" type="password" inputMode="numeric" autoComplete="off" maxLength={12} value={pin} placeholder={c('pin')} onChange={(e) => setPin(e.target.value)} style={{ maxWidth: 160 }} data-testid="fresh-pin" />
          </label>
          <p className="s28-warn a2-xs">{c('warn')}</p>
          <div className="s28-row a2-mt12">
            <button type="button" className="a2-btn" onClick={() => setOpen(false)}>{c('cancel')}</button>
            <button type="button" className="a2-btn" disabled={!canRun} onClick={run} data-testid="fresh-go">{busy ? c('working') : c('go')}</button>
          </div>
        </section>
      ) : null}
      {said ? <p className="a2-sm a2-mt6 s28-bad" role="alert">{said}</p> : null}
    </>
  );
}
