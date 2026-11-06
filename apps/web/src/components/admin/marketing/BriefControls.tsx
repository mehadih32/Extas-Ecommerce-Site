'use client';
// S13 · PR 270 — Marketing › Ad platforms › Creative briefs: "Write the brief" (a product and, if picked, a campaign, or
// an approved creative refresh with its campaign fixed; POST {action: 'create'}), "Correct the words" (both hooks and
// both picture lines while it is a draft; POST {action: 'edit'}), and "Send to the studio" / "Set aside" after a confirm
// (POST {action: 'send' | 'setAside', confirm: true}). The API checks the permission and the switch again; the page is
// read again after each. Words come from the page.
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { call } from '../api';
import { showToast } from '../lumen/Toast';

type Out = { text: string; bad: boolean } | null;
const errText = (a: { status: number; data: Record<string, unknown> }, err: Record<string, string>) => {
  const code = a.status === 0 ? 'network' : String(a.data.error ?? 'other');
  return err[code] ?? err.other ?? code;
};

function Said({ out, id }: { out: Out; id: string }) {
  return out ? (
    <span className={`a2-sm${out.bad ? ' adp-bad' : ''}`} role="status" aria-live="polite" data-testid={id}>
      {out.text}
    </span>
  ) : null;
}

export interface BriefNewTexts {
  product: string;
  campaign: string;
  noCampaign: string;
  write: string;
  writing: string;
  wrote: string;
  err: Record<string, string>;
}

/** A new brief: pick a product (and a campaign unless it is fixed by an approved refresh). */
export function BriefNew({ url, uid, products, campaigns, fixed, texts: x }: { url: string; uid: string; products: { id: string; name: string }[]; campaigns: { id: string; name: string }[]; fixed?: { adCampaignId: string; proposalId: string; productId: string | null }; texts: BriefNewTexts }) {
  const router = useRouter();
  const [product, setProduct] = useState(fixed?.productId && products.some((p) => p.id === fixed.productId) ? fixed.productId : (products[0]?.id ?? ''));
  const [campaign, setCampaign] = useState('');
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState<Out>(null);
  async function go() {
    setBusy(true);
    setOut(null);
    const body = fixed ? { action: 'create', productId: product, proposalId: fixed.proposalId } : { action: 'create', productId: product, adCampaignId: campaign || null };
    const a = await call('POST', url, body);
    setBusy(false);
    if (a.status !== 200) return setOut({ text: errText(a, x.err), bad: true });
    showToast({ text: x.wrote, tone: 'ok' });
    router.refresh();
  }
  return (
    <div className="adp-add" data-testid={`adb-new-${uid}`}>
      <div>
        <label className="a2-lbl" htmlFor={`adb-p-${uid}`}>
          {x.product}
        </label>
        <select id={`adb-p-${uid}`} className="a2-sel" value={product} disabled={busy} onChange={(e) => setProduct(e.target.value)} data-testid="adb-product">
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>
      {fixed ? null : (
        <div>
          <label className="a2-lbl" htmlFor={`adb-c-${uid}`}>
            {x.campaign}
          </label>
          <select id={`adb-c-${uid}`} className="a2-sel" value={campaign} disabled={busy} onChange={(e) => setCampaign(e.target.value)} data-testid="adb-campaign">
            <option value="">{x.noCampaign}</option>
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="adp-read">
        <button type="button" className="a2-btn pri" disabled={busy || !product} onClick={() => void go()} data-testid="adb-write">
          {busy ? x.writing : x.write}
        </button>
        <Said out={out} id="adb-wrote" />
      </div>
    </div>
  );
}

export interface BriefEditTexts {
  edit: string;
  hookBn: string;
  hookEn: string;
  showBn: string;
  showEn: string;
  save: string;
  saving: string;
  saved: string;
  err: Record<string, string>;
}

/** "Correct the words": both hooks and both picture lines of a draft. */
export function BriefEdit({ url, id, max, hooks, show, texts: x }: { url: string; id: string; max: number; hooks: { en: string; bn: string }; show: { en: string; bn: string }; texts: BriefEditTexts }) {
  const router = useRouter();
  const [v, setV] = useState({ hookBn: hooks.bn, hookEn: hooks.en, showBn: show.bn, showEn: show.en });
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState<Out>(null);
  async function go() {
    setBusy(true);
    setOut(null);
    const a = await call('POST', url, { action: 'edit', id, hooks: { bn: v.hookBn, en: v.hookEn }, show: { bn: v.showBn, en: v.showEn } });
    setBusy(false);
    if (a.status !== 200) return setOut({ text: errText(a, x.err), bad: true });
    showToast({ text: x.saved, tone: 'ok' });
    router.refresh();
  }
  const field = (k: keyof typeof v, rows: number) => (
    <div>
      <label className="a2-lbl" htmlFor={`adb-${k}-${id}`}>
        {x[k]}
      </label>
      <textarea id={`adb-${k}-${id}`} className="a2-ta" rows={rows} maxLength={max} value={v[k]} disabled={busy} onChange={(e) => setV({ ...v, [k]: e.target.value })} data-testid={`adb-${k}`} />
    </div>
  );
  return (
    <details className="a2-more-opts adp-ctl" data-testid="adb-edit">
      <summary>{x.edit}</summary>
      <div className="adp-ctl-body">
        {field('hookBn', 2)}
        {field('hookEn', 2)}
        {field('showBn', 3)}
        {field('showEn', 3)}
        <div className="adp-read">
          <button type="button" className="a2-btn" disabled={busy} onClick={() => void go()} data-testid="adb-save">
            {busy ? x.saving : x.save}
          </button>
          <Said out={out} id="adb-saved" />
        </div>
      </div>
    </details>
  );
}

export interface BriefStepTexts {
  send: string;
  setAside: string;
  confirmSend: string;
  confirmSetAside: string;
  yes: string;
  cancel: string;
  said: Record<string, string>;
  err: Record<string, string>;
}

/** "Send to the studio" / "Set aside", each after a confirm. */
export function BriefStep({ url, id, texts: x }: { url: string; id: string; texts: BriefStepTexts }) {
  const router = useRouter();
  const [ask, setAsk] = useState<'send' | 'setAside' | null>(null);
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState<Out>(null);
  async function go() {
    if (!ask) return;
    setBusy(true);
    const a = await call('POST', url, { action: ask, id, confirm: true });
    setBusy(false);
    setAsk(null);
    if (a.status !== 200) return setOut({ text: errText(a, x.err), bad: true });
    const st = String(a.data.status ?? '');
    showToast({ text: x.said[st] ?? st, tone: 'ok' });
    router.refresh();
  }
  const pick = (k: 'send' | 'setAside') => (setOut(null), setAsk(k));
  return (
    <div className="adp-ctl-body">
      <div className="adp-read">
        <button type="button" className="a2-btn pri" disabled={busy} onClick={() => pick('send')} data-testid="adb-send">
          {x.send}
        </button>
        <button type="button" className="a2-btn" disabled={busy} onClick={() => pick('setAside')} data-testid="adb-aside">
          {x.setAside}
        </button>
      </div>
      {ask ? (
        <div className="adp-confirm" role="alertdialog" aria-label={ask === 'send' ? x.confirmSend : x.confirmSetAside} data-testid="adb-confirm">
          <p className="a2-sm">{ask === 'send' ? x.confirmSend : x.confirmSetAside}</p>
          <div className="adp-read">
            <button type="button" className="a2-btn pri" disabled={busy} onClick={() => void go()} data-testid="adb-confirm-yes">
              {x.yes}
            </button>
            <button type="button" className="a2-btn" disabled={busy} onClick={() => setAsk(null)}>
              {x.cancel}
            </button>
          </div>
        </div>
      ) : null}
      <Said out={out} id="adb-said" />
    </div>
  );
}
