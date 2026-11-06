'use client';
// S13 · PR 282 — Marketing › Calendar's small forms: add or change one of the owner's own plan lines (title in English,
// Bengali optional, first and last day on the shop's clock, a short note) and one-button actions (set aside, bring
// back). POST {action, …} to /api/admin/marketing/calendar (`marketing.campaigns.write`); the API checks everything again.
// Follow-up 656: the plan line's campaign (Marketing › Campaigns, or none) picked from the page's list.
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import { showToast } from '../lumen/Toast';

const API = '/api/admin/marketing/calendar';

/** The page's words for these forms (already in the viewer's language). */
export interface CalendarFormTexts {
  err: Record<string, string>;
  fields: Record<string, string>;
}

export interface PlanFormWords {
  title: string;
  titleBn: string;
  titleBnHelp: string;
  starts: string;
  ends: string;
  endsHelp: string;
  note: string;
  save: string;
  saved: string;
  /** Follow-up 656: the campaign picker's label, its "none" choice and the campaigns (not archived). */
  campaign: string;
  campaignNone: string;
  campaigns: { id: string; name: string }[];
  /** The longest title and note (the API's own guards). */
  titleMax: number;
  noteMax: number;
}

export interface PlanValue {
  id?: string;
  version?: string;
  title: string;
  titleBn: string | null;
  starts: string;
  ends: string | null;
  note: string | null;
  campaignId?: string | null;
}

type Msg = { ok: boolean; text: string } | null;

async function post(texts: CalendarFormTexts, body: Record<string, unknown>): Promise<{ ok: true } | { ok: false; text: string }> {
  try {
    const res = await fetch(API, { method: 'POST', credentials: 'same-origin', cache: 'no-store', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const data = (await res.json().catch(() => ({ ok: false }))) as { ok?: boolean; error?: string; details?: string[] };
    if (data.ok) return { ok: true };
    const code = data.error ?? (res.status === 403 ? 'forbidden' : res.status === 401 ? 'unauthorized' : 'other');
    const fields = (data.details ?? []).map((f) => texts.fields[f] ?? f).join(', ');
    return { ok: false, text: (texts.err[code] ?? texts.err.other ?? code).replace('{fields}', fields) };
  } catch {
    return { ok: false, text: texts.err.network ?? 'network' };
  }
}

function Note({ msg, testId }: { msg: Msg; testId: string }) {
  if (!msg) return null;
  return (
    <p className="a2-xs" role={msg.ok ? 'status' : 'alert'} style={msg.ok ? undefined : { color: 'var(--bad)' }} data-testid={testId}>
      {msg.text}
    </p>
  );
}

function useSend(texts: CalendarFormTexts) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const send = async (body: Record<string, unknown>, done?: string): Promise<boolean> => {
    setBusy(true);
    setMsg(null);
    const r = await post(texts, body);
    setBusy(false);
    if (!r.ok) {
      setMsg({ ok: false, text: r.text });
      return false;
    }
    if (done) showToast({ text: done, tone: 'ok' });
    router.refresh();
    return true;
  };
  return { busy, msg, send };
}

/** One button that sends one action (set aside, bring back) and reloads the page. */
export function CalendarAct({ texts, body, label, testId }: { texts: CalendarFormTexts; body: Record<string, unknown>; label: string; testId: string }) {
  const { busy, msg, send } = useSend(texts);
  return (
    <span>
      <button type="button" className="a2-btn" disabled={busy} data-testid={testId} onClick={() => void send(body)}>
        {label}
      </button>
      <Note msg={msg} testId={`${testId}-msg`} />
    </span>
  );
}

/** Add a plan line (no `value.id`) or change one. */
export function PlanForm({ texts, w, value, testId }: { texts: CalendarFormTexts; w: PlanFormWords; value?: PlanValue; testId: string }) {
  const uid = useId();
  const blank: PlanValue = { title: '', titleBn: null, starts: '', ends: null, note: null, campaignId: null };
  const [v, setV] = useState<PlanValue>(value ?? blank);
  const { busy, msg, send } = useSend(texts);
  const set = (k: keyof PlanValue) => (e: { target: { value: string } }) => setV({ ...v, [k]: e.target.value });
  // a campaign set aside since keeps its place on the line it was named on
  const unlisted = v.campaignId && !w.campaigns.some((c) => c.id === v.campaignId) ? v.campaignId : null;
  const box = (k: 'title' | 'titleBn' | 'starts' | 'ends', label: string, type: 'text' | 'date', help?: string, max?: number) => (
    <div className="a2-fld">
      <label className="a2-lbl" htmlFor={`${uid}-${k}`}>
        {label}
      </label>
      <input id={`${uid}-${k}`} type={type} className="a2-inp" value={v[k] ?? ''} maxLength={max} onChange={set(k)} data-testid={`${testId}-${k}`} />
      {help ? <p className="a2-xs a2-mute">{help}</p> : null}
    </div>
  );
  return (
    <div className="mail-form" data-testid={testId}>
      <div className="mc-pair">
        {box('title', w.title, 'text', undefined, w.titleMax)}
        {box('titleBn', w.titleBn, 'text', w.titleBnHelp, w.titleMax)}
      </div>
      <div className="mc-pair">
        {box('starts', w.starts, 'date')}
        {box('ends', w.ends, 'date', w.endsHelp)}
      </div>
      <div className="a2-fld">
        <label className="a2-lbl" htmlFor={`${uid}-note`}>
          {w.note}
        </label>
        <textarea id={`${uid}-note`} className="a2-inp" rows={2} maxLength={w.noteMax} value={v.note ?? ''} onChange={set('note')} data-testid={`${testId}-note`} />
      </div>
      <div className="a2-fld">
        <label className="a2-lbl" htmlFor={`${uid}-campaign`}>
          {w.campaign}
        </label>
        <select id={`${uid}-campaign`} className="a2-inp" value={v.campaignId ?? ''} onChange={set('campaignId')} data-testid={`${testId}-campaign`}>
          <option value="">{w.campaignNone}</option>
          {unlisted ? <option value={unlisted}>{unlisted.slice(0, 8)}</option> : null}
          {w.campaigns.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      <span>
        <button
          type="button"
          className="a2-btn pri"
          disabled={busy}
          data-testid={`${testId}-save`}
          onClick={async () => {
            const ok = await send({ action: value?.id ? 'plan.update' : 'plan.add', ...(value?.id ? { id: value.id, version: value.version } : {}), title: v.title, titleBn: v.titleBn, starts: v.starts, ends: v.ends, note: v.note, campaignId: v.campaignId || null }, w.saved);
            if (ok && !value?.id) setV(blank);
          }}
        >
          {w.save}
        </button>
        <Note msg={msg} testId={`${testId}-msg`} />
      </span>
    </div>
  );
}
