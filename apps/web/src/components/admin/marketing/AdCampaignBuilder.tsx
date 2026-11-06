'use client';
// S13 · PR 531 — full campaign control: the draft form of Marketing › Ad platforms › New campaigns (POST draft.save),
// a draft's Duplicate / Launch… / Set aside / Bring back, and on Ad platforms each campaign's Schedule (POST change
// 'schedule' to the campaign controls, after a confirm) and Duplicate (a new draft). A launch and a schedule always say
// that they wait for the owner; the API checks the permission, the switches and the rule again, and the page is read
// again after each. Words come from the page; a budget is typed in the account's currency and sent in its minor unit.
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { call, type Answer } from '../api';
import { showToast } from '../lumen/Toast';

const fill = (s: string, vars: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
type Out = { text: string; bad: boolean } | null;
export interface BuildErr {
  err: Record<string, string>;
  field: Record<string, string>;
}
function errText(a: Answer, x: BuildErr): string {
  const code = a.status === 0 ? 'network' : (a.data.error ?? 'other');
  const field = code === 'INVALID_INPUT' ? (a.data.details ?? []).map((d) => x.field[d]).find(Boolean) : undefined;
  return field ?? x.err[code] ?? x.err.other ?? code;
}
const Said = ({ out, id }: { out: Out; id: string }) =>
  out ? (
    <span className={`a2-sm${out.bad ? ' adp-bad' : ''}`} role="status" aria-live="polite" data-testid={id}>
      {out.text}
    </span>
  ) : null;

function Confirm({ text, busy, yes, cancel, onYes, onNo, id }: { text: string | null; busy: boolean; yes: string; cancel: string; onYes: () => void; onNo: () => void; id: string }) {
  if (!text) return null;
  return (
    <div className="adp-confirm" role="alertdialog" aria-label={text} data-testid={id}>
      <p className="a2-sm">{text}</p>
      <div className="adp-read">
        <button type="button" className="a2-btn pri" disabled={busy} onClick={onYes} data-testid={`${id}-yes`}>
          {yes}
        </button>
        <button type="button" className="a2-btn" disabled={busy} onClick={onNo}>
          {cancel}
        </button>
      </div>
    </div>
  );
}

export interface DraftAccount {
  id: string;
  label: string;
  /** 10 ** the currency's minor digits. */
  scale: number;
}
export interface DraftValues {
  id?: string;
  version?: string;
  adAccountId: string;
  campaignId: string | null;
  name: string;
  objective: string;
  dailyBudgetMinor: number | null;
  startWall: string | null;
  endWall: string | null;
}
export interface DraftFormTexts extends BuildErr {
  account: string;
  campaign: string;
  noCampaign: string;
  name: string;
  objective: string;
  budget: string;
  budgetHelp: string;
  start: string;
  end: string;
  scheduleHelp: string;
  save: string;
  saving: string;
  saved: string;
}

/** A new draft (no `initial.id`) or a change to an open one. */
export function DraftForm({ url, uid, accounts, campaigns, objectives, nameMax, initial, texts: x }: { url: string; uid: string; accounts: DraftAccount[]; campaigns: { id: string; name: string }[]; objectives: { value: string; label: string }[]; nameMax: number; initial: DraftValues; texts: DraftFormTexts }) {
  const router = useRouter();
  const [v, setV] = useState(initial);
  const scaleOf = (id: string) => accounts.find((a) => a.id === id)?.scale ?? 1;
  const [budget, setBudget] = useState(initial.dailyBudgetMinor === null ? '' : String(initial.dailyBudgetMinor / scaleOf(initial.adAccountId)));
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState<Out>(null);
  const n = Number(budget);
  const minor = budget.trim() === '' ? null : Number.isFinite(n) && n > 0 ? Math.round(n * scaleOf(v.adAccountId)) : NaN;
  const set = (k: keyof DraftValues, val: string | null) => setV((o) => ({ ...o, [k]: val }));
  async function go() {
    setBusy(true);
    setOut(null);
    const a = await call('POST', url, { action: 'draft.save', id: v.id, version: v.version, adAccountId: v.adAccountId, campaignId: v.campaignId || null, name: v.name, objective: v.objective, dailyBudgetMinor: Number.isNaN(minor) ? -1 : minor, startAt: v.startWall || null, endAt: v.endWall || null });
    setBusy(false);
    if (a.status !== 200) return setOut({ text: errText(a, x), bad: true });
    showToast({ text: x.saved, tone: 'ok' });
    if (!v.id) {
      setV(initial);
      setBudget('');
    }
    router.refresh();
  }
  const id = (k: string) => `adc-${k}-${uid}`;
  return (
    <div className="adp-add" data-testid={`adc-form-${uid}`}>
      <div>
        <label className="a2-lbl" htmlFor={id('acc')}>
          {x.account}
        </label>
        <select id={id('acc')} className="a2-sel" value={v.adAccountId} disabled={busy} onChange={(e) => set('adAccountId', e.target.value)} data-testid="adc-account">
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="a2-lbl" htmlFor={id('camp')}>
          {x.campaign}
        </label>
        <select id={id('camp')} className="a2-sel" value={v.campaignId ?? ''} disabled={busy} onChange={(e) => set('campaignId', e.target.value || null)} data-testid="adc-campaign">
          <option value="">{x.noCampaign}</option>
          {campaigns.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="a2-lbl" htmlFor={id('name')}>
          {x.name}
        </label>
        <input id={id('name')} className="a2-inp" value={v.name} maxLength={nameMax} disabled={busy} onChange={(e) => set('name', e.target.value)} data-testid="adc-name" />
      </div>
      <div>
        <label className="a2-lbl" htmlFor={id('obj')}>
          {x.objective}
        </label>
        <select id={id('obj')} className="a2-sel" value={v.objective} disabled={busy} onChange={(e) => set('objective', e.target.value)} data-testid="adc-objective">
          {objectives.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="a2-lbl" htmlFor={id('bud')}>
          {x.budget}
        </label>
        <input id={id('bud')} className="a2-inp" type="number" inputMode="decimal" min={0} step="any" value={budget} disabled={busy} onChange={(e) => setBudget(e.target.value)} aria-describedby={id('budh')} data-testid="adc-budget" />
        <p className="a2-sm a2-mute" id={id('budh')}>
          {x.budgetHelp}
        </p>
      </div>
      <div>
        <label className="a2-lbl" htmlFor={id('start')}>
          {x.start}
        </label>
        <input id={id('start')} className="a2-inp" type="datetime-local" value={v.startWall ?? ''} disabled={busy} onChange={(e) => set('startWall', e.target.value || null)} aria-describedby={id('sch')} data-testid="adc-start" />
      </div>
      <div>
        <label className="a2-lbl" htmlFor={id('end')}>
          {x.end}
        </label>
        <input id={id('end')} className="a2-inp" type="datetime-local" value={v.endWall ?? ''} disabled={busy} onChange={(e) => set('endWall', e.target.value || null)} aria-describedby={id('sch')} data-testid="adc-end" />
        <p className="a2-sm a2-mute" id={id('sch')}>
          {x.scheduleHelp}
        </p>
      </div>
      <div className="adp-read">
        <button type="button" className="a2-btn pri" disabled={busy || !v.name.trim() || !v.adAccountId} onClick={() => void go()} data-testid="adc-save">
          {busy ? x.saving : x.save}
        </button>
        <Said out={out} id="adc-saved" />
      </div>
    </div>
  );
}

export interface DraftStepTexts extends BuildErr {
  duplicate: string;
  launch: string;
  archive: string;
  restore: string;
  yes: string;
  cancel: string;
  said: Record<string, string>;
}

/** A draft's buttons: Duplicate, Launch… (after a confirm that says it waits for the owner), Set aside / Bring back. */
export function DraftStep({ url, id, canDup, canLaunch, launchText, archived, canEdit, texts: x }: { url: string; id: string; canDup: boolean; canLaunch: boolean; launchText: string; archived: boolean; canEdit: boolean; texts: DraftStepTexts }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [ask, setAsk] = useState(false);
  const [out, setOut] = useState<Out>(null);
  async function post(body: Record<string, unknown>, said: string) {
    setBusy(true);
    setOut(null);
    const a = await call('POST', url, body);
    setBusy(false);
    setAsk(false);
    if (a.status !== 200) return setOut({ text: errText(a, x), bad: true });
    showToast({ text: x.said[said] ?? said, tone: 'ok' });
    router.refresh();
  }
  return (
    <div className="adp-ctl-body">
      <div className="adp-read">
        {!archived && canDup ? (
          <button type="button" className="a2-btn" disabled={busy} onClick={() => void post({ action: 'duplicate', draftId: id }, 'duplicated')} data-testid="adc-dup">
            {x.duplicate}
          </button>
        ) : null}
        {!archived && canLaunch ? (
          <button type="button" className="a2-btn pri" disabled={busy} onClick={() => (setOut(null), setAsk(true))} data-testid="adc-launch">
            {x.launch}
          </button>
        ) : null}
        {canEdit ? (
          <button type="button" className="a2-btn" disabled={busy} onClick={() => void post({ action: archived ? 'restore' : 'archive', id }, archived ? 'restored' : 'archived')} data-testid={archived ? 'adc-restore' : 'adc-archive'}>
            {archived ? x.restore : x.archive}
          </button>
        ) : null}
      </div>
      <Confirm text={ask ? launchText : null} busy={busy} yes={x.yes} cancel={x.cancel} onYes={() => void post({ action: 'launch', id, confirm: true }, 'WAITING')} onNo={() => setAsk(false)} id="adc-launch-confirm" />
      <Said out={out} id="adc-said" />
    </div>
  );
}

export interface CampaignExtraTexts extends BuildErr {
  schedule: string;
  start: string;
  end: string;
  scheduleHelp: string;
  scheduleGo: string;
  confirmSchedule: string;
  now: string;
  noEnd: string;
  duplicate: string;
  duplicated: string;
  openDrafts: string;
  waiting: string;
  yes: string;
  cancel: string;
}

/** On Ad platforms, inside a campaign's "Change" fold: Schedule (waits for the owner) and Duplicate (a new draft). */
export function CampaignExtra({ controlUrl, builderUrl, draftsHref, adCampaignId, name, texts: x }: { controlUrl: string; builderUrl: string; draftsHref: string; adCampaignId: string; name: string; texts: CampaignExtraTexts }) {
  const router = useRouter();
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [ask, setAsk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState<Out>(null);
  const [made, setMade] = useState(false);
  async function post(url: string, body: Record<string, unknown>, ok: string, dup = false) {
    setBusy(true);
    setOut(null);
    const a = await call('POST', url, body);
    setBusy(false);
    setAsk(false);
    if (a.status !== 200) return setOut({ text: errText(a, x), bad: true });
    showToast({ text: ok, tone: 'ok' });
    setMade(dup);
    router.refresh();
  }
  const sid = `adp-sch-${adCampaignId}`;
  return (
    <>
      <div className="adp-rule-limit">
        <span className="a2-lbl">{x.schedule}</span>
        <label className="a2-lbl" htmlFor={`${sid}-s`}>
          {x.start}
        </label>
        <input id={`${sid}-s`} className="a2-inp" type="datetime-local" value={start} disabled={busy} onChange={(e) => setStart(e.target.value)} aria-describedby={`${sid}-h`} data-testid="adp-ctl-start" />
        <label className="a2-lbl" htmlFor={`${sid}-e`}>
          {x.end}
        </label>
        <input id={`${sid}-e`} className="a2-inp" type="datetime-local" value={end} disabled={busy} onChange={(e) => setEnd(e.target.value)} aria-describedby={`${sid}-h`} data-testid="adp-ctl-end" />
        <p className="a2-sm a2-mute" id={`${sid}-h`}>
          {x.scheduleHelp}
        </p>
        <button type="button" className="a2-btn" disabled={busy || (!start && !end)} onClick={() => (setOut(null), setAsk(true))} data-testid="adp-ctl-schedule">
          {x.scheduleGo}
        </button>
      </div>
      <Confirm
        text={ask ? fill(x.confirmSchedule, { name, from: start ? start.replace('T', ' ') : x.now, to: end ? end.replace('T', ' ') : x.noEnd }) : null}
        busy={busy}
        yes={x.yes}
        cancel={x.cancel}
        onYes={() => void post(controlUrl, { action: 'change', adCampaignId, change: 'schedule', startAt: start || null, endAt: end || null, confirm: true }, x.waiting)}
        onNo={() => setAsk(false)}
        id="adp-sch-confirm"
      />
      <div className="adp-read">
        <button type="button" className="a2-btn" disabled={busy} onClick={() => void post(builderUrl, { action: 'duplicate', adCampaignId }, x.duplicated, true)} data-testid="adp-ctl-dup">
          {x.duplicate}
        </button>
        {made ? (
          <Link className="a2-sm adp-keys" href={draftsHref} data-testid="adp-ctl-drafts">
            {x.openDrafts}
          </Link>
        ) : null}
      </div>
      <Said out={out} id="adp-ctl-extra-said" />
    </>
  );
}
