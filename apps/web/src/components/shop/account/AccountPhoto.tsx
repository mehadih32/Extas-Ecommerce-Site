'use client';
// PR 133 — the profile photo (demo 60-account.js acc_photoCard, CHANGE['acc-photo'], note 52): picked on this device,
// cropped square from the middle and shrunk to `account.photo.sizePx` on a canvas, and kept only in this browser
// (localStorage, per account) — the file never leaves the phone, so nothing is uploaded or stored on the server. Every
// round picture of My account shows it; without one, the initials. Off until the owner turns it on (`account.photo`).
import { useEffect, useState } from 'react';
import { Icon } from '../Icon';

const KEY = (customerId: string) => `extas.account.photo.${customerId}`;
const EVENT = 'extas:account-photo';
const JPEG_QUALITY = 0.82;

function readPhoto(customerId: string): string | null {
  try {
    const v = window.localStorage.getItem(KEY(customerId));
    return v && v.startsWith('data:image/') ? v : null;
  } catch {
    return null;
  }
}

/** The photo kept for this account in this browser (null: none, or the browser keeps nothing), live across the page. */
function usePhoto(customerId: string, on: boolean): string | null {
  const [photo, setPhoto] = useState<string | null>(null);
  useEffect(() => {
    if (!on) return;
    const read = () => setPhoto(readPhoto(customerId));
    read();
    window.addEventListener(EVENT, read);
    window.addEventListener('storage', read);
    return () => {
      window.removeEventListener(EVENT, read);
      window.removeEventListener('storage', read);
    };
  }, [customerId, on]);
  return on ? photo : null;
}

/** The round picture: his photo when this browser keeps one, else the initials (or the person mark). */
export function Avatar({ initials, customerId, photoOn, small = false }: { initials: string; customerId: string; photoOn: boolean; small?: boolean }) {
  const photo = usePhoto(customerId, photoOn);
  return (
    <span className={`acc-avatar${small ? ' sm' : ''}${photo ? ' has-photo' : ''}`} data-acc-avatar="">
      {photo ? (
        // a data: URL made on this device; next/image has nothing to optimise here
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photo} alt="" />
      ) : initials ? (
        initials
      ) : (
        <Icon name="user" size={small ? 18 : 22} />
      )}
    </span>
  );
}

export type PhotoWords = Record<string, string>;

/** Profile's photo card: pick, change or remove. */
export function PhotoCard({ words, customerId, initials, maxMb, sizePx }: { words: PhotoWords; customerId: string; initials: string; maxMb: number; sizePx: number }) {
  const w = (k: string) => (words[k] ?? k).replace('{mb}', String(maxMb));
  const photo = usePhoto(customerId, true);
  const [err, setErr] = useState<string | null>(null);
  const [said, setSaid] = useState<string | null>(null);

  const save = (v: string | null) => {
    try {
      if (v) window.localStorage.setItem(KEY(customerId), v);
      else window.localStorage.removeItem(KEY(customerId));
      window.dispatchEvent(new Event(EVENT));
      setSaid(w(v ? 'photo.saved' : 'photo.removed'));
    } catch {
      setErr(w('photo.errSave'));
    }
  };

  const pick = (input: HTMLInputElement) => {
    const f = input.files?.[0];
    setErr(null);
    setSaid(null);
    if (!f) return;
    input.value = '';
    if (!f.type.startsWith('image/')) return setErr(w('photo.errType'));
    if (f.size > maxMb * 1024 * 1024) return setErr(w('photo.errBig'));
    const url = URL.createObjectURL(f);
    const img = new Image();
    img.onerror = () => {
      URL.revokeObjectURL(url);
      setErr(w('photo.errRead'));
    };
    img.onload = () => {
      URL.revokeObjectURL(url);
      try {
        const side = Math.min(img.naturalWidth, img.naturalHeight);
        const cv = document.createElement('canvas');
        cv.width = sizePx;
        cv.height = sizePx;
        // a square from the middle, so a portrait photo is not squashed
        cv.getContext('2d')?.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, sizePx, sizePx);
        save(cv.toDataURL('image/jpeg', JPEG_QUALITY));
      } catch {
        setErr(w('photo.errSave'));
      }
    };
    img.src = url;
  };

  return (
    <section className="card p20 acc-ph" aria-labelledby="pf-ph" data-testid="acc-photo">
      <div className="acc-ph-row">
        <label className="acc-ph-pic" htmlFor="pf-photo" title={w(photo ? 'photo.change' : 'photo.upload')}>
          {photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photo} alt={w('photo.alt')} />
          ) : (
            <span className="acc-ph-ini">{initials || <Icon name="user" size={30} />}</span>
          )}
          <span className="acc-ph-cam">
            <Icon name="camera" size={16} />
          </span>
        </label>
        <div className="grow">
          <h2 className="h3" id="pf-ph">
            {w('photo.title')}
          </h2>
          <p className="xs text2 acc-ph-note">{w('photo.note')}</p>
          <div className="row wrap acc-ph-btns">
            <label className="btn btn-secondary btn-sm acc-ph-pick" htmlFor="pf-photo">
              <Icon name="camera" size={15} />
              {w(photo ? 'photo.change' : 'photo.upload')}
            </label>
            {photo ? (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => save(null)} data-testid="acc-photo-rm">
                <Icon name="trash" size={15} />
                {w('photo.remove')}
              </button>
            ) : null}
          </div>
          <div role="alert">
            {err ? (
              <div className="acc-err">
                <Icon name="info" size={16} />
                <span>{err}</span>
              </div>
            ) : null}
          </div>
          <div role="status" className="sr">
            {said}
          </div>
        </div>
      </div>
      <input id="pf-photo" className="acc-ph-input" type="file" accept="image/*" onChange={(e) => pick(e.currentTarget)} data-testid="acc-photo-input" />
    </section>
  );
}
