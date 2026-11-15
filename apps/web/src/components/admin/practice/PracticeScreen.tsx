'use client';
// S28 · PR 706 (CN-049) — Settings → Practice data: the practice switch, "Add sample data" and the reset (PR 725: the owner's PIN
// alone, no typed words; "Also remove demo products" unticked, "Add sample data again" for Refresh). Writes go to
// /api/admin/practice/*; every refusal is text from the messages file.
// PR 843 (lane E4): drawn as the prototype draws its Demo products and Start fresh pages (m-settings.js) — a big light with the
// switch on the right, a card of what a reset clears next to a card of what stays, "Preview (nothing changes)", and the reset in
// a window that asks the owner's PIN.
import { useRouter } from 'next/navigation';
import { useId, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { t, type Dict } from '@/lib/i18n';
import type { PracticeView } from '@/lib/practice/api';
import { call } from '../api';
import { showToast } from '../lumen/Toast';
import { useDialogKeys } from '../orders/OrderCommands';
import { LmSwitch } from '../settings/LmSwitch';
import { ShellIcon } from '../shell/ShellIcon';

const KINDS = ['orders', 'customers', 'incomplete', 'claims', 'payouts', 'parcels', 'couriers', 'products'] as const;
const STAYS = ['real', 'settings', 'staff', 'keys'] as const;
const noSubscribe = () => () => {};

/** A window like the prototype's: a title, a body, a foot with the buttons; Esc or a tap outside closes it. */
function Win({ title, close, onClose, foot, testId, children }: { title: string; close: string; onClose: () => void; foot: ReactNode; testId: string; children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const mounted = useSyncExternalStore(
    noSubscribe,
    () => true,
    () => false,
  );
  useDialogKeys(box, onClose);
  if (!mounted) return null;
  return createPortal(
    <div className="adm2 a2-z a2-ov mid" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={box} className="a2-dlg" role="dialog" aria-modal="true" aria-label={title} data-testid={testId}>
        <div className="a2-dlgh">
          <h2 className="a2-h3">{title}</h2>
          <button type="button" className="a2-icb" onClick={onClose} aria-label={close}>
            <ShellIcon name="x" size={18} />
          </button>
        </div>
        <div className="a2-dlgb">{children}</div>
        <div className="a2-dlgf">{foot}</div>
      </div>
    </div>,
    document.body,
  );
}

export function PracticeScreen({ dict, view }: { dict: Dict; view: PracticeView }) {
  const id = useId();
  const router = useRouter();
  const c = (k: string, vars?: Record<string, string | number>) => t(dict, `practice.${k}`, vars);
  const [open, setOpen] = useState<'reset' | 'preview' | null>(null);
  const [pin, setPin] = useState('');
  const [removeDemo, setRemoveDemo] = useState(false);
  const [refill, setRefill] = useState(false);
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<string | null>(null);
  // the photo steps: how far it is (starts from what the page loaded); the loop stops when closed, the next press continues
  const [pics, setPics] = useState<{ done: number; total: number } | null>(null);
  const [picBusy, setPicBusy] = useState(false);
  const shown = pics ?? view.photos;

  const say = (a: Awaited<ReturnType<typeof call>>) => {
    const k = `practice.errors.${a.status === 0 ? 'network' : (a.data.error ?? 'server-error')}`;
    const v = t(dict, k);
    setSaid(v === k ? c('errors.server-error') : v);
  };
  async function post(path: string, body: unknown) {
    setBusy(true);
    setSaid(null);
    const a = await call('POST', `/api/admin/practice/${path}`, body);
    setBusy(false);
    return a;
  }
  async function mode(on: boolean) {
    const a = await post('mode', { on });
    if (a.data.ok) router.refresh();
    else say(a);
  }
  async function fill() {
    const a = await post('fill', {});
    if (a.data.ok) {
      showToast({
        text: a.data.seeded ? c('filled') : c('alreadyFilled'),
        tone: 'ok',
      });
      router.refresh();
    } else say(a);
  }
  async function photos() {
    setPicBusy(true);
    setSaid(null);
    let guard = 0;
    for (;;) {
      const a = await call('POST', '/api/admin/practice/photos', {});
      if (!a.data.ok) {
        say(a);
        break;
      }
      const done = Number(a.data.done ?? 0);
      const total = Number(a.data.total ?? 0);
      setPics({ done, total });
      if (a.data.finished === true) {
        showToast({ text: c('photos.finished'), tone: 'ok' });
        break;
      }
      // a step that made nothing and is not finished would repeat for ever: stop and let the owner press again
      if (Number(a.data.added ?? 0) === 0 || ++guard > 200) break; // hardcode-ok: a loop guard, not a business number
    }
    setPicBusy(false);
    router.refresh();
  }
  async function reset() {
    const a = await post('reset', { pin, removeDemo, refill });
    if (a.data.ok) {
      showToast({ text: c('resetDone'), tone: 'ok' });
      setOpen(null);
      setPin('');
      setRemoveDemo(false);
      setRefill(false);
      router.refresh();
    } else say(a);
  }

  if (!view.isOwner)
    return (
      <p className="a2-sm a2-mt12" data-testid="practice-owner-only">
        {c('ownerOnly')}
      </p>
    );
  const canReset = /^\d{4,12}$/.test(pin.trim()) && !busy;
  return (
    <>
      <section className="a2-sc a2-mt12 sy-hero" data-testid="practice-card" data-state={view.enabled ? 'on' : 'off'} aria-labelledby={`${id}-t`}>
        <i className={`sy-dot${view.enabled ? '' : ' off'}`} aria-hidden="true" />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="sy-big" id={`${id}-t`} data-testid="practice-state">
            {view.enabled ? c('mode.on') : c('mode.off')}
          </div>
          <div className="a2-scd">{c('hero.line', { n: view.total, kept: view.keptProducts })}</div>
        </div>
        <LmSwitch testId="practice-switch" on={view.enabled} label={view.enabled ? c('mode.turnOff') : c('mode.turnOn')} disabled={busy} onFlip={(v) => void mode(v)} />
      </section>
      <p className="a2-xs a2-mute a2-mt6">{c('card.lead')}</p>
      <p className="a2-xs a2-mute">{c('card.guard')}</p>

      <div className="sy-grid">
        <section className="a2-sc" data-testid="practice-counts">
          <h2 className="a2-h3">{c('clears')}</h2>
          <p className="a2-scd">{c('counts')}</p>
          <div className="a2-mt6">
            {KINDS.map((k) => (
              <div key={k} className="a2-between a2-sm" style={{ gap: 12, padding: '4px 0' }}>
                <span>{c(`kinds.${k}`)}</span>
                <b>{view.counts[k] ?? 0}</b>
              </div>
            ))}
          </div>
        </section>
        <section className="a2-sc" data-testid="practice-stays">
          <h2 className="a2-h3">{c('stays')}</h2>
          <ul className="sy-list" style={{ listStyle: 'none', paddingLeft: 0 }}>
            {STAYS.map((k) => (
              <li key={k} className="a2-sm" style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '4px 0' }}>
                <ShellIcon name="check" size={15} />
                <span>{c(`stay.${k}`)}</span>
              </li>
            ))}
          </ul>
          <p className="a2-xs a2-mute a2-mt6">{c('kept', { n: view.keptProducts })}</p>
        </section>
      </div>

      <section className="a2-sc a2-mt12" data-testid="practice-actions">
        <h2 className="a2-h3">{c('actions')}</h2>
        <div className="a2-mt6" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="a2-btn" disabled={busy || !view.enabled} onClick={fill} data-testid="practice-fill">
            {c('fill')}
          </button>
          <button type="button" className="a2-btn" disabled={busy || picBusy || !view.enabled || shown.total === 0} onClick={photos} data-testid="practice-photos-go">
            {picBusy ? c('photos.working') : c('photos.add')}
          </button>
        </div>
        <div className="a2-mt12" data-testid="practice-photos">
          <p className="a2-sm" role="status" data-testid="practice-photos-progress">
            {shown.total === 0 ? c('photos.none') : shown.done >= shown.total ? c('photos.complete', { total: shown.total }) : c('photos.progress', { done: shown.done, total: shown.total })}
          </p>
          <p className="a2-xs a2-mute">{c('photos.note')}</p>
        </div>
        {view.showReset ? (
          <div className="a2-mt12" data-testid="practice-reset" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <button type="button" className="a2-btn" onClick={() => setOpen('preview')} data-testid="practice-preview-open">
              {c('preview.open')}
            </button>
            <button type="button" className="a2-btn badf" onClick={() => setOpen('reset')} data-testid="practice-reset-open">
              {c('reset.open')}
            </button>
          </div>
        ) : null}
      </section>
      {said ? (
        <p className="a2-sm a2-mt6" role="alert" data-testid="practice-error">
          {said}
        </p>
      ) : null}

      {open === 'preview' ? (
        <Win
          title={c('preview.title')}
          close={c('close')}
          onClose={() => setOpen(null)}
          testId="practice-preview"
          foot={
            <button type="button" className="a2-btn" onClick={() => setOpen(null)}>
              {c('close')}
            </button>
          }
        >
          <p className="a2-sm">{c('preview.lead', { n: view.total })}</p>
          <div className="a2-mt6">
            {KINDS.map((k) => (
              <div key={k} className="a2-between a2-sm" style={{ gap: 12, padding: '4px 0' }}>
                <span>{c(`kinds.${k}`)}</span>
                <b>{view.counts[k] ?? 0}</b>
              </div>
            ))}
          </div>
          <p className="a2-xs a2-mute a2-mt12">{c('preview.kept', { n: view.keptProducts })}</p>
        </Win>
      ) : null}
      {open === 'reset' ? (
        <Win
          title={c('reset.title')}
          close={c('close')}
          onClose={() => setOpen(null)}
          testId="practice-reset-window"
          foot={
            <>
              <button type="button" className="a2-btn" onClick={() => setOpen(null)}>
                {c('reset.cancel')}
              </button>
              <button type="button" className="a2-btn badf" disabled={!canReset} onClick={reset} data-testid="practice-go">
                {busy ? c('reset.working') : c('reset.go')}
              </button>
            </>
          }
        >
          <p className="a2-sm">{c('reset.lead')}</p>
          <p className="a2-xs a2-mute">{c('reset.backup')}</p>
          <label className="a2-mt12" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input type="checkbox" checked={removeDemo} onChange={(e) => setRemoveDemo(e.target.checked)} data-testid="practice-remove-demo" /> {c('reset.removeDemo')}
          </label>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input type="checkbox" checked={refill} onChange={(e) => setRefill(e.target.checked)} data-testid="practice-refill" /> {c('reset.refill')}
          </label>
          <label className="a2-mt12" style={{ display: 'block' }}>
            <b>{c('reset.pin')}</b>
            <input className="a2-inp" type="password" inputMode="numeric" autoComplete="off" maxLength={12} placeholder="••••" value={pin} onChange={(e) => setPin(e.target.value)} style={{ maxWidth: 160 }} data-testid="practice-pin" />
          </label>
          <div className="a2-note warn a2-mt12">
            <ShellIcon name="alert" size={15} />
            <span>{c('reset.once')}</span>
          </div>
        </Win>
      ) : null}
    </>
  );
}
