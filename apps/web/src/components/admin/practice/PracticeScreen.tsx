'use client';
// S28 · PR 706 (CN-049) — Settings → Practice data: the practice switch, "Add sample data" and the reset dialog (the words,
// the owner's PIN, "Also remove demo products" unticked, "Add sample data again" for Refresh). Writes go to
// /api/admin/practice/*; every refusal is text from the messages file.
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import { t, type Dict } from '@/lib/i18n';
import type { PracticeView } from '@/lib/practice/api';
import { call } from '../api';
import { showToast } from '../lumen/Toast';

const WORDS = 'RESET PRACTICE'; // hardcode-ok: the phrase the owner types, shown in the field's hint
const KINDS = ['orders', 'customers', 'incomplete', 'claims', 'payouts', 'parcels', 'couriers', 'products'] as const;

export function PracticeScreen({ dict, view }: { dict: Dict; view: PracticeView }) {
  const id = useId();
  const router = useRouter();
  const c = (k: string, vars?: Record<string, string | number>) => t(dict, `practice.${k}`, vars);
  const [open, setOpen] = useState(false);
  const [words, setWords] = useState('');
  const [pin, setPin] = useState('');
  const [removeDemo, setRemoveDemo] = useState(false);
  const [refill, setRefill] = useState(false);
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<string | null>(null);

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
  async function reset() {
    const a = await post('reset', { words, pin, removeDemo, refill });
    if (a.data.ok) {
      showToast({ text: c('resetDone'), tone: 'ok' });
      setOpen(false);
      setWords('');
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
  const canReset = words.trim() === WORDS && /^\d{4,12}$/.test(pin.trim()) && !busy;
  return (
    <>
      <section className="a2-card a2-mt12" data-testid="practice-card" aria-labelledby={`${id}-t`}>
        <h2 className="a2-h3" id={`${id}-t`}>
          {c('card.title')}
        </h2>
        <p className="a2-cs">{c('card.lead')}</p>
        <p className="a2-sm a2-mt6" data-testid="practice-state">
          {view.enabled ? c('mode.on') : c('mode.off')}
        </p>
        <div className="a2-mt6" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="a2-btn" disabled={busy} onClick={() => mode(!view.enabled)} data-testid="practice-switch">
            {view.enabled ? c('mode.turnOff') : c('mode.turnOn')}
          </button>
          <button type="button" className="a2-btn" disabled={busy || !view.enabled} onClick={fill} data-testid="practice-fill">
            {c('fill')}
          </button>
        </div>
        <p className="a2-xs a2-mute a2-mt6">{c('card.guard')}</p>
      </section>

      <section className="a2-card a2-mt12" data-testid="practice-counts">
        <b className="a2-sm">{c('counts')}</b>
        <div className="a2-mt6">
          {KINDS.map((k) => (
            <div
              key={k}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: 12,
              }}
            >
              <span>{c(`kinds.${k}`)}</span>
              <b>{view.counts[k] ?? 0}</b>
            </div>
          ))}
        </div>
        <p className="a2-xs a2-mute a2-mt6">{c('kept', { n: view.keptProducts })}</p>
      </section>

      {view.showReset ? (
        <section className="a2-card a2-mt12" data-testid="practice-reset">
          <button type="button" className="a2-btn" onClick={() => setOpen((v) => !v)} data-testid="practice-reset-open">
            {c('reset.open')}
          </button>
          {open ? (
            <div className="a2-mt12" role="group" aria-label={c('reset.title')}>
              <b>{c('reset.title')}</b>
              <p className="a2-sm a2-mt6">{c('reset.lead')}</p>
              <p className="a2-xs a2-mute">{c('reset.backup')}</p>
              <label className="a2-mt12" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input type="checkbox" checked={removeDemo} onChange={(e) => setRemoveDemo(e.target.checked)} data-testid="practice-remove-demo" /> {c('reset.removeDemo')}
              </label>
              <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input type="checkbox" checked={refill} onChange={(e) => setRefill(e.target.checked)} data-testid="practice-refill" /> {c('reset.refill')}
              </label>
              <label className="a2-mt12" style={{ display: 'block' }}>
                <b>{c('reset.words')}</b>
                <input className="a2-inp" value={words} autoComplete="off" placeholder={WORDS} onChange={(e) => setWords(e.target.value)} data-testid="practice-words" />
              </label>
              <label className="a2-mt12" style={{ display: 'block' }}>
                <b>{c('reset.pin')}</b>
                <input
                  className="a2-inp"
                  type="password"
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength={12}
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  style={{ maxWidth: 160 }}
                  data-testid="practice-pin"
                />
              </label>
              <div className="a2-mt12" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button type="button" className="a2-btn" onClick={() => setOpen(false)}>
                  {c('reset.cancel')}
                </button>
                <button type="button" className="a2-btn" disabled={!canReset} onClick={reset} data-testid="practice-go">
                  {busy ? c('reset.working') : c('reset.go')}
                </button>
              </div>
            </div>
          ) : null}
        </section>
      ) : null}
      {said ? (
        <p className="a2-sm a2-mt6" role="alert" data-testid="practice-error">
          {said}
        </p>
      ) : null}
    </>
  );
}
