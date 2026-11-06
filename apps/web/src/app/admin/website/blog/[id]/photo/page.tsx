// S12 · PR 547 (register "Image sourcing for the blog — the owner's own product photographs first … AI generation asks
// permission every time … Nothing is ever taken from Google image search"; Blueprint C11.6; BACKEND-ARCHITECTURE
// WEB-03 "image sourcing order") — Website › Blog & journal › the article › Main photo at
// /admin/website/blog/<id>/photo, drawn in Lumen (CN-036: the shared patterns, --lm-* tokens only, data-lm-ready): the
// photo in use (or none), then the shop's own pictures in their fixed order — (1) the photographs of the article's own
// products, (2) the photo library — each with "Use this photo"; studio pictures only while allowed and always labelled;
// the card `blog.images` (off as it ships: the shop shows no main photo). No picture from a web address, no AI here.
// Seeing needs `blog.read`; picking `blog.write`; the card `blog.publish`. Guide: docs/admin-guide/pages/website/blog-photo.md.
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { SettingCards } from '@/components/admin/lumen/SettingCards';
import { PickPhoto } from '@/components/admin/website/PickPhoto';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { ResponsiveImage } from '@/components/media/ResponsiveImage';
import { adminDeps } from '@/lib/admin-auth';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess, type AdminView } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { t, type Dict } from '@/lib/i18n';
import { PHOTO_SOURCES, photoScreen, type PhotoPick } from '@/lib/journal/images';
import bn from '../../../../../../../messages/admin-blog.bn.json';
import en from '../../../../../../../messages/admin-blog.en.json';
import './photo.css';

export const dynamic = 'force-dynamic';

const LIST = '/admin/website/blog';
const API = '/api/admin/blog/photo';
const KEY = 'blogPhoto';

function withScreen(view: AdminView): AdminView {
  return { ...view, dict: { ...view.dict, ...((view.lang === 'bn' ? bn : en) as unknown as Dict) } };
}

export async function generateMetadata(): Promise<Metadata> {
  const view = withScreen(await adminView());
  return { title: t(view.dict, 'jr.ph.meta'), robots: { index: false, follow: false } };
}

type Props = { params: Promise<{ id: string }> };

export default async function BlogPhotoPage(props: Props) {
  const deps = adminDeps();
  const [{ id }, plain] = await Promise.all([props.params, adminView(deps)]);
  const editor = `${LIST}/${encodeURIComponent(id)}`;
  const here = `${editor}/photo`;
  const access = await pageAccess('blog.read', deps, MOTHER_STORE_ID);
  const view = withScreen(plain);
  const d = view.dict;
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(here)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(d, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z">
        <ShellState view={view} kind="denied" permission="blog.read" />
      </div>
    );
  const l = (k: string, vars?: Record<string, string | number>) => t(d, `jr.ph.${k}`, vars);
  const r = await photoScreen(access.deps.db, access.deps.resolver, id);
  const crumb = (
    <Link className="ph-crumb" href={r ? editor : LIST}>
      {r ? l('back') : t(d, 'jr.e.back')}
    </Link>
  );
  if (!r)
    return (
      <div className="a2-z">
        <PageHead view={view} place={locateKey(KEY)} crumb={crumb} title={l('title')} />
        <ShellState view={view} kind="notfound" />
      </div>
    );
  const perms = access.guard.permissions;
  const canWrite = perms?.has('blog.write') ?? false;
  const canPublish = perms?.has('blog.publish') ?? false;
  const set = r.card.value;
  const num = (n: number) => new Intl.NumberFormat(view.locale, { numberingSystem: 'latn' }).format(n);
  const words = { done: l('done'), failed: l('failed') };
  const tile = (p: PhotoPick, inUse: boolean) => (
    <li key={p.id} className={`ph-it${inUse ? ' on' : ''}`} data-testid="ph-pick">
      <div className="ph-img">
        {p.image ? <ResponsiveImage image={p.image} slot="thumb" sizes="(max-width: 767px) 45vw, 180px" alt={p.alt ?? ''} /> : <span className="ph-none">{l('processing')}</span>}
      </div>
      <div className="ph-meta">
        {p.productName ? <span className="ph-name">{p.productName}</span> : null}
        {p.studio ? <span className="ph-pill warn">{l('studio')}</span> : null}
        {p.alt ? null : <span className="ph-pill">{l('noAlt')}</span>}
        {inUse ? <span className="ph-pill ok">{l('inUse')}</span> : canWrite ? <PickPhoto postId={r.post.id} assetId={p.id} label={l('use')} {...words} testId="ph-use" /> : null}
      </div>
    </li>
  );

  return (
    <div className="a2-z ph-page" data-testid="blog-photo" data-lm-ready="">
      <PageHead view={view} place={locateKey(KEY)} crumb={crumb} title={l('title')} sub={l('sub', { title: r.post.title })} />
      <SectionTabs view={view} current={KEY} />
      {set.show ? null : (
        <p className="lm-card ph-off" role="note" data-testid="ph-off">
          {l('off')}
        </p>
      )}
      <div className="ph-grid">
        <div className="ph-stack">
          <section className="lm-card" aria-labelledby="ph-now-h" data-testid="ph-current">
            <h2 className="lm-h2" id="ph-now-h">
              {l('now')}
            </h2>
            {r.current ? (
              <div className="ph-now">
                <ul className="ph-list">{tile(r.current, true)}</ul>
                {canWrite ? <PickPhoto postId={r.post.id} assetId={null} label={l('takeOff')} {...words} testId="ph-take-off" /> : null}
              </div>
            ) : (
              <p className="ph-sub">{l('none')}</p>
            )}
          </section>
          {PHOTO_SOURCES.map((src, i) => {
            const rows = r.sources[src];
            return (
              <section key={src} className="lm-card" aria-labelledby={`ph-${src}-h`} data-testid={`ph-${src}`}>
                <h2 className="lm-h2" id={`ph-${src}-h`}>
                  {l('step', { n: num(i + 1), name: l(`src.${src}`) })}
                </h2>
                <p className="ph-sub">{l(`src.${src}Sub`)}</p>
                {rows.length ? (
                  <ul className="ph-list">{rows.map((p) => tile(p, p.id === r.post.heroAssetId))}</ul>
                ) : (
                  <p className="ph-sub" data-testid={`ph-${src}-empty`}>
                    {src === 'products' && !r.post.products ? l('noProducts') : l(`src.${src}Empty`)}{' '}
                    <Link href={src === 'products' ? editor : '/admin/products'}>{src === 'products' && !r.post.products ? l('openEditor') : l('openLibrary')}</Link>
                  </p>
                )}
              </section>
            );
          })}
        </div>
        <div className="ph-stack">
          {canPublish ? (
            <SettingCards
              save={{ method: 'PUT', url: API }}
              cards={[
                {
                  key: r.card.key,
                  title: l('card'),
                  text: l('cardText'),
                  on: set.show,
                  fields: [
                    {
                      name: 'studio',
                      label: l('studioField'),
                      kind: 'select',
                      value: set.studio ? 'yes' : 'no',
                      options: [
                        { value: 'no', label: l('studioNo') },
                        { value: 'yes', label: l('studioYes') },
                      ],
                      hint: l('studioHint'),
                    },
                    { name: 'perSource', label: l('perSource'), kind: 'number', value: set.perSource, min: 4, max: 60, step: 1 },
                  ],
                },
              ]}
              testId="ph-card"
            />
          ) : (
            <p className="lm-card ph-sub" data-testid="ph-readonly">
              {l('readOnly')}
            </p>
          )}
          <section className="lm-card" aria-labelledby="ph-rules-h">
            <h2 className="lm-h2" id="ph-rules-h">
              {l('rules')}
            </h2>
            <ol className="ph-how">
              {['rule1', 'rule2', 'rule3', 'rule4'].map((k) => (
                <li key={k}>{l(k)}</li>
              ))}
            </ol>
          </section>
        </div>
      </div>
    </div>
  );
}
