'use client';
// S23 · PR 437, 438 — Marketing › Studio's small forms: social accounts (add, rename, switch, approval, daily
// limit, archive/restore), templates (add, update, archive/restore) and brand assets (set a kind, archive/restore;
// uploading a file goes straight to the shared Media library, `/api/admin/media`, with `folder: 'studio'`, which
// needs `media.upload` on top of this page's own `studio.write`). The API checks every permission again; nothing
// here posts to a real social account, renders a video or spends anything.
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
