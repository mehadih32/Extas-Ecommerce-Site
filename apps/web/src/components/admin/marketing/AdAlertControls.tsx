'use client';
// S13 · PR 267 — Marketing › Ad platforms' alert rules: each rule's on/off switch, its limit and "Put away" (POST
// {action: set | archive}), and the form that adds a rule, off (POST {action: 'add'}). The owner types the limit in
// taka; it is sent in the minor unit (`scale`). The API checks `marketing.campaigns.write` again; the page is read
// again after each. Words come from the page.
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { call } from '../api';
import { showToast } from '../lumen/Toast';

export interface AlertTexts {
  enabled: string;
  limit: string;
  saveLimit: string;
  archive: string;
  addMetric: string;
  addWhere: string;
  addLimit: string;
  add: string;
  working: string;
  done: string;
  err: Record<string, string>;
}

function useSend(url: string, x: AlertTexts) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<{ text: string; bad: boolean } | null>(null);
  async function send(body: Record<string, unknown>): Promise<boolean> {
    setBusy(true);
    setSaid(null);
    const a = await call('POST', url, body);
    setBusy(false);
    if (a.status !== 200) {
      const code = a.status === 0 ? 'network' : (a.data.error ?? 'other');
      setSaid({ text: x.err[code] ?? x.err.other ?? code, bad: true });
      return false;
    }
    showToast({ text: x.done, tone: 'ok' });
    router.refresh();
    return true;
  }
  return { busy, said, send };
}

const Said = ({ said, id }: { said: { text: string; bad: boolean } | null; id: string }) =>
  said ? (
    <span className={`a2-sm${said.bad ? ' adp-bad' : ''}`} role="status" aria-live="polite" data-testid={id}>
      {said.text}
    </span>
  ) : null;

const toMinor = (v: string, scale: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n * scale) : null;
};

export function AlertRuleControls({ url, id, enabled, thresholdMinor, scale, label, canEdit, texts: x }: { url: string; id: string; enabled: boolean; thresholdMinor: number; scale: number; label: string; canEdit: boolean; texts: AlertTexts }) {
  const { busy, said, send } = useSend(url, x);
  const [limit, setLimit] = useState(String(thresholdMinor / scale));
  const minor = toMinor(limit, scale);
  const off = !canEdit || busy;
  return (
    <div className="adp-rule-ctl">
      <div className="a2-swl">
        <span>{x.enabled}</span>
        <button type="button" className={`a2-sw${enabled ? ' on' : ''}`} role="switch" aria-checked={enabled} aria-label={`${x.enabled}: ${label}`} disabled={off} onClick={() => void send({ action: 'set', id, enabled: !enabled })} data-testid="adp-rule-on" />
      </div>
      <div className="adp-rule-limit">
        <label className="a2-lbl" htmlFor={`adp-lim-${id}`}>
          {x.limit}
        </label>
        <input id={`adp-lim-${id}`} className="a2-inp" type="number" inputMode="decimal" min={0} step="any" value={limit} disabled={off} onChange={(e) => setLimit(e.target.value)} data-testid="adp-rule-limit" />
        <button type="button" className="a2-btn" disabled={off || minor === null || minor === thresholdMinor} onClick={() => void send({ action: 'set', id, thresholdMinor: minor })} data-testid="adp-rule-save">
          {x.saveLimit}
        </button>
        <button type="button" className="a2-btn" disabled={off} onClick={() => void send({ action: 'archive', id })} data-testid="adp-rule-archive">
          {x.archive}
        </button>
      </div>
      <Said said={said} id="adp-rule-said" />
    </div>
  );
}

export function AlertRuleAdd({ url, scale, metrics, places, texts: x }: { url: string; scale: number; metrics: { value: string; label: string }[]; places: { value: string; label: string }[]; texts: AlertTexts }) {
  const { busy, said, send } = useSend(url, x);
  const [metric, setMetric] = useState(metrics[0]?.value ?? '');
  const [where, setWhere] = useState(places[0]?.value ?? '');
  const [limit, setLimit] = useState('');
  const minor = toMinor(limit, scale);
  async function add() {
    const scope = where.startsWith('p:') ? { platform: where.slice(2) } : where.startsWith('c:') ? { adCampaignId: where.slice(2) } : null;
    if (await send({ action: 'add', metric, scope, thresholdMinor: minor })) setLimit('');
  }
  return (
    <div className="adp-add" data-testid="adp-rule-add">
      <div className="a2-fld">
        <label className="a2-lbl" htmlFor="adp-add-metric">
          {x.addMetric}
        </label>
        <select id="adp-add-metric" className="a2-sel" value={metric} disabled={busy} onChange={(e) => setMetric(e.target.value)} data-testid="adp-add-metric">
          {metrics.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
      </div>
      <div className="a2-fld">
        <label className="a2-lbl" htmlFor="adp-add-where">
          {x.addWhere}
        </label>
        <select id="adp-add-where" className="a2-sel" value={where} disabled={busy} onChange={(e) => setWhere(e.target.value)} data-testid="adp-add-where">
          {places.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
      </div>
      <div className="a2-fld">
        <label className="a2-lbl" htmlFor="adp-add-limit">
          {x.addLimit}
        </label>
        <input id="adp-add-limit" className="a2-inp" type="number" inputMode="decimal" min={0} step="any" value={limit} disabled={busy} onChange={(e) => setLimit(e.target.value)} data-testid="adp-add-limit" />
      </div>
      <div className="adp-read">
        <button type="button" className="a2-btn pri" disabled={busy || minor === null} onClick={() => void add()} data-testid="adp-add-go">
          {busy ? x.working : x.add}
        </button>
        <Said said={said} id="adp-add-said" />
      </div>
    </div>
  );
}
