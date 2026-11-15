'use client';
// PR 818 — the controls of AI Center › Costs & limits: the AI monthly ceiling (a plain amount in the store's own currency, empty =
// no ceiling, saved with a Save button that shows only once something changed) and a switch or tick box for the cost-saver mode and
// "turn on by itself at 80%". They post to `/api/admin/ai/limits` (`ai.control`, written through the settings history); a change is
// reversible, so the toast offers Undo like every other switch in the AI Center. Drawn only for someone who holds `ai.control`.
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toMajor, toMinor, type Money } from '@/components/admin/products/model';
import { runCall, withBody, type LmCall } from '@/lib/admin-lumen/safety';
import { showToast } from '@/components/admin/lumen/Toast';

const CALL: LmCall = { method: 'POST', url: '/api/admin/ai/limits' };

export function CeilingInput({ capMinor, money, label, saveLabel, savedText, failedText, invalidText }: { capMinor: number | null; money: Money; label: string; saveLabel: string; savedText: string; failedText: string; invalidText: string }) {
  const router = useRouter();
  const [saved, setSaved] = useState(toMajor(capMinor, money));
  const [text, setText] = useState(saved);
  const [busy, setBusy] = useState(false);
  const dirty = text !== saved;

  const save = async () => {
    if (busy) return;
    const minor = toMinor(text, money);
    if (minor === undefined || (minor !== null && minor < 1)) {
      showToast({ text: invalidText, tone: 'bad' });
      return;
    }
    const prev = toMinor(saved, money) ?? null;
    setBusy(true);
    const ok = await runCall(withBody(CALL, { aiCapMinor: minor }));
    setBusy(false);
    if (!ok) {
      showToast({ text: failedText, tone: 'bad' });
      return;
    }
    setSaved(text);
    router.refresh();
    showToast({
      text: savedText,
      undo: {
        kind: 'setting.switch',
        run: async () => {
          const u = await runCall(withBody(CALL, { aiCapMinor: prev }));
          if (u) {
            const back = toMajor(prev, money);
            setSaved(back);
            setText(back);
            router.refresh();
          }
          return u;
        },
      },
    });
  };

  return (
    <div className="ai-cap" data-testid="ai-ceiling">
      <input type="text" inputMode="decimal" aria-label={label} className="a2-sel ai-capin" data-testid="ai-ceiling-input" value={text} disabled={busy} onChange={(e) => setText(e.target.value)} />
      {dirty ? (
        <button type="button" className="a2-btn sm pri" disabled={busy} onClick={() => void save()} data-testid="ai-ceiling-save">
          {saveLabel}
        </button>
      ) : null}
    </div>
  );
}

/** A switch (`kind="switch"`) or a tick box (`kind="check"`) for one yes/no limit. */
export function LimitToggle({ field, on, label, kind, onText, offText, failedText, testId }: { field: 'costSaver' | 'costSaverAuto'; on: boolean; label: string; kind: 'switch' | 'check'; onText: string; offText: string; failedText: string; testId: string }) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(on);
  const [busy, setBusy] = useState(false);

  const flip = async () => {
    if (busy) return;
    const next = !enabled;
    setBusy(true);
    const ok = await runCall(withBody(CALL, { [field]: next }));
    setBusy(false);
    if (!ok) {
      showToast({ text: failedText, tone: 'bad' });
      return;
    }
    setEnabled(next);
    router.refresh();
    showToast({
      text: next ? onText : offText,
      undo: {
        kind: 'setting.switch',
        run: async () => {
          const u = await runCall(withBody(CALL, { [field]: !next }));
          if (u) {
            setEnabled(!next);
            router.refresh();
          }
          return u;
        },
      },
    });
  };

  if (kind === 'check')
    return (
      <label className="ai-check" data-testid={testId}>
        <input type="checkbox" checked={enabled} disabled={busy} onChange={() => void flip()} />
        <span>{label}</span>
      </label>
    );
  return (
    <button type="button" role="switch" aria-checked={enabled} aria-label={label} className={`lm-sw${enabled ? ' on' : ''}`} onClick={() => void flip()} disabled={busy} data-testid={testId}>
      <span aria-hidden="true" />
    </button>
  );
}
