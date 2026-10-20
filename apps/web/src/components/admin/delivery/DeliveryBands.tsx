'use client';
// S06 · PR 550 — the "Three delivery bands" card (demo 92-admin-couriers.js zk_bandsCard): each band with its name in
// both languages, the charge (or "not set yet" while it is off), the delivery hours and, for the sub-area band, what it
// is charged as. "Change" opens the band's sheet (demo Settings › Delivery rows: charge, hours, the sub-area mode); the
// sheet is shown only to people who hold `delivery.charges`, and the server checks it again.
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import type { BandView } from '@extas/delivery';
import { t, type Dict } from '@/lib/i18n';
import { call } from '../api';
import { Icon } from '../Icon';
import type { Money } from '../products/model';
import { useToast } from '../products/useToast';
import { bandForm, bandPatch, chargedAsText, chargeText, hoursText, nameOf, otherName, refusalText, type BandForm, type Lang } from './model';

interface Props {
  dict: Dict;
  lang: Lang;
  locale: string;
  money: Money;
  bands: BandView[];
  canEdit: boolean;
}

export function DeliveryBands({ dict: d, lang, locale, money, bands, canEdit }: Props) {
  const [open, setOpen] = useState<BandView | null>(null);
  const [toast, say] = useToast();
  const router = useRouter();
  const opener = useRef<HTMLButtonElement | null>(null);

  const close = () => setOpen(null);

  return (
    <section className="ad-card dl-card" aria-labelledby="dl-bands-h">
      <h2 id="dl-bands-h">{t(d, 'delivery.bands.title')}</h2>
      <p className="ad-sub">{t(d, 'delivery.bands.sub')}</p>
      {bands.length ? (
        <ul className="dl-bands">
          {bands.map((b) => {
            const folded = chargedAsText(d, b);
            const shown = b.chargedAs.id === b.id ? b : (bands.find((x) => x.id === b.chargedAs.id) ?? b);
            return (
              <li key={b.id} className={`dl-band${b.enabled ? '' : ' off'}`} data-testid="dl-band">
                <div className="dl-band-name">{nameOf(lang, b)}</div>
                <div className="ad-mini dl-band-other" lang={lang === 'bn' ? 'en' : 'bn'}>
                  {otherName(lang, b)}
                </div>
                <div className={`dl-band-v${shown.enabled ? '' : ' unset'}`}>{chargeText(d, shown, money)}</div>
                <div className="ad-mini">
                  {hoursText(d, shown, locale)}
                  {folded ? `${t(d, 'delivery.sep')}${folded}` : ''}
                </div>
                {b.role === 'subArea' ? <div className="ad-mini">{t(d, 'delivery.bands.listed', { n: String(b.listed) })}</div> : null}
                <div className="dl-band-foot">
                  {canEdit ? (
                    <button
                      type="button"
                      className="ad-btn ad-btn-ghost ad-btn-sm"
                      onClick={(e) => {
                        opener.current = e.currentTarget;
                        setOpen(b);
                      }}
                      aria-label={`${t(d, 'delivery.bands.change')}: ${nameOf(lang, b)}`}
                    >
                      {t(d, 'delivery.bands.change')}
                    </button>
                  ) : null}
                  <span className={`dl-pill${b.enabled ? ' on' : ''}`}>{t(d, b.enabled ? 'delivery.bands.on' : 'delivery.bands.off')}</span>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="ad-mini">{t(d, 'delivery.bands.none')}</p>
      )}
      {bands.some((b) => !b.enabled) ? (
        <div className="ad-note">
          <Icon name="info" size={16} />
          <div>{t(d, 'delivery.bands.offNote')}</div>
        </div>
      ) : null}
      <p className="ad-mini dl-note">{t(d, 'delivery.bands.note')}</p>
      {open ? (
        <BandSheet
          dict={d}
          lang={lang}
          money={money}
          band={open}
          opener={opener}
          onClose={close}
          onSaved={(b) => {
            close();
            say(t(d, 'delivery.edit.saved', { name: nameOf(lang, b) }));
            router.refresh();
          }}
        />
      ) : null}
      {toast ? (
        <div className="ad-toast" role="status">
          {toast}
        </div>
      ) : null}
    </section>
  );
}

interface SheetProps {
  dict: Dict;
  lang: Lang;
  money: Money;
  band: BandView;
  /** The button that opened the sheet: it gets the focus back when the sheet closes. */
  opener: RefObject<HTMLButtonElement | null>;
  onClose: () => void;
  onSaved: (b: BandView) => void;
}

function BandSheet({ dict: d, lang, money, band: b, opener, onClose, onSaved }: SheetProps) {
  const [form, setForm] = useState<BandForm>(() => bandForm(b, money));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const box = useRef<HTMLDivElement>(null);
  const set = (patch: Partial<BandForm>) => setForm((f) => ({ ...f, ...patch }));

  // While the sheet is open the page behind it is inert (no tap, no Tab, no screen reader); the sheet itself sits
  // outside it, at the end of the body. Closing gives the page back and the focus to the button that opened it.
  useEffect(() => {
    const page = document.querySelector<HTMLElement>('.ad:not(.dl-portal)');
    const back = opener.current;
    box.current?.querySelector<HTMLElement>('input')?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    if (page) page.inert = true;
    return () => {
      document.body.style.overflow = prev;
      if (page) page.inert = false;
      back?.focus();
    };
  }, [opener]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const { patch, error: bad } = bandPatch(b, form, money);
    if (bad) {
      setError(t(d, `delivery.errors.${bad}`));
      return;
    }
    if (!Object.keys(patch).length) {
      onClose();
      return;
    }
    setBusy(true);
    setError('');
    const a = await call('PATCH', `/api/admin/delivery/bands/${encodeURIComponent(b.id)}`, patch);
    setBusy(false);
    if (a.status === 200) onSaved(a.data.band as BandView);
    else setError(refusalText(d, a.data.error, a.data.details));
  };

  /** Escape closes; Tab stays inside the sheet. */
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== 'Tab' || !box.current) return;
    const items = [...box.current.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled])')];
    const first = items[0];
    const last = items[items.length - 1];
    if (!first || !last) return;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  const symbol = money.currency;
  return createPortal(
    <div className="ad dl-portal" lang={lang}>
      <div className="ad-modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
        <div className="ad-modal" role="dialog" aria-modal="true" aria-labelledby="dl-sheet-h" ref={box} onKeyDown={onKey}>
          <div className="ad-modal-hd">
            <h2 id="dl-sheet-h">{t(d, 'delivery.edit.title', { name: nameOf(lang, b) })}</h2>
            <button type="button" className="ad-iconbtn" aria-label={t(d, 'delivery.edit.close')} onClick={onClose}>
              <Icon name="close" />
            </button>
          </div>
          <form className="ad-modal-bd" onSubmit={submit} noValidate autoComplete="off">
            <div className="ad-modal-desc">{t(d, 'delivery.edit.desc')}</div>
            <div>
              <label className="ad-label" htmlFor="dl-charge">
                {t(d, 'delivery.edit.charge', { currency: symbol })}
              </label>
              <input id="dl-charge" className="ad-input" inputMode="decimal" value={form.charge} onChange={(e) => set({ charge: e.target.value })} aria-describedby="dl-charge-help" />
              <div className="ad-mini dl-help" id="dl-charge-help">
                {t(d, 'delivery.edit.chargeHelp')}
              </div>
            </div>
            <div className="dl-two">
              <div>
                <label className="ad-label" htmlFor="dl-hmin">
                  {t(d, 'delivery.edit.hoursMin')}
                </label>
                <input id="dl-hmin" className="ad-input" inputMode="numeric" value={form.hoursMin} onChange={(e) => set({ hoursMin: e.target.value })} aria-describedby="dl-hours-help" />
              </div>
              <div>
                <label className="ad-label" htmlFor="dl-hmax">
                  {t(d, 'delivery.edit.hoursMax')}
                </label>
                <input id="dl-hmax" className="ad-input" inputMode="numeric" value={form.hoursMax} onChange={(e) => set({ hoursMax: e.target.value })} aria-describedby="dl-hours-help" />
              </div>
              <div className="ad-mini dl-help dl-span" id="dl-hours-help">
                {t(d, 'delivery.edit.hoursHelp')}
              </div>
            </div>
            {b.role === 'subArea' ? (
              <div>
                <label className="ad-label" htmlFor="dl-mode">
                  {t(d, 'delivery.edit.mode')}
                </label>
                <select id="dl-mode" className="ad-input" value={form.mode} onChange={(e) => set({ mode: e.target.value })}>
                  {(['own', 'city', 'outside'] as const).map((m) => (
                    <option key={m} value={m}>
                      {t(d, `delivery.edit.modes.${m}`)}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            <label className="dl-check">
              <input type="checkbox" checked={form.enabled} onChange={(e) => set({ enabled: e.target.checked })} />
              <span>{t(d, 'delivery.edit.enabled')}</span>
            </label>
            {error ? (
              <p className="ad-modal-err" role="alert">
                {error}
              </p>
            ) : null}
            <div className="ad-modal-acts">
              <button type="button" className="ad-btn ad-btn-ghost" onClick={onClose}>
                {t(d, 'delivery.edit.cancel')}
              </button>
              <button type="submit" className="ad-btn ad-btn-primary" disabled={busy}>
                {t(d, 'delivery.edit.save')}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>,
    document.body,
  );
}
