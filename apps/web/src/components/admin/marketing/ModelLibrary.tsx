'use client';
// S24 · PR 445 — Marketing › Studio › Model library: add a model, archive/restore it, link one of its own
// reference photos per angle (by an already-uploaded Media library asset id — a real picker is a later
// refinement, same honest shape PR 439's product-id field used), and record its rights/consent. POST
// {action: 'create' | 'archive' | 'restore' | 'addAsset' | 'removeAsset' | 'recordConsent'} on
// /api/admin/marketing/studio/models. The API checks the permission again; the page is read again after each
// change (nothing here generates an image or costs anything).
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { call } from '../api';
import { MODEL_ANGLES, MODEL_KINDS, type ModelAngle, type ModelKind } from '@extas/photoshoot';
import type { ModelOverviewRow } from '@/lib/marketing/studio-models';

type Out = { text: string; bad: boolean } | null;
const errText = (a: { status: number; data: Record<string, unknown> }, err: Record<string, string>) => {
  const code = a.status === 0 ? 'network' : String(a.data.error ?? 'other');
  return err[code] ?? err.other ?? code;
};

export interface ModelTexts {
  name: string;
  gender: string;
  ageGroup: string;
  kind: string;
  heightCm: string;
  sizeWorn: string;
  shared: string;
  add: string;
  adding: string;
  added: string;
  archive: string;
  restore: string;
  confirmArchive: string;
  yes: string;
  cancel: string;
  archived: string;
  own: string;
  empty: string;
  kinds: Record<ModelKind, string>;
  angles: Record<ModelAngle, string>;
  asset: { h: string; assetId: string; angle: string; add: string; added: string; remove: string; empty: string };
  consent: { h: string; scope: string; grantedAt: string; expiresAt: string; documentAssetId: string; add: string; added: string; empty: string; valid: string; expired: string; neverExpires: string };
  err: Record<string, string>;
}

/** A new model: name and kind are required, everything else is optional detail the owner fills in as it's known. */
export function ModelNew({ url, texts: x }: { url: string; texts: ModelTexts }) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [gender, setGender] = useState('');
  const [ageGroup, setAgeGroup] = useState('');
  const [kind, setKind] = useState<ModelKind>('full_body');
  const [heightCm, setHeightCm] = useState('');
  const [sizeWorn, setSizeWorn] = useState('');
  const [shared, setShared] = useState(false);
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState<Out>(null);
  const ready = name.trim().length > 0;
  async function go() {
    setBusy(true);
    setOut(null);
    const input = {
      name: name.trim(),
      kind,
      gender: gender.trim() || null,
      ageGroup: ageGroup.trim() || null,
      heightCm: heightCm.trim() ? Number(heightCm) : null,
      sizeWorn: sizeWorn.trim() || null,
      sharedWithAllStores: shared,
    };
    const a = await call('POST', url, { action: 'create', input });
    setBusy(false);
    if (a.status !== 200) return setOut({ text: errText(a, x.err), bad: true });
    setName('');
    setGender('');
    setAgeGroup('');
    setHeightCm('');
    setSizeWorn('');
    setShared(false);
    router.refresh();
  }
  return (
    <div className="adp-add" data-testid="model-new">
      <div>
        <label className="a2-lbl" htmlFor="model-name">
          {x.name}
        </label>
        <input id="model-name" className="a2-inp" value={name} disabled={busy} onChange={(e) => setName(e.target.value)} data-testid="model-name" />
      </div>
      <div>
        <label className="a2-lbl" htmlFor="model-kind">
          {x.kind}
        </label>
        <select id="model-kind" className="a2-sel" value={kind} disabled={busy} onChange={(e) => setKind(e.target.value as ModelKind)} data-testid="model-kind">
          {MODEL_KINDS.map((k) => (
            <option key={k} value={k}>
              {x.kinds[k]}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="a2-lbl" htmlFor="model-gender">
          {x.gender}
        </label>
        <input id="model-gender" className="a2-inp" value={gender} disabled={busy} onChange={(e) => setGender(e.target.value)} data-testid="model-gender" />
      </div>
      <div>
        <label className="a2-lbl" htmlFor="model-age">
          {x.ageGroup}
        </label>
        <input id="model-age" className="a2-inp" value={ageGroup} disabled={busy} onChange={(e) => setAgeGroup(e.target.value)} data-testid="model-age" />
      </div>
      <div>
        <label className="a2-lbl" htmlFor="model-height">
          {x.heightCm}
        </label>
        <input id="model-height" type="number" min={30} max={260} className="a2-inp" value={heightCm} disabled={busy} onChange={(e) => setHeightCm(e.target.value)} data-testid="model-height" />
      </div>
      <div>
        <label className="a2-lbl" htmlFor="model-size">
          {x.sizeWorn}
        </label>
        <input id="model-size" className="a2-inp" value={sizeWorn} disabled={busy} onChange={(e) => setSizeWorn(e.target.value)} data-testid="model-size" />
      </div>
      <label className="a2-chkl">
        <input type="checkbox" className="a2-chk" checked={shared} disabled={busy} onChange={(e) => setShared(e.target.checked)} data-testid="model-shared" />
        {x.shared}
      </label>
      <div className="adp-read">
        <button type="button" className="a2-btn pri" disabled={busy || !ready} onClick={() => void go()} data-testid="model-add">
          {busy ? x.adding : x.add}
        </button>
        {out ? (
          <span className={`a2-sm${out.bad ? ' adp-bad' : ''}`} role="status" aria-live="polite" data-testid="model-out">
            {out.text}
          </span>
        ) : null}
      </div>
    </div>
  );
}

/** Archive (with a confirm) or restore one model. Never deletes it. */
export function ModelArchive({ url, model, texts: x }: { url: string; model: ModelOverviewRow; texts: ModelTexts }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState<Out>(null);
  async function go(next: 'archive' | 'restore') {
    setBusy(true);
    setOut(null);
    const a = await call('POST', url, { action: next, id: model.id });
    setBusy(false);
    setConfirming(false);
    if (a.status !== 200) return setOut({ text: errText(a, x.err), bad: true });
    router.refresh();
  }
  if (model.archivedAt) {
    return (
      <button type="button" className="a2-btn" disabled={busy} onClick={() => void go('restore')} data-testid="model-restore">
        {x.restore}
      </button>
    );
  }
  if (confirming) {
    return (
      <span className="adp-read" data-testid="model-confirm">
        <span className="a2-sm">{x.confirmArchive}</span>
        <button type="button" className="a2-btn pri" disabled={busy} onClick={() => void go('archive')} data-testid="model-confirm-yes">
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
      <button type="button" className="a2-btn" disabled={busy} onClick={() => setConfirming(true)} data-testid="model-archive">
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

/** Links one of this model's own reference photos, by an already-uploaded Media library asset id. */
export function ModelAssetAdd({ url, modelId, texts: x }: { url: string; modelId: string; texts: ModelTexts }) {
  const router = useRouter();
  const [assetId, setAssetId] = useState('');
  const [angle, setAngle] = useState<ModelAngle>('front');
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState<Out>(null);
  async function go() {
    setBusy(true);
    setOut(null);
    const a = await call('POST', url, { action: 'addAsset', input: { modelId, assetId: assetId.trim(), angle } });
    setBusy(false);
    if (a.status !== 200) return setOut({ text: errText(a, x.err), bad: true });
    setAssetId('');
    router.refresh();
  }
  return (
    <div className="adp-add" data-testid="model-asset-add">
      <div>
        <label className="a2-lbl" htmlFor={`model-asset-id-${modelId}`}>
          {x.asset.assetId}
        </label>
        <input id={`model-asset-id-${modelId}`} className="a2-inp" value={assetId} disabled={busy} onChange={(e) => setAssetId(e.target.value)} data-testid="model-asset-id" />
      </div>
      <div>
        <label className="a2-lbl" htmlFor={`model-asset-angle-${modelId}`}>
          {x.asset.angle}
        </label>
        <select id={`model-asset-angle-${modelId}`} className="a2-sel" value={angle} disabled={busy} onChange={(e) => setAngle(e.target.value as ModelAngle)} data-testid="model-asset-angle">
          {MODEL_ANGLES.map((an) => (
            <option key={an} value={an}>
              {x.angles[an]}
            </option>
          ))}
        </select>
      </div>
      <div className="adp-read">
        <button type="button" className="a2-btn" disabled={busy || !assetId.trim()} onClick={() => void go()} data-testid="model-asset-add-btn">
          {x.asset.add}
        </button>
        {out ? (
          <span className={`a2-sm${out.bad ? ' adp-bad' : ''}`} role="status" aria-live="polite">
            {out.text}
          </span>
        ) : null}
      </div>
    </div>
  );
}

/** Unlinks a reference photo (the file itself stays in the Media library). */
export function ModelAssetRemove({ url, assetRowId, texts: x }: { url: string; assetRowId: string; texts: ModelTexts }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function go() {
    setBusy(true);
    await call('POST', url, { action: 'removeAsset', id: assetRowId });
    setBusy(false);
    router.refresh();
  }
  return (
    <button type="button" className="a2-btn" disabled={busy} onClick={() => void go()} data-testid="model-asset-remove">
      {x.asset.remove}
    </button>
  );
}

/** Records this model's rights/consent. Append-only — a later renewal is a new record, never an edit. */
export function ModelConsentAdd({ url, modelId, texts: x }: { url: string; modelId: string; texts: ModelTexts }) {
  const router = useRouter();
  const [scope, setScope] = useState('');
  const [grantedAt, setGrantedAt] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [documentAssetId, setDocumentAssetId] = useState('');
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState<Out>(null);
  async function go() {
    setBusy(true);
    setOut(null);
    const input = { modelId, scope: scope.trim(), grantedAt, expiresAt: expiresAt || null, documentAssetId: documentAssetId.trim() || null };
    const a = await call('POST', url, { action: 'recordConsent', input });
    setBusy(false);
    if (a.status !== 200) return setOut({ text: errText(a, x.err), bad: true });
    setScope('');
    setGrantedAt('');
    setExpiresAt('');
    setDocumentAssetId('');
    router.refresh();
  }
  return (
    <div className="adp-add" data-testid="model-consent-add">
      <div>
        <label className="a2-lbl" htmlFor={`model-consent-scope-${modelId}`}>
          {x.consent.scope}
        </label>
        <input id={`model-consent-scope-${modelId}`} className="a2-inp" value={scope} disabled={busy} onChange={(e) => setScope(e.target.value)} data-testid="model-consent-scope" />
      </div>
      <div>
        <label className="a2-lbl" htmlFor={`model-consent-granted-${modelId}`}>
          {x.consent.grantedAt}
        </label>
        <input id={`model-consent-granted-${modelId}`} type="date" className="a2-inp" value={grantedAt} disabled={busy} onChange={(e) => setGrantedAt(e.target.value)} data-testid="model-consent-granted" />
      </div>
      <div>
        <label className="a2-lbl" htmlFor={`model-consent-expires-${modelId}`}>
          {x.consent.expiresAt}
        </label>
        <input id={`model-consent-expires-${modelId}`} type="date" className="a2-inp" value={expiresAt} disabled={busy} onChange={(e) => setExpiresAt(e.target.value)} data-testid="model-consent-expires" />
      </div>
      <div>
        <label className="a2-lbl" htmlFor={`model-consent-doc-${modelId}`}>
          {x.consent.documentAssetId}
        </label>
        <input id={`model-consent-doc-${modelId}`} className="a2-inp" value={documentAssetId} disabled={busy} onChange={(e) => setDocumentAssetId(e.target.value)} data-testid="model-consent-doc" />
      </div>
      <div className="adp-read">
        <button type="button" className="a2-btn" disabled={busy || !scope.trim() || !grantedAt} onClick={() => void go()} data-testid="model-consent-add-btn">
          {x.consent.add}
        </button>
        {out ? (
          <span className={`a2-sm${out.bad ? ' adp-bad' : ''}`} role="status" aria-live="polite">
            {out.text}
          </span>
        ) : null}
      </div>
    </div>
  );
}
