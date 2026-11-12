'use client';
// S25 · PR 487 — Marketing › Studio › Campaign exports: preview a selection (how many products/photos it covers)
// before preparing it, then prepare the export. POST {action: 'preview' | 'request' | 'archive'} on
// /api/admin/marketing/studio/exports. The API checks the permission and every rule again; the page is read again
// after a request or an archive.
// S25 · PR 488 — `CreativeExportActions` also carries the rest of the row's own next move: "Queue it" on a
// waiting (`DRAFT`) export, "Run it" on a queued one (gathers `outputAssetIds`), then "Download" or, with
// `marketing.studio.approve`, "Send to ad account" on an `APPROVED` one. POST {action: 'queue' | 'run' |
// 'download', exportId} or {action: 'send', exportId, adAccountId}.
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

export interface ExportTexts {
  selectionKind: string;
  kindProduct: string;
  kindSku: string;
  kindCategory: string;
  productId: string;
  skuId: string;
  category: string;
  campaign: string;
  noCampaign: string;
  sizes: string;
  sizeName: Record<CreativeExportSize, string>;
  withOverlay: string;
  landingUrl: string;
  checkIt: string;
  checking: string;
  checkCovers: string;
  requestIt: string;
  requesting: string;
  requested: string;
  archiveIt: string;
  archiving: string;
  archived: string;
  queueIt: string;
  queuing: string;
  runIt: string;
  running: string;
  downloadIt: string;
  downloading: string;
  downloaded: string;
  sendIt: string;
  sending: string;
  sent: string;
  adAccount: string;
  noAdAccount: string;
  err: Record<string, string>;
}

/** Previews what a selection covers, then prepares the export (sent on to part 2 once that is built — PR 488). */
export function CreativeExportForm({ url, categories, campaigns, texts: x }: { url: string; categories: { id: string; name: string }[]; campaigns: { id: string; name: string }[]; texts: ExportTexts }) {
  const router = useRouter();
  const [kind, setKind] = useState<'product' | 'sku' | 'category'>('category');
  const [productId, setProductId] = useState('');
  const [skuId, setSkuId] = useState('');
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? '');
  const [campaignId, setCampaignId] = useState('');
  const [sizes, setSizes] = useState<CreativeExportSize[]>(['meta_1_1']);
  const [withOverlay, setWithOverlay] = useState(false);
  const [landingUrl, setLandingUrl] = useState('');
  const [preview, setPreview] = useState<{ productCount: number; assetCount: number } | null | undefined>(undefined);
  const [busy, setBusy] = useState<'check' | 'request' | null>(null);
  const [out, setOut] = useState<Out>(null);

  const selection = () => (kind === 'product' ? { kind, productId } : kind === 'sku' ? { kind, skuId } : { kind, categoryId });
  const resetPreview = () => setPreview(undefined);
  const toggleSize = (s: CreativeExportSize) => setSizes((cur) => (cur.includes(s) ? cur.filter((v) => v !== s) : [...cur, s]));

  async function checkIt() {
    setBusy('check');
    setOut(null);
    const a = await call('POST', url, { action: 'preview', input: selection() });
    setBusy(null);
    if (a.status !== 200) return setOut({ text: errText(a, x.err), bad: true });
    setPreview(a.data.preview as { productCount: number; assetCount: number });
  }

  async function requestIt() {
    setBusy('request');
    setOut(null);
    const a = await call('POST', url, { action: 'request', input: { campaignId: campaignId || null, selection: selection(), sizes, withOverlay, landingUrl: landingUrl || null } });
    setBusy(null);
    if (a.status !== 200) return setOut({ text: errText(a, x.err), bad: true });
    showToast({ text: x.requested, tone: 'ok' });
    resetPreview();
    router.refresh();
  }

  return (
    <div className="adp-add" data-testid="export-new">
      <div>
        <label className="a2-lbl" htmlFor="export-kind">
          {x.selectionKind}
        </label>
        <select
          id="export-kind"
          className="a2-sel"
          value={kind}
          disabled={busy !== null}
          onChange={(e) => {
            setKind(e.target.value as typeof kind);
            resetPreview();
          }}
          data-testid="export-kind"
        >
          <option value="category">{x.kindCategory}</option>
          <option value="product">{x.kindProduct}</option>
          <option value="sku">{x.kindSku}</option>
        </select>
      </div>
      {kind === 'category' ? (
        <div>
          <label className="a2-lbl" htmlFor="export-category">
            {x.category}
          </label>
          <select
            id="export-category"
            className="a2-sel"
            value={categoryId}
            disabled={busy !== null}
            onChange={(e) => {
              setCategoryId(e.target.value);
              resetPreview();
            }}
            data-testid="export-category"
          >
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      ) : kind === 'product' ? (
        <div>
          <label className="a2-lbl" htmlFor="export-product">
            {x.productId}
          </label>
          <input id="export-product" className="a2-inp" value={productId} disabled={busy !== null} onChange={(e) => (setProductId(e.target.value), resetPreview())} data-testid="export-product" />
        </div>
      ) : (
        <div>
          <label className="a2-lbl" htmlFor="export-sku">
            {x.skuId}
          </label>
          <input id="export-sku" className="a2-inp" value={skuId} disabled={busy !== null} onChange={(e) => (setSkuId(e.target.value), resetPreview())} data-testid="export-sku" />
        </div>
      )}
      <div>
        <label className="a2-lbl" htmlFor="export-campaign">
          {x.campaign}
        </label>
        <select id="export-campaign" className="a2-sel" value={campaignId} disabled={busy !== null} onChange={(e) => setCampaignId(e.target.value)} data-testid="export-campaign">
          <option value="">{x.noCampaign}</option>
          {campaigns.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      <fieldset className="adp-read">
        <legend className="a2-lbl">{x.sizes}</legend>
        {CREATIVE_EXPORT_SIZES.map((s) => (
          <label key={s} className="a2-sm">
            <input type="checkbox" checked={sizes.includes(s)} disabled={busy !== null} onChange={() => toggleSize(s)} data-testid={`export-size-${s}`} /> {x.sizeName[s]}
          </label>
        ))}
      </fieldset>
      <div>
        <label className="a2-sm">
          <input type="checkbox" checked={withOverlay} disabled={busy !== null} onChange={(e) => setWithOverlay(e.target.checked)} data-testid="export-overlay" /> {x.withOverlay}
        </label>
      </div>
      <div>
        <label className="a2-lbl" htmlFor="export-landing">
          {x.landingUrl}
        </label>
        <input id="export-landing" className="a2-inp" type="url" value={landingUrl} disabled={busy !== null} onChange={(e) => setLandingUrl(e.target.value)} data-testid="export-landing" />
      </div>
      <div className="adp-read">
        <button type="button" className="a2-btn" disabled={busy !== null} onClick={() => void checkIt()} data-testid="export-check">
          {busy === 'check' ? x.checking : x.checkIt}
        </button>
        {preview !== undefined && preview !== null ? (
          <span className="a2-pill" data-testid="export-check-out">
            {x.checkCovers.replace('{products}', String(preview.productCount)).replace('{photos}', String(preview.assetCount))}
          </span>
        ) : null}
      </div>
      <div className="adp-read">
        <button type="button" className="a2-btn pri" disabled={busy !== null || sizes.length === 0} onClick={() => void requestIt()} data-testid="export-request">
          {busy === 'request' ? x.requesting : x.requestIt}
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

/**
 * One export row's own next move — set a waiting (`DRAFT`) one aside or queue it, run a queued one, then download
 * or (with `marketing.studio.approve`) send a ready (`APPROVED`) one to a connected ad account.
 */
export function CreativeExportActions({
  url,
  exportId,
  status,
  adAccounts,
  canSend,
  texts: x,
}: {
  url: string;
  exportId: string;
  status: string;
  adAccounts: { id: string; name: string; platform: string }[];
  canSend: boolean;
  texts: ExportTexts;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<'archive' | 'queue' | 'run' | 'download' | 'send' | null>(null);
  const [out, setOut] = useState<Out>(null);
  const [adAccountId, setAdAccountId] = useState(adAccounts[0]?.id ?? '');

  async function act(action: 'archive' | 'queue' | 'run' | 'download', successToast?: string) {
    setBusy(action);
    setOut(null);
    const a = await call('POST', url, { action, exportId });
    setBusy(null);
    if (a.status !== 200) return setOut({ text: errText(a, x.err), bad: true });
    if (successToast) showToast({ text: successToast, tone: 'ok' });
    router.refresh();
  }

  async function send() {
    if (!adAccountId) return;
    setBusy('send');
    setOut(null);
    const a = await call('POST', url, { action: 'send', exportId, adAccountId });
    setBusy(null);
    if (a.status !== 200) return setOut({ text: errText(a, x.err), bad: true });
    showToast({ text: x.sent, tone: 'ok' });
    router.refresh();
  }

  const outLine = out ? (
    <span className={`a2-sm${out.bad ? ' adp-bad' : ''}`} role="status" aria-live="polite">
      {out.text}
    </span>
  ) : null;

  if (status === 'DRAFT')
    return (
      <span className="adp-read">
        <button type="button" className="a2-btn sm" disabled={busy !== null} onClick={() => void act('queue')} data-testid="export-queue">
          {busy === 'queue' ? x.queuing : x.queueIt}
        </button>
        <button type="button" className="a2-btn sm" disabled={busy !== null} onClick={() => void act('archive', x.archived)} data-testid="export-archive">
          {busy === 'archive' ? x.archiving : x.archiveIt}
        </button>
        {outLine}
      </span>
    );

  if (status === 'QUEUED')
    return (
      <span className="adp-read">
        <button type="button" className="a2-btn sm" disabled={busy !== null} onClick={() => void act('run')} data-testid="export-run">
          {busy === 'run' ? x.running : x.runIt}
        </button>
        {outLine}
      </span>
    );

  if (status === 'APPROVED')
    return (
      <span className="adp-read">
        <button type="button" className="a2-btn sm" disabled={busy !== null} onClick={() => void act('download', x.downloaded)} data-testid="export-download">
          {busy === 'download' ? x.downloading : x.downloadIt}
        </button>
        {canSend ? (
          <>
            <label className="a2-lbl" htmlFor={`export-account-${exportId}`}>
              {x.adAccount}
            </label>
            <select id={`export-account-${exportId}`} className="a2-sel" value={adAccountId} disabled={busy !== null} onChange={(e) => setAdAccountId(e.target.value)} data-testid="export-account">
              {adAccounts.length ? (
                adAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.platform})
                  </option>
                ))
              ) : (
                <option value="">{x.noAdAccount}</option>
              )}
            </select>
            <button type="button" className="a2-btn sm pri" disabled={busy !== null || !adAccountId} onClick={() => void send()} data-testid="export-send">
              {busy === 'send' ? x.sending : x.sendIt}
            </button>
          </>
        ) : null}
        {outLine}
      </span>
    );

  return null;
}
