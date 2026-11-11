'use client';
// S25 · PR 482 — Marketing › Studio › Videos: price a clip before asking for it, then request it. POST
// {action: 'estimate' | 'request', input} on /api/admin/marketing/studio/videos. The API checks the permission and
// every rule again; the page is read again after a request (nothing here generates a clip yet — that is PR 483).
import { useRouter } from 'next/navigation';
import { useState } from 'react';
// Narrowed to the video subpath (not the package's full barrel): a Client Component must never pull in
// adapters/storage's Azure/S3 SDKs (Node-only) through @extas/adapters's root export.
import { VIDEO_ASPECTS, type VideoAspect } from '@extas/adapters/video';
import { call } from '../api';
import { showToast } from '../lumen/Toast';
import { formatMoney, type Money } from '../products/model';

type Out = { text: string; bad: boolean } | null;
const errText = (a: { status: number; data: Record<string, unknown> }, err: Record<string, string>) => {
  const code = a.status === 0 ? 'network' : String(a.data.error ?? 'other');
  return err[code] ?? err.other ?? code;
};

export interface VideoTexts {
  product: string;
  aspect: string;
  aspectName: Record<VideoAspect, string>;
  duration: string;
  priceIt: string;
  pricing: string;
  requestIt: string;
  requesting: string;
  requested: string;
  costUnset: string;
  money: Money;
  noProducts: string;
  err: Record<string, string>;
}

/** Prices, then requests, one clip from a product's own live primary photo. */
export function VideoRequestForm({ url, products, texts: x }: { url: string; products: { id: string; name: string }[]; texts: VideoTexts }) {
  const router = useRouter();
  const [productId, setProductId] = useState(products[0]?.id ?? '');
  const [aspect, setAspect] = useState<VideoAspect>('9:16');
  const [durationSec, setDurationSec] = useState(6);
  const [price, setPrice] = useState<number | null | undefined>(undefined);
  const [busy, setBusy] = useState<'price' | 'request' | null>(null);
  const [out, setOut] = useState<Out>(null);

  const input = () => ({ productId, aspect, durationSec });
  const cost = (minor: number) => formatMoney(minor, x.money);

  async function priceIt() {
    setBusy('price');
    setOut(null);
    const a = await call('POST', url, { action: 'estimate', input: input() });
    setBusy(null);
    if (a.status !== 200) return setOut({ text: errText(a, x.err), bad: true });
    setPrice((a.data.estimate as { costMinor: number | null }).costMinor);
  }

  async function requestIt() {
    setBusy('request');
    setOut(null);
    const a = await call('POST', url, { action: 'request', input: input() });
    setBusy(null);
    if (a.status !== 200) return setOut({ text: errText(a, x.err), bad: true });
    showToast({ text: x.requested, tone: 'ok' });
    setPrice(undefined);
    router.refresh();
  }

  if (!products.length) return <p className="a2-sm a2-mute">{x.noProducts}</p>;

  return (
    <div className="adp-add" data-testid="video-new">
      <div>
        <label className="a2-lbl" htmlFor="video-product">
          {x.product}
        </label>
        <select
          id="video-product"
          className="a2-sel"
          value={productId}
          disabled={busy !== null}
          onChange={(e) => {
            setProductId(e.target.value);
            setPrice(undefined);
          }}
          data-testid="video-product"
        >
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="a2-lbl" htmlFor="video-aspect">
          {x.aspect}
        </label>
        <select
          id="video-aspect"
          className="a2-sel"
          value={aspect}
          disabled={busy !== null}
          onChange={(e) => {
            setAspect(e.target.value as VideoAspect);
            setPrice(undefined);
          }}
          data-testid="video-aspect"
        >
          {VIDEO_ASPECTS.map((a) => (
            <option key={a} value={a}>
              {x.aspectName[a]}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="a2-lbl" htmlFor="video-duration">
          {x.duration}
        </label>
        <input
          id="video-duration"
          type="number"
          className="a2-inp"
          min={4}
          max={8}
          step={1}
          value={durationSec}
          disabled={busy !== null}
          onChange={(e) => {
            setDurationSec(Math.min(8, Math.max(4, Number(e.target.value) || 4)));
            setPrice(undefined);
          }}
          data-testid="video-duration"
        />
      </div>
      <div className="adp-read">
        <button type="button" className="a2-btn" disabled={busy !== null} onClick={() => void priceIt()} data-testid="video-price">
          {busy === 'price' ? x.pricing : x.priceIt}
        </button>
        {price !== undefined ? (
          <span className="a2-pill" data-testid="video-price-out">
            {price === null ? x.costUnset : cost(price)}
          </span>
        ) : null}
      </div>
      <div className="adp-read">
        <button type="button" className="a2-btn pri" disabled={busy !== null} onClick={() => void requestIt()} data-testid="video-request">
          {busy === 'request' ? x.requesting : x.requestIt}
        </button>
        {out ? (
          <span className={`a2-sm${out.bad ? ' adp-bad' : ''}`} role="status" aria-live="polite" data-testid="video-out">
            {out.text}
          </span>
        ) : null}
      </div>
    </div>
  );
}
