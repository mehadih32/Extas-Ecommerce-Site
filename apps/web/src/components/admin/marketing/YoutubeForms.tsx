'use client';
// S13 · PR 278 — Marketing › YouTube's small forms: add the channel, add a video, change a video's title or products,
// set aside or bring back (POST {action, …} to /api/admin/marketing/youtube; `marketing.campaigns.write`), and copy a
// tracked link. The API checks everything again; nothing here posts to YouTube.
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import { showToast } from '../lumen/Toast';

const API = '/api/admin/marketing/youtube';

/** The page's words for these forms (already in the viewer's language). */
export interface YoutubeFormTexts {
  err: Record<string, string>;
  fields: Record<string, string>;
}

type Msg = { ok: boolean; text: string } | null;

async function post(texts: YoutubeFormTexts, body: Record<string, unknown>): Promise<{ ok: true } | { ok: false; text: string }> {
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

/** One button that sends one action (set aside, bring back) and reloads the page. */
export function YoutubeAct({ texts, body, label, testId }: { texts: YoutubeFormTexts; body: Record<string, unknown>; label: string; testId: string }) {
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
          router.refresh();
        }}
      >
        {label}
      </button>
      <Note msg={msg} testId={`${testId}-msg`} />
    </span>
  );
}

/** Copies a tracked link. */
export function YoutubeCopy({ text, label, done }: { text: string; label: string; done: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="a2-btn"
      data-testid="yt-copy"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
        } catch {
          setCopied(false);
        }
      }}
    >
      {copied ? done : label}
    </button>
  );
}

export interface ChannelFormWords {
  link: string;
  linkPh: string;
  name: string;
  namePh: string;
  add: string;
  added: string;
}

/** Adds the channel by its link and a name. */
export function YoutubeChannelForm({ texts, w }: { texts: YoutubeFormTexts; w: ChannelFormWords }) {
  const uid = useId();
  const router = useRouter();
  const [link, setLink] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  return (
    <div className="mail-form" data-testid="yt-channel-form">
      <div className="a2-fld">
        <label className="a2-lbl" htmlFor={`${uid}-l`}>
          {w.link}
        </label>
        <input id={`${uid}-l`} className="a2-inp" value={link} maxLength={300} placeholder={w.linkPh} onChange={(e) => setLink(e.target.value)} data-testid="yt-channel-link" />
      </div>
      <div className="a2-fld">
        <label className="a2-lbl" htmlFor={`${uid}-n`}>
          {w.name}
        </label>
        <input id={`${uid}-n`} className="a2-inp" value={name} maxLength={100} placeholder={w.namePh} onChange={(e) => setName(e.target.value)} data-testid="yt-channel-name" />
      </div>
      <span>
        <button
          type="button"
          className="a2-btn pri"
          disabled={busy}
          data-testid="yt-channel-add"
          onClick={async () => {
            setBusy(true);
            setMsg(null);
            const r = await post(texts, { action: 'channel.add', link, name });
            setBusy(false);
            if (!r.ok) return setMsg({ ok: false, text: r.text });
            showToast({ text: w.added, tone: 'ok' });
            setLink('');
            setName('');
            router.refresh();
          }}
        >
          {w.add}
        </button>
      </span>
      <Note msg={msg} testId="yt-channel-msg" />
    </div>
  );
}

export interface VideoFormWords {
  channel: string;
  link: string;
  linkPh: string;
  title: string;
  day: string;
  products: string;
  productsPh: string;
  add: string;
  added: string;
}

/** Adds a video: its channel, link, title, the day it went up and the products it shows. */
export function YoutubeVideoForm({ texts, w, channels }: { texts: YoutubeFormTexts; w: VideoFormWords; channels: { id: string; name: string }[] }) {
  const uid = useId();
  const router = useRouter();
  const [channelId, setChannelId] = useState(channels[0]?.id ?? '');
  const [link, setLink] = useState('');
  const [title, setTitle] = useState('');
  const [day, setDay] = useState('');
  const [products, setProducts] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  return (
    <div className="mail-form" data-testid="yt-video-form">
      {channels.length > 1 ? (
        <div className="a2-fld">
          <label className="a2-lbl" htmlFor={`${uid}-c`}>
            {w.channel}
          </label>
          <select id={`${uid}-c`} className="a2-sel" value={channelId} onChange={(e) => setChannelId(e.target.value)}>
            {channels.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      <div className="a2-fld">
        <label className="a2-lbl" htmlFor={`${uid}-l`}>
          {w.link}
        </label>
        <input id={`${uid}-l`} className="a2-inp" value={link} maxLength={300} placeholder={w.linkPh} onChange={(e) => setLink(e.target.value)} data-testid="yt-video-link" />
      </div>
      <div className="a2-fld">
        <label className="a2-lbl" htmlFor={`${uid}-t`}>
          {w.title}
        </label>
        <input id={`${uid}-t`} className="a2-inp" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} data-testid="yt-video-title" />
      </div>
      <div className="a2-fld">
        <label className="a2-lbl" htmlFor={`${uid}-d`}>
          {w.day}
        </label>
        <input id={`${uid}-d`} className="a2-inp" type="date" value={day} onChange={(e) => setDay(e.target.value)} />
      </div>
      <div className="a2-fld">
        <label className="a2-lbl" htmlFor={`${uid}-p`}>
          {w.products}
        </label>
        <textarea id={`${uid}-p`} className="a2-inp" rows={3} value={products} placeholder={w.productsPh} onChange={(e) => setProducts(e.target.value)} data-testid="yt-video-products" />
      </div>
      <span>
        <button
          type="button"
          className="a2-btn pri"
          disabled={busy}
          data-testid="yt-video-add"
          onClick={async () => {
            setBusy(true);
            setMsg(null);
            const r = await post(texts, { action: 'video.add', channelId, link, title, publishedOn: day, products });
            setBusy(false);
            if (!r.ok) return setMsg({ ok: false, text: r.text });
            showToast({ text: w.added, tone: 'ok' });
            setLink('');
            setTitle('');
            setDay('');
            setProducts('');
            router.refresh();
          }}
        >
          {w.add}
        </button>
      </span>
      <Note msg={msg} testId="yt-video-msg" />
    </div>
  );
}

/** Changes a video's title and products. */
export function YoutubeVideoEdit({ texts, id, title: t0, products: p0, w }: { texts: YoutubeFormTexts; id: string; title: string; products: string; w: { title: string; products: string; save: string; saved: string } }) {
  const uid = useId();
  const router = useRouter();
  const [title, setTitle] = useState(t0);
  const [products, setProducts] = useState(p0);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  return (
    <div className="mail-form a2-mt12">
      <div className="a2-fld">
        <label className="a2-lbl" htmlFor={`${uid}-t`}>
          {w.title}
        </label>
        <input id={`${uid}-t`} className="a2-inp" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div className="a2-fld">
        <label className="a2-lbl" htmlFor={`${uid}-p`}>
          {w.products}
        </label>
        <textarea id={`${uid}-p`} className="a2-inp" rows={3} value={products} onChange={(e) => setProducts(e.target.value)} data-testid="yt-edit-products" />
      </div>
      <span>
        <button
          type="button"
          className="a2-btn pri"
          disabled={busy}
          data-testid="yt-edit-save"
          onClick={async () => {
            setBusy(true);
            setMsg(null);
            const r = await post(texts, { action: 'video.update', id, title, products });
            setBusy(false);
            if (!r.ok) return setMsg({ ok: false, text: r.text });
            showToast({ text: w.saved, tone: 'ok' });
            router.refresh();
          }}
        >
          {w.save}
        </button>
      </span>
      <Note msg={msg} testId="yt-edit-msg" />
    </div>
  );
}
