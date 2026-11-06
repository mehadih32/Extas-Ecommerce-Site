// S13 · PR 270 (register "Ad creative briefs generated from the product and the campaign"; demo 93-admin-ads.js
// `zd-brief`) — Marketing › Ad platforms › Creative briefs at /admin/marketing/ad-platforms/briefs: a new brief from a
// product (and, if picked, a platform campaign), the growth agent's approved creative refreshes still waiting for their
// brief, the briefs (offer, formats, hooks in Bengali and English, what the picture shows, landing and what the ads
// optimise for, what the ads brought back) with "Correct the words", "Send to the studio" and "Set aside", and the brief
// settings (off as shipped). Seeing needs `marketing.campaigns.read`; writing `marketing.campaigns.write`; the settings
// `marketing.ads.control`. lib/marketing/creative-brief.ts. Guide: docs/admin-guide/pages/marketing/ad-briefs.md.
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { BRIEF_CAROUSEL_MAX, BRIEF_OPTIMISE, BRIEF_VIDEO_MAX_SECONDS } from '@extas/settings';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { BriefEdit, BriefNew, BriefStep } from '@/components/admin/marketing/BriefControls';
import { FieldsCard, type FieldsCardField, type FieldsCardTexts } from '@/components/admin/settings/FieldsCard';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { formatMoney, formatNumber, moneyOf } from '@/components/admin/products/model';
import { adminDeps } from '@/lib/admin-auth';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess, type AdminView } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { t, type Dict } from '@/lib/i18n';
import { briefsOverview, type BriefView } from '@/lib/marketing/creative-brief';
import { BRIEF_TEXT_MAX, type BriefFormat } from '@/lib/marketing/creative-brief-model';
import bn from '../../../../../../messages/admin-ad-platforms.bn.json';
import en from '../../../../../../messages/admin-ad-platforms.en.json';
import '../../../settings-cards.css';
import '../ad-platforms.css';
import './briefs.css';

export const dynamic = 'force-dynamic';

const HERE = '/admin/marketing/ad-platforms/briefs';
const BACK = '/admin/marketing/ad-platforms';
const API = '/api/admin/marketing/ad-platforms/briefs';
const KEY = 'marketingAdBriefs';

function withScreen(view: AdminView): AdminView {
  return { ...view, dict: { ...view.dict, ...((view.lang === 'bn' ? bn : en) as unknown as Dict) } };
}

export async function generateMetadata(): Promise<Metadata> {
  const view = withScreen(await adminView());
  return { title: t(view.dict, 'adp.brief.metaTitle'), robots: { index: false, follow: false } };
}

export default async function CreativeBriefsPage() {
  const deps = adminDeps();
  const [plain, access] = await Promise.all([adminView(deps), pageAccess('marketing.campaigns.read', deps, MOTHER_STORE_ID)]);
  const view = withScreen(plain);
  const d = view.dict;
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(HERE)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(d, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z" data-testid="adb-page" data-lm-ready="">
        <ShellState view={view} kind="denied" permission="marketing.campaigns.read" />
      </div>
    );
  const o = await briefsOverview({ db: access.deps.db, resolver: access.deps.resolver }, view.lang === 'bn' ? 'bn' : 'en');
  const canWrite = access.guard.permissions?.has('marketing.campaigns.write') ?? false;
  const canControl = access.guard.permissions?.has('marketing.ads.control') ?? false;
  const g = (k: string, vars?: Record<string, string | number>) => t(d, `adp.brief.${k}`, vars);
  const when = (iso: string) => new Intl.DateTimeFormat(view.locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: view.timeZone }).format(new Date(iso));
  const errs = Object.fromEntries(['INVALID_INPUT', 'NOT_FOUND', 'STALE', 'forbidden', 'unauthorized', 'network', 'other'].map((k) => [k, t(d, `adp.err.${k}`)]));
  const err = { ...errs, ...Object.fromEntries(['OFF', 'TAKEN', 'DECIDED'].map((k) => [k, g(`err.${k}`)])) };
  const newTexts = { product: g('product'), campaign: g('campaign'), noCampaign: g('noCampaign'), write: g('write'), writing: g('writing'), wrote: g('wrote'), err };
  const editTexts = { edit: g('edit'), hookBn: g('hookBn'), hookEn: g('hookEn'), showBn: g('showBn'), showEn: g('showEn'), save: g('save'), saving: g('saving'), saved: g('saved'), err };
  const stepTexts = { send: g('send'), setAside: g('setAside'), confirmSend: g('confirmSend'), confirmSetAside: g('confirmSetAside'), yes: g('yes'), cancel: g('cancel'), said: { SENT: g('said.SENT'), SET_ASIDE: g('said.SET_ASIDE') }, err };
  const on = o.card.value.on;
  const canMake = on && canWrite && o.products.length > 0;
  const fmt = (f: BriefFormat) => (f.kind === 'photo' ? g('fmt.photo', { ratio: f.ratio }) : f.kind === 'carousel' ? g('fmt.carousel', { ratio: f.ratio, cards: f.cards }) : g('fmt.video', { ratio: f.ratio, min: f.minSeconds, max: f.maxSeconds }));
  const offer = (b: BriefView) => {
    const a = b.answers;
    if (a.priceMinor === null) return g('noPrice');
    const m = moneyOf(a.currency, view.locale);
    const price = a.wasMinor === null ? formatMoney(a.priceMinor, m) : g('offerWas', { was: formatMoney(a.wasMinor, m), price: formatMoney(a.priceMinor, m) });
    const list = view.lang === 'bn' ? a.colours.bn : a.colours.en;
    return list.length ? `${price}, ${g('offerColours', { colours: formatNumber(list.length, view.locale), list: list.join(', ') })}` : price;
  };
  const figures = (b: BriefView) => {
    const f = b.answers.figures;
    if (!f) return g('figuresNone');
    const m = moneyOf(b.answers.currency, view.locale);
    return g('figuresText', { delivered: formatNumber(f.delivered, view.locale), sales: formatMoney(f.deliveredSalesMinor, m), roas: f.roasPercent === null ? g('unknown') : `${formatNumber(f.roasPercent, view.locale)}%`, from: f.from, to: f.to });
  };
  const pill = (st: string) => (st === 'SENT' ? 'g' : st === 'SET_ASIDE' ? 'line' : 'info');
  const c = (k: string) => g(`card.${k}`);
  const cardTexts: FieldsCardTexts = { h: c('h'), d: c('d'), save: t(d, 'adp.spend.card.save'), saving: t(d, 'adp.spend.card.saving'), saved: t(d, 'adp.spend.card.saved'), discard: t(d, 'adp.spend.card.discard'), unsaved: t(d, 'adp.spend.card.unsaved'), readOnly: c('readOnly'), pairHelp: '', err: { ...errs } };
  const sw = (path: string): FieldsCardField => ({ kind: 'switch', path, label: c(path), help: c(`${path}Help`) });
  const num = (path: string, min: number, max: number): FieldsCardField => ({ kind: 'number', path, label: c(path), help: c(`${path}Help`), min, max });
  const cardFields: FieldsCardField[] = [
    sw('on'),
    sw('photo'),
    sw('carousel'),
    sw('video'),
    num('carouselCards', 2, BRIEF_CAROUSEL_MAX), // hardcode-ok: the setting's own bound
    num('videoMinSeconds', 1, BRIEF_VIDEO_MAX_SECONDS),
    num('videoMaxSeconds', 1, BRIEF_VIDEO_MAX_SECONDS),
    sw('noTextOnPicture'),
    { kind: 'select', path: 'optimiseFor', label: c('optimiseFor'), help: c('optimiseForHelp'), options: BRIEF_OPTIMISE.map((v) => ({ value: v, label: c(`opt.${v}`) })) },
  ];
  const row = (label: string, value: string, id?: string) => (
    <div>
      <dt className="a2-sm">{label}</dt>
      <dd className="a2-sm" data-testid={id}>
        {value}
      </dd>
    </div>
  );

  return (
    <div className="a2-z" data-testid="adb-page" data-lm-ready="">
      <PageHead view={view} place={locateKey(KEY)} title={g('title')} sub={g('sub')} />
      <SectionTabs view={view} current={KEY} />
      <p className="adb-mt8">
        <Link className="a2-sm adp-keys" href={BACK}>
          {g('back')}
        </Link>
      </p>
      <div className="a2-note" role="note">
        <span>{g('note')}</span>
      </div>

      <section className="a2-sc a2-mt12" aria-labelledby="adb-new-h" data-testid="adb-new">
        <h2 className="a2-h3" id="adb-new-h">
          {g('newH')}
        </h2>
        <p className="a2-sm a2-mute">{g('newD')}</p>
        {!on ? (
          <p className="a2-sm adb-mt8" data-testid="adb-off">
            {g('off')}
          </p>
        ) : !canWrite ? (
          <p className="a2-sm a2-mute adb-mt8">{g('noWrite')}</p>
        ) : !o.products.length ? (
          <p className="a2-sm a2-mute adb-mt8">{g('noProducts')}</p>
        ) : (
          <BriefNew url={API} uid="new" products={o.products} campaigns={o.campaigns} texts={newTexts} />
        )}
      </section>

      <section className="a2-sc a2-mt12" aria-labelledby="adb-ref-h" data-testid="adb-refreshes">
        <h2 className="a2-h3" id="adb-ref-h">
          {g('refreshH')}
        </h2>
        <p className="a2-sm a2-mute">{g('refreshD')}</p>
        {o.refreshes.length ? (
          <ul className="adp-rules">
            {o.refreshes.map((r) => (
              <li key={r.proposalId} className="adp-rule" data-testid="adb-refresh">
                <p className="a2-sm adp-sub">{g('refreshFor', { name: r.campaign ?? t(d, 'adp.gone'), when: r.decidedAt ? when(r.decidedAt) : '' })}</p>
                {canMake ? <BriefNew url={API} uid={r.proposalId} products={o.products} campaigns={o.campaigns} fixed={{ adCampaignId: r.adCampaignId, proposalId: r.proposalId, productId: r.productId }} texts={newTexts} /> : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="a2-sm a2-mute adb-mt8">{g('refreshNone')}</p>
        )}
      </section>

      <section className="a2-sc a2-mt12" aria-labelledby="adb-list-h" data-testid="adb-list">
        <h2 className="a2-h3" id="adb-list-h">
          {g('listH')}
        </h2>
        {o.briefs.length ? (
          <ul className="adp-rules">
            {o.briefs.map((b) => {
              const a = b.answers;
              return (
                <li key={b.id} className="adp-rule" data-testid="adb-brief" data-status={b.status}>
                  <p className="a2-sm adp-sub">{g('titleOf', { name: b.product ?? t(d, 'adp.gone') })}</p>
                  <p className="a2-sm a2-mute">
                    <span className={`a2-pill ${pill(b.status)}`}>{g(`status.${b.status}`)}</span> {a.sentAt ? g('sentAt', { when: when(a.sentAt) }) : g('madeAt', { when: when(b.createdAt) })}
                    {b.campaign ? ` · ${g('campaignLine', { name: b.campaign })}` : ''}
                  </p>
                  <dl className="adb-lines">
                    {row(g('offer'), offer(b), 'adb-offer')}
                    {row(g('formats'), a.formats.length ? a.formats.map(fmt).join(' · ') : g('noFormats'), 'adb-formats')}
                    {row(g('hookBn'), a.hooks.bn, 'adb-hook-bn')}
                    {row(g('hookEn'), a.hooks.en, 'adb-hook-en')}
                    {row(g('show'), view.lang === 'bn' ? a.show.bn : a.show.en)}
                    {row(g('landing'), `${a.landingPath} · ${g(`optimise.${a.optimiseFor}`)}`, 'adb-landing')}
                    {row(g('figures'), figures(b))}
                  </dl>
                  {b.status === 'DRAFT' && canWrite ? (
                    <>
                      <BriefEdit url={API} id={b.id} max={BRIEF_TEXT_MAX} hooks={a.hooks} show={a.show} texts={editTexts} />
                      <BriefStep url={API} id={b.id} texts={stepTexts} />
                    </>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="a2-sm a2-mute adb-mt8">{g('listNone')}</p>
        )}
      </section>

      <div className="a2-mt12">
        <FieldsCard url={API} screen={{ key: o.card.key, value: o.card.value, version: o.card.version }} fields={cardFields} texts={cardTexts} canEdit={canControl} testId="adb-card" />
      </div>
    </div>
  );
}
