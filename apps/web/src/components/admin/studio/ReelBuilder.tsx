'use client';
// S25 · PR 485 — Marketing › Studio › Reels: build a reel from a handful of already-APPROVED clips, an optional
// music track, text/logo overlay choices and the output shapes to cut it for. POST {action: 'build', input} on
// /api/admin/marketing/studio/reels. The API checks the permission and every rule again; the page is read again
// after a build. Setting a DRAFT reel aside or back is {action: 'archive' | 'restore', reelId}.
//
// S25 · PR 486 — {action: 'assemble', reelId} fills in the honest-preview output, one per shape; `ReelAssemble` is
// the button for a reel still waiting (or one that failed and can be tried again).
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { VIDEO_ASPECTS, type VideoAspect } from '@extas/adapters/video';
import { call } from '../api';
import { showToast } from '../lumen/Toast';

type Out = { text: string; bad: boolean } | null;
const errText = (a: { status: number; data: Record<string, unknown> }, err: Record<string, string>) => {
  const code = a.status === 0 ? 'network' : String(a.data.error ?? 'other');
  return err[code] ?? err.other ?? code;
};

export interface ReelTexts {
  title: string;
  clips: string;
  noApprovedClips: string;
  shapes: string;
  aspectName: Record<VideoAspect, string>;
  music: string;
  musicPh: string;
  musicHelp: string;
  overlayText: string;
  overlayTextPh: string;
  showLogo: string;
  build: string;
  building: string;
  built: string;
  assemble: string;
  assembling: string;
  assembled: string;
  assembleNote: string;
  archive: string;
  archiving: string;
  restore: string;
  restoring: string;
  err: Record<string, string>;
}

/** Picks the approved clips, music, overlay and shapes for a new reel; nothing is composited yet (that is PR 486). */
export function ReelBuilder({ url, approvedClips, texts: x }: { url: string; approvedClips: { id: string; productId: string | null; aspect: string | null }[]; texts: ReelTexts }) {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [clipIds, setClipIds] = useState<string[]>([]);
  const [aspects, setAspects] = useState<VideoAspect[]>(['9:16']);
  const [musicAssetId, setMusicAssetId] = useState('');
  const [overlayText, setOverlayText] = useState('');
  const [showLogo, setShowLogo] = useState(false);
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState<Out>(null);

  const toggleClip = (id: string) => setClipIds((cur) => (cur.includes(id) ? cur.filter((c) => c !== id) : [...cur, id]));
  const toggleAspect = (a: VideoAspect) => setAspects((cur) => (cur.includes(a) ? cur.filter((x2) => x2 !== a) : [...cur, a]));
  const ready = title.trim().length > 0 && clipIds.length > 0 && aspects.length > 0;

  async function build() {
    setBusy(true);
    setOut(null);
    const input = {
      title: title.trim(),
      clipJobIds: clipIds,
      aspects,
      musicAssetId: musicAssetId.trim() || undefined,
      overlays: overlayText.trim() || showLogo ? { text: overlayText.trim() || null, showLogo } : undefined,
    };
    const a = await call('POST', url, { action: 'build', input });
    setBusy(false);
    if (a.status !== 200) return setOut({ text: errText(a, x.err), bad: true });
    showToast({ text: x.built, tone: 'ok' });
    setTitle('');
    setClipIds([]);
    setMusicAssetId('');
    setOverlayText('');
    setShowLogo(false);
    router.refresh();
  }

  if (!approvedClips.length) return <p className="a2-sm a2-mute">{x.noApprovedClips}</p>;

  return (
    <div className="adp-add" data-testid="reel-new">
      <div>
        <label className="a2-lbl" htmlFor="reel-title">
          {x.title}
        </label>
        <input id="reel-title" className="a2-inp" value={title} disabled={busy} onChange={(e) => setTitle(e.target.value)} data-testid="reel-title" />
      </div>
      <fieldset>
        <legend className="a2-lbl">{x.clips}</legend>
        {approvedClips.map((c) => (
          <label key={c.id} className="a2-chkl">
            <input type="checkbox" className="a2-chk" checked={clipIds.includes(c.id)} disabled={busy} onChange={() => toggleClip(c.id)} data-testid="reel-clip" />
            <span>
              {c.aspect ?? '—'} · {c.id.slice(0, 8)}
            </span>
          </label>
        ))}
      </fieldset>
      <fieldset>
        <legend className="a2-lbl">{x.shapes}</legend>
        {VIDEO_ASPECTS.map((a) => (
          <label key={a} className="a2-chkl">
            <input type="checkbox" className="a2-chk" checked={aspects.includes(a)} disabled={busy} onChange={() => toggleAspect(a)} data-testid="reel-aspect" />
            <span>{x.aspectName[a]}</span>
          </label>
        ))}
      </fieldset>
      <div>
        <label className="a2-lbl" htmlFor="reel-music">
          {x.music}
        </label>
        <input id="reel-music" className="a2-inp" placeholder={x.musicPh} value={musicAssetId} disabled={busy} onChange={(e) => setMusicAssetId(e.target.value)} data-testid="reel-music" />
        <p className="a2-sm a2-mute">{x.musicHelp}</p>
      </div>
      <div>
        <label className="a2-lbl" htmlFor="reel-overlay-text">
          {x.overlayText}
        </label>
        <input id="reel-overlay-text" className="a2-inp" placeholder={x.overlayTextPh} value={overlayText} disabled={busy} onChange={(e) => setOverlayText(e.target.value)} data-testid="reel-overlay-text" />
      </div>
      <label className="a2-chkl">
        <input type="checkbox" className="a2-chk" checked={showLogo} disabled={busy} onChange={(e) => setShowLogo(e.target.checked)} data-testid="reel-logo" />
        <span>{x.showLogo}</span>
      </label>
      <div className="adp-read">
        <button type="button" className="a2-btn pri" disabled={busy || !ready} onClick={() => void build()} data-testid="reel-build">
          {busy ? x.building : x.build}
        </button>
        {out ? (
          <span className={`a2-sm${out.bad ? ' adp-bad' : ''}`} role="status" aria-live="polite" data-testid="reel-out">
            {out.text}
          </span>
        ) : null}
      </div>
    </div>
  );
}

/** Assembles a DRAFT (or previously FAILED) reel — the honest-preview compositor, one output per shape, never a
 * real stitched video yet (no encoder in the stack). */
export function ReelAssemble({ url, reelId, texts: x }: { url: string; reelId: string; texts: ReelTexts }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState<Out>(null);
  async function go() {
    setBusy(true);
    setOut(null);
    const a = await call('POST', url, { action: 'assemble', reelId });
    setBusy(false);
    if (a.status !== 200) return setOut({ text: errText(a, x.err), bad: true });
    showToast({ text: x.assembled, tone: 'ok' });
    router.refresh();
  }
  return (
    <span className="adp-read">
      <button type="button" className="a2-btn pri sm" disabled={busy} onClick={() => void go()} data-testid="reel-assemble">
        {busy ? x.assembling : x.assemble}
      </button>
      {out ? (
        <span className={`a2-sm${out.bad ? ' adp-bad' : ''}`} role="status" aria-live="polite" data-testid="reel-assemble-out">
          {out.text}
        </span>
      ) : null}
    </span>
  );
}

/** Sets a DRAFT reel aside — never deleted, only no longer offered for assembly. */
export function ReelArchive({ url, reelId, texts: x }: { url: string; reelId: string; texts: ReelTexts }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState<Out>(null);
  async function go() {
    setBusy(true);
    setOut(null);
    const a = await call('POST', url, { action: 'archive', reelId });
    setBusy(false);
    if (a.status !== 200) return setOut({ text: errText(a, x.err), bad: true });
    router.refresh();
  }
  return (
    <span className="adp-read">
      <button type="button" className="a2-btn sm" disabled={busy} onClick={() => void go()} data-testid="reel-archive">
        {busy ? x.archiving : x.archive}
      </button>
      {out ? (
        <span className={`a2-sm${out.bad ? ' adp-bad' : ''}`} role="status" aria-live="polite">
          {out.text}
        </span>
      ) : null}
    </span>
  );
}
