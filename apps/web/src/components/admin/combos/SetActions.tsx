'use client';
// PR 773 (prototype v5 parity, m-products.js renderSets) — the foot of a set card: the on/off switch ("On the shop" / "Off"), Edit and
// Archive (or "Bring back" for an archived set). The switch and Archive call the same route Combos & sets uses
// (POST /api/admin/combos/:id/active {on}, `combos.publish`; the API checks again). PR 786: Off (paused, the switch stays) and Archive (ended, "Bring back" returns it to Off) are two states; Archive asks first.
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { SetEditorButton } from './SetEditor';

export interface SetActionsTexts {
  on: string;
  off: string;
  edit: string;
  archive: string;
  bringBack: string;
  archived: string;
  confirm: string;
  confirmBody: string;
  cancel: string;
  failed: string;
  notReady: string;
}

export function SetActions({ id, on, archived, canPublish, canEdit, texts }: { id: string; on: boolean; archived: boolean; canPublish: boolean; canEdit: boolean; texts: SetActionsTexts }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState(false);
  const [msg, setMsg] = useState('');
  const call = async (next: boolean, archive = false) => {
    setBusy(true);
    setMsg('');
    try {
      const res = await fetch(`/api/admin/combos/${id}/active`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(archive ? { on: false, archive: true } : { on: next }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { code?: string };
        setMsg(body.code === 'NOT_READY' ? texts.notReady : texts.failed);
      } else {
        setAsking(false);
        router.refresh();
      }
    } catch {
      setMsg(texts.failed);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="st-foot" data-testid="set-actions">
      {archived ? (
        <>
          <span className="a2-pill line">{texts.archived}</span>
          {canPublish ? (
            <button type="button" className="a2-btn sm" disabled={busy} onClick={() => call(false)}>
              {texts.bringBack}
            </button>
          ) : null}
        </>
      ) : (
        <>
          <label className="st-sw">
            <input type="checkbox" role="switch" className="a2-chk" checked={on} disabled={busy || !canPublish} onChange={(e) => call(e.target.checked)} data-testid="set-switch" />
            <span>{on ? texts.on : texts.off}</span>
          </label>
          <span className="st-btns">
            {canEdit ? <SetEditorButton id={id} label={texts.edit} /> : null}
            {canPublish ? (
              <button type="button" className="a2-btn sm ghost" disabled={busy} onClick={() => setAsking(true)}>
                {texts.archive}
              </button>
            ) : null}
          </span>
        </>
      )}
      {asking ? (
        <div className="st-ask" role="alertdialog" aria-label={texts.confirm}>
          <b>{texts.confirm}</b>
          <span>{texts.confirmBody}</span>
          <span className="st-btns">
            <button type="button" className="a2-btn sm" onClick={() => setAsking(false)}>
              {texts.cancel}
            </button>
            <button type="button" className="a2-btn sm primary" disabled={busy} onClick={() => call(false, true)}>
              {texts.archive}
            </button>
          </span>
        </div>
      ) : null}
      {msg ? (
        <p className="a2-xs" role="alert" style={{ color: 'var(--bad)' }}>
          {msg}
        </p>
      ) : null}
    </div>
  );
}
