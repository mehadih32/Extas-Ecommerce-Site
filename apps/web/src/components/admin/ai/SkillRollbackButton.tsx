'use client';
// S15 · PR 321 (C1.7 "Skill library") — one-click rollback (the demo's own "Roll back to vN" button, AIC-04): a
// confirm step naming exactly which version stays in history and which becomes current, then
// `POST {action:'rollback', id}` to `/api/admin/ai/skills` (`ai.skills.write`). Nothing is deleted — the version
// rolled back from stays in `AiSkillVersion`, only the skill's own `currentVersion` pointer moves.
import { useId, useRef, useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { createPortal } from 'react-dom';
import { showToast } from '@/components/admin/lumen/Toast';
import { useDialogKeys } from '@/components/admin/orders/OrderCommands';
import { ShellIcon } from '@/components/admin/shell/ShellIcon';
import { runCall, withBody, type LmCall } from '@/lib/admin-lumen/safety';

const CALL: LmCall = { method: 'POST', url: '/api/admin/ai/skills' };
const noSubscribe = () => () => {};

export function SkillRollbackButton({
  id,
  buttonLabel,
  dialogTitle,
  effect,
  cancel,
  ok,
  working,
  close,
  toastOk,
  toastFailed,
}: {
  id: string;
  buttonLabel: string;
  dialogTitle: string;
  effect: string;
  cancel: string;
  ok: string;
  working: string;
  close: string;
  toastOk: string;
  toastFailed: string;
}) {
  const router = useRouter();
  const uid = useId();
  const box = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const mounted = useSyncExternalStore(
    noSubscribe,
    () => true,
    () => false,
  );
  useDialogKeys(box, () => setOpen(false));

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    const okCall = await runCall(withBody(CALL, { action: 'rollback', id }));
    setBusy(false);
    if (!okCall) {
      showToast({ text: toastFailed, tone: 'bad' });
      return;
    }
    setOpen(false);
    showToast({ text: toastOk });
    router.refresh();
  };

  return (
    <>
      <button type="button" className="a2-btn sm" data-testid={`ai-sk-rollback-${id}`} onClick={() => setOpen(true)}>
        <ShellIcon name="uturn" size={14} />
        {buttonLabel}
      </button>
      {open && mounted
        ? createPortal(
            <div className="adm2 a2-z a2-ov mid" onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}>
              <div ref={box} className="a2-dlg" role="dialog" aria-modal="true" aria-labelledby={`${uid}-t`} data-testid={`ai-sk-rollback-dialog-${id}`}>
                <div className="a2-dlgh">
                  <h2 className="a2-h3" id={`${uid}-t`}>
                    {dialogTitle}
                  </h2>
                  <button type="button" className="a2-icb" onClick={() => setOpen(false)} aria-label={close}>
                    <ShellIcon name="x" size={18} />
                  </button>
                </div>
                <div className="a2-dlgb">
                  <ul className="a2-eff">
                    <li>
                      <ShellIcon name="check" size={14} />
                      <span>{effect}</span>
                    </li>
                  </ul>
                </div>
                <div className="a2-dlgf">
                  <button type="button" className="a2-btn" onClick={() => setOpen(false)}>
                    {cancel}
                  </button>
                  <button type="button" className="a2-btn pri" data-ok onClick={submit} disabled={busy} aria-busy={busy || undefined} data-testid={`ai-sk-rollback-submit-${id}`}>
                    {busy ? working : ok}
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
