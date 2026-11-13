'use client';
// S28 · PR 681 — Products › a product › Video (optional): paste a YouTube, Vimeo or Facebook link, or upload a clip. The
// product page shows a poster with a play button and loads the player only when a customer taps. A link needs its
// length (Google asks for it); the clip's length is read from the file by the browser. Off until `catalogue.video` is on.
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { parseVideoLink } from '@extas/catalogue/video-link';
import { call } from '../api';
import { t, type Dict } from '@/lib/i18n';
import { refusalText } from './model';
import { say, sayBad } from './useToast';

export interface VideoPanelProps {
  dict: Dict;
  productId: string;
  on: boolean;
  allowUpload: boolean;
  canWrite: boolean;
  maxUploadMb: number;
  video: { source: 'LINK' | 'FILE'; provider: string; url: string | null; durationSec: number | null; titleEn: string | null } | null;
  settingsHref: string;
}

const PROVIDER = { YOUTUBE: 'YouTube', VIMEO: 'Vimeo', FACEBOOK: 'Facebook', FILE: '' } as const;

/** The length of a clip, read by the browser from the file itself (whole seconds), or null. */
function clipLength(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const v = document.createElement('video');
    const url = URL.createObjectURL(file);
    v.preload = 'metadata';
    v.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(Number.isFinite(v.duration) && v.duration > 0 ? Math.max(1, Math.round(v.duration)) : null);
    };
    v.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    v.src = url;
  });
}

export function VideoPanel(p: VideoPanelProps) {
  const d = p.dict;
  const router = useRouter();
  const [mode, setMode] = useState<'link' | 'file'>('link');
  const [url, setUrl] = useState('');
  const [dur, setDur] = useState(String(p.video?.durationSec ?? ''));
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const api = `/api/admin/products/${p.productId}/video`;
  const parsed = url.trim() ? parseVideoLink(url) : null;

  const done = (ok: string, a: { status: number; data: Record<string, unknown> & { error?: string; details?: string[] } }) => {
    if (a.status !== 200) return sayBad(refusalText(d, a.data.error, a.data.details));
    say(ok);
    setUrl('');
    router.refresh();
  };

  const saveLink = async () => {
    setBusy(true);
    try {
      done(t(d, 'products.vid.saved'), await call('PUT', api, { url: url.trim(), ...(Number(dur) > 0 ? { durationSec: Number(dur) } : {}) }));
    } finally {
      setBusy(false);
    }
  };
  const upload = async (f: File) => {
    setBusy(true);
    try {
      const length = await clipLength(f);
      const form = new FormData();
      form.append('file', f);
      if (length) form.append('durationSec', String(length));
      let a;
      try {
        const res = await fetch(api, { method: 'POST', body: form, credentials: 'same-origin' });
        a = { status: res.status, data: (await res.json().catch(() => ({ error: 'server-error' }))) as Record<string, unknown> & { error?: string; details?: string[] } };
      } catch {
        a = { status: 0, data: { error: 'network' } };
      }
      done(t(d, 'products.vid.saved'), a);
    } finally {
      setBusy(false);
    }
  };
  const saveDur = async () => {
    const n = Number(dur);
    if (!(n > 0)) return;
    done(t(d, 'products.vid.lengthSaved'), await call('PATCH', api, { durationSec: n }));
  };
  const remove = async () => {
    if (!window.confirm(t(d, 'products.vid.confirmRemove'))) return;
    done(t(d, 'products.vid.removed'), await call('DELETE', api));
  };

  return (
    <div className="pm-video" data-testid="video-panel">
      <div className="ad-label">{t(d, 'products.vid.title')}</div>
      <p className="ad-mini">{t(d, 'products.vid.help')}</p>
      {!p.on ? (
        <p className="ad-mini" data-testid="video-off">
          {t(d, 'products.vid.off')} <a href={p.settingsHref}>{t(d, 'products.vid.turnOn')}</a>
        </p>
      ) : (
        <>
          {p.video ? (
            <div className="pm-vcur" data-testid="video-current">
              <b>{p.video.source === 'FILE' ? t(d, 'products.vid.yourClip') : PROVIDER[p.video.provider as keyof typeof PROVIDER] || p.video.provider}</b>
              {p.video.url ? <span className="ad-mini pm-vurl">{p.video.url}</span> : null}
              <label className="pm-vlen">
                <span className="ad-mini">{t(d, 'products.vid.length')}</span>
                <input
                  className="ad-input"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  value={dur}
                  onChange={(e) => setDur(e.target.value)}
                  onBlur={saveDur}
                  disabled={!p.canWrite}
                />
              </label>
              {p.canWrite ? (
                <button type="button" className="ad-btn-sm" onClick={remove}>
                  {t(d, 'products.vid.remove')}
                </button>
              ) : null}
            </div>
          ) : null}
          {p.canWrite ? (
            <div className="pm-vadd">
              <div className="pm-chips" role="tablist">
                <button type="button" role="tab" aria-selected={mode === 'link'} className={`pm-chip${mode === 'link' ? ' on' : ''}`} onClick={() => setMode('link')}>
                  {t(d, 'products.vid.paste')}
                </button>
                {p.allowUpload ? (
                  <button type="button" role="tab" aria-selected={mode === 'file'} className={`pm-chip${mode === 'file' ? ' on' : ''}`} onClick={() => setMode('file')}>
                    {t(d, 'products.vid.uploadClip')}
                  </button>
                ) : null}
              </div>
              {mode === 'link' ? (
                <div className="pm-vrow">
                  <input
                    className="ad-input"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://www.youtube.com/watch?v=…  ·  vimeo.com/…  ·  facebook.com/…/videos/…"
                    aria-label={t(d, 'products.vid.paste')}
                  />
                  <input
                    className="ad-input pm-vnum"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    value={dur}
                    onChange={(e) => setDur(e.target.value)}
                    placeholder={t(d, 'products.vid.length')}
                    aria-label={t(d, 'products.vid.length')}
                  />
                  <button type="button" className="ad-btn" disabled={busy || !parsed || !(Number(dur) > 0)} onClick={saveLink}>
                    {t(d, 'products.vid.useLink')}
                  </button>
                  <span className="ad-mini">{url.trim() && !parsed ? t(d, 'products.vid.badLink') : t(d, 'products.vid.providers')}</span>
                </div>
              ) : (
                <div className="pm-vrow">
                  <input
                    ref={file}
                    className="pa-file"
                    type="file"
                    accept="video/mp4,video/quicktime,video/webm"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      e.target.value = '';
                      if (f) void upload(f);
                    }}
                  />
                  <button type="button" className="ad-btn" disabled={busy} onClick={() => file.current?.click()}>
                    {busy ? t(d, 'products.photos.uploading') : t(d, 'products.vid.chooseClip')}
                  </button>
                  <span className="ad-mini">{t(d, 'products.vid.clipHelp', { mb: p.maxUploadMb })}</span>
                </div>
              )}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
