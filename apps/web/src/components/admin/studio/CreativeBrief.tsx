'use client';
// S25 · PR 490 — Marketing › Studio › Creative brief: answer a few short questions, then propose three fixed
// directions (or ask to see them again), then choose one. POST {action: 'draft' | 'propose' | 'choose' | 'archive'}
// on /api/admin/marketing/studio/briefs. The API checks the permission and every rule again; the page is read again
// after each move. Nothing downstream is produced from any of this (Blueprint C8.4): choosing a direction only
// records which one the owner liked.
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { CREATIVE_DIRECTION_KEYS, type CreativeBriefAnswers, type CreativeDirectionKey } from '@extas/creative-studio';
import { call } from '../api';
import { showToast } from '../lumen/Toast';

type Out = { text: string; bad: boolean } | null;
const errText = (a: { status: number; data: Record<string, unknown> }, err: Record<string, string>) => {
  const code = a.status === 0 ? 'network' : String(a.data.error ?? 'other');
  return err[code] ?? err.other ?? code;
};

export interface BriefTexts {
  purpose: string;
  audience: string;
  offer: string;
  durationDays: string;
  products: string;
  noProducts: string;
  campaign: string;
  noCampaign: string;
  draftIt: string;
  drafting: string;
  proposeIt: string;
  proposing: string;
  askForMore: string;
  chooseIt: string;
  choosing: string;
  archiveIt: string;
  archiving: string;
  archived: string;
  directionName: Record<CreativeDirectionKey, string>;
  directionRationale: Record<CreativeDirectionKey, string>;
  chosenDirection: string;
  err: Record<string, string>;
}

const fill = (template: string, vars: Record<string, string | number>) => Object.entries(vars).reduce((s, [k, v]) => s.replace(`{${k}}`, String(v)), template);

/** Answers a brief's short questionnaire; a new brief sits DRAFTING until proposed. */
export function CreativeBriefForm({ url, campaigns, products, texts: x }: { url: string; campaigns: { id: string; name: string }[]; products: { id: string; name: string }[]; texts: BriefTexts }) {
  const router = useRouter();
  const [campaignId, setCampaignId] = useState('');
  const [purpose, setPurpose] = useState('');
  const [audience, setAudience] = useState('');
  const [offer, setOffer] = useState('');
  const [durationDays, setDurationDays] = useState(7);
  const [productIds, setProductIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState<Out>(null);

  const toggleProduct = (id: string) => setProductIds((cur) => (cur.includes(id) ? cur.filter((v) => v !== id) : [...cur, id]));

  async function draftIt() {
    setBusy(true);
    setOut(null);
    const a = await call('POST', url, { action: 'draft', input: { campaignId: campaignId || null, purpose, audience, offer, durationDays, productIds } });
    setBusy(false);
    if (a.status !== 200) return setOut({ text: errText(a, x.err), bad: true });
    setPurpose('');
    setAudience('');
    setOffer('');
    setDurationDays(7);
    setProductIds([]);
    router.refresh();
  }

  return (
    <div className="adp-add" data-testid="brief-new">
      <div>
        <label className="a2-lbl" htmlFor="brief-campaign">
          {x.campaign}
        </label>
        <select id="brief-campaign" className="a2-sel" value={campaignId} disabled={busy} onChange={(e) => setCampaignId(e.target.value)} data-testid="brief-campaign">
          <option value="">{x.noCampaign}</option>
          {campaigns.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="a2-lbl" htmlFor="brief-purpose">
          {x.purpose}
        </label>
        <input id="brief-purpose" className="a2-inp" value={purpose} disabled={busy} onChange={(e) => setPurpose(e.target.value)} data-testid="brief-purpose" />
      </div>
      <div>
        <label className="a2-lbl" htmlFor="brief-audience">
          {x.audience}
        </label>
        <input id="brief-audience" className="a2-inp" value={audience} disabled={busy} onChange={(e) => setAudience(e.target.value)} data-testid="brief-audience" />
      </div>
      <div>
        <label className="a2-lbl" htmlFor="brief-offer">
          {x.offer}
        </label>
        <input id="brief-offer" className="a2-inp" value={offer} disabled={busy} onChange={(e) => setOffer(e.target.value)} data-testid="brief-offer" />
      </div>
      <div>
        <label className="a2-lbl" htmlFor="brief-duration">
          {x.durationDays}
        </label>
        <input id="brief-duration" className="a2-inp" type="number" min={1} max={365} value={durationDays} disabled={busy} onChange={(e) => setDurationDays(Math.max(1, Number(e.target.value) || 1))} data-testid="brief-duration" />
      </div>
      <fieldset className="adp-read">
        <legend className="a2-lbl">{x.products}</legend>
        {products.length ? (
          products.map((p) => (
            <label key={p.id} className="a2-sm">
              <input type="checkbox" checked={productIds.includes(p.id)} disabled={busy} onChange={() => toggleProduct(p.id)} data-testid={`brief-product-${p.id}`} /> {p.name}
            </label>
          ))
        ) : (
          <p className="a2-sm a2-mute">{x.noProducts}</p>
        )}
      </fieldset>
      <div className="adp-read">
        <button type="button" className="a2-btn pri" disabled={busy || !purpose || !audience || !offer} onClick={() => void draftIt()} data-testid="brief-draft">
          {busy ? x.drafting : x.draftIt}
        </button>
        {out ? (
          <span className={`a2-sm${out.bad ? ' adp-bad' : ''}`} role="status" aria-live="polite" data-testid="brief-out">
            {out.text}
          </span>
        ) : null}
      </div>
    </div>
  );
}

/** One brief's own next move: propose/re-propose the three directions, choose one, or set it aside. */
export function CreativeBriefActions({
  url,
  briefId,
  status,
  answers,
  directions,
  chosenDirection,
  texts: x,
}: {
  url: string;
  briefId: string;
  status: string;
  answers: CreativeBriefAnswers;
  directions: { key: CreativeDirectionKey; previewAssetId: string | null }[] | null;
  chosenDirection: number | null;
  texts: BriefTexts;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<'propose' | 'choose' | 'archive' | null>(null);
  const [out, setOut] = useState<Out>(null);

  async function propose() {
    setBusy('propose');
    setOut(null);
    const a = await call('POST', url, { action: 'propose', briefId });
    setBusy(null);
    if (a.status !== 200) return setOut({ text: errText(a, x.err), bad: true });
    router.refresh();
  }

  async function choose(index: number) {
    setBusy('choose');
    setOut(null);
    const a = await call('POST', url, { action: 'choose', briefId, directionIndex: index });
    setBusy(null);
    if (a.status !== 200) return setOut({ text: errText(a, x.err), bad: true });
    router.refresh();
  }

  async function archive() {
    setBusy('archive');
    setOut(null);
    const a = await call('POST', url, { action: 'archive', briefId });
    setBusy(null);
    if (a.status !== 200) return setOut({ text: errText(a, x.err), bad: true });
    showToast({ text: x.archived, tone: 'ok' });
    router.refresh();
  }

  const vars = { offer: answers.offer, purpose: answers.purpose, audience: answers.audience, durationDays: answers.durationDays };
  const outLine = out ? (
    <span className={`a2-sm${out.bad ? ' adp-bad' : ''}`} role="status" aria-live="polite">
      {out.text}
    </span>
  ) : null;

  if (status === 'ARCHIVED') return null;

  if (status === 'DRAFTING')
    return (
      <span className="adp-read">
        <button type="button" className="a2-btn sm pri" disabled={busy !== null} onClick={() => void propose()} data-testid="brief-propose">
          {busy === 'propose' ? x.proposing : x.proposeIt}
        </button>
        <button type="button" className="a2-btn sm" disabled={busy !== null} onClick={() => void archive()} data-testid="brief-archive">
          {busy === 'archive' ? x.archiving : x.archiveIt}
        </button>
        {outLine}
      </span>
    );

  if (status === 'PROPOSED')
    return (
      <div className="adp-read" data-testid="brief-directions">
        <ul className="adp-rules">
          {(directions ?? CREATIVE_DIRECTION_KEYS.map((key) => ({ key, previewAssetId: null }))).map((d, i) => (
            <li key={d.key} className="adp-rule" data-testid="brief-direction">
              <p className="a2-sm adp-sub">{x.directionName[d.key]}</p>
              <p className="a2-sm a2-mute">{fill(x.directionRationale[d.key], vars)}</p>
              <button type="button" className="a2-btn sm pri" disabled={busy !== null} onClick={() => void choose(i)} data-testid={`brief-choose-${d.key}`}>
                {busy === 'choose' ? x.choosing : x.chooseIt}
              </button>
            </li>
          ))}
        </ul>
        <span className="adp-read">
          <button type="button" className="a2-btn sm" disabled={busy !== null} onClick={() => void propose()} data-testid="brief-ask-more">
            {busy === 'propose' ? x.proposing : x.askForMore}
          </button>
          <button type="button" className="a2-btn sm" disabled={busy !== null} onClick={() => void archive()} data-testid="brief-archive">
            {busy === 'archive' ? x.archiving : x.archiveIt}
          </button>
          {outLine}
        </span>
      </div>
    );

  if (status === 'CHOSEN')
    return (
      <span className="adp-read">
        <span className="a2-pill info" data-testid="brief-chosen">
          {chosenDirection != null && directions?.[chosenDirection] ? fill(x.chosenDirection, { name: x.directionName[directions[chosenDirection]!.key] }) : ''}
        </span>
        <button type="button" className="a2-btn sm" disabled={busy !== null} onClick={() => void archive()} data-testid="brief-archive">
          {busy === 'archive' ? x.archiving : x.archiveIt}
        </button>
        {outLine}
      </span>
    );

  return null;
}
