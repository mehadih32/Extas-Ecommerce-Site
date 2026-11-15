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
import { call } from '@/components/admin/api';
import { ConfirmDialog } from '@/components/admin/settings/ConfirmDialog';

const CALL: LmCall = { method: 'POST', url: '/api/admin/ai/limits' };

export interface CeilingPinTexts {
  title: string;
  text: string;
  label: string;
  ok: string;
  cancel: string;
  /** Error words by code (PIN_REQUIRED, WRONG_PIN, …, other). */
  err: Record<string, string>;
}

/** The monthly AI ceiling is a money limit: saving it asks the owner's PIN (the server checks it again). No Undo toast: an undo would need the PIN too. */
export function CeilingInput({ capMinor, money, label, saveLabel, savedText, failedText, invalidText, pin }: { capMinor: number | null; money: Money; label: string; saveLabel: string; savedText: string; failedText: string; invalidText: string; pin: CeilingPinTexts }) {
  const router = useRouter();
  const [saved, setSaved] = useState(toMajor(capMinor, money));
  const [text, setText] = useState(saved);
  const [ask, setAsk] = useState(false);
  const dirty = text !== saved;

  const open = () => {
    const minor = toMinor(text, money);
    if (minor === undefined || (minor !== null && minor < 1)) {
      showToast({ text: invalidText, tone: 'bad' });
      return;
    }
    setAsk(true);
  };
  const save = async (pinText: string): Promise<string | null> => {
    if (!pinText) return pin.err.PIN_REQUIRED ?? failedText;
    const minor = toMinor(text, money) ?? null;
    const r = await call('POST', CALL.url, { aiCapMinor: minor, pin: pinText });
    if (!r.data.ok) return r.status === 0 ? failedText : (pin.err[String(r.data.error)] ?? pin.err.other ?? failedText);
    setSaved(text);
    setAsk(false);
    router.refresh();
    showToast({ text: savedText, tone: 'ok' });
    return null;
  };

  return (
    <div className="ai-cap" data-testid="ai-ceiling">
      <input type="text" inputMode="decimal" aria-label={label} className="a2-sel ai-capin" data-testid="ai-ceiling-input" value={text} onChange={(e) => setText(e.target.value)} />
      {dirty ? (
        <button type="button" className="a2-btn sm pri" onClick={open} data-testid="ai-ceiling-save">
          {saveLabel}
        </button>
      ) : null}
      {ask ? <ConfirmDialog testId="ai-ceiling-pin" tone="pri" texts={{ title: pin.title, effects: [pin.text], reason: null, cancel: pin.cancel, ok: pin.ok, working: '…', close: pin.cancel, pin: pin.label }} onClose={() => setAsk(false)} onConfirm={(_r, pinText) => save(pinText)} /> : null}
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
