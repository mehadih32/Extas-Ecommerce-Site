'use client';
// S25 · PR 481 — Marketing › Studio › Motion library: add a new action, archive or restore one. POST {action: 'create'
// | 'archive' | 'restore'} on /api/admin/marketing/studio/motion. The API checks the permission again; the page is
// read again after each change (nothing here generates a clip).
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { call } from '../api';
import { showToast } from '../lumen/Toast';
import { MOTION_GARMENT_HINTS, type MotionActionView, type MotionGarmentHint } from '@extas/creative-studio';

type Out = { text: string; bad: boolean } | null;
const errText = (a: { status: number; data: Record<string, unknown> }, err: Record<string, string>) => {
  const code = a.status === 0 ? 'network' : String(a.data.error ?? 'other');
  return err[code] ?? err.other ?? code;
};

export interface MotionTexts {
  name: string;
  nameBn: string;
  garmentHint: string;
  descriptionEn: string;
  descriptionBn: string;
  groupClip: string;
  add: string;
  adding: string;
  added: string;
  archive: string;
  restore: string;
  confirmArchive: string;
  yes: string;
  cancel: string;
  hint: Record<MotionGarmentHint, string>;
  err: Record<string, string>;
}

/** A new motion action: key is derived from the English name on the server's own slug rule is not used here — the
 * key field is typed directly so the owner controls it (camelCase, checked by the API). */
export function MotionNew({ url, texts: x }: { url: string; texts: MotionTexts }) {
  const router = useRouter();
  const [key, setKey] = useState('');
  const [name, setName] = useState('');
  const [nameBn, setNameBn] = useState('');
  const [hint, setHint] = useState<MotionGarmentHint>('other');
  const [descriptionEn, setDescriptionEn] = useState('');
  const [descriptionBn, setDescriptionBn] = useState('');
  const [groupClip, setGroupClip] = useState(false);
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState<Out>(null);
  const ready = key.trim().length >= 2 && name.trim() && nameBn.trim() && descriptionEn.trim() && descriptionBn.trim();
  async function go() {
    setBusy(true);
    setOut(null);
    const input = { key: key.trim(), name: name.trim(), spec: { nameBn: nameBn.trim(), garmentHint: hint, descriptionEn: descriptionEn.trim(), descriptionBn: descriptionBn.trim(), minSeconds: 4, maxSeconds: 8, groupClip } };
    const a = await call('POST', url, { action: 'create', input });
    setBusy(false);
    if (a.status !== 200) return setOut({ text: errText(a, x.err), bad: true });
    showToast({ text: x.added, tone: 'ok' });
    setKey('');
    setName('');
    setNameBn('');
    setDescriptionEn('');
    setDescriptionBn('');
    setGroupClip(false);
    router.refresh();
  }
  return (
    <div className="adp-add" data-testid="motion-new">
      <div>
        <label className="a2-lbl" htmlFor="motion-key">
          key
        </label>
        <input id="motion-key" className="a2-inp" value={key} disabled={busy} onChange={(e) => setKey(e.target.value)} data-testid="motion-key" />
      </div>
      <div>
        <label className="a2-lbl" htmlFor="motion-name">
          {x.name}
        </label>
        <input id="motion-name" className="a2-inp" value={name} disabled={busy} onChange={(e) => setName(e.target.value)} data-testid="motion-name" />
      </div>
      <div>
        <label className="a2-lbl" htmlFor="motion-name-bn">
          {x.nameBn}
        </label>
        <input id="motion-name-bn" className="a2-inp" value={nameBn} disabled={busy} onChange={(e) => setNameBn(e.target.value)} data-testid="motion-name-bn" />
      </div>
      <div>
        <label className="a2-lbl" htmlFor="motion-hint">
          {x.garmentHint}
        </label>
        <select id="motion-hint" className="a2-sel" value={hint} disabled={busy} onChange={(e) => setHint(e.target.value as MotionGarmentHint)} data-testid="motion-hint">
          {MOTION_GARMENT_HINTS.map((h) => (
            <option key={h} value={h}>
              {x.hint[h]}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="a2-lbl" htmlFor="motion-desc-en">
          {x.descriptionEn}
        </label>
        <input id="motion-desc-en" className="a2-inp" value={descriptionEn} disabled={busy} onChange={(e) => setDescriptionEn(e.target.value)} data-testid="motion-desc-en" />
      </div>
      <div>
        <label className="a2-lbl" htmlFor="motion-desc-bn">
          {x.descriptionBn}
        </label>
        <input id="motion-desc-bn" className="a2-inp" value={descriptionBn} disabled={busy} onChange={(e) => setDescriptionBn(e.target.value)} data-testid="motion-desc-bn" />
      </div>
      <label className="a2-sm adp-read">
        <input type="checkbox" className="a2-chk" checked={groupClip} disabled={busy} onChange={(e) => setGroupClip(e.target.checked)} data-testid="motion-group" />
        {x.groupClip}
      </label>
      <div className="adp-read">
        <button type="button" className="a2-btn pri" disabled={busy || !ready} onClick={() => void go()} data-testid="motion-add">
          {busy ? x.adding : x.add}
        </button>
        {out ? (
          <span className={`a2-sm${out.bad ? ' adp-bad' : ''}`} role="status" aria-live="polite" data-testid="motion-out">
            {out.text}
          </span>
        ) : null}
      </div>
    </div>
  );
}

/** Archive (with a confirm) or restore one action. */
export function MotionArchive({ url, action, texts: x }: { url: string; action: MotionActionView; texts: MotionTexts }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState<Out>(null);
  async function go(next: 'archive' | 'restore') {
    setBusy(true);
    setOut(null);
    const a = await call('POST', url, { action: next, id: action.id });
    setBusy(false);
    setConfirming(false);
    if (a.status !== 200) return setOut({ text: errText(a, x.err), bad: true });
    router.refresh();
  }
  if (action.archived) {
    return (
      <button type="button" className="a2-btn" disabled={busy} onClick={() => void go('restore')} data-testid="motion-restore">
        {x.restore}
      </button>
    );
  }
  if (confirming) {
    return (
      <span className="adp-read" data-testid="motion-confirm">
        <span className="a2-sm">{x.confirmArchive}</span>
        <button type="button" className="a2-btn pri" disabled={busy} onClick={() => void go('archive')} data-testid="motion-confirm-yes">
          {x.yes}
        </button>
        <button type="button" className="a2-btn" disabled={busy} onClick={() => setConfirming(false)}>
          {x.cancel}
        </button>
      </span>
    );
  }
  return (
    <>
      <button type="button" className="a2-btn" disabled={busy} onClick={() => setConfirming(true)} data-testid="motion-archive">
        {x.archive}
      </button>
      {out ? (
        <span className={`a2-sm${out.bad ? ' adp-bad' : ''}`} role="status" aria-live="polite">
          {out.text}
        </span>
      ) : null}
    </>
  );
}
