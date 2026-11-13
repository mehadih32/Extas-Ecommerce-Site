'use client';
// S23 · PR 437–442 — Marketing › Studio's small forms: social accounts (add, rename, switch, approval, daily
// limit, archive/restore), templates (add, update, archive/restore), brand assets (set a kind, archive/restore;
// uploading a file goes straight to the shared Media library, `/api/admin/media`, with `folder: 'studio'`, which
// needs `media.upload` on top of this page's own `studio.write`), a render job (PR 439) and a post from a
// finished render job onto a Facebook, Instagram or TikTok account (PR 440/441, `StudioPostForm`, with an optional
// hold-until time for the calendar). The API checks every permission again; a post only reaches a real account
// once its account runs free and the "Post now" button is pressed (`post.run`) — queuing one here never sends
// anything by itself. PR 442 adds the approval queue (`StudioDecide` — approve/reject a post waiting for a
// person), the calendar's own reschedule control (`StudioReschedule`) and the auto-schedule rules (add/edit, a
// cadence of posts+reels a day on chosen weekdays — `StudioScheduleRuleForm`/`StudioScheduleRuleControls`).
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import { showToast } from '../lumen/Toast';

const API = '/api/admin/marketing/studio';
const MEDIA_API = '/api/admin/media';

export interface StudioFormTexts {
  err: Record<string, string>;
  fields: Record<string, string>;
}

type Msg = { ok: boolean; text: string } | null;

async function post(texts: StudioFormTexts, body: Record<string, unknown>): Promise<{ ok: true } | { ok: false; text: string }> {
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

/** One button that sends one action and reloads the page. */
export function StudioAct({ texts, body, label, testId, done }: { texts: StudioFormTexts; body: Record<string, unknown>; label: string; testId: string; done?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  return (
    <span>
      <button
        type="button"
        className="a2-btn"
        disabled={busy}
        data-testid={testId}
        onClick={async () => {
          setBusy(true);
          const r = await post(texts, body);
          setBusy(false);
          if (!r.ok) return setMsg({ ok: false, text: r.text });
          if (done) showToast({ text: done, tone: 'ok' });
          router.refresh();
        }}
      >
        {label}
      </button>
      <Note msg={msg} testId={`${testId}-msg`} />
    </span>
  );
}

export interface AccountFormWords {
  platform: string;
  externalId: string;
  externalIdPh: string;
  name: string;
  namePh: string;
  add: string;
  added: string;
}

/** Adds a social account: its platform, page/channel id and a name. Always off and needing approval (PR 437). */
export function StudioAccountForm({ texts, platforms, w }: { texts: StudioFormTexts; platforms: { id: string; label: string }[]; w: AccountFormWords }) {
  const uid = useId();
  const router = useRouter();
  const [platform, setPlatform] = useState(platforms[0]?.id ?? '');
  const [externalId, setExternalId] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  return (
    <div className="mail-form" data-testid="st-account-form">
      <div className="a2-fld">
        <label className="a2-lbl" htmlFor={`${uid}-p`}>
          {w.platform}
        </label>
        <select id={`${uid}-p`} className="a2-inp" value={platform} onChange={(e) => setPlatform(e.target.value)} data-testid="st-account-platform">
          {platforms.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </div>
      <div className="a2-fld">
        <label className="a2-lbl" htmlFor={`${uid}-e`}>
          {w.externalId}
        </label>
        <input id={`${uid}-e`} className="a2-inp" value={externalId} maxLength={80} placeholder={w.externalIdPh} onChange={(e) => setExternalId(e.target.value)} data-testid="st-account-external" />
      </div>
      <div className="a2-fld">
        <label className="a2-lbl" htmlFor={`${uid}-n`}>
          {w.name}
        </label>
        <input id={`${uid}-n`} className="a2-inp" value={name} maxLength={80} placeholder={w.namePh} onChange={(e) => setName(e.target.value)} data-testid="st-account-name" />
      </div>
      <span>
        <button
          type="button"
          className="a2-btn pri"
          disabled={busy}
          data-testid="st-account-add"
          onClick={async () => {
            setBusy(true);
            setMsg(null);
            const r = await post(texts, { action: 'account.add', platform, externalId, name });
            setBusy(false);
            if (!r.ok) return setMsg({ ok: false, text: r.text });
            showToast({ text: w.added, tone: 'ok' });
            setExternalId('');
            setName('');
            router.refresh();
          }}
        >
          {w.add}
        </button>
      </span>
      <Note msg={msg} testId="st-account-msg" />
    </div>
  );
}

/** One account's daily limit: an empty box means no limit. */
export function StudioAccountLimit({ texts, id, version, dailyLimit, w }: { texts: StudioFormTexts; id: string; version: string; dailyLimit: number | null; w: { label: string; save: string; saved: string } }) {
  const router = useRouter();
  const [value, setValue] = useState(dailyLimit === null ? '' : String(dailyLimit));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  return (
    <span className="a2-gap8" data-testid="st-account-limit">
      <input className="a2-inp" inputMode="numeric" value={value} maxLength={3} placeholder={w.label} onChange={(e) => setValue(e.target.value.replace(/[^0-9]/g, ''))} data-testid="st-account-limit-input" />
      <button
        type="button"
        className="a2-btn"
        disabled={busy}
        data-testid="st-account-limit-save"
        onClick={async () => {
          setBusy(true);
          setMsg(null);
          const r = await post(texts, { action: 'account.dailyLimit', id, dailyLimit: value === '' ? null : Number(value), version });
          setBusy(false);
          if (!r.ok) return setMsg({ ok: false, text: r.text });
          showToast({ text: w.saved, tone: 'ok' });
          router.refresh();
        }}
      >
        {w.save}
      </button>
      <Note msg={msg} testId="st-account-limit-msg" />
    </span>
  );
}

export interface TemplateFormWords {
  kind: string;
  name: string;
  namePh: string;
  aspectRatio: string;
  duration: string;
  notes: string;
  notesPh: string;
  add: string;
  added: string;
}

/** Adds a template: its kind, name, aspect ratio and (for a reel/short) a duration. No brand assets from here yet. */
export function StudioTemplateForm({ texts, kinds, ratios, w }: { texts: StudioFormTexts; kinds: { id: string; label: string }[]; ratios: string[]; w: TemplateFormWords }) {
  const uid = useId();
  const router = useRouter();
  const [kind, setKind] = useState(kinds[0]?.id ?? 'image');
  const [name, setName] = useState('');
  const [aspectRatio, setAspectRatio] = useState(ratios[0] ?? '1:1');
  const [duration, setDuration] = useState('15');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const timed = kind === 'reel' || kind === 'short';
  return (
    <div className="mail-form" data-testid="st-template-form">
      <div className="a2-fld">
        <label className="a2-lbl" htmlFor={`${uid}-k`}>
          {w.kind}
        </label>
        <select id={`${uid}-k`} className="a2-inp" value={kind} onChange={(e) => setKind(e.target.value)} data-testid="st-template-kind">
          {kinds.map((k) => (
            <option key={k.id} value={k.id}>
              {k.label}
            </option>
          ))}
        </select>
      </div>
      <div className="a2-fld">
        <label className="a2-lbl" htmlFor={`${uid}-n`}>
          {w.name}
        </label>
        <input id={`${uid}-n`} className="a2-inp" value={name} maxLength={80} placeholder={w.namePh} onChange={(e) => setName(e.target.value)} data-testid="st-template-name" />
      </div>
      <div className="a2-fld">
        <label className="a2-lbl" htmlFor={`${uid}-a`}>
          {w.aspectRatio}
        </label>
        <select id={`${uid}-a`} className="a2-inp" value={aspectRatio} onChange={(e) => setAspectRatio(e.target.value)} data-testid="st-template-ratio">
          {ratios.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </div>
      {timed ? (
        <div className="a2-fld">
          <label className="a2-lbl" htmlFor={`${uid}-d`}>
            {w.duration}
          </label>
          <input id={`${uid}-d`} className="a2-inp" inputMode="numeric" value={duration} maxLength={2} onChange={(e) => setDuration(e.target.value.replace(/[^0-9]/g, ''))} data-testid="st-template-duration" />
        </div>
      ) : null}
      <div className="a2-fld">
        <label className="a2-lbl" htmlFor={`${uid}-o`}>
          {w.notes}
        </label>
        <input id={`${uid}-o`} className="a2-inp" value={notes} maxLength={500} placeholder={w.notesPh} onChange={(e) => setNotes(e.target.value)} data-testid="st-template-notes" />
      </div>
      <span>
        <button
          type="button"
          className="a2-btn pri"
          disabled={busy}
          data-testid="st-template-add"
          onClick={async () => {
            setBusy(true);
            setMsg(null);
            const spec: Record<string, unknown> = { aspectRatio, brandAssetIds: [] };
            if (timed) spec.durationSeconds = Number(duration) || 1;
            if (notes.trim()) spec.notes = notes.trim();
            const r = await post(texts, { action: 'template.add', kind, name, spec });
            setBusy(false);
            if (!r.ok) return setMsg({ ok: false, text: r.text });
            showToast({ text: w.added, tone: 'ok' });
            setName('');
            setNotes('');
            router.refresh();
          }}
        >
          {w.add}
        </button>
      </span>
      <Note msg={msg} testId="st-template-msg" />
    </div>
  );
}

/** Names what a brand asset is for (logo, overlay frame, …) or clears it; saves right away. */
export function StudioAssetKind({ texts, assetId, kind, kinds, clearLabel }: { texts: StudioFormTexts; assetId: string; kind: string | null; kinds: { id: string; label: string }[]; clearLabel: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  return (
    <span data-testid="st-asset-kind">
      <select
        className="a2-inp"
        value={kind ?? ''}
        disabled={busy}
        data-testid="st-asset-kind-select"
        onChange={async (e) => {
          setBusy(true);
          setMsg(null);
          const r = await post(texts, { action: 'asset.kind', assetId, kind: e.target.value || null });
          setBusy(false);
          if (!r.ok) return setMsg({ ok: false, text: r.text });
          router.refresh();
        }}
      >
        <option value="">{clearLabel}</option>
        {kinds.map((k) => (
          <option key={k.id} value={k.id}>
            {k.label}
          </option>
        ))}
      </select>
      <Note msg={msg} testId="st-asset-kind-msg" />
    </span>
  );
}

export interface RenderFormWords {
  template: string;
  noTemplates: string;
  products: string;
  productsPh: string;
  productsHelp: string;
  caption: string;
  captionPh: string;
  queue: string;
  queued: string;
}

/** Queues a render job (PR 439): a template, a comma-separated list of product ids, and an optional caption. */
export function StudioRenderForm({ texts, templates, w }: { texts: StudioFormTexts; templates: { id: string; label: string }[]; w: RenderFormWords }) {
  const uid = useId();
  const router = useRouter();
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? '');
  const [products, setProducts] = useState('');
  const [caption, setCaption] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  if (!templates.length) return <p className="a2-sm a2-mute" data-testid="st-render-no-template">{w.noTemplates}</p>;
  return (
    <div className="mail-form" data-testid="st-render-form">
      <div className="a2-fld">
        <label className="a2-lbl" htmlFor={`${uid}-t`}>
          {w.template}
        </label>
        <select id={`${uid}-t`} className="a2-inp" value={templateId} onChange={(e) => setTemplateId(e.target.value)} data-testid="st-render-template">
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
      </div>
      <div className="a2-fld">
        <label className="a2-lbl" htmlFor={`${uid}-p`}>
          {w.products}
        </label>
        <input id={`${uid}-p`} className="a2-inp" value={products} placeholder={w.productsPh} onChange={(e) => setProducts(e.target.value)} data-testid="st-render-products" />
        <p className="a2-xs a2-mute">{w.productsHelp}</p>
      </div>
      <div className="a2-fld">
        <label className="a2-lbl" htmlFor={`${uid}-c`}>
          {w.caption}
        </label>
        <textarea id={`${uid}-c`} className="a2-inp" rows={3} maxLength={2200} value={caption} placeholder={w.captionPh} onChange={(e) => setCaption(e.target.value)} data-testid="st-render-caption" />
      </div>
      <span>
        <button
          type="button"
          className="a2-btn pri"
          disabled={busy || !templateId}
          data-testid="st-render-queue"
          onClick={async () => {
            setBusy(true);
            setMsg(null);
            const productIds = products
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean);
            const r = await post(texts, { action: 'render.queue', templateId, productIds, ...(caption.trim() ? { caption: caption.trim() } : {}) });
            setBusy(false);
            if (!r.ok) return setMsg({ ok: false, text: r.text });
            showToast({ text: w.queued, tone: 'ok' });
            setProducts('');
            setCaption('');
            router.refresh();
          }}
        >
          {w.queue}
        </button>
      </span>
      <Note msg={msg} testId="st-render-msg" />
    </div>
  );
}

export interface PostFormWords {
  renderJob: string;
  noRenderJobs: string;
  account: string;
  noAccounts: string;
  caption: string;
  captionPh: string;
  captionHelp: string;
  scheduledAt: string;
  scheduledAtHelp: string;
  queue: string;
  queued: string;
}

/** Queues a post from a finished render job onto one account (PR 440): the render job, the account, an optional
 * caption override (the render job's own caption is used when this is left empty), and an optional future time to
 * hold it for (PR 442's calendar) — left blank, it runs the moment it is cleared, same as before PR 442. */
export function StudioPostForm({ texts, renders, accounts, w }: { texts: StudioFormTexts; renders: { id: string; label: string }[]; accounts: { id: string; label: string }[]; w: PostFormWords }) {
  const uid = useId();
  const router = useRouter();
  const [renderJobId, setRenderJobId] = useState(renders[0]?.id ?? '');
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? '');
  const [caption, setCaption] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  if (!renders.length) return <p className="a2-sm a2-mute" data-testid="st-post-no-render">{w.noRenderJobs}</p>;
  if (!accounts.length) return <p className="a2-sm a2-mute" data-testid="st-post-no-account">{w.noAccounts}</p>;
  return (
    <div className="mail-form" data-testid="st-post-form">
      <div className="a2-fld">
        <label className="a2-lbl" htmlFor={`${uid}-r`}>
          {w.renderJob}
        </label>
        <select id={`${uid}-r`} className="a2-inp" value={renderJobId} onChange={(e) => setRenderJobId(e.target.value)} data-testid="st-post-render">
          {renders.map((r) => (
            <option key={r.id} value={r.id}>
              {r.label}
            </option>
          ))}
        </select>
      </div>
      <div className="a2-fld">
        <label className="a2-lbl" htmlFor={`${uid}-a`}>
          {w.account}
        </label>
        <select id={`${uid}-a`} className="a2-inp" value={accountId} onChange={(e) => setAccountId(e.target.value)} data-testid="st-post-account">
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.label}
            </option>
          ))}
        </select>
      </div>
      <div className="a2-fld">
        <label className="a2-lbl" htmlFor={`${uid}-c`}>
          {w.caption}
        </label>
        <textarea id={`${uid}-c`} className="a2-inp" rows={3} maxLength={2200} value={caption} placeholder={w.captionPh} onChange={(e) => setCaption(e.target.value)} data-testid="st-post-caption" />
        <p className="a2-xs a2-mute">{w.captionHelp}</p>
      </div>
      <div className="a2-fld">
        <label className="a2-lbl" htmlFor={`${uid}-s`}>
          {w.scheduledAt}
        </label>
        <input id={`${uid}-s`} className="a2-inp" type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} data-testid="st-post-scheduled" />
        <p className="a2-xs a2-mute">{w.scheduledAtHelp}</p>
      </div>
      <span>
        <button
          type="button"
          className="a2-btn pri"
          disabled={busy || !renderJobId || !accountId}
          data-testid="st-post-queue"
          onClick={async () => {
            setBusy(true);
            setMsg(null);
            const iso = scheduledAt ? new Date(scheduledAt).toISOString() : undefined;
            const r = await post(texts, { action: 'post.queue', renderJobId, accountId, ...(caption.trim() ? { caption: caption.trim() } : {}), ...(iso ? { scheduledAt: iso } : {}) });
            setBusy(false);
            if (!r.ok) return setMsg({ ok: false, text: r.text });
            showToast({ text: w.queued, tone: 'ok' });
            setCaption('');
            setScheduledAt('');
            router.refresh();
          }}
        >
          {w.queue}
        </button>
      </span>
      <Note msg={msg} testId="st-post-msg" />
    </div>
  );
}

/** Approves or rejects one post waiting in the queue (PR 442, `studio.approve`): approving moves it to `SCHEDULED`
 * (if it has a time) or `PUBLISHING`; rejecting is final, kept for the record. */
export function StudioDecide({ texts, id, w }: { texts: StudioFormTexts; id: string; w: { approve: string; reject: string; done: string } }) {
  const router = useRouter();
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null);
  const [msg, setMsg] = useState<Msg>(null);
  const decide = async (decision: 'approve' | 'reject') => {
    setBusy(decision);
    setMsg(null);
    const r = await post(texts, { action: 'post.decide', id, decision });
    setBusy(null);
    if (!r.ok) return setMsg({ ok: false, text: r.text });
    showToast({ text: w.done, tone: 'ok' });
    router.refresh();
  };
  return (
    <span className="a2-gap8" data-testid="st-post-decide">
      <button type="button" className="a2-btn pri" disabled={busy !== null} data-testid="st-post-approve" onClick={() => decide('approve')}>
        {w.approve}
      </button>
      <button type="button" className="a2-btn" disabled={busy !== null} data-testid="st-post-reject" onClick={() => decide('reject')}>
        {w.reject}
      </button>
      <Note msg={msg} testId="st-post-decide-msg" />
    </span>
  );
}

/** Moves a post not yet sent (`PENDING_APPROVAL`/`SCHEDULED`) to a new time, or clears it to run the moment it is
 * next cleared/run (PR 442, `studio.generate`). */
export function StudioReschedule({ texts, id, scheduledAt, w }: { texts: StudioFormTexts; id: string; scheduledAt: string | null; w: { label: string; save: string; clear: string; saved: string } }) {
  const router = useRouter();
  const toLocal = (iso: string | null) => (iso ? new Date(iso).toISOString().slice(0, 16) : '');
  const [value, setValue] = useState(toLocal(scheduledAt));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const save = async (next: string) => {
    setBusy(true);
    setMsg(null);
    const r = await post(texts, { action: 'post.reschedule', id, scheduledAt: next ? new Date(next).toISOString() : null });
    setBusy(false);
    if (!r.ok) return setMsg({ ok: false, text: r.text });
    showToast({ text: w.saved, tone: 'ok' });
    router.refresh();
  };
  return (
    <span className="a2-gap8" data-testid="st-post-reschedule">
      <input className="a2-inp" type="datetime-local" value={value} disabled={busy} onChange={(e) => setValue(e.target.value)} data-testid="st-post-reschedule-input" />
      <button type="button" className="a2-btn" disabled={busy || !value} data-testid="st-post-reschedule-save" onClick={() => save(value)}>
        {w.save}
      </button>
      {scheduledAt ? (
        <button
          type="button"
          className="a2-btn"
          disabled={busy}
          data-testid="st-post-reschedule-clear"
          onClick={() => {
            setValue('');
            void save('');
          }}
        >
          {w.clear}
        </button>
      ) : null}
      <Note msg={msg} testId="st-post-reschedule-msg" />
    </span>
  );
}

export interface ScheduleRuleFormWords {
  account: string;
  anyAccount: string;
  postsPerDay: string;
  reelsPerDay: string;
  weekdays: string;
  weekdayLabels: string[];
  categoryIds: string;
  categoryIdsPh: string;
  categoryIdsHelp: string;
  add: string;
  added: string;
}

function WeekdayPicker({ active, onChange, labels, testId }: { active: number[]; onChange: (next: number[]) => void; labels: string[]; testId: string }) {
  return (
    <span className="a2-gap8" data-testid={testId}>
      {labels.map((label, day) => {
        const on = active.includes(day);
        return (
          <label key={day} className="a2-sm">
            <input
              type="checkbox"
              checked={on}
              data-testid={`${testId}-${day}`}
              onChange={() => onChange(on ? active.filter((d) => d !== day) : [...active, day].sort((a, b) => a - b))}
            />{' '}
            {label}
          </label>
        );
      })}
    </span>
  );
}

/** Adds an auto-schedule rule (PR 442): a cadence (posts and reels a day), which weekdays it runs on, which
 * categories it draws from, and optionally one account. Always off until switched on by hand — see schedule.ts's
 * own honest-scope header for why this previews a next active day rather than dispatching anything by itself. */
export function StudioScheduleRuleForm({ texts, accounts, w }: { texts: StudioFormTexts; accounts: { id: string; label: string }[]; w: ScheduleRuleFormWords }) {
  const uid = useId();
  const router = useRouter();
  const [accountId, setAccountId] = useState('');
  const [postsPerDay, setPostsPerDay] = useState('1');
  const [reelsPerDay, setReelsPerDay] = useState('0');
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [categoryIds, setCategoryIds] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  return (
    <div className="mail-form" data-testid="st-rule-form">
      <div className="a2-fld">
        <label className="a2-lbl" htmlFor={`${uid}-a`}>
          {w.account}
        </label>
        <select id={`${uid}-a`} className="a2-inp" value={accountId} onChange={(e) => setAccountId(e.target.value)} data-testid="st-rule-account">
          <option value="">{w.anyAccount}</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.label}
            </option>
          ))}
        </select>
      </div>
      <div className="a2-fld">
        <label className="a2-lbl" htmlFor={`${uid}-p`}>
          {w.postsPerDay}
        </label>
        <input id={`${uid}-p`} className="a2-inp" inputMode="numeric" value={postsPerDay} maxLength={2} onChange={(e) => setPostsPerDay(e.target.value.replace(/[^0-9]/g, ''))} data-testid="st-rule-posts" />
      </div>
      <div className="a2-fld">
        <label className="a2-lbl" htmlFor={`${uid}-r`}>
          {w.reelsPerDay}
        </label>
        <input id={`${uid}-r`} className="a2-inp" inputMode="numeric" value={reelsPerDay} maxLength={2} onChange={(e) => setReelsPerDay(e.target.value.replace(/[^0-9]/g, ''))} data-testid="st-rule-reels" />
      </div>
      <div className="a2-fld">
        <span className="a2-lbl">{w.weekdays}</span>
        <WeekdayPicker active={weekdays} onChange={setWeekdays} labels={w.weekdayLabels} testId="st-rule-weekdays" />
      </div>
      <div className="a2-fld">
        <label className="a2-lbl" htmlFor={`${uid}-c`}>
          {w.categoryIds}
        </label>
        <input id={`${uid}-c`} className="a2-inp" value={categoryIds} placeholder={w.categoryIdsPh} onChange={(e) => setCategoryIds(e.target.value)} data-testid="st-rule-categories" />
        <p className="a2-xs a2-mute">{w.categoryIdsHelp}</p>
      </div>
      <span>
        <button
          type="button"
          className="a2-btn pri"
          disabled={busy}
          data-testid="st-rule-add"
          onClick={async () => {
            setBusy(true);
            setMsg(null);
            const ids = categoryIds
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean);
            const cadence = { postsPerDay: Number(postsPerDay) || 0, reelsPerDay: Number(reelsPerDay) || 0, activeWeekdays: weekdays };
            const r = await post(texts, { action: 'rule.add', accountId: accountId || undefined, cadence, categoryIds: ids });
            setBusy(false);
            if (!r.ok) return setMsg({ ok: false, text: r.text });
            showToast({ text: w.added, tone: 'ok' });
            setCategoryIds('');
            setWeekdays([]);
            router.refresh();
          }}
        >
          {w.add}
        </button>
      </span>
      <Note msg={msg} testId="st-rule-msg" />
    </div>
  );
}

/** One existing rule's own on/off and archive/restore switches (PR 442) — editing its cadence/weekdays happens by
 * archiving and adding a fresh one for now, the same pattern an account's platform/externalId already follows. */
export function StudioScheduleRuleControls({ texts, id, version, enabled, archived, w }: { texts: StudioFormTexts; id: string; version: string; enabled: boolean; archived: boolean; w: { turnOn: string; turnOff: string; archive: string; restore: string; saved: string } }) {
  return (
    <span className="a2-gap8 yt-mt8" data-testid="st-rule-controls">
      {!archived ? <StudioAct texts={texts} body={{ action: 'rule.switch', id, enabled: !enabled, version }} label={enabled ? w.turnOff : w.turnOn} testId="st-rule-switch" done={w.saved} /> : null}
      <StudioAct texts={texts} body={{ action: 'rule.archive', id, archived: !archived, version }} label={archived ? w.restore : w.archive} testId="st-rule-archive" done={w.saved} />
    </span>
  );
}

export interface AssetUploadWords {
  file: string;
  kind: string;
  add: string;
  added: string;
  needMedia: string;
}

/** Uploads a brand asset straight to the shared Media library in the private `studio` folder (needs `media.upload`). */
export function StudioAssetUpload({ texts, kinds, w, canUpload }: { texts: StudioFormTexts; kinds: { id: string; label: string }[]; w: AssetUploadWords; canUpload: boolean }) {
  const uid = useId();
  const router = useRouter();
  const [kind, setKind] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  if (!canUpload) return <p className="a2-xs a2-mute" data-testid="st-asset-upload-locked">{w.needMedia}</p>;
  return (
    <form
      className="mail-form"
      data-testid="st-asset-upload"
      onSubmit={(e) => e.preventDefault()}
    >
      <div className="a2-fld">
        <label className="a2-lbl" htmlFor={`${uid}-k`}>
          {w.kind}
        </label>
        <select id={`${uid}-k`} className="a2-inp" value={kind} onChange={(e) => setKind(e.target.value)} data-testid="st-asset-upload-kind">
          <option value="">—</option>
          {kinds.map((k) => (
            <option key={k.id} value={k.id}>
              {k.label}
            </option>
          ))}
        </select>
      </div>
      <div className="a2-fld">
        <label className="a2-lbl" htmlFor={`${uid}-f`}>
          {w.file}
        </label>
        <input
          id={`${uid}-f`}
          className="a2-inp"
          type="file"
          accept="image/*,video/*,audio/*"
          disabled={busy}
          data-testid="st-asset-upload-file"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            setBusy(true);
            setMsg(null);
            try {
              const form = new FormData();
              form.set('file', file);
              form.set('folder', 'studio');
              if (kind) form.append('tags', kind);
              const res = await fetch(MEDIA_API, { method: 'POST', credentials: 'same-origin', body: form });
              const data = (await res.json().catch(() => ({ ok: false }))) as { ok?: boolean; error?: string };
              if (!data.ok) {
                const code = data.error ?? (res.status === 403 ? 'forbidden' : 'other');
                setMsg({ ok: false, text: texts.err[code] ?? texts.err.other ?? code });
              } else {
                showToast({ text: w.added, tone: 'ok' });
                router.refresh();
              }
            } catch {
              setMsg({ ok: false, text: texts.err.network ?? 'network' });
            } finally {
              setBusy(false);
              e.target.value = '';
            }
          }}
        />
      </div>
      <Note msg={msg} testId="st-asset-upload-msg" />
    </form>
  );
}
