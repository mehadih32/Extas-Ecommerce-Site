'use client';
// S08 · PR 193 (CN-014 g; demo 97x-adm2-marketing.js "Eid order-by dates and pre-order") — the Eid dates page on the
// existing API (/api/admin/rules/eid, PR 214 follow-up): the switch (`rules.publish`, only once every check passes, with
// a confirm step), the dates (`rules.write`: Eid day, one last day per delivery band, a district's own date, the cut-off
// minute, how early the banner shows), the customer's words under "More options", and pre-order with its advance —
// money, so only with `rules.approve` (the owner's OK, CLAUDE.md rule 6). "What the shop shows today" reads the saved
// settings with the same pure engine the shop uses (@extas/rules/pure), in the shop's time zone.
import { useId, useMemo, useState } from 'react';
import { eidBanner, eidBannerLines, eidStatus, formatDay, minorPerMajor, type BandNames, type EidConfig, type EidIssue, type LocalText } from '@extas/rules/pure';
import { t, type Dict } from '@/lib/i18n';
import { call } from '../api';
import { ShellIcon } from '../shell/ShellIcon';

export interface EidBandOption {
  key: string;
  nameEn: string;
  nameBn: string | null;
}
export interface EidDistrictOption {
  code: string;
  nameEn: string;
  nameBn: string | null;
}
export interface EidScreenData {
  config: EidConfig;
  issues: EidIssue[];
  bands: EidBandOption[];
  districts: EidDistrictOption[];
  perms: { write: boolean; publish: boolean; approve: boolean };
}

type TextKey = 'bannerText' | 'lateText' | 'preorderText' | 'preorderBannerText';
const TEXT_KEYS: readonly TextKey[] = ['bannerText', 'lateText', 'preorderText', 'preorderBannerText'];

interface Draft {
  eidDate: string;
  cutoffTime: string;
  showDaysBefore: string;
  bands: Record<string, string>;
  districts: { district: string; orderBy: string }[];
  texts: Record<TextKey, LocalText>;
}

const draftOf = (c: EidConfig): Draft => ({
  eidDate: c.eidDate ?? '',
  cutoffTime: c.cutoffTime,
  showDaysBefore: String(c.showDaysBefore),
  bands: Object.fromEntries((c.bandDates ?? []).map((r) => [r.band, r.orderBy])),
  districts: (c.districtDates ?? []).map((r) => ({ ...r })),
  texts: { bannerText: c.bannerText, lateText: c.lateText, preorderText: c.preorderText, preorderBannerText: c.preorderBannerText },
});

interface PreDraft {
  enabled: boolean;
  type: 'fixed' | 'percent';
  amount: string;
  percent: string;
}
const preOf = (c: EidConfig, per: number): PreDraft => ({
  enabled: c.preorderEnabled === true,
  type: c.preorderAdvanceType,
  amount: c.preorderAdvanceMinor === null ? '' : String(c.preorderAdvanceMinor / per),
  percent: c.preorderAdvancePercent === null ? '' : String(c.preorderAdvancePercent),
});

export function EidScreen({ d, lang, timeZone, currency, data }: { d: Dict; lang: 'en' | 'bn'; timeZone: string; currency: string; data: EidScreenData }) {
  const id = useId();
  const w = (k: string, vars?: Record<string, string | number>) => t(d, `eta.eid.${k}`, vars);
  const per = minorPerMajor(currency);
  const [screen, setScreen] = useState(data);
  const [draft, setDraft] = useState<Draft>(() => draftOf(data.config));
  const [pre, setPre] = useState<PreDraft>(() => preOf(data.config, per));
  const [busy, setBusy] = useState<'' | 'dates' | 'switch' | 'pre'>('');
  const [asking, setAsking] = useState(false);
  const [said, setSaid] = useState<{ where: 'dates' | 'switch' | 'pre'; text: string; bad: boolean } | null>(null);
  const c = screen.config;
  const on = c.enabled;
  const name = (b: { nameEn: string; nameBn: string | null }) => (lang === 'bn' ? (b.nameBn ?? b.nameEn) : b.nameEn);

  const fresh = (next: EidScreenData) => {
    setScreen(next);
    setDraft(draftOf(next.config));
    setPre(preOf(next.config, per));
  };
  const failText = (a: { status: number; data: { error?: string; details?: string[] } }) => {
    const code = a.status === 0 ? 'network' : (a.data.error ?? 'other');
    if (code === 'EID_INVALID' && a.data.details?.length) return `${w('error.EID_INVALID')} ${a.data.details.map((i) => w(`issue.${i}`)).join(' ')}`;
    const key = `eta.eid.error.${code}`;
    const text = t(d, key, { fields: (a.data.details ?? []).join(', ') });
    return text === key ? w('error.other') : text;
  };

  async function saveDates() {
    setBusy('dates');
    setSaid(null);
    const days = Number(draft.showDaysBefore);
    const body = {
      eidDate: draft.eidDate || null,
      cutoffTime: draft.cutoffTime,
      showDaysBefore: Number.isFinite(days) ? Math.trunc(days) : c.showDaysBefore,
      bandDates: screen.bands.filter((b) => draft.bands[b.key]).map((b) => ({ band: b.key, orderBy: draft.bands[b.key]! })),
      districtDates: draft.districts.filter((r) => r.district && r.orderBy),
      ...draft.texts,
    };
    const a = await call('PUT', '/api/admin/rules/eid', body);
    setBusy('');
    if (a.status === 200 && a.data.eid) {
      fresh(a.data.eid as EidScreenData);
      return setSaid({ where: 'dates', text: w('saved'), bad: false });
    }
    setSaid({ where: 'dates', text: failText(a), bad: true });
  }

  async function flip() {
    setBusy('switch');
    setSaid(null);
    const a = await call('POST', '/api/admin/rules/eid/status', { enabled: !on });
    setBusy('');
    setAsking(false);
    if (a.status === 200 && a.data.eid) {
      fresh(a.data.eid as EidScreenData);
      return setSaid({ where: 'switch', text: w(on ? 'switchedOff' : 'switchedOn'), bad: false });
    }
    setSaid({ where: 'switch', text: failText(a), bad: true });
  }

  async function savePre() {
    setBusy('pre');
    setSaid(null);
    const amount = pre.amount.trim() === '' ? null : Math.round(Number(pre.amount) * per);
    const percent = pre.percent.trim() === '' ? null : Math.trunc(Number(pre.percent));
    const a = await call('POST', '/api/admin/rules/eid/preorder', { preorderEnabled: pre.enabled, preorderAdvanceType: pre.type, preorderAdvanceMinor: amount, preorderAdvancePercent: percent });
    setBusy('');
    if (a.status === 200 && a.data.eid) {
      fresh(a.data.eid as EidScreenData);
      return setSaid({ where: 'pre', text: w('saved'), bad: false });
    }
    setSaid({ where: 'pre', text: failText(a), bad: true });
  }

  // what the shop shows today, from the saved settings (the shop's own engine)
  const preview = useMemo(() => {
    const now = new Date();
    const ctx = { locale: lang === 'bn' ? 'bn-BD' : 'en-BD', currency, timeZone };
    const names: BandNames = Object.fromEntries(screen.bands.map((b) => [b.key, { en: b.nameEn, bn: b.nameBn ?? b.nameEn }]));
    const banner = eidBanner(c, now, timeZone);
    const lines = banner ? eidBannerLines(c, banner, ctx, names) : [];
    const places = c.enabled
      ? screen.bands.map((b) => {
          const s = eidStatus(c, { band: b.key }, now, timeZone);
          const band = name(b);
          if (s.state === 'open') return w('placeOpen', { band, date: formatDay(s.orderBy, ctx.locale), days: s.daysLeft });
          if (s.state === 'closed') return w('placeClosed', { band });
          return s.state === 'none' ? w('placeNone', { band }) : null;
        })
      : [];
    return { lines, places: places.filter((x): x is string => !!x) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, lang, currency, timeZone]);

  const status = (where: 'dates' | 'switch' | 'pre') =>
    said?.where === where ? (
      <span className={`a2-sm${said.bad ? '' : ' a2-mute'}`} role="status" aria-live="polite" data-testid={`eid-${where}-status`}>
        {said.text}
      </span>
    ) : (
      <span />
    );
  const roDates = !screen.perms.write || busy !== '';
  const roPre = !screen.perms.approve || busy !== '';
  const usedDistricts = new Set(draft.districts.map((r) => r.district));

  return (
    <>
      <section className="a2-sc a2-mt12" aria-labelledby={`${id}-st`} data-testid="eid-status">
        <div className="a2-sch">
          <div>
            <h2 className="a2-h3" id={`${id}-st`}>
              {w('statusH')} <span className={`a2-pill ${on ? 'ok' : ''}`}>{w(on ? 'on' : 'off')}</span>
            </h2>
            <p className="a2-scd">{w(on ? 'statusOn' : 'statusOff')}</p>
          </div>
        </div>
        {!on && screen.issues.length ? (
          <div className="a2-note a2-mt12" data-testid="eid-issues">
            <ShellIcon name="info" size={15} />
            <span>
              <b>{w('issuesH')}</b>
              {screen.issues.map((i) => (
                <span key={i} className="a2-blk">
                  {w(`issue.${i}`)}
                </span>
              ))}
            </span>
          </div>
        ) : null}
        <div className="a2-scbar">
          {status('switch')}
          {screen.perms.publish ? (
            asking ? (
              <div className="a2-gap8">
                <button type="button" className="a2-btn" disabled={busy !== ''} onClick={() => setAsking(false)}>
                  {w('cancel')}
                </button>
                <button type="button" className="a2-btn pri" disabled={busy !== ''} onClick={() => void flip()} data-testid="eid-switch-confirm">
                  {w(on ? 'confirmOff' : 'confirmOn')}
                </button>
              </div>
            ) : (
              <button type="button" className={`a2-btn${on ? '' : ' pri'}`} disabled={busy !== '' || (!on && screen.issues.length > 0)} onClick={() => setAsking(true)} data-testid="eid-switch">
                {w(on ? 'switchOff' : 'switchOn')}
              </button>
            )
          ) : null}
        </div>
      </section>

      <section className="a2-sc a2-mt12" aria-labelledby={`${id}-dt`} data-testid="eid-dates">
        <div className="a2-sch">
          <div>
            <h2 className="a2-h3" id={`${id}-dt`}>
              {w('datesH')}
            </h2>
            <p className="a2-scd">{w('datesD')}</p>
          </div>
        </div>
        {!screen.perms.write ? (
          <div className="a2-note">
            <ShellIcon name="lock" size={15} />
            <span>{w('readOnly')}</span>
          </div>
        ) : null}
        <div className="a2-fg a2-mt12">
          <div className="a2-fld">
            <label className="a2-lbl" htmlFor={`${id}-eid`}>
              {w('eidDate')}
            </label>
            <input id={`${id}-eid`} className="a2-inp" type="date" value={draft.eidDate} disabled={roDates} onChange={(e) => setDraft({ ...draft, eidDate: e.target.value })} data-testid="eid-day" />
          </div>
          {screen.bands.map((b) => (
            <div className="a2-fld" key={b.key}>
              <label className="a2-lbl" htmlFor={`${id}-b-${b.key}`}>
                {w('bandDate', { band: name(b) })}
              </label>
              <input
                id={`${id}-b-${b.key}`}
                className="a2-inp"
                type="date"
                value={draft.bands[b.key] ?? ''}
                disabled={roDates}
                onChange={(e) => setDraft({ ...draft, bands: { ...draft.bands, [b.key]: e.target.value } })}
                data-testid={`eid-band-${b.key}`}
              />
            </div>
          ))}
          <div className="a2-fld">
            <label className="a2-lbl" htmlFor={`${id}-cut`}>
              {w('cutoffTime')}
            </label>
            <input id={`${id}-cut`} className="a2-inp" type="time" value={draft.cutoffTime} disabled={roDates} onChange={(e) => setDraft({ ...draft, cutoffTime: e.target.value })} data-testid="eid-cutoff" />
            <span className="a2-xs a2-mute">{w('cutoffHelp')}</span>
          </div>
          <div className="a2-fld">
            <label className="a2-lbl" htmlFor={`${id}-show`}>
              {w('showDaysBefore')}
            </label>
            <input id={`${id}-show`} className="a2-inp" type="number" inputMode="numeric" min={1} max={90} value={draft.showDaysBefore} disabled={roDates} onChange={(e) => setDraft({ ...draft, showDaysBefore: e.target.value })} data-testid="eid-show" />
          </div>
        </div>

        <h3 className="a2-h4 a2-mt12">{w('districtsH')}</h3>
        {draft.districts.length ? null : <p className="a2-xs a2-mute a2-mt6">{w('noDistricts')}</p>}
        {draft.districts.map((r, i) => (
          <div className="a2-fg a2-mt6 eid-drow" key={i} data-testid="eid-district-row">
            <div className="a2-fld">
              <label className="a2-lbl" htmlFor={`${id}-d-${i}`}>
                {w('district')}
              </label>
              <select
                id={`${id}-d-${i}`}
                className="a2-sel"
                value={r.district}
                disabled={roDates}
                onChange={(e) => setDraft({ ...draft, districts: draft.districts.map((x, j) => (j === i ? { ...x, district: e.target.value } : x)) })}
              >
                <option value="">{w('pickDistrict')}</option>
                {screen.districts
                  .filter((o) => o.code === r.district || !usedDistricts.has(o.code))
                  .map((o) => (
                    <option key={o.code} value={o.code}>
                      {name(o)}
                    </option>
                  ))}
              </select>
            </div>
            <div className="a2-fld">
              <label className="a2-lbl" htmlFor={`${id}-dd-${i}`}>
                {w('districtDate')}
              </label>
              <input
                id={`${id}-dd-${i}`}
                className="a2-inp"
                type="date"
                value={r.orderBy}
                disabled={roDates}
                onChange={(e) => setDraft({ ...draft, districts: draft.districts.map((x, j) => (j === i ? { ...x, orderBy: e.target.value } : x)) })}
              />
            </div>
            {screen.perms.write ? (
              <div className="a2-fld eid-dend">
                <button type="button" className="a2-btn" disabled={roDates} onClick={() => setDraft({ ...draft, districts: draft.districts.filter((_, j) => j !== i) })}>
                  {w('remove')}
                </button>
              </div>
            ) : null}
          </div>
        ))}
        {screen.perms.write ? (
          <button type="button" className="a2-btn a2-mt6" disabled={roDates} onClick={() => setDraft({ ...draft, districts: [...draft.districts, { district: '', orderBy: '' }] })} data-testid="eid-district-add">
            {w('addDistrict')}
          </button>
        ) : null}

        <details className="a2-mt12 a2-more-opts" data-testid="eid-words">
          <summary className="a2-sm a2-b">{w('wordsMore')}</summary>
          <p className="a2-xs a2-mute a2-mt6">{w('wordsHelp')}</p>
          <div className="a2-fg a2-mt12">
            {TEXT_KEYS.map((k) =>
              (['en', 'bn'] as const).map((l) => (
                <div className="a2-fld" key={`${k}-${l}`}>
                  <label className="a2-lbl" htmlFor={`${id}-${k}-${l}`}>
                    {`${w(k)} · ${w(l === 'en' ? 'langEn' : 'langBn')}`}
                  </label>
                  <textarea
                    id={`${id}-${k}-${l}`}
                    className="a2-inp eid-ta"
                    rows={2}
                    maxLength={240}
                    value={draft.texts[k][l]}
                    disabled={roDates}
                    onChange={(e) => setDraft({ ...draft, texts: { ...draft.texts, [k]: { ...draft.texts[k], [l]: e.target.value } } })}
                    data-testid={`eid-text-${k}-${l}`}
                  />
                </div>
              )),
            )}
          </div>
        </details>
        <div className="a2-scbar">
          {status('dates')}
          {screen.perms.write ? (
            <button type="button" className="a2-btn pri" disabled={roDates} onClick={() => void saveDates()} data-testid="eid-save">
              {busy === 'dates' ? w('saving') : w('save')}
            </button>
          ) : null}
        </div>
      </section>

      <section className="a2-sc a2-mt12" aria-labelledby={`${id}-pre`} data-testid="eid-preorder">
        <div className="a2-sch">
          <div>
            <h2 className="a2-h3" id={`${id}-pre`}>
              {w('preH')}
            </h2>
            <p className="a2-scd">{w('preD')}</p>
          </div>
        </div>
        <div className="a2-note">
          <ShellIcon name="lock" size={15} />
          <span>{w('preOwner')}</span>
        </div>
        <div className="a2-fg a2-mt12">
          <div className="a2-swl">
            <span>{w('preEnabled')}</span>
            <button type="button" className={`a2-sw${pre.enabled ? ' on' : ''}`} role="switch" aria-checked={pre.enabled} aria-label={w('preEnabled')} disabled={roPre} onClick={() => setPre({ ...pre, enabled: !pre.enabled })} data-testid="eid-pre-switch" />
          </div>
          <div className="a2-fld">
            <label className="a2-lbl" htmlFor={`${id}-ptype`}>
              {w('preType')}
            </label>
            <select id={`${id}-ptype`} className="a2-sel" value={pre.type} disabled={roPre} onChange={(e) => setPre({ ...pre, type: e.target.value as PreDraft['type'] })} data-testid="eid-pre-type">
              <option value="fixed">{w('preFixed')}</option>
              <option value="percent">{w('prePercent')}</option>
            </select>
          </div>
          {pre.type === 'fixed' ? (
            <div className="a2-fld">
              <label className="a2-lbl" htmlFor={`${id}-pamt`}>
                {`${w('preAmount')} (${currency})`}
              </label>
              <input id={`${id}-pamt`} className="a2-inp" type="number" inputMode="decimal" min={1} value={pre.amount} disabled={roPre} onChange={(e) => setPre({ ...pre, amount: e.target.value })} data-testid="eid-pre-amount" />
            </div>
          ) : (
            <div className="a2-fld">
              <label className="a2-lbl" htmlFor={`${id}-ppct`}>
                {w('prePercentField')}
              </label>
              <input id={`${id}-ppct`} className="a2-inp" type="number" inputMode="numeric" min={1} max={100} value={pre.percent} disabled={roPre} onChange={(e) => setPre({ ...pre, percent: e.target.value })} data-testid="eid-pre-percent" />
            </div>
          )}
        </div>
        <div className="a2-scbar">
          {status('pre')}
          {screen.perms.approve ? (
            <button type="button" className="a2-btn pri" disabled={roPre} onClick={() => void savePre()} data-testid="eid-pre-save">
              {busy === 'pre' ? w('saving') : w('preSave')}
            </button>
          ) : null}
        </div>
      </section>

      <section className="a2-sc a2-mt12" aria-labelledby={`${id}-pv`} data-testid="eid-preview">
        <div className="a2-sch">
          <div>
            <h2 className="a2-h3" id={`${id}-pv`}>
              {w('previewH')}
            </h2>
            <p className="a2-scd">{w('previewD')}</p>
          </div>
        </div>
        {preview.lines.length || preview.places.length ? (
          <ul className="a2-mt12 eid-pv">
            {preview.lines.map((l, i) => (
              <li key={`l${i}`}>
                <b>{l}</b>
              </li>
            ))}
            {preview.places.map((l, i) => (
              <li key={`p${i}`}>{l}</li>
            ))}
          </ul>
        ) : (
          <p className="a2-sm a2-mute a2-mt12">{w('previewNone')}</p>
        )}
      </section>
    </>
  );
}
