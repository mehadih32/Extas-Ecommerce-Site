'use client';
// S28 · PR 680 — easy photo handling (prototype v5, Products › a product › Photos & video): drag many photos in, paste
// one, or choose them; they go to the colour picked above. Reorder by dragging (or ◀ ▶), set the main photo, tag a
// colour, write the alt text. When the plain photo checks are on (`media.quality`) each photo shows what is wrong, with
// a one-click fix for the shape and the light. Everything goes through the media API; no AI is called.
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ImageSource } from '@extas/media/delivery';
import type { ProductPhoto, QualityIssue } from '@extas/media';
import { call } from '../api';
import { ResponsiveImage, altFor } from '@/components/media/ResponsiveImage';
import { t, type Dict } from '@/lib/i18n';
import { dropOnto, groupOf, imageFiles, move, NOTE_TONE, roleForNext } from './photo-manager-model';
import { refusalText, type Lang } from './model';
import { say, sayBad } from './useToast';
import './photo-manager.css';

export interface PhotoNotes {
  on: boolean;
  /** by ProductMedia id */
  byLink: Record<
    string,
    {
      issues: QualityIssue[];
      fixable: QualityIssue[];
      width: number;
      height: number;
    } | null
  >;
}

export interface PhotoManagerProps {
  dict: Dict;
  lang: Lang;
  productId: string;
  colours: { id: string; label: string; hex: string | null }[];
  photos: ProductPhoto[];
  images: Record<string, ImageSource>;
  notes: PhotoNotes;
  canUpload: boolean;
  /** Where the photo checks' numbers are changed. */
  settingsHref?: string;
}

const NONE = '';

export function PhotoManager(p: PhotoManagerProps) {
  const { dict: d, lang } = p;
  const router = useRouter();
  const [colour, setColour] = useState<string>(p.colours[0]?.id ?? NONE);
  const [busy, setBusy] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const url = `/api/admin/media/products/${p.productId}`;
  const colourId = colour === NONE ? null : colour;
  const group = groupOf(p.photos, colourId);

  const post = async (body: Record<string, unknown>, ok?: string) => {
    const a = await call('POST', url, body);
    if (a.status !== 200) {
      sayBad(refusalText(d, a.data.error, a.data.details));
      return false;
    }
    if (ok) say(ok);
    router.refresh();
    return true;
  };

  const upload = async (files: File[]) => {
    if (!p.canUpload || !files.length) return;
    setBusy('upload');
    let placed = 0;
    let count = group.length;
    try {
      for (const file of files) {
        const form = new FormData();
        form.append('file', file);
        let up: {
          ok?: boolean;
          error?: string;
          details?: string[];
          asset?: { id: string };
        };
        try {
          const res = await fetch('/api/admin/media', {
            method: 'POST',
            body: form,
            credentials: 'same-origin',
          });
          up = (await res.json().catch(() => ({ ok: false, error: 'server-error' }))) as typeof up;
        } catch {
          up = { ok: false, error: 'network' };
        }
        if (!up.ok || !up.asset) {
          sayBad(`${file.name}: ${refusalText(d, up.error, up.details)}`);
          continue;
        }
        const a = await call('POST', url, {
          action: 'attach',
          assetId: up.asset.id,
          role: roleForNext(count),
          colourId,
          isPrimary: count === 0,
        });
        if (a.status !== 200) sayBad(refusalText(d, a.data.error, a.data.details));
        else {
          placed++;
          count++;
        }
      }
      if (placed) say(t(d, 'products.pm.added', { count: placed }));
      router.refresh();
    } finally {
      setBusy(null);
    }
  };

  // paste a picture (Ctrl+V) anywhere on the page while the manager is on screen
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files = imageFiles(e.clipboardData?.files);
      if (files.length) {
        e.preventDefault();
        void upload(files);
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  });

  const reorder = (ids: string[]) => post({ action: 'reorder', colourId, orderedIds: ids });
  const ids = group.map((g) => g.id);

  const saveAlt = async (assetId: string, value: string) => {
    const a = await call('PATCH', `/api/admin/media/${assetId}`, lang === 'bn' ? { altBn: value } : { altEn: value });
    if (a.status !== 200) sayBad(refusalText(d, a.data.error, a.data.details));
    else say(t(d, 'products.pm.altSaved'));
  };

  const fix = async (id: string) => {
    setBusy(`fix:${id}`);
    try {
      await post({ action: 'fix', productMediaId: id }, t(d, 'products.pm.fixed'));
    } finally {
      setBusy(null);
    }
  };

  const takeOff = async (id: string) => {
    if (!window.confirm(t(d, 'products.photos.confirmOff'))) return;
    setBusy(`off:${id}`);
    try {
      await post({ action: 'detach', productMediaId: id }, t(d, 'products.photos.removed'));
    } finally {
      setBusy(null);
    }
  };

  const bad = group.filter((g) => (p.notes.byLink[g.id]?.issues.length ?? 0) > 0).length;

  return (
    <div className="pm" data-testid="photo-manager">
      {p.colours.length ? (
        <div className="pm-chips" role="tablist" aria-label={t(d, 'products.pm.colour')}>
          {p.colours.map((c) => (
            <button key={c.id} type="button" role="tab" aria-selected={c.id === colour} className={`pm-chip${c.id === colour ? ' on' : ''}`} onClick={() => setColour(c.id)}>
              <span className="pm-sw" style={c.hex ? { background: c.hex } : undefined} aria-hidden="true" />
              {c.label}
              <span className="pm-n">{groupOf(p.photos, c.id).length}</span>
            </button>
          ))}
          <button type="button" role="tab" aria-selected={colour === NONE} className={`pm-chip${colour === NONE ? ' on' : ''}`} onClick={() => setColour(NONE)}>
            {t(d, 'products.pm.allColours')}
            <span className="pm-n">{groupOf(p.photos, null).length}</span>
          </button>
        </div>
      ) : null}

      {p.canUpload ? (
        <div
          className={`pm-drop${over ? ' over' : ''}`}
          onDragOver={(e) => {
            if (e.dataTransfer.types.includes('Files')) {
              e.preventDefault();
              setOver(true);
            }
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            setOver(false);
            const files = imageFiles(e.dataTransfer.files);
            if (files.length) {
              e.preventDefault();
              void upload(files);
            }
          }}
        >
          <b>{t(d, 'products.pm.dropTitle')}</b>
          <span className="ad-mini">{t(d, 'products.pm.dropHelp')}</span>
          <input
            ref={fileRef}
            className="pa-file"
            type="file"
            accept="image/*"
            multiple
            onChange={(e) => {
              void upload(imageFiles(e.target.files));
              e.target.value = '';
            }}
          />
          <button type="button" className="ad-btn" disabled={busy === 'upload'} onClick={() => fileRef.current?.click()}>
            {busy === 'upload' ? t(d, 'products.photos.uploading') : t(d, 'products.pm.choose')}
          </button>
        </div>
      ) : (
        <p className="ad-mini">{t(d, 'products.photos.noUpload')}</p>
      )}

      {p.notes.on ? (
        <p className="ad-mini pm-sum" data-testid="pm-summary">
          {bad ? t(d, 'products.pm.needLook', { count: bad }) : t(d, 'products.pm.allGood')}
        </p>
      ) : (
        <p className="ad-mini pm-sum">
          {t(d, 'products.pm.checksOff')} {p.settingsHref ? <a href={p.settingsHref}>{t(d, 'products.pm.checksSet')}</a> : null}
        </p>
      )}

      {group.length ? (
        <>
          <div className="pm-grid">
            {group.map((g, i) => {
              const img = p.images[g.assetId];
              const n = p.notes.byLink[g.id];
              return (
                <div
                  key={g.id}
                  className={`pm-card${dragId === g.id ? ' drag' : ''}`}
                  draggable={p.canUpload}
                  onDragStart={() => setDragId(g.id)}
                  onDragEnd={() => setDragId(null)}
                  onDragOver={(e) => {
                    if (dragId) e.preventDefault();
                  }}
                  onDrop={(e) => {
                    if (dragId) {
                      e.preventDefault();
                      const next = dropOnto(ids, dragId, g.id);
                      setDragId(null);
                      void reorder(next);
                    }
                  }}
                  data-testid="pm-card"
                >
                  <div className="pm-img">
                    {img ? (
                      <ResponsiveImage image={img} slot="thumb" sizes="(max-width: 767px) 45vw, 160px" alt={altFor(img, lang, t(d, `products.photos.kinds.${g.role}`))} />
                    ) : (
                      <span className="ad-mini">{t(d, 'products.photos.processing')}</span>
                    )}
                    {i === 0 ? <span className="pm-main">{t(d, 'products.pm.main')}</span> : null}
                    {n ? (
                      <span className="pm-px">
                        {n.width}×{n.height}
                      </span>
                    ) : null}
                  </div>
                  {n ? (
                    <div className="pm-notes">
                      {n.issues.length ? (
                        n.issues.map((k) => (
                          <span key={k} className={`pm-note ${NOTE_TONE[k]}`}>
                            {t(d, `products.pm.note.${k}`)}
                          </span>
                        ))
                      ) : (
                        <span className="pm-note ok">✓ {t(d, 'products.pm.good')}</span>
                      )}
                      {n.fixable.length ? (
                        <button type="button" className="ad-btn-sm" disabled={busy === `fix:${g.id}`} onClick={() => fix(g.id)}>
                          {t(d, 'products.pm.fix')}
                        </button>
                      ) : null}
                      {n.issues.some((k) => !n.fixable.includes(k)) ? <span className="ad-mini">{t(d, 'products.pm.needNew')}</span> : null}
                    </div>
                  ) : null}
                  <input
                    className="ad-input pm-alt"
                    defaultValue={img ? altFor(img, lang, '') : ''}
                    placeholder={t(d, 'products.pm.alt')}
                    aria-label={t(d, 'products.pm.alt')}
                    disabled={!p.canUpload}
                    onBlur={(e) => {
                      if (img && e.target.value !== altFor(img, lang, '')) void saveAlt(g.assetId, e.target.value);
                    }}
                  />
                  {p.canUpload ? (
                    <div className="pm-acts">
                      {i === 0 ? null : (
                        <button type="button" className="ad-btn-sm" onClick={() => reorder([g.id, ...ids.filter((x) => x !== g.id)])}>
                          {t(d, 'products.pm.setMain')}
                        </button>
                      )}
                      <button type="button" className="ad-btn-sm" disabled={i === 0} aria-label={t(d, 'products.pm.earlier')} onClick={() => reorder(move(ids, g.id, -1))}>
                        ◀
                      </button>
                      <button
                        type="button"
                        className="ad-btn-sm"
                        disabled={i === group.length - 1}
                        aria-label={t(d, 'products.pm.later')}
                        onClick={() => reorder(move(ids, g.id, 1))}
                      >
                        ▶
                      </button>
                      {p.colours.length ? (
                        <select
                          className="pa-kind"
                          aria-label={t(d, 'products.pm.colour')}
                          value={g.colourId ?? NONE}
                          onChange={(e) =>
                            post({
                              action: 'tag',
                              productMediaId: g.id,
                              colourId: e.target.value || null,
                            })
                          }
                        >
                          <option value={NONE}>{t(d, 'products.pm.allColours')}</option>
                          {p.colours.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.label}
                            </option>
                          ))}
                        </select>
                      ) : null}
                      <button type="button" className="pa-link" disabled={busy === `off:${g.id}`} onClick={() => takeOff(g.id)}>
                        {t(d, 'products.photos.remove')}
                      </button>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
          <p className="ad-mini">{t(d, 'products.pm.dragHelp')}</p>
        </>
      ) : (
        <p className="ad-mini pm-empty">{t(d, 'products.pm.empty')}</p>
      )}
    </div>
  );
}
