'use client';
// S28 · PR 1036 — wizard step 7, "Google & link" (prototype v5): the search word, the title and description Google shows, the page link,
// a live preview of the Google result and the seven checks with their score. Each field saves by itself; "Suggest" fills what is empty.
import { slugOf, suggestKeyword, wizardSeo } from '@extas/catalogue/wizard-model';
import { useEffect, useMemo, useState } from 'react';
import { t } from '@/lib/i18n';
import { nameIn } from '../model';
import { CheckLine, Fld, Tag, useDebounced } from '../wizard-ui';
import { patchNaming, patchProduct } from './api';
import type { Ctx } from './ctx';

export function StepGoogle({ c }: { c: Ctx }) {
  const { d, data, lang } = c;
  const id = data.productId;
  const [keyword, setKeyword] = useState(data.focusKeyword ?? '');
  const [title, setTitle] = useState(data.seoTitleEn);
  const [desc, setDesc] = useState(data.metaDescriptionEn);
  const [slug, setSlug] = useState(data.slug);
  const [slugErr, setSlugErr] = useState('');
  const cat = c.lists.categories.find((x) => x.id === c.live.categoryId);
  const brand = c.lists.brands.find((b) => b.id === c.live.brandId)?.name ?? null;
  const ownBrand = c.lists.brands.find((b) => b.id === c.ownBrandId)?.name ?? null;
  const missingFront = data.colours.filter((x) => !c.live.hiddenColourIds.includes(x.id) && !x.front).length;
  const page = `${c.live.description} ${c.live.keyPoints}`;

  const save = async (p: Promise<{ status: number; data: Record<string, unknown> }>, after?: (ok: boolean) => void) => {
    const a = await p;
    if (a.status === 200) {
      c.saved();
      after?.(true);
    } else {
      after?.(false);
      c.refuse(a as never);
    }
  };
  useDebounced(keyword, 700, (v) => void save(patchProduct(id, { focusKeyword: v.trim() || null })));
  useDebounced(title, 700, (v) => void save(patchNaming(id, { seoTitleEn: v.trim() || null })));
  useDebounced(desc, 700, (v) => void save(patchNaming(id, { metaDescriptionEn: v.trim() || null })));
  useDebounced(slug, 700, (v) => {
    if (!v || v === data.slug) return;
    void save(patchNaming(id, { slug: v }), (ok) => setSlugErr(ok ? '' : t(d, 'products.wiz.google.slugTaken')));
  });
  useEffect(() => c.setLive({ keyword, title, metaDescription: desc, slug }), [keyword, title, desc, slug]); // eslint-disable-line react-hooks/exhaustive-deps

  const seo = useMemo(() => wizardSeo({ title, description: desc, keyword, pageText: page, slug, coloursWithoutFront: missingFront }, c.place), [title, desc, keyword, page, slug, missingFront, c.place]);
  const suggest = () => {
    const name = c.live.name || data.nameEn;
    if (!keyword) setKeyword(suggestKeyword({ brand, ownBrand, categoryName: cat ? nameIn('en', cat) : name, place: t(d, 'products.wiz.google.placeWord') }));
    if (!title) setTitle(`${name} | ${t(d, 'products.wiz.google.titleTail')}`.slice(0, 60));
    if (!desc) setDesc(t(d, 'products.wiz.google.descTemplate', { name }).slice(0, 160));
    if (!slug || slug === data.slug) setSlug(slugOf(name));
  };
  const band = seo.band === 'good' ? 'ok' : seo.band === 'ok' ? 'warn' : 'bad';
  const shownTitle = title || `${c.live.name || data.nameEn} | ${t(d, 'products.wiz.google.titleTail')}`;
  const origin = t(d, 'products.wiz.google.origin');

  return (
    <>
      <div style={{ marginBottom: 10 }}>
        <button type="button" className="ad-btn ad-btn-ghost" onClick={suggest} disabled={!c.can.write} data-testid="wiz-suggest">
          {t(d, 'products.wiz.google.suggest')}
        </button>
      </div>
      <div className="wzp-grid2">
        <Fld dict={d} label={t(d, 'products.wiz.google.keyword')} tag="a" htmlFor="wz-kw" hint={t(d, 'products.wiz.google.keywordHint')}>
          <input id="wz-kw" className="ad-input" value={keyword} onChange={(e) => setKeyword(e.target.value)} maxLength={80} disabled={!c.can.write} />
        </Fld>
        <Fld dict={d} label={t(d, 'products.wiz.google.slug')} tag="a" htmlFor="wz-slug" hint={slugErr || t(d, 'products.wiz.google.slugHint')}>
          <input id="wz-slug" className="ad-input" value={slug} onChange={(e) => setSlug(slugOf(e.target.value))} maxLength={60} disabled={!c.can.write} />
        </Fld>
      </div>
      <Fld dict={d} label={t(d, 'products.wiz.google.title')} tag="a" htmlFor="wz-title" hint={t(d, 'products.wiz.google.titleHint', { n: title.length })}>
        <input id="wz-title" className="ad-input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={300} disabled={!c.can.write} />
      </Fld>
      <Fld dict={d} label={t(d, 'products.wiz.google.desc')} tag="a" htmlFor="wz-gdesc" hint={t(d, 'products.wiz.google.descHint', { n: desc.length })}>
        <textarea id="wz-gdesc" className="ad-input" rows={3} value={desc} onChange={(e) => setDesc(e.target.value)} maxLength={1000} disabled={!c.can.write} />
      </Fld>
      <div className="wzp-gprev" data-testid="wiz-gprev" aria-label={t(d, 'products.wiz.google.preview')}>
        <div className="u">{origin}/{slug || '…'}</div>
        <div className="ti">{shownTitle}</div>
        <div className="de">{desc || t(d, 'products.wiz.google.descEmpty')}</div>
      </div>
      <div className="wzp-box" data-testid="wiz-seo">
        <div className="ad-mini" style={{ marginBottom: 6 }}>
          <b>{t(d, 'products.wiz.google.score', { n: seo.score })}</b> <span className={`wzp-pill ${band}`}>{t(d, `products.wiz.google.band_${seo.band}`)}</span> <Tag dict={d} kind="a" />
        </div>
        {seo.checks.map((k) => (
          <CheckLine key={k.key} state={k.ok ? 'ok' : 'no'}>
            {t(d, `products.wiz.google.ck_${k.key}`)}
          </CheckLine>
        ))}
        <div className="ad-mini" style={{ marginTop: 6 }}>{lang === 'bn' ? t(d, 'products.wiz.google.note') : t(d, 'products.wiz.google.note')}</div>
      </div>
    </>
  );
}
