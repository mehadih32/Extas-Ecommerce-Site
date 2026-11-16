'use client';
// PR 1010 (prototype v5 `U().modal`) — a small dialog for the Settings pages that edit something in a pop-up (Settings › Couriers: Fees, Connect,
// Disconnect, the PIN; Settings › Customer messages: Edit). A title, the page's own body, a Cancel and an action button. Esc or a tap on the scrim
// closes it; Tab stays inside (`useDialogKeys`). Drawn on the page's body so a parent's layout never clips it.
import { useId, useRef, useSyncExternalStore, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useDialogKeys } from '../orders/OrderCommands';
import { ShellIcon } from '../shell/ShellIcon';

const noSubscribe = () => () => {};

export function SettingsDialog({
  title,
  close,
  cancel,
  ok,
  tone,
  busy,
  onClose,
  onOk,
  testId,
  children,
}: {
  title: string;
  close: string;
  cancel: string;
  ok: string;
  tone?: 'pri' | 'badf';
  busy?: boolean;
  onClose(): void;
  onOk(): void;
  testId: string;
  children: ReactNode;
}) {
  const uid = useId();
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
      <div ref={box} className="a2-dlg" role="dialog" aria-modal="true" aria-labelledby={`${uid}-t`} data-testid={testId}>
        <div className="a2-dlgh">
          <div>
            <h2 className="a2-h3" id={`${uid}-t`}>
              {title}
            </h2>
          </div>
          <button type="button" className="a2-icb" onClick={onClose} aria-label={close}>
            <ShellIcon name="x" size={18} />
          </button>
        </div>
        <div className="a2-dlgb">{children}</div>
        <div className="a2-dlgf">
          <button type="button" className="a2-btn" onClick={onClose}>
            {cancel}
          </button>
          <button type="button" className={`a2-btn ${tone ?? 'pri'}`} data-ok onClick={onOk} disabled={busy} aria-busy={busy || undefined} data-testid={`${testId}-ok`}>
            {ok}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
