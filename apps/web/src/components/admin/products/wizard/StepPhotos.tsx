'use client';
// S28 · PR 1033 — wizard step 4, "Photos & video" (prototype v5): a front photo for every colour (the product's photo manager), the
// optional video, and a plain "Google & speed" list that says which colours still lack a front photo. Publishing needs the front photos.
import { t } from '@/lib/i18n';
import { nameIn } from '../model';
import { PhotoManager } from '../PhotoManager';
import { VideoPanel } from '../VideoPanel';
import { Callout, CheckLine, Fld } from '../wizard-ui';
import type { Ctx } from './ctx';

export function StepPhotos({ c }: { c: Ctx }) {
  const { d, data, lang } = c;
  const p = c.photos;
  const shown = data.colours.filter((x) => !c.live.hiddenColourIds.includes(x.id));
  const missing = shown.filter((x) => !x.front);
  const total = data.photoCount;
  return (
    <>
      <Callout kind={missing.length ? 'warn' : 'good'}>{missing.length ? t(d, 'products.wiz.ph.needFront', { colours: missing.map((x) => nameIn(lang, x)).join(', ') }) : t(d, 'products.wiz.ph.allFront')}</Callout>
      <Fld dict={d} label={t(d, 'products.wiz.ph.photos')} tag="a">
        <PhotoManager
          dict={d}
          lang={lang}
          productId={data.productId}
          colours={shown.map((x) => ({ id: x.id, label: nameIn(lang, x), hex: x.hex }))}
          photos={p.gallery}
          images={p.images}
          notes={p.notes}
          canUpload={c.can.upload}
          settingsHref={c.settingsHref}
        />
      </Fld>
      <Fld dict={d} label={t(d, 'products.wiz.ph.video')} tag="a" hint={t(d, 'products.wiz.ph.videoHint')}>
        <VideoPanel dict={d} productId={data.productId} on={p.video.on} allowUpload={p.video.allowUpload} canWrite={c.can.write} maxUploadMb={p.video.maxUploadMb} video={p.video.current as never} settingsHref={c.settingsHref} />
      </Fld>
      <div className="wzp-box" data-testid="wiz-speed">
        <div className="ad-mini" style={{ marginBottom: 6 }}>
          <b>{t(d, 'products.wiz.ph.speed')}</b>
        </div>
        <CheckLine state={total > 0 ? 'ok' : 'no'}>{t(d, 'products.wiz.ph.ckCount', { n: total })}</CheckLine>
        <CheckLine state={missing.length ? 'stop' : 'ok'}>{t(d, 'products.wiz.ph.ckFront')}</CheckLine>
        <CheckLine state={p.notes.on ? 'ok' : 'dash'}>{p.notes.on ? t(d, 'products.wiz.ph.ckQualityOn') : t(d, 'products.wiz.ph.ckQualityOff')}</CheckLine>
        <CheckLine state={data.video ? 'ok' : 'dash'}>{data.video ? t(d, 'products.wiz.ph.ckVideo') : t(d, 'products.wiz.ph.ckNoVideo')}</CheckLine>
      </div>
    </>
  );
}
