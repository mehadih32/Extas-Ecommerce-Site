'use client';
// S13 · PR 256 (Blueprint C6.2, demo 93-admin-ads.js "New campaign · draft") — one campaign: its name, aim, channels and
// audience; the offer (a coupon or the owner's words); the creative; the window and the planned budget; its landing pages
// and the orders they brought; and its steps. Saving sends the version it was read at (STALE = read again). Start, End
// and Archive ask once more. The budget is a plan only and is locked once the campaign has started (BUDGET_LOCKED): a live
// budget changes only through the change request and the owner's approval (PR 268). Without `marketing.campaigns.write`
// everything is read-only.
import { useRouter } from 'next/navigation';
import { useId, useState, type ReactNode } from 'react';
import { t, type Dict } from '@/lib/i18n';
import { BUDGET_KINDS, CAMPAIGN_CHANNELS, CAMPAIGN_OBJECTIVES, OFFER_KINDS, budgetLocked, stepsFor, type CampaignAction, type CampaignChannel, type CampaignCreative, type CampaignOffer, type CampaignState } from '@/lib/marketing/campaign-model';
import { toMajor, toMinor, type Money } from '../products/model';
import { call } from '../api';

export interface EditorCampaign {
  id: string | null;
  name: string;
  state: CampaignState;
  objective: string | null;
  channels: CampaignChannel[];
  audienceId: string | null;
  couponId: string | null;
  offer: CampaignOffer;
  creative: CampaignCreative;
  startsAt: string | null;
  endsAt: string | null;
  budgetMinor: number | null;
  budgetKind: string | null;
  landingPages: { id: string; title: string; slug: string; status: string }[];
  version: string | null;
}

const API = '/api/admin/marketing/campaigns';
const ASK: CampaignAction[] = ['start', 'end', 'archive'];
/** A stored instant as the browser's `datetime-local` value (its own clock), and back. */
const toLocal = (iso: string | null | undefined) => {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};
const fromLocal = (v: string) => (v ? new Date(v).toISOString() : null);

export function CampaignEditor(p: { words: Dict; campaign: EditorCampaign; audiences: { id: string; name: string }[]; coupons: { id: string; code: string; enabled: boolean }[]; money: Money; canWrite: boolean; listHref: string; landingHref: string }) {
  const id = useId();
  const router = useRouter();
  const c = (k: string, vars?: Record<string, string | number>) => t(p.words, `cp.${k}`, vars);
  const cp = p.campaign;
  const [name, setName] = useState(cp.name);
  const [objective, setObjective] = useState(cp.objective ?? '');
  const [channels, setChannels] = useState<CampaignChannel[]>(cp.channels);
  const [audienceId, setAudienceId] = useState(cp.audienceId ?? '');
  const [offerKind, setOfferKind] = useState<CampaignOffer['kind']>(cp.offer.kind);
  const [couponId, setCouponId] = useState(cp.couponId ?? '');
  const [offerEn, setOfferEn] = useState(cp.offer.words?.en ?? '');
  const [offerBn, setOfferBn] = useState(cp.offer.words?.bn ?? '');
  const [headEn, setHeadEn] = useState(cp.creative.headline?.en ?? '');
  const [headBn, setHeadBn] = useState(cp.creative.headline?.bn ?? '');
  const [textEn, setTextEn] = useState(cp.creative.text?.en ?? '');
  const [textBn, setTextBn] = useState(cp.creative.text?.bn ?? '');
  const [startsAt, setStartsAt] = useState(toLocal(cp.startsAt));
  const [endsAt, setEndsAt] = useState(toLocal(cp.endsAt));
  const [budget, setBudget] = useState(toMajor(cp.budgetMinor, p.money));
  const [budgetKind, setBudgetKind] = useState(cp.budgetKind ?? 'DAILY');
  const [busy, setBusy] = useState(false);
  const [ask, setAsk] = useState<CampaignAction | null>(null);
  const [dirty, setDirty] = useState(!cp.id);
  const [said, setSaid] = useState<{ text: string; bad: boolean } | null>(null);
  const ro = !p.canWrite || cp.state === 'ARCHIVED';
  const off = ro || busy;
  const locked = budgetLocked(cp.state);
  const touch = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setDirty(true);
    setAsk(null);
  };

  function errText(a: { status: number; data: { error?: string; details?: string[] } }) {
    if (a.status === 0) return c('err.network');
    if (a.status === 401) return c('err.unauthorized');
    if (a.status === 403) return c('err.forbidden');
    const k = `err.${a.data.error ?? 'other'}`;
    const txt = c(k, { fields: (a.data.details ?? []).map((f) => c(`field.${f}`)).join(', ') });
    return txt === `cp.${k}` ? c('err.other') : txt;
  }

  async function save() {
    const minor = toMinor(budget, p.money);
    if (minor === undefined) return setSaid({ text: c('err.budget'), bad: true });
    setBusy(true);
    setSaid(null);
    const body = {
      name,
      objective: objective || null,
      channels,
      audienceId: audienceId || null,
      offer: { kind: offerKind, ...(offerKind === 'words' ? { words: { en: offerEn, bn: offerBn } } : {}) },
      couponId: offerKind === 'coupon' ? couponId || null : null,
      creative: { headline: { en: headEn, bn: headBn }, text: { en: textEn, bn: textBn } },
      startsAt: fromLocal(startsAt),
      endsAt: fromLocal(endsAt),
      budgetMinor: minor,
      budgetKind: minor == null ? null : budgetKind,
      version: cp.version,
    };
    const a = await call(cp.id ? 'PUT' : 'POST', cp.id ? `${API}/${cp.id}` : API, body);
    setBusy(false);
    if (a.status === 200 || a.status === 201) {
      setDirty(false);
      setSaid({ text: c('saved'), bad: false });
      const nid = (a.data.campaign as { id?: string } | undefined)?.id;
      if (!cp.id && nid) return router.replace(`${p.listHref}/${nid}`);
      return router.refresh();
    }
    setSaid({ text: errText(a), bad: true });
    if (a.status === 409 && a.data.error === 'STALE') router.refresh();
  }

  async function step(s: CampaignAction) {
    if (dirty) return setSaid({ text: c('unsavedFirst'), bad: true });
    if (ASK.includes(s) && ask !== s) return setAsk(s);
    setAsk(null);
    setBusy(true);
    const a = await call('POST', `${API}/${cp.id}`, { action: s, version: cp.version });
    setBusy(false);
    if (a.status === 200) {
      setSaid({ text: c(`state.${(a.data.campaign as { state: CampaignState }).state}`), bad: false });
      return router.refresh();
    }
    setSaid({ text: errText(a), bad: true });
    if (a.status === 409 && a.data.error === 'STALE') router.refresh();
  }

  const fld = (key: string, label: string, el: ReactNode, help?: string) => (
    <div className="a2-fld">
      <label className="a2-lbl" htmlFor={`${id}-${key}`}>
        {label}
      </label>
      {el}
      {help ? <div className="a2-help a2-xs a2-mute">{help}</div> : null}
    </div>
  );
  const card = (key: string, title: string, sub: string | null, inner: ReactNode) => (
    <section className="a2-card a2-sc" aria-labelledby={`${id}-${key}`} data-testid={`cp-${key}`}>
      <h2 className="a2-h3" id={`${id}-${key}`}>
        {title}
      </h2>
      {sub ? <p className="a2-cs">{sub}</p> : null}
      {inner}
    </section>
  );

  return (
    <div className="lp-grid a2-mt12">
      <div className="lp-stack">
        {card(
          'who',
          c('who'),
          null,
          <div className="lp-g2 a2-mt12">
            {fld('nm', c('name'), <input id={`${id}-nm`} className="a2-inp" value={name} maxLength={120} disabled={off} onChange={(e) => touch(setName)(e.target.value)} data-testid="cp-name" />)}
            {fld(
              'ob',
              c('objective'),
              <select id={`${id}-ob`} className="a2-sel" value={objective} disabled={off} onChange={(e) => touch(setObjective)(e.target.value)} data-testid="cp-objective">
                <option value="">{c('objectiveNone')}</option>
                {CAMPAIGN_OBJECTIVES.map((o) => (
                  <option key={o} value={o}>
                    {c(`obj.${o}`)}
                  </option>
                ))}
              </select>,
              c('objectiveHelp'),
            )}
            {fld(
              'au',
              c('audience'),
              <select id={`${id}-au`} className="a2-sel" value={audienceId} disabled={off} onChange={(e) => touch(setAudienceId)(e.target.value)} data-testid="cp-audience">
                <option value="">{c('audienceNone')}</option>
                {p.audiences.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </select>,
              p.audiences.length ? undefined : c('audienceEmpty'),
            )}
            <div className="a2-fld">
              <span className="a2-lbl" id={`${id}-chl`}>
                {c('channels')}
              </span>
              <div className="cp-chips" role="group" aria-labelledby={`${id}-chl`}>
                {CAMPAIGN_CHANNELS.map((ch) => {
                  const on = channels.includes(ch);
                  return (
                    <button key={ch} type="button" className={`cp-chip${on ? ' on' : ''}`} aria-pressed={on} disabled={off} onClick={() => touch(setChannels)(on ? channels.filter((x) => x !== ch) : [...channels, ch])} data-testid={`cp-ch-${ch}`}>
                      {c(`ch.${ch}`)}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>,
        )}

        {card(
          'offer',
          c('offer'),
          c('offerSub'),
          <>
            <div className="cp-chips a2-mt12" role="radiogroup" aria-label={c('offer')}>
              {OFFER_KINDS.map((k) => (
                <button key={k} type="button" role="radio" aria-checked={offerKind === k} className={`cp-chip${offerKind === k ? ' on' : ''}`} disabled={off} onClick={() => touch(setOfferKind)(k)} data-testid={`cp-offer-${k}`}>
                  {c(`offerKind.${k}`)}
                </button>
              ))}
            </div>
            {offerKind === 'coupon' ? (
              <div className="lp-g2 a2-mt12">
                {fld(
                  'cu',
                  c('coupon'),
                  <select id={`${id}-cu`} className="a2-sel" value={couponId} disabled={off} onChange={(e) => touch(setCouponId)(e.target.value)} data-testid="cp-coupon">
                    <option value="">{c('couponPick')}</option>
                    {p.coupons.map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.enabled ? x.code : `${x.code} (${c('couponOff')})`}
                      </option>
                    ))}
                  </select>,
                  p.coupons.length ? c('couponHelp') : c('couponEmpty'),
                )}
              </div>
            ) : null}
            {offerKind === 'words' ? (
              <div className="lp-g2 a2-mt12">
                {fld('oe', c('offerWords'), <input id={`${id}-oe`} className="a2-inp" value={offerEn} maxLength={160} disabled={off} onChange={(e) => touch(setOfferEn)(e.target.value)} data-testid="cp-offer-en" />)}
                {fld('obn', c('offerWordsBn'), <input id={`${id}-obn`} className="a2-inp" value={offerBn} maxLength={160} disabled={off} onChange={(e) => touch(setOfferBn)(e.target.value)} lang="bn" />)}
              </div>
            ) : null}
          </>,
        )}

        {card(
          'creative',
          c('creative'),
          c('creativeSub'),
          <div className="lp-g2 a2-mt12">
            {fld('he', c('headline'), <input id={`${id}-he`} className="a2-inp" value={headEn} maxLength={120} disabled={off} onChange={(e) => touch(setHeadEn)(e.target.value)} data-testid="cp-headline" />)}
            {fld('hb', c('headlineBn'), <input id={`${id}-hb`} className="a2-inp" value={headBn} maxLength={120} disabled={off} onChange={(e) => touch(setHeadBn)(e.target.value)} lang="bn" />)}
            {fld('te', c('text'), <textarea id={`${id}-te`} className="a2-inp" value={textEn} maxLength={600} disabled={off} onChange={(e) => touch(setTextEn)(e.target.value)} />)}
            {fld('tb', c('textBn'), <textarea id={`${id}-tb`} className="a2-inp" value={textBn} maxLength={600} disabled={off} onChange={(e) => touch(setTextBn)(e.target.value)} lang="bn" />)}
          </div>,
        )}

        {card(
          'when',
          c('when'),
          c('whenSub'),
          <div className="lp-g2 a2-mt12">
            {fld('st', c('startsAt'), <input id={`${id}-st`} type="datetime-local" className="a2-inp" value={startsAt} disabled={off} onChange={(e) => touch(setStartsAt)(e.target.value)} data-testid="cp-start" />)}
            {fld('en', c('endsAt'), <input id={`${id}-en`} type="datetime-local" className="a2-inp" value={endsAt} disabled={off} onChange={(e) => touch(setEndsAt)(e.target.value)} data-testid="cp-end" />)}
            {fld(
              'bu',
              c('budget', { currency: p.money.currency }),
              <input id={`${id}-bu`} className="a2-inp" inputMode="decimal" value={budget} disabled={off || locked} onChange={(e) => touch(setBudget)(e.target.value)} data-testid="cp-budget" />,
              locked ? c('budgetLocked') : c('budgetHelp'),
            )}
            {fld(
              'bk',
              c('budgetKind'),
              <select id={`${id}-bk`} className="a2-sel" value={budgetKind} disabled={off || locked} onChange={(e) => touch(setBudgetKind)(e.target.value)} data-testid="cp-budget-kind">
                {BUDGET_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {c(`bk.${k}`)}
                  </option>
                ))}
              </select>,
            )}
          </div>,
        )}

        <div className="lp-acts" data-testid="cp-actions">
          {!ro ? (
            <button type="button" className="a2-btn pri" disabled={busy || !name.trim()} onClick={save} data-testid="cp-save">
              {busy ? c('saving') : cp.id ? c('save') : c('create')}
            </button>
          ) : null}
          {p.canWrite && cp.id
            ? stepsFor(cp.state).map((s) => (
                <button key={s} type="button" className={`a2-btn${ask === s ? ' pri' : ''}`} disabled={busy} onClick={() => step(s)} data-testid={`cp-step-${s}`}>
                  {ask === s ? c(`stepAsk.${s}`) : c(`step.${s}`)}
                </button>
              ))
            : null}
        </div>
        {said ? (
          <p className={`a2-sm lp-said ${said.bad ? 'bk-warn' : 'a2-mute'}`} role={said.bad ? 'alert' : 'status'} data-testid="cp-said">
            {said.text}
          </p>
        ) : null}
        {!p.canWrite ? <p className="a2-xs a2-mute">{c('readOnly')}</p> : null}
        {cp.id ? <p className="a2-xs a2-mute">{c('stateLine', { state: c(`state.${cp.state}`) })}</p> : null}
      </div>

      <div className="lp-stack">
        {card(
          'pages',
          c('pages'),
          c('pagesSub'),
          <>
            {cp.landingPages.length ? (
              <ul className="cp-pages a2-mt12">
                {cp.landingPages.map((x) => (
                  <li key={x.id}>
                    <a className="a2-lnk cp-pl" href={`${p.landingHref}/${x.id}`}>
                      {x.title}
                    </a>
                    <span className="a2-xs a2-mute a2-mono">/l/{x.slug}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="a2-sm a2-mute a2-mt12">{c('pagesNone')}</p>
            )}
            {p.canWrite ? (
              <a className="a2-btn a2-mt12" href={`${p.landingHref}/new`} data-testid="cp-new-page">
                {c('pagesNew')}
              </a>
            ) : null}
          </>,
        )}
      </div>
    </div>
  );
}
