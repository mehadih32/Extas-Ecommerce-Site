'use client';
// S24 · PR 457 (Blueprint C7.8 — "a small editor in the admin: crop, straighten, brightness and contrast, spot
// removal, and 'run finishing again'") — the editor's own client form. A live CSS preview only (rotate +
// brightness/contrast filter, a crop overlay box, spot markers): no pixel is ever changed here, only the
// owner's own operations are recorded, in the order applied, through `/api/admin/marketing/photoshoot-editor`.
// "Run finishing again" is offered only on a generated image (the finishing pass never touches a real
// original, the same C7.8 rule `recordImageEdit` itself enforces).
import { useRouter } from 'next/navigation';
import { useId, useMemo, useState } from 'react';
import { showToast } from '../lumen/Toast';

const API = '/api/admin/marketing/photoshoot-editor';

export interface EditorFormTexts {
  err: Record<string, string>;
  preview: string;
  crop: string;
  cropX: string;
  cropY: string;
  cropWidth: string;
  cropHeight: string;
  straighten: string;
  straightenHelp: string;
  tone: string;
  brightness: string;
  contrast: string;
  spots: string;
  spotX: string;
  spotY: string;
  spotAdd: string;
  spotEmpty: string;
  spotRemove: string;
  rerun: string;
  rerunHint: string;
  rerunNotGenerated: string;
  save: string;
  saving: string;
  saved: string;
  nothingToSave: string;
  noPicture: string;
}

type Msg = { ok: boolean; text: string } | null;
type Spot = { id: string; x: number; y: number };

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const num = (v: string, fallback: number) => (v.trim() === '' ? fallback : Number(v));

export function PhotoshootEditorForm({ assetId, isAiGenerated, previewUrl, texts: w }: { assetId: string; isAiGenerated: boolean; previewUrl: string | null; texts: EditorFormTexts }) {
  const uid = useId();
  const router = useRouter();
  const [cropX, setCropX] = useState(0);
  const [cropY, setCropY] = useState(0);
  const [cropW, setCropW] = useState(100);
  const [cropH, setCropH] = useState(100);
  const [degrees, setDegrees] = useState(0);
  const [brightness, setBrightness] = useState(0);
  const [contrast, setContrast] = useState(0);
  const [spots, setSpots] = useState<Spot[]>([]);
  const [spotX, setSpotX] = useState(50);
  const [spotY, setSpotY] = useState(50);
  const [rerun, setRerun] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);

  const cropped = cropX !== 0 || cropY !== 0 || cropW !== 100 || cropH !== 100;
  const straightened = degrees !== 0;
  const toned = brightness !== 0 || contrast !== 0;

  const previewStyle = useMemo(
    () => ({ transform: `rotate(${degrees}deg)`, filter: `brightness(${100 + brightness}%) contrast(${100 + contrast}%)` }),
    [degrees, brightness, contrast],
  );
  const cropBoxStyle = useMemo(() => ({ left: `${cropX}%`, top: `${cropY}%`, width: `${cropW}%`, height: `${cropH}%` }), [cropX, cropY, cropW, cropH]);

  function addSpot() {
    setSpots((s) => [...s, { id: `${Date.now()}-${s.length}`, x: clamp(spotX, 0, 100), y: clamp(spotY, 0, 100) }]);
  }
  function removeSpot(id: string) {
    setSpots((s) => s.filter((p) => p.id !== id));
  }

  async function save() {
    const operations: Record<string, unknown>[] = [];
    if (cropped) operations.push({ kind: 'crop', box: { x: cropX / 100, y: cropY / 100, width: cropW / 100, height: cropH / 100 } });
    if (straightened) operations.push({ kind: 'straighten', degrees });
    if (toned) operations.push({ kind: 'brightnessContrast', brightness, contrast });
    if (spots.length) operations.push({ kind: 'spotRemoval', points: spots.map((p) => ({ x: p.x / 100, y: p.y / 100 })) });
    if (rerun) operations.push({ kind: 'runFinishingAgain' });
    if (!operations.length) return setMsg({ ok: false, text: w.nothingToSave });

    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(API, { method: 'POST', credentials: 'same-origin', cache: 'no-store', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sourceAssetId: assetId, operations }) });
      const data = (await res.json().catch(() => ({ ok: false }))) as { ok?: boolean; error?: string };
      if (!data.ok) {
        const code = data.error ?? (res.status === 403 ? 'forbidden' : res.status === 401 ? 'unauthorized' : 'other');
        setMsg({ ok: false, text: w.err[code] ?? w.err.other ?? code });
        return;
      }
      showToast({ text: w.saved, tone: 'ok' });
      setCropX(0);
      setCropY(0);
      setCropW(100);
      setCropH(100);
      setDegrees(0);
      setBrightness(0);
      setContrast(0);
      setSpots([]);
      setRerun(false);
      router.refresh();
    } catch {
      setMsg({ ok: false, text: w.err.network ?? w.err.other ?? 'network' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="a2-row" data-testid="photoshoot-editor-form">
      <section className="a2-sc" aria-labelledby={`${uid}-prev-h`} data-testid="ped-preview">
        <h2 className="a2-h3" id={`${uid}-prev-h`}>
          {w.preview}
        </h2>
        {previewUrl ? (
          <div className="ped-img-wrap">
            {/* eslint-disable-next-line @next/next/no-img-element -- a live CSS rotate/filter preview needs a plain <img>, never next/image's own transform */}
            <img src={previewUrl} alt="" className="ped-img" style={previewStyle} data-testid="ped-preview-img" />
            {cropped ? <div className="ped-crop-box" style={cropBoxStyle} aria-hidden="true" /> : null}
            {spots.map((p) => (
              <span key={p.id} className="ped-spot" style={{ left: `${p.x}%`, top: `${p.y}%` }} aria-hidden="true" />
            ))}
          </div>
        ) : (
          <p className="a2-sm a2-mute" data-testid="ped-no-picture">
            {w.noPicture}
          </p>
        )}
      </section>

      <section className="a2-sc" aria-labelledby={`${uid}-crop-h`}>
        <h2 className="a2-h3" id={`${uid}-crop-h`}>
          {w.crop}
        </h2>
        <div className="a2-fg">
          <div className="a2-fld">
            <label className="a2-lbl" htmlFor={`${uid}-cx`}>
              {w.cropX}
            </label>
            <input id={`${uid}-cx`} className="a2-inp" type="number" inputMode="numeric" min={0} max={99} value={cropX} data-testid="ped-crop-x" onChange={(e) => setCropX(clamp(num(e.target.value, 0), 0, 99))} />
          </div>
          <div className="a2-fld">
            <label className="a2-lbl" htmlFor={`${uid}-cy`}>
              {w.cropY}
            </label>
            <input id={`${uid}-cy`} className="a2-inp" type="number" inputMode="numeric" min={0} max={99} value={cropY} data-testid="ped-crop-y" onChange={(e) => setCropY(clamp(num(e.target.value, 0), 0, 99))} />
          </div>
          <div className="a2-fld">
            <label className="a2-lbl" htmlFor={`${uid}-cw`}>
              {w.cropWidth}
            </label>
            <input id={`${uid}-cw`} className="a2-inp" type="number" inputMode="numeric" min={1} max={100} value={cropW} data-testid="ped-crop-w" onChange={(e) => setCropW(clamp(num(e.target.value, 100), 1, 100))} />
          </div>
          <div className="a2-fld">
            <label className="a2-lbl" htmlFor={`${uid}-ch`}>
              {w.cropHeight}
            </label>
            <input id={`${uid}-ch`} className="a2-inp" type="number" inputMode="numeric" min={1} max={100} value={cropH} data-testid="ped-crop-h" onChange={(e) => setCropH(clamp(num(e.target.value, 100), 1, 100))} />
          </div>
        </div>
      </section>

      <section className="a2-sc" aria-labelledby={`${uid}-str-h`}>
        <h2 className="a2-h3" id={`${uid}-str-h`}>
          {w.straighten}
        </h2>
        <div className="a2-fld">
          <label className="a2-lbl" htmlFor={`${uid}-deg`}>
            {w.straighten}
          </label>
          <input id={`${uid}-deg`} className="a2-inp" type="number" inputMode="numeric" min={-45} max={45} value={degrees} data-testid="ped-straighten" onChange={(e) => setDegrees(clamp(num(e.target.value, 0), -45, 45))} />
          <p className="a2-help">{w.straightenHelp}</p>
        </div>
      </section>

      <section className="a2-sc" aria-labelledby={`${uid}-tone-h`}>
        <h2 className="a2-h3" id={`${uid}-tone-h`}>
          {w.tone}
        </h2>
        <div className="a2-fg">
          <div className="a2-fld">
            <label className="a2-lbl" htmlFor={`${uid}-b`}>
              {w.brightness}
            </label>
            <input id={`${uid}-b`} className="a2-inp" type="number" inputMode="numeric" min={-100} max={100} value={brightness} data-testid="ped-brightness" onChange={(e) => setBrightness(clamp(num(e.target.value, 0), -100, 100))} />
          </div>
          <div className="a2-fld">
            <label className="a2-lbl" htmlFor={`${uid}-c`}>
              {w.contrast}
            </label>
            <input id={`${uid}-c`} className="a2-inp" type="number" inputMode="numeric" min={-100} max={100} value={contrast} data-testid="ped-contrast" onChange={(e) => setContrast(clamp(num(e.target.value, 0), -100, 100))} />
          </div>
        </div>
      </section>

      <section className="a2-sc" aria-labelledby={`${uid}-spot-h`} data-testid="ped-spots">
        <h2 className="a2-h3" id={`${uid}-spot-h`}>
          {w.spots}
        </h2>
        {spots.length ? (
          <ul className="adp-rules">
            {spots.map((p) => (
              <li key={p.id} className="adp-rule">
                <span className="a2-sm">
                  {w.spotX} {p.x} · {w.spotY} {p.y}
                </span>
                <span className="a2-gap8 yt-mt8">
                  <button type="button" className="a2-btn sm" data-testid={`ped-spot-remove-${p.id}`} onClick={() => removeSpot(p.id)}>
                    {w.spotRemove}
                  </button>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="a2-sm a2-mute yt-mt8">{w.spotEmpty}</p>
        )}
        <div className="a2-fg yt-mt8">
          <div className="a2-fld">
            <label className="a2-lbl" htmlFor={`${uid}-sx`}>
              {w.spotX}
            </label>
            <input id={`${uid}-sx`} className="a2-inp" type="number" inputMode="numeric" min={0} max={100} value={spotX} data-testid="ped-spot-x" onChange={(e) => setSpotX(clamp(num(e.target.value, 0), 0, 100))} />
          </div>
          <div className="a2-fld">
            <label className="a2-lbl" htmlFor={`${uid}-sy`}>
              {w.spotY}
            </label>
            <input id={`${uid}-sy`} className="a2-inp" type="number" inputMode="numeric" min={0} max={100} value={spotY} data-testid="ped-spot-y" onChange={(e) => setSpotY(clamp(num(e.target.value, 0), 0, 100))} />
          </div>
        </div>
        <span className="a2-gap8 yt-mt8">
          <button type="button" className="a2-btn" data-testid="ped-spot-add" onClick={addSpot}>
            {w.spotAdd}
          </button>
        </span>
      </section>

      <section className="a2-sc" aria-labelledby={`${uid}-rerun-h`}>
        <h2 className="a2-h3" id={`${uid}-rerun-h`}>
          {w.rerun}
        </h2>
        <label className="a2-chkl">
          <input type="checkbox" className="a2-chk" checked={rerun} disabled={!isAiGenerated} data-testid="ped-rerun" onChange={(e) => setRerun(e.target.checked)} />
          {w.rerun}
        </label>
        <p className="a2-help">{isAiGenerated ? w.rerunHint : w.rerunNotGenerated}</p>
      </section>

      {msg ? (
        <p className="a2-xs" role={msg.ok ? 'status' : 'alert'} style={msg.ok ? undefined : { color: 'var(--bad)' }} data-testid="ped-msg">
          {msg.text}
        </p>
      ) : null}

      <span>
        <button type="button" className="a2-btn pri" disabled={busy} data-testid="ped-save" onClick={save}>
          {busy ? w.saving : w.save}
        </button>
      </span>
    </div>
  );
}
