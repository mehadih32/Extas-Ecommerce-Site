'use client';
// PR 934 — AI Center › Approvals: "Read draft" on a card whose agent attached the text it wants to send (prototype v5 m-ai.js `seeDraft`).
// Read-only: the owner reads the words here and decides with Approve or Reject on the card; nothing is sent from this window.
import { useEffect, useId, useState } from 'react';
import { createPortal } from 'react-dom';
import { ShellIcon } from '@/components/admin/shell/ShellIcon';

export function ReadDraftButton({ buttonLabel, title, close, who, topic, body, note }: { buttonLabel: string; title: string; close: string; who: string; topic: string; body: string; note: string }) {
  const uid = useId();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- mounted flag so the portal draws only in the browser
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);
  return (
    <>
      <button type="button" className="a2-btn sm" onClick={() => setOpen(true)} data-testid="ai-ap-draft-open">
        {buttonLabel}
      </button>
      {open && mounted
        ? createPortal(
            <div className="adm2 a2-z a2-ov mid" onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}>
              <div className="a2-dlg" role="dialog" aria-modal="true" aria-labelledby={`${uid}-t`} data-testid="ai-ap-draft">
                <div className="a2-dlgh">
                  <h2 className="a2-h3" id={`${uid}-t`}>
                    {title}
                  </h2>
                  <button type="button" className="a2-icb" onClick={() => setOpen(false)} aria-label={close}>
                    <ShellIcon name="x" size={18} />
                  </button>
                </div>
                <div className="a2-dlgb">
                  <p className="a2-xs a2-mute">
                    {who} · {topic}
                  </p>
                  <pre className="ai-dg-pre">{body}</pre>
                  <p className="a2-xs a2-mute">{note}</p>
                  <div className="a2-gap8 a2-mt12">
                    <button type="button" className="a2-btn" onClick={() => setOpen(false)}>
                      {close}
                    </button>
                  </div>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
