'use client';
// S25 · PR 489 — Marketing › Studio › Campaign overlays: add a new overlay, enable/disable it, archive or restore it.
// POST {action: 'create' | 'enable' | 'disable' | 'archive' | 'restore'} on /api/admin/marketing/studio/overlay. The
// API checks the permission again; the page is read again after each change. An overlay never touches a price — it
// is a decorative label the owner's own colour and words, drawn on top of the picture (Blueprint C8.3).
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { call } from '../api';
import { showToast } from '../lumen/Toast';
import { OVERLAY_TEMPLATES, type CampaignOverlayView, type OverlayTemplateKey } from '@extas/creative-studio';

type Out = { text: string; bad: boolean } | null;
const errText = (a: { status: number; data: Record<string, unknown> }, err: Record<string, string>) => {
  const code = a.status === 0 ? 'network' : String(a.data.error ?? 'other');
  return err[code] ?? err.other ?? code;
};

type Reach = 'all' | 'products' | 'categories';

export interface OverlayTexts {
  campaign: string;
  noCampaign: string;
  templateLabel: string;
  template: Record<OverlayTemplateKey, string>;
  labelEn: string;
  labelBn: string;
  accent: string;
  reach: string;
  reachAll: string;
  reachProducts: string;
  reachCategories: string;
  slugsHelp: string;
  startsAt: string;
  endsAt: string;
  add: string;
  adding: string;
  added: string;
  enable: string;
  disable: string;
  archive: string;
  restore: string;
  confirmArchive: string;
  yes: string;
  cancel: string;
  archived: string;
  enabled: string;
  disabled: string;
  empty: string;
  err: Record<string, string>;
}

/** The admin look's own accent (`--lm-accent`, a setting under Settings › Admin look) — never a fixed brand colour
 * in the code (CLAUDE.md rule 1). Empty when it can't be read (SSR, tests): the owner then picks a colour themself. */
function themeAccent(): string {
  if (typeof document === 'undefined') return '';
  const v = getComputedStyle(document.documentElement).getPropertyValue('--lm-accent').trim();
  return /^#[0-9a-fA-F]{6}$/.test(v) ? v : '';
}

/** A new overlay: the owner picks its template, its words in both languages, its colour, who it reaches and its
 * window, then saves it. It starts disabled (CLAUDE.md rule 1: off by default) — "Enable" is a second, separate step. */
export function OverlayNew({ url, campaigns, texts: x }: { url: string; campaigns: { id: string; name: string }[]; texts: OverlayTexts }) {
  const router = useRouter();
  const [campaignId, setCampaignId] = useState('');
  const [templateKey, setTemplateKey] = useState<OverlayTemplateKey>('badge');
  const [labelEn, setLabelEn] = useState('');
  const [labelBn, setLabelBn] = useState('');
  const [accent, setAccent] = useState(themeAccent);
  const [reach, setReach] = useState<Reach>('all');
  const [slugsText, setSlugsText] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState<Out>(null);
  const slugs = slugsText
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const ready = labelEn.trim().length > 0 && labelBn.trim().length > 0 && /^#[0-9a-fA-F]{6}$/.test(accent) && (reach === 'all' || slugs.length > 0);
  async function go() {
    setBusy(true);
    setOut(null);
    const appliesTo = reach === 'all' ? { kind: 'all' as const } : { kind: reach, slugs };
    const input = {
      campaignId: campaignId || null,
      templateKey,
      design: { labelEn: labelEn.trim(), labelBn: labelBn.trim(), accent },
      appliesTo,
      startsAt: startsAt ? new Date(startsAt).toISOString() : null,
      endsAt: endsAt ? new Date(endsAt).toISOString() : null,
    };
    const a = await call('POST', url, { action: 'create', input });
    setBusy(false);
    if (a.status !== 200) return setOut({ text: errText(a, x.err), bad: true });
    showToast({ text: x.added, tone: 'ok' });
    setLabelEn('');
    setLabelBn('');
    setAccent(themeAccent());
    setSlugsText('');
    setStartsAt('');
    setEndsAt('');
    router.refresh();
  }
  return (
    <div className="adp-add" data-testid="overlay-new">
      <div>
        <label className="a2-lbl" htmlFor="ov-campaign">
          {x.campaign}
        </label>
        <select id="ov-campaign" className="a2-sel" value={campaignId} disabled={busy} onChange={(e) => setCampaignId(e.target.value)} data-testid="ov-campaign">
          <option value="">{x.noCampaign}</option>
          {campaigns.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="a2-lbl" htmlFor="ov-template">
          {x.templateLabel}
        </label>
        <select id="ov-template" className="a2-sel" value={templateKey} disabled={busy} onChange={(e) => setTemplateKey(e.target.value as OverlayTemplateKey)} data-testid="ov-template">
          {OVERLAY_TEMPLATES.map((t) => (
            <option key={t} value={t}>
              {x.template[t]}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="a2-lbl" htmlFor="ov-label-en">
          {x.labelEn}
        </label>
        <input id="ov-label-en" className="a2-inp" value={labelEn} disabled={busy} maxLength={40} onChange={(e) => setLabelEn(e.target.value)} data-testid="ov-label-en" />
      </div>
      <div>
        <label className="a2-lbl" htmlFor="ov-label-bn">
          {x.labelBn}
        </label>
        <input id="ov-label-bn" className="a2-inp" value={labelBn} disabled={busy} maxLength={40} onChange={(e) => setLabelBn(e.target.value)} data-testid="ov-label-bn" />
      </div>
      <div>
        <label className="a2-lbl" htmlFor="ov-accent">
          {x.accent}
        </label>
        <input id="ov-accent" className="a2-inp" type="color" value={accent} disabled={busy} onChange={(e) => setAccent(e.target.value)} data-testid="ov-accent" />
      </div>
      <div>
        <label className="a2-lbl" htmlFor="ov-reach">
          {x.reach}
        </label>
        <select id="ov-reach" className="a2-sel" value={reach} disabled={busy} onChange={(e) => setReach(e.target.value as Reach)} data-testid="ov-reach">
          <option value="all">{x.reachAll}</option>
          <option value="products">{x.reachProducts}</option>
          <option value="categories">{x.reachCategories}</option>
        </select>
      </div>
      {reach !== 'all' ? (
        <div>
          <label className="a2-lbl" htmlFor="ov-slugs">
            {reach === 'products' ? x.reachProducts : x.reachCategories}
          </label>
          <input id="ov-slugs" className="a2-inp" value={slugsText} disabled={busy} onChange={(e) => setSlugsText(e.target.value)} placeholder={x.slugsHelp} data-testid="ov-slugs" />
          <p className="a2-sm a2-mute">{x.slugsHelp}</p>
        </div>
      ) : null}
      <div>
        <label className="a2-lbl" htmlFor="ov-starts">
          {x.startsAt}
        </label>
        <input id="ov-starts" className="a2-inp" type="datetime-local" value={startsAt} disabled={busy} onChange={(e) => setStartsAt(e.target.value)} data-testid="ov-starts" />
      </div>
      <div>
        <label className="a2-lbl" htmlFor="ov-ends">
          {x.endsAt}
        </label>
        <input id="ov-ends" className="a2-inp" type="datetime-local" value={endsAt} disabled={busy} onChange={(e) => setEndsAt(e.target.value)} data-testid="ov-ends" />
      </div>
      <div className="adp-read">
        <button type="button" className="a2-btn pri" disabled={busy || !ready} onClick={() => void go()} data-testid="overlay-add">
          {busy ? x.adding : x.add}
        </button>
        {out ? (
          <span className={`a2-sm${out.bad ? ' adp-bad' : ''}`} role="status" aria-live="polite" data-testid="overlay-out">
            {out.text}
          </span>
        ) : null}
      </div>
    </div>
  );
}

/** Enable or disable a live overlay (independent of its window: disabled never shows, even inside its dates). */
export function OverlayEnable({ url, overlay, texts: x }: { url: string; overlay: CampaignOverlayView; texts: OverlayTexts }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState<Out>(null);
  async function go(next: 'enable' | 'disable') {
    setBusy(true);
    setOut(null);
    const a = await call('POST', url, { action: next, id: overlay.id });
    setBusy(false);
    if (a.status !== 200) return setOut({ text: errText(a, x.err), bad: true });
    router.refresh();
  }
  return (
    <>
      <button type="button" className="a2-btn" disabled={busy} onClick={() => void go(overlay.enabled ? 'disable' : 'enable')} data-testid={overlay.enabled ? 'overlay-disable' : 'overlay-enable'}>
        {overlay.enabled ? x.disable : x.enable}
      </button>
      {out ? (
        <span className={`a2-sm${out.bad ? ' adp-bad' : ''}`} role="status" aria-live="polite">
          {out.text}
        </span>
      ) : null}
    </>
  );
}

/** Archive (with a confirm) or restore one overlay. */
export function OverlayArchive({ url, overlay, texts: x }: { url: string; overlay: CampaignOverlayView; texts: OverlayTexts }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState<Out>(null);
  async function go(next: 'archive' | 'restore') {
    setBusy(true);
    setOut(null);
    const a = await call('POST', url, { action: next, id: overlay.id });
    setBusy(false);
    setConfirming(false);
    if (a.status !== 200) return setOut({ text: errText(a, x.err), bad: true });
    router.refresh();
  }
  if (overlay.archived) {
    return (
      <button type="button" className="a2-btn" disabled={busy} onClick={() => void go('restore')} data-testid="overlay-restore">
        {x.restore}
      </button>
    );
  }
  if (confirming) {
    return (
      <span className="adp-read" data-testid="overlay-confirm">
        <span className="a2-sm">{x.confirmArchive}</span>
        <button type="button" className="a2-btn pri" disabled={busy} onClick={() => void go('archive')} data-testid="overlay-confirm-yes">
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
      <button type="button" className="a2-btn" disabled={busy} onClick={() => setConfirming(true)} data-testid="overlay-archive">
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
