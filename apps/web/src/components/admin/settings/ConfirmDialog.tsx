"use client";
// PR 602 — the new admin's [confirm] dialog for a settings page (demo a2Confirm): what will happen, an optional reason
// for the audit log, Cancel and the action's own button. Esc or the scrim closes it; Tab stays inside. Drawn on the
// page's body so a parent's layout never clips it.
import { useId, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useDialogKeys } from "../orders/OrderCommands";
import { ShellIcon } from "../shell/ShellIcon";

export interface ConfirmTexts {
  title: string;
  effects: readonly string[];
  /** The reason field's label; null: no reason asked. */
  reason: string | null;
  cancel: string;
  ok: string;
  working: string;
  close: string;
}

const noSubscribe = () => () => {};

export function ConfirmDialog({
  texts,
  tone,
  onClose,
  onConfirm,
  testId,
}: {
  texts: ConfirmTexts;
  tone?: "pri" | "badf";
  onClose(): void;
  onConfirm(reason: string): Promise<string | null>;
  testId: string;
}) {
  const uid = useId();
  const box = useRef<HTMLDivElement>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const mounted = useSyncExternalStore(
    noSubscribe,
    () => true,
    () => false,
  );
  useDialogKeys(box, onClose);
  const go = async () => {
    if (busy) return;
    setBusy(true);
    const p = await onConfirm(reason.trim());
    setBusy(false);
    if (p) setProblem(p);
  };
  if (!mounted) return null;
  return createPortal(
    <div
      className="adm2 a2-z a2-ov mid"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        ref={box}
        className="a2-dlg"
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${uid}-t`}
        data-testid={testId}
      >
        <div className="a2-dlgh">
          <h2 className="a2-h3" id={`${uid}-t`}>
            {texts.title}
          </h2>
          <button
            type="button"
            className="a2-icb"
            onClick={onClose}
            aria-label={texts.close}
          >
            <ShellIcon name="x" size={18} />
          </button>
        </div>
        <div className="a2-dlgb">
          <ul className="a2-eff">
            {texts.effects.map((e) => (
              <li key={e}>
                <ShellIcon name="check" size={14} />
                <span>{e}</span>
              </li>
            ))}
          </ul>
          {texts.reason ? (
            <div className="a2-fld a2-mt12">
              <label className="a2-lbl" htmlFor={`${uid}-r`}>
                {texts.reason}
              </label>
              <input
                id={`${uid}-r`}
                className="a2-inp"
                value={reason}
                maxLength={500}
                onChange={(e) => {
                  setReason(e.target.value);
                  setProblem(null);
                }}
                autoComplete="off"
              />
            </div>
          ) : null}
          {problem ? (
            <div className="a2-note bad a2-mt12" role="alert">
              <ShellIcon name="alert" size={15} />
              <span>{problem}</span>
            </div>
          ) : null}
        </div>
        <div className="a2-dlgf">
          <button type="button" className="a2-btn" onClick={onClose}>
            {texts.cancel}
          </button>
          <button
            type="button"
            className={`a2-btn ${tone ?? "pri"}`}
            data-ok
            onClick={go}
            disabled={busy}
            aria-busy={busy || undefined}
          >
            {busy ? texts.working : texts.ok}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
