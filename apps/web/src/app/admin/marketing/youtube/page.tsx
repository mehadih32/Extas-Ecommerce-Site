// S13 · PR 278 (register "YouTube module — channel, videos, and the attribution back to orders"; Blueprint C4.4) —
// Marketing › YouTube at /admin/marketing/youtube: what the videos brought (orders through their tracked links,
// delivered, delivered value), the channels (add by link, set aside, bring back), each video with its products, each
// product's tracked link to copy into the video's description and the orders it brought, "Add a video", and the
// settings card (the switch and the link's tags). Off as shipped (`marketing.youtube`). Seeing needs
// `marketing.campaigns.read`; changing needs `marketing.campaigns.write` (the API checks again).
// lib/marketing/youtube.ts. Guide: docs/admin-guide/pages/marketing/youtube.md.
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { YoutubeAct, YoutubeChannelForm, YoutubeCopy, YoutubeVideoEdit, YoutubeVideoForm, type YoutubeFormTexts } from '@/components/admin/marketing/YoutubeForms';
import { FieldsCard, type FieldsCardField, type FieldsCardTexts } from '@/components/admin/settings/FieldsCard';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { formatMoney, formatNumber, moneyOf } from '@/components/admin/products/model';
import { adminDeps } from '@/lib/admin-auth';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess, type AdminView } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { t, type Dict } from '@/lib/i18n';
import { trackedLink, youtubeOverview } from '@/lib/marketing/youtube';
import { productPath } from '@/lib/shop/home-model';
import { shopOrigin } from '@/lib/shop/meta';
import bn from '../../../../../messages/admin-youtube.bn.json';
import en from '../../../../../messages/admin-youtube.en.json';
import '../../settings-cards.css';
import '../../messages/email/email.css';
import '../ad-platforms/ad-platforms.css';
import './youtube.css';

export const dynamic = 'force-dynamic';

const HERE = '/admin/marketing/youtube';
const API = '/api/admin/marketing/youtube';
const KEY = 'marketingYoutube';

function withScreen(view: AdminView): AdminView {
  return { ...view, dict: { ...view.dict, ...((view.lang === 'bn' ? bn : en) as unknown as Dict) } };
}

export async function generateMetadata(): Promise<Metadata> {
  const view = withScreen(await adminView());
  return { title: t(view.dict, 'yt.metaTitle'), robots: { index: false, follow: false } };
}

export default async function YoutubePage() {
  const deps = adminDeps();
  const [plain, access] = await Promise.all([adminView(deps), pageAccess('marketing.campaigns.read', deps, MOTHER_STORE_ID)]);
  const view = withScreen(plain);
  const d = view.dict;
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(HERE)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(d, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z" data-testid="yt-page" data-lm-ready="">
        <ShellState view={view} kind="denied" permission="marketing.campaigns.read" />
      </div>
    );
  const [o, currency, prefix, origin] = await Promise.all([
    youtubeOverview({ db: access.deps.db, resolver: access.deps.resolver }),
    access.deps.resolver.value('store.currency', { storeId: MOTHER_STORE_ID }) as Promise<string>,
    access.deps.resolver.value('naming.productPathPrefix', { storeId: MOTHER_STORE_ID }) as Promise<string>,
    shopOrigin(MOTHER_STORE_ID),
  ]);
  const canWrite = access.guard.permissions?.has('marketing.campaigns.write') ?? false;
  const on = o.settings.enabled;
  const m = moneyOf(currency, view.locale);
  const g = (k: string, vars?: Record<string, string | number>) => t(d, `yt.${k}`, vars);
  const n = (x: number) => formatNumber(x, view.locale);
  const day = (iso: string) => new Intl.DateTimeFormat(view.locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(iso));
  const errKeys = ['INVALID_INPUT', 'UNKNOWN_PRODUCTS', 'EXISTS', 'SWITCHED_OFF', 'NOT_FOUND', 'STALE', 'forbidden', 'unauthorized', 'network', 'other'];
  const err = Object.fromEntries(errKeys.map((k) => [k, g(`err.${k}`)]));
  const texts: YoutubeFormTexts = { err, fields: Object.fromEntries(['link', 'name', 'title', 'channelId', 'publishedOn', 'products'].map((k) => [k, g(`f.${k}`)])) };
  const c = (k: string) => g(`card.${k}`);
  const cardTexts: FieldsCardTexts = { h: c('h'), d: c('d'), save: c('save'), saving: c('saving'), saved: c('saved'), discard: c('discard'), unsaved: c('unsaved'), readOnly: c('readOnly'), pairHelp: '', err };
  const cardFields: FieldsCardField[] = [
    { kind: 'switch', path: 'enabled', label: c('on'), help: c('onHelp') },
    { kind: 'text', path: 'utmSource', label: c('utmSource'), help: c('utmSourceHelp'), max: 40 },
    { kind: 'text', path: 'utmMedium', label: c('utmMedium'), help: c('utmMediumHelp'), max: 40 },
    { kind: 'text', path: 'campaignPrefix', label: c('campaignPrefix'), help: c('campaignPrefixHelp'), max: 20 },
  ];
  const liveChannels = o.channels.filter((ch) => !ch.archived);
  const link = (slug: string, videoId: string) => (origin ? trackedLink(origin.origin, productPath(prefix, slug), o.settings, videoId) : '');
  const total = (label: string, value: string, id: string) => (
    <div>
      <dt className="a2-sm">{label}</dt>
      <dd className="a2-sm" data-testid={id}>
        {value}
      </dd>
    </div>
  );

  return (
    <div className="a2-z" data-testid="yt-page" data-lm-ready="">
      <PageHead view={view} place={locateKey(KEY)} title={g('title')} sub={g('sub')} />
      <SectionTabs view={view} current={KEY} />
      <div className="a2-note yt-mt8" role="note">
        <span>{g('note')}</span>
      </div>
      {!on ? (
        <section className="a2-card a2-mt12" data-testid="yt-off">
          <h2 className="a2-h3">{g('offTitle')}</h2>
          <p className="a2-sm a2-mute a2-mt6">{g(canWrite ? 'offBody' : 'offAsk')}</p>
        </section>
      ) : null}

      <section className="a2-sc a2-mt12" aria-labelledby="yt-tot-h" data-testid="yt-totals">
        <h2 className="a2-h3" id="yt-tot-h">
          {g('totals.h')}
        </h2>
        <dl className="yt-totals">
          {total(g('totals.videos'), n(o.totals.videos), 'yt-t-videos')}
          {total(g('totals.orders'), n(o.totals.orders), 'yt-t-orders')}
          {total(g('totals.delivered'), n(o.totals.delivered), 'yt-t-delivered')}
          {total(g('totals.value'), formatMoney(o.totals.deliveredValueMinor, m), 'yt-t-value')}
        </dl>
      </section>

      <section className="a2-sc a2-mt12" aria-labelledby="yt-ch-h" data-testid="yt-channels">
        <h2 className="a2-h3" id="yt-ch-h">
          {g('channels.h')}
        </h2>
        {o.channels.length ? (
          <ul className="adp-rules">
            {o.channels.map((ch) => (
              <li key={ch.id} className="adp-rule" data-testid="yt-channel">
                <p className="a2-sm adp-sub">
                  {ch.name} {ch.archived ? <span className="a2-pill line">{g('channels.archived')}</span> : null}
                </p>
                <p className="a2-sm a2-mute yt-break">
                  {ch.externalId} · {g('channels.videos', { n: n(ch.videos) })}
                </p>
                {canWrite && (on || !ch.archived) ? <YoutubeAct texts={texts} body={{ action: ch.archived ? 'channel.restore' : 'channel.archive', id: ch.id }} label={g(ch.archived ? 'channels.restore' : 'channels.archive')} testId="yt-channel-toggle" /> : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="a2-sm a2-mute yt-mt8">{g('channels.empty')}</p>
        )}
        {on && canWrite ? (
          <details className="a2-mt12 a2-more-opts" data-testid="yt-add-channel" open={!o.channels.length}>
            <summary className="a2-sm a2-b">{g('addChannel.h')}</summary>
            <YoutubeChannelForm texts={texts} w={{ link: g('addChannel.link'), linkPh: g('addChannel.linkPh'), name: g('addChannel.name'), namePh: g('addChannel.namePh'), add: g('addChannel.add'), added: g('addChannel.added') }} />
          </details>
        ) : null}
      </section>

      <section className="a2-sc a2-mt12" aria-labelledby="yt-v-h" data-testid="yt-videos">
        <h2 className="a2-h3" id="yt-v-h">
          {g('videos.h')}
        </h2>
        <p className="a2-xs a2-mute yt-mt8">{g('keyNote')}</p>
        {o.videos.length ? (
          <ul className="adp-rules">
            {o.videos.map((v) => (
              <li key={v.id} className="adp-rule" data-testid="yt-video" data-archived={v.archived ? 'yes' : 'no'}>
                <p className="a2-sm adp-sub">
                  {v.title} {v.archived ? <span className="a2-pill line">{g('videos.archived')}</span> : null}
                </p>
                <p className="a2-sm a2-mute">{[v.channelName, v.publishedAt ? g('videos.went', { when: day(v.publishedAt) }) : '', v.externalId].filter(Boolean).join(' · ')}</p>
                <p className="a2-sm" data-testid="yt-video-stats">
                  {g('videos.stats', { orders: n(v.orders), delivered: n(v.delivered), value: formatMoney(v.deliveredValueMinor, m), withProducts: n(v.withProducts) })}
                </p>
                {v.products.length ? (
                  <>
                    <p className="a2-xs a2-mute yt-mt8">{g('videos.links')}</p>
                    <ul className="yt-links">
                      {v.products.map((p) => {
                        const url = link(p.slug, v.externalId);
                        return (
                          <li key={p.id}>
                            <span className="a2-sm a2-b">{p.name}</span>
                            <code className="a2-xs yt-break" data-testid="yt-link">
                              {url}
                            </code>
                            {url ? <YoutubeCopy text={url} label={g('videos.copy')} done={g('videos.copied')} /> : null}
                          </li>
                        );
                      })}
                    </ul>
                  </>
                ) : (
                  <p className="a2-xs a2-mute yt-mt8">{g('videos.noProducts')}</p>
                )}
                {on && canWrite && !v.archived ? (
                  <details className="a2-mt12 a2-more-opts">
                    <summary className="a2-sm a2-b">{g('videos.edit')}</summary>
                    <YoutubeVideoEdit texts={texts} id={v.id} title={v.title} products={v.products.map((p) => p.slug).join('\n')} w={{ title: g('addVideo.title'), products: g('addVideo.products'), save: g('editVideo.save'), saved: g('editVideo.saved') }} />
                  </details>
                ) : null}
                <span className="a2-gap8 yt-mt8">
                  <a className="a2-btn" href={`https://www.youtube.com/watch?v=${encodeURIComponent(v.externalId)}`} target="_blank" rel="noopener noreferrer">
                    {g('videos.open')}
                  </a>
                  {canWrite && (on || !v.archived) ? <YoutubeAct texts={texts} body={{ action: v.archived ? 'video.restore' : 'video.archive', id: v.id }} label={g(v.archived ? 'videos.restore' : 'videos.archive')} testId="yt-video-toggle" /> : null}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="a2-sm a2-mute yt-mt8">{g('videos.empty')}</p>
        )}
        {on && canWrite ? (
          <details className="a2-mt12 a2-more-opts" data-testid="yt-add-video" open={!o.videos.length && liveChannels.length > 0}>
            <summary className="a2-sm a2-b">{g('addVideo.h')}</summary>
            {liveChannels.length ? (
              <YoutubeVideoForm
                texts={texts}
                channels={liveChannels.map((ch) => ({ id: ch.id, name: ch.name }))}
                w={{ channel: g('addVideo.channel'), link: g('addVideo.link'), linkPh: g('addVideo.linkPh'), title: g('addVideo.title'), day: g('addVideo.day'), products: g('addVideo.products'), productsPh: g('addVideo.productsPh'), add: g('addVideo.add'), added: g('addVideo.added') }}
              />
            ) : (
              <p className="a2-sm a2-mute yt-mt8">{g('addVideo.needChannel')}</p>
            )}
          </details>
        ) : null}
      </section>

      <div className="a2-mt12">
        <FieldsCard url={API} screen={{ key: o.card.key, value: o.card.value, version: o.card.version }} fields={cardFields} texts={cardTexts} canEdit={canWrite} testId="yt-card" />
      </div>
    </div>
  );
}
