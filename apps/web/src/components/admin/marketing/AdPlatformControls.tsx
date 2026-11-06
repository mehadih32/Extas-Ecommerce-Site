'use client';
// S13 · PR 259 — Marketing › Ad platforms' two controls: "Read now" (POST {action: 'sync', platform}) and the select that
// ties a platform campaign to one of the shop's own (POST {action: 'link'}). The API checks
// `marketing.campaigns.write` again; the page is read again after each. Words come from the page.
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { call } from '../api';
import { showToast } from '../lumen/Toast';

const fill = (s: string, vars: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));

export interface ReadTexts {
  label: string;
  working: string;
  /** `{campaigns} campaigns and {adSets} ad sets read; {gone} no longer listed` */
  done: string;
  /** `Practice copy: {campaigns} example campaigns, nothing saved` */
  practice: string;
  err: Record<string, string>;
}

export function AdPlatformRead({ url, platform, texts: x }: { url: string; platform: string; texts: ReadTexts }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<{ text: string; bad: boolean } | null>(null);
  async function press() {
    setBusy(true);
    setSaid(null);
    const a = await call('POST', url, { action: 'sync', platform });
    setBusy(false);
    if (a.status !== 200) {
      const code = a.status === 0 ? 'network' : (a.data.error ?? 'other');
      const why = Array.isArray(a.data.details) && code === 'PLATFORM' ? ` ${String(a.data.details[0] ?? '')}` : '';
      setSaid({ text: `${x.err[code] ?? x.err.other ?? code}${why}`, bad: true });
      return;
    }
    const o = a.data.outcome as { practice: boolean; campaigns: number; adSets: number; gone: number };
    showToast({ text: fill(o.practice ? x.practice : x.done, { campaigns: o.campaigns, adSets: o.adSets, gone: o.gone }), tone: 'ok' });
    router.refresh();
  }
  return (
    <div className="adp-read">
      <button type="button" className="a2-btn pri" disabled={busy} onClick={press} data-testid={`adp-read-${platform}`}>
        {busy ? x.working : x.label}
      </button>
      {said ? (
        <span className={`a2-sm${said.bad ? ' adp-bad' : ''}`} role="status" aria-live="polite" data-testid={`adp-read-${platform}-said`}>
          {said.text}
        </span>
      ) : null}
    </div>
  );
}

export function AdCampaignLink({ url, adCampaignId, value, ours, label, none, disabled, err }: { url: string; adCampaignId: string; value: string | null; ours: { id: string; name: string }[]; label: string; none: string; disabled: boolean; err: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [bad, setBad] = useState(false);
  async function pick(v: string) {
    setBusy(true);
    setBad(false);
    const a = await call('POST', url, { action: 'link', adCampaignId, campaignId: v || null });
    setBusy(false);
    if (a.status !== 200) setBad(true);
    else router.refresh();
  }
  return (
    <>
      <select className="a2-sel adp-link" aria-label={label} value={value ?? ''} disabled={disabled || busy} onChange={(e) => void pick(e.target.value)} data-testid="adp-link">
        <option value="">{none}</option>
        {ours.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
      {bad ? (
        <span className="a2-sm adp-bad" role="status">
          {err}
        </span>
      ) : null}
    </>
  );
}

export interface SpendTexts {
  label: string;
  working: string;
  /** `{rows} campaign days of spend kept ({from} to {to}).` */
  done: string;
  /** `Practice copy: {rows} example days counted, nothing saved.` */
  practice: string;
  /** ` {unknown} days … left out.` */
  unknown: string;
  /** ` {noRate} days … wait for the USD rate.` (PR 266) */
  noRate: string;
  err: Record<string, string>;
}

/** PR 265 — "Import spend now" for one platform (POST {platform} to the spend API; read only on the platform). */
export function AdSpendImport({ url, platform, texts: x }: { url: string; platform: string; texts: SpendTexts }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<{ text: string; bad: boolean } | null>(null);
  async function press() {
    setBusy(true);
    setSaid(null);
    const a = await call('POST', url, { platform });
    setBusy(false);
    const r = a.status === 200 && Array.isArray(a.data.results) ? (a.data.results[0] as { practice: boolean; rows: number; unknown: number; noRate: number; error: string | null; range: { from: string; to: string } } | undefined) : undefined;
    if (!r || r.error) {
      const code = a.status === 0 ? 'network' : r?.error ? 'PLATFORM' : (a.data.error ?? 'other');
      setSaid({ text: `${x.err[code] ?? x.err.other ?? code}${r?.error ? ` ${r.error}` : ''}`, bad: true });
      return;
    }
    const vars = { rows: r.rows, from: r.range.from, to: r.range.to, unknown: r.unknown, noRate: r.noRate };
    const text = r.practice ? fill(x.practice, vars) : `${fill(x.done, vars)}${r.unknown ? fill(x.unknown, vars) : ''}${r.noRate ? fill(x.noRate, vars) : ''}`;
    showToast({ text, tone: 'ok' });
    router.refresh();
  }
  return (
    <div className="adp-read">
      <button type="button" className="a2-btn" disabled={busy} onClick={press} data-testid={`adp-spend-${platform}`}>
        {busy ? x.working : x.label}
      </button>
      {said ? (
        <span className={`a2-sm${said.bad ? ' adp-bad' : ''}`} role="status" aria-live="polite" data-testid={`adp-spend-${platform}-said`}>
          {said.text}
        </span>
      ) : null}
    </div>
  );
}
