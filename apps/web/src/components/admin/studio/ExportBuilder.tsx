'use client';
// S25 · PR 487 — Marketing › Studio › Export: request a campaign creative export for a product, a SKU or a
// category — exactly one — with the platform sizes to cut it for, an optional offer overlay, landing URL and
// campaign. POST {action: 'request', input} on /api/admin/marketing/studio/export. The API checks the permission
// and every rule again; the page is read again after a request. Cancelling a still-DRAFT export is
// {action: 'cancel', exportId}.
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { CREATIVE_EXPORT_SIZES, type CreativeExportSize } from '@extas/creative-studio';
import { call } from '../api';
import { showToast } from '../lumen/Toast';

type Out = { text: string; bad: boolean } | null;
const errText = (a: { status: number; data: Record<string, unknown> }, err: Record<string, string>) => {
  const code = a.status === 0 ? 'network' : String(a.data.error ?? 'other');
  return err[code] ?? err.other ?? code;
};

type SelectionKind = 'product' | 'variant' | 'category';

export interface ExportTexts {
  kind: string;
  kindProduct: string;
  kindVariant: string;
  kindCategory: string;
  idLabel: string;
  idPh: string;
  sizes: string;
  sizeName: Record<CreativeExportSize, string>;
  withOverlay: string;
  landingUrl: string;
  landingUrlPh: string;
  campaignId: string;
  campaignIdPh: string;
  request: string;
  requesting: string;
  requested: string;
  cancel: string;
  cancelling: string;
  err: Record<string, string>;
}

/** Picks exactly one of a product, a SKU or a category, the platform sizes to cut it for, and the optional offer
 * overlay/landing URL/campaign; nothing is produced yet (that is PR 488). */
export function ExportRequestForm({ url, texts: x }: { url: string; texts: ExportTexts }) {
  const router = useRouter();
  const [kind, setKind] = useState<SelectionKind>('product');
  const [id, setId] = useState('');
  const [sizes, setSizes] = useState<CreativeExportSize[]>([]);
  const [withOverlay, setWithOverlay] = useState(false);
  const [landingUrl, setLandingUrl] = useState('');
  const [campaignId, setCampaignId] = useState('');
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState<Out>(null);

  const toggleSize = (s: CreativeExportSize) => setSizes((cur) => (cur.includes(s) ? cur.filter((c) => c !== s) : [...cur, s]));
  const ready = id.trim().length > 0 && sizes.length > 0;
  const selectionKey = kind === 'product' ? 'productId' : kind === 'variant' ? 'variantId' : 'categoryId';

  async function request() {
    setBusy(true);
    setOut(null);
    const input = {
      selection: { [selectionKey]: id.trim() },
      sizes,
      withOverlay,
      landingUrl: landingUrl.trim() || undefined,
      campaignId: campaignId.trim() || undefined,
    };
    const a = await call('POST', url, { action: 'request', input });
    setBusy(false);
    if (a.status !== 200) return setOut({ text: errText(a, x.err), bad: true });
    showToast({ text: x.requested, tone: 'ok' });
    setId('');
    setSizes([]);
    setWithOverlay(false);
    setLandingUrl('');
    setCampaignId('');
    router.refresh();
  }

  return (
    <div className="adp-add" data-testid="export-new">
      <div>
        <label className="a2-lbl" htmlFor="export-kind">
          {x.kind}
        </label>
        <select id="export-kind" className="a2-inp" value={kind} disabled={busy} onChange={(e) => setKind(e.target.value as SelectionKind)} data-testid="export-kind">
          <option value="product">{x.kindProduct}</option>
          <option value="variant">{x.kindVariant}</option>
          <option value="category">{x.kindCategory}</option>
        </select>
      </div>
      <div>
        <label className="a2-lbl" htmlFor="export-id">
          {x.idLabel}
        </label>
        <input id="export-id" className="a2-inp" placeholder={x.idPh} value={id} disabled={busy} onChange={(e) => setId(e.target.value)} data-testid="export-id" />
      </div>
      <fieldset>
        <legend className="a2-lbl">{x.sizes}</legend>
        {CREATIVE_EXPORT_SIZES.map((s) => (
          <label key={s} className="a2-chkl">
            <input type="checkbox" className="a2-chk" checked={sizes.includes(s)} disabled={busy} onChange={() => toggleSize(s)} data-testid="export-size" />
            <span>{x.sizeName[s]}</span>
          </label>
        ))}
      </fieldset>
      <label className="a2-chkl">
        <input type="checkbox" className="a2-chk" checked={withOverlay} disabled={busy} onChange={(e) => setWithOverlay(e.target.checked)} data-testid="export-overlay" />
        <span>{x.withOverlay}</span>
      </label>
      <div>
        <label className="a2-lbl" htmlFor="export-landing-url">
          {x.landingUrl}
        </label>
        <input id="export-landing-url" className="a2-inp" placeholder={x.landingUrlPh} value={landingUrl} disabled={busy} onChange={(e) => setLandingUrl(e.target.value)} data-testid="export-landing-url" />
      </div>
      <div>
        <label className="a2-lbl" htmlFor="export-campaign-id">
          {x.campaignId}
        </label>
        <input id="export-campaign-id" className="a2-inp" placeholder={x.campaignIdPh} value={campaignId} disabled={busy} onChange={(e) => setCampaignId(e.target.value)} data-testid="export-campaign-id" />
      </div>
      <div className="adp-read">
        <button type="button" className="a2-btn pri" disabled={busy || !ready} onClick={() => void request()} data-testid="export-request">
          {busy ? x.requesting : x.request}
        </button>
        {out ? (
          <span className={`a2-sm${out.bad ? ' adp-bad' : ''}`} role="status" aria-live="polite" data-testid="export-out">
            {out.text}
          </span>
        ) : null}
      </div>
    </div>
  );
}

/** Cancels a still-DRAFT export — never deleted, only moved to CANCELLED (like VideoJob's REJECTED, a terminal
 * status, not a removed row). */
export function ExportCancel({ url, exportId, texts: x }: { url: string; exportId: string; texts: ExportTexts }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState<Out>(null);
  async function go() {
    setBusy(true);
    setOut(null);
    const a = await call('POST', url, { action: 'cancel', exportId });
    setBusy(false);
    if (a.status !== 200) return setOut({ text: errText(a, x.err), bad: true });
    router.refresh();
  }
  return (
    <span className="adp-read">
      <button type="button" className="a2-btn sm" disabled={busy} onClick={() => void go()} data-testid="export-cancel">
        {busy ? x.cancelling : x.cancel}
      </button>
      {out ? (
        <span className={`a2-sm${out.bad ? ' adp-bad' : ''}`} role="status" aria-live="polite">
          {out.text}
        </span>
      ) : null}
    </span>
  );
}
