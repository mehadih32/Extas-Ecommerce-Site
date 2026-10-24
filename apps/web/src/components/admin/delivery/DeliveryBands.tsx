'use client';
// S06 · PR 550 — the three delivery bands; PR 502 — on the new admin shell (demo V12.3 #/admin/delivery/zones: the three
// band cards in a row). Each card: the band's name in both languages, on or off, the charge (or "not set yet" while it is
// off), the delivery hours, the cash-on-delivery limit and, for the sub-area band, what it is charged as, how many places
// are on the owner's list and its own on/off switch (off = its places go by the map). "Change" opens the band's drawer:
// the charge, the COD limit, the hours, the sub-area choice and on/off. Changing needs `delivery.charges`; the server
// checks it again, and a band never goes on with a charge nobody typed.
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import type { BandView } from '@extas/delivery';
import { t, type Dict } from '@/lib/i18n';
import { call } from '../api';
import type { Money } from '../products/model';
import { Drawer } from '../shell/Drawer';
import { ShellIcon } from '../shell/ShellIcon';
import { bandForm, bandPatch, chargedAsText, chargeText, codText, hoursText, nameOf, otherName, refusalText, type BandForm, type Lang } from './model';

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
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<{ text: string; bad: boolean } | null>(null);
  const router = useRouter();
  const hasSub = bands.some((b) => b.role === 'subArea');

  const switchSub = async (b: BandView) => {
    setBusy(true);
    setSaid(null);
    const a = await call('PATCH', `/api/admin/delivery/bands/${encodeURIComponent(b.id)}`, { enabled: !b.enabled });
    setBusy(false);
    if (a.status === 200) {
      setSaid({ text: t(d, b.enabled ? 'delivery.bands.subTurnedOff' : 'delivery.bands.subTurnedOn'), bad: false });
      router.refresh();
    } else setSaid({ text: a.data.error === 'CHARGE_REQUIRED' ? t(d, 'delivery.bands.needCharge') : refusalText(d, a.data.error, a.data.details), bad: true });
  };

  return (
    <section className="a2-sc" aria-labelledby="dl-bands-h" data-testid="dz-bands">
      <div className="a2-sch">
        <div>
          <h2 className="a2-h3" id="dl-bands-h">
            {t(d, 'delivery.bands.title')}
          </h2>
          <p className="a2-scd">{t(d, 'delivery.bands.sub')}</p>
        </div>
      </div>
      {bands.length ? (
        <div className="a2-row a2-r3 a2-mt12">
          {bands.map((b) => {
            const folded = chargedAsText(d, b);
            const shown = b.chargedAs.id === b.id ? b : (bands.find((x) => x.id === b.chargedAs.id) ?? b);
            const sub = b.role === 'subArea';
            return (
              <div key={b.id} className={`a2-card tight dz-band${b.enabled ? '' : ' off'}`} data-testid="dl-band" data-band={b.key}>
                <div className="a2-between">
                  <b className="a2-h4">{nameOf(lang, b)}</b>
                  <span className={`a2-pill${b.enabled ? ' ok' : ''}`}>{t(d, b.enabled ? 'delivery.bands.on' : 'delivery.bands.off')}</span>
                </div>
                {otherName(lang, b) ? (
                  <div className="a2-xs a2-mute" lang={lang === 'bn' ? 'en' : 'bn'}>
                    {otherName(lang, b)}
                  </div>
                ) : null}
                <div className={`dz-v${shown.enabled ? '' : ' unset'}`}>{chargeText(d, shown, money)}</div>
                <div className="a2-xs a2-mute">
                  {hoursText(d, shown, locale)}
                  {folded ? `${t(d, 'delivery.sep')}${folded}` : ''}
                </div>
                <div className="a2-xs a2-mute">{codText(d, b, money)}</div>
                {sub ? (
                  <>
                    <div className="a2-xs a2-mute">{t(d, 'delivery.bands.listed', { n: String(b.listed) })}</div>
                    <div className="a2-swl a2-mt6">
                      <span>
                        {t(d, 'delivery.bands.subSwitch')}
                        <span className="a2-xs a2-mute a2-blk">{b.enabled ? '' : t(d, 'delivery.bands.subOffNote')}</span>
                      </span>
                      <button type="button" className={`a2-sw${b.enabled ? ' on' : ''}`} role="switch" aria-checked={b.enabled} aria-label={t(d, 'delivery.bands.subSwitch')} disabled={!canEdit || busy} onClick={() => void switchSub(b)} data-testid="dz-sub-switch" />
                    </div>
                  </>
                ) : null}
                {canEdit ? (
                  <div className="dz-foot">
                    <button type="button" className="a2-btn" onClick={() => setOpen(b)} aria-label={`${t(d, 'delivery.bands.change')}: ${nameOf(lang, b)}`} data-testid="dz-band-change">
                      {t(d, 'delivery.bands.change')}
                    </button>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="a2-sm a2-mute a2-mt12">{t(d, 'delivery.bands.none')}</p>
      )}
      {hasSub ? <p className="a2-xs a2-mute">{t(d, 'delivery.bands.subSwitchHelp')}</p> : null}
      {bands.some((b) => !b.enabled && b.role !== 'subArea') ? (
        <div className="a2-note">
          <ShellIcon name="info" size={15} />
          <span>{t(d, 'delivery.bands.offNote')}</span>
        </div>
      ) : null}
      <p className="a2-xs a2-mute a2-mt6">{t(d, 'delivery.bands.note')}</p>
      <div className={`a2-sm dz-status${said?.bad ? '' : ' a2-mute'}`} role="status" aria-live="polite" data-testid="dz-bands-status">
        {said?.text ?? ''}
      </div>
      {open ? (
        <BandDrawer
          dict={d}
          lang={lang}
          money={money}
          band={open}
          onClose={() => setOpen(null)}
          onSaved={(b) => {
            setOpen(null);
            setSaid({ text: t(d, 'delivery.edit.saved', { name: nameOf(lang, b) }), bad: false });
            router.refresh();
          }}
        />
      ) : null}
    </section>
  );
}

function BandDrawer({ dict: d, lang, money, band: b, onClose, onSaved }: { dict: Dict; lang: Lang; money: Money; band: BandView; onClose(): void; onSaved(b: BandView): void }) {
  const [form, setForm] = useState<BandForm>(() => bandForm(b, money));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (patch: Partial<BandForm>) => setForm((f) => ({ ...f, ...patch }));
  const sub = b.role === 'subArea';

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (busy) return;
    const { patch, error: bad } = bandPatch(b, form, money);
    if (bad) return setError(t(d, `delivery.errors.${bad}`));
    if (!Object.keys(patch).length) return onClose();
    setBusy(true);
    setError('');
    const a = await call('PATCH', `/api/admin/delivery/bands/${encodeURIComponent(b.id)}`, patch);
    setBusy(false);
    if (a.status === 200) onSaved(a.data.band as BandView);
    else setError(refusalText(d, a.data.error, a.data.details));
  };

  const currency = money.currency;
  return (
    <Drawer
      title={t(d, 'delivery.edit.title', { name: nameOf(lang, b) })}
      sub={t(d, 'delivery.edit.desc')}
      closeLabel={t(d, 'delivery.edit.close')}
      onClose={onClose}
      testId="dz-band-drawer"
      foot={
        <>
          <button type="button" className="a2-btn" onClick={onClose}>
            {t(d, 'delivery.edit.cancel')}
          </button>
          <button type="button" className="a2-btn pri" disabled={busy} onClick={() => void submit()} data-testid="dz-band-save">
            {t(d, 'delivery.edit.save')}
          </button>
        </>
      }
    >
      <form className="dz-sec" onSubmit={submit} noValidate autoComplete="off">
        <div className="a2-fld">
          <label className="a2-lbl" htmlFor="dz-charge">
            {t(d, 'delivery.edit.charge', { currency })}
          </label>
          <input id="dz-charge" className="a2-inp" inputMode="decimal" value={form.charge} onChange={(e) => set({ charge: e.target.value })} aria-describedby="dz-charge-help" />
          <span className="a2-xs a2-mute" id="dz-charge-help">
            {t(d, 'delivery.edit.chargeHelp')}
          </span>
        </div>
        <div className="a2-fld">
          <label className="a2-lbl" htmlFor="dz-cod">
            {t(d, 'delivery.edit.codLimit', { currency })}
          </label>
          <input id="dz-cod" className="a2-inp" inputMode="decimal" value={form.codLimit} onChange={(e) => set({ codLimit: e.target.value })} aria-describedby="dz-cod-help" data-testid="dz-cod" />
          <span className="a2-xs a2-mute" id="dz-cod-help">
            {t(d, 'delivery.edit.codHelp')}
          </span>
        </div>
        <div className="a2-fg a2-mt12">
          <div className="a2-fld">
            <label className="a2-lbl" htmlFor="dz-hmin">
              {t(d, 'delivery.edit.hoursMin')}
            </label>
            <input id="dz-hmin" className="a2-inp" inputMode="numeric" value={form.hoursMin} onChange={(e) => set({ hoursMin: e.target.value })} aria-describedby="dz-hours-help" />
          </div>
          <div className="a2-fld">
            <label className="a2-lbl" htmlFor="dz-hmax">
              {t(d, 'delivery.edit.hoursMax')}
            </label>
            <input id="dz-hmax" className="a2-inp" inputMode="numeric" value={form.hoursMax} onChange={(e) => set({ hoursMax: e.target.value })} aria-describedby="dz-hours-help" />
          </div>
        </div>
        <span className="a2-xs a2-mute" id="dz-hours-help">
          {t(d, 'delivery.edit.hoursHelp')}
        </span>
        {sub ? (
          <div className="a2-fld a2-mt12">
            <label className="a2-lbl" htmlFor="dz-mode">
              {t(d, 'delivery.edit.mode')}
            </label>
            <select id="dz-mode" className="a2-sel" value={form.mode} onChange={(e) => set({ mode: e.target.value })}>
              {(['own', 'city', 'outside'] as const).map((m) => (
                <option key={m} value={m}>
                  {t(d, `delivery.edit.modes.${m}`)}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        <label className="a2-chkl a2-mt12">
          <input type="checkbox" className="a2-chk" checked={form.enabled} onChange={(e) => set({ enabled: e.target.checked })} data-testid="dz-band-on" />
          <span>{t(d, sub ? 'delivery.bands.subSwitch' : 'delivery.edit.enabled')}</span>
        </label>
        {error ? (
          <p className="dz-said bad" role="alert">
            {error}
          </p>
        ) : null}
        <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
      </form>
    </Drawer>
  );
}
