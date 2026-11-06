'use client';
// S12 · PR 547 — one button of the article's main-photo picker (Website › Blog & journal › the article › Main photo),
// drawn in Lumen: "Use this photo" (or "Take off" for the one in use) saves at once through /api/admin/blog/photo,
// shows the toast and reloads the page's data. Picking another photo is how a choice is changed back; nothing is
// deleted (the picture stays in the library).
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { showToast } from '@/components/admin/lumen/Toast';

export function PickPhoto(props: { postId: string; assetId: string | null; label: string; done: string; failed: string; pri?: boolean; testId?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const go = async () => {
    if (busy) return;
    setBusy(true);
    let ok = false;
    try {
      const r = await fetch('/api/admin/blog/photo', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: props.postId, assetId: props.assetId }) });
      ok = r.ok;
    } catch {
      ok = false;
    }
    setBusy(false);
    showToast({ text: ok ? props.done : props.failed, tone: ok ? 'ok' : 'bad' });
    if (ok) router.refresh();
  };
  return (
    <button type="button" className={`lm-btn sm${props.pri ? ' pri' : ''}`} onClick={go} disabled={busy} aria-busy={busy} data-testid={props.testId}>
      {props.label}
    </button>
  );
}
