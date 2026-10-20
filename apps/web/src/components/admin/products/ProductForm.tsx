'use client';
// PR 21 — the product edit form (demo 90-admin-catalog.js: zp-ed, zp-col, size-pill, zp-stk, zp-slots, zp-savebar).
// Everything typed is kept here until "Save changes"; then one request (model.ts buildSave) is applied in order by the
// server (product-form.ts) and the form starts again from what was written. Photos are placed at once through the
// media API (they are files, not form fields). Prices are typed only by someone with `catalogue.prices`; stock is shown,
// never typed (it comes from the ERP). Taking a colour or size off retires its SKUs — kept, never deleted.
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { NamingView, ProductView, Readiness, VariantView } from '@extas/catalogue';
import { suggestSku } from '@extas/catalogue/sku';
import type { ImageSource } from '@extas/media/delivery';
import type { ProductPhoto } from '@extas/media';
import { ResponsiveImage, altFor } from '@/components/media/ResponsiveImage';
import { t, type Dict } from '@/lib/i18n';
import { call } from '../api';
import { Icon } from '../Icon';
import {
  buildSave,
  checkText,
  comboKey,
  formatNumber,
  initialState,
  liveVariants,
  nameIn,
  refusalText,
  type CategoryOption,
  type ColourOption,
  type FabricOption,
  type FormState,
  type Lang,
  type Money,
  type SizeOption,
} from './model';
import { statusKey } from './ProductList';
import { useToast } from './useToast';

export interface FormCan {
  write: boolean;
  prices: boolean;
  publish: boolean;
  upload: boolean;
}

interface Props {
  dict: Dict;
  lang: Lang;
  product: ProductView;
  naming: NamingView;
  readiness: Readiness;
  stock: Record<string, number>;
  categories: CategoryOption[];
  fabrics: FabricOption[];
  colours: ColourOption[];
  sizes: SizeOption[];
  money: Money;
  skuTemplate: string;
  frontPerColour: boolean;
  /** The product's photos; null = this person may not see the media library. */
  gallery: ProductPhoto[] | null;
  images: Record<string, ImageSource>;
  can: FormCan;
}

/** Kinds of photo a person can pick for an extra photo (the media library's kinds; video has its own screen). */
const EXTRA_KINDS = ['DETAIL', 'ON_MODEL', 'FLAT_LAY', 'FABRIC', 'TRUE_COLOUR', 'SET', 'OTHER', 'BACK', 'FRONT'] as const;

type TextKey = 'nameEn' | 'nameBn' | 'erpStyleCode' | 'descriptionEn' | 'descriptionBn' | 'careEn' | 'careBn' | 'slug' | 'seoTitleEn' | 'seoTitleBn' | 'metaDescriptionEn' | 'metaDescriptionBn' | 'feedTitle';

export function ProductForm(props: Props) {
  const { dict: d, lang, readiness, stock, categories, fabrics, sizes, money, skuTemplate, frontPerColour, gallery, images, can } = props;
  const router = useRouter();
  const [product, setProduct] = useState(props.product);
  const [naming, setNaming] = useState(props.naming);
  const [base, setBase] = useState<FormState>(() => initialState(props.product, props.naming, money));
  const [draft, setDraft] = useState<FormState>(base);
  const [colours, setColours] = useState(props.colours);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, say] = useToast();
  const newName = useRef<HTMLInputElement>(null);
  const newHex = useRef<HTMLInputElement>(null);
  const [extraKind, setExtraKind] = useState<string>(EXTRA_KINDS[0]);

  const built = useMemo(() => buildSave(base, draft, product, money, can.prices), [base, draft, product, money, can.prices]);
  const dirty = built.dirty;
  const num = (n: number) => formatNumber(n, money.locale);
  const colourById = useMemo(() => new Map(colours.map((c) => [c.id, c])), [colours]);
  const sizeById = useMemo(() => new Map(sizes.map((s) => [s.id, s])), [sizes]);
  const colourName = (id: string) => {
    const c = colourById.get(id);
    return c ? nameIn(lang, c) : id;
  };

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setDraft((s) => ({ ...s, [k]: v }));
  const text = (k: TextKey) => ({ value: draft[k], onChange: (e: { target: { value: string } }) => set(k, e.target.value), disabled: !can.write });

  // ---------------------------------------------------------------- save, cancel
  const save = async () => {
    if (built.problems.length) {
      const list = built.problems.map((p) => (p === 'nameEn' ? t(d, 'products.fields.nameEn') : t(d, `products.save.bad.${p.split(':')[0]}`, { sku: p.slice(p.indexOf(':') + 1) })));
      return say(t(d, 'products.save.check', { list: list.join(t(d, 'checks.sep')) }));
    }
    if (!dirty) return say(t(d, 'products.save.nothing'));
    setBusy('save');
    try {
      const a = await call('POST', `/api/admin/catalogue/products/${product.id}/form`, built.input);
      if (a.status !== 200) return say(refusalText(d, a.data.error, a.data.details));
      const p = a.data.product as ProductView;
      const n = a.data.naming as NamingView;
      const next = initialState(p, n, money);
      setProduct(p);
      setNaming(n);
      setBase(next);
      setDraft(next);
      say(t(d, 'products.save.saved'));
      router.refresh();
    } finally {
      setBusy(null);
    }
  };

  // ---------------------------------------------------------------- publish, take off, archive
  const act = async (url: string, body: unknown, done: string) => {
    setBusy(url);
    try {
      const a = await call('POST', url, body);
      if (a.status !== 200) return say(refusalText(d, a.data.error, a.data.details));
      const bulk = a.data.bulk as { results?: { ok: boolean; error?: string; details?: string[] }[] } | undefined;
      const first = bulk?.results?.[0];
      if (first && !first.ok) return say(refusalText(d, first.error, first.details));
      say(t(d, done));
      router.refresh();
    } finally {
      setBusy(null);
    }
  };
  const publish = (action: 'publish' | 'unpublish') => {
    if (action === 'unpublish' && !window.confirm(t(d, 'products.publish.confirmOff'))) return;
    void act(`/api/admin/catalogue/products/${product.id}/publish`, { action }, action === 'publish' ? 'products.publish.published' : 'products.publish.unpublished');
  };
  const archive = (on: boolean) => {
    if (on && !window.confirm(t(d, 'products.publish.confirmArchive'))) return;
    void act('/api/admin/catalogue/products/bulk', { action: on ? 'archive' : 'restore', productIds: [product.id] }, on ? 'products.publish.archived' : 'products.publish.restored');
  };

  // ---------------------------------------------------------------- colours and sizes
  const toggleColour = (id: string) => set('colours', draft.colours.includes(id) ? draft.colours.filter((c) => c !== id) : [...draft.colours, id]);
  const toggleSize = (id: string) =>
    set(
      'sizes',
      draft.sizes.includes(id) ? draft.sizes.filter((s) => s !== id) : [...draft.sizes, id].sort((a, b) => (sizeById.get(a)?.sortOrder ?? 0) - (sizeById.get(b)?.sortOrder ?? 0)),
    );
  const addColour = async () => {
    const nameEn = newName.current?.value.trim() ?? '';
    const hex = newHex.current?.value ?? '';
    if (!nameEn) return say(t(d, 'products.colours.needName'));
    setBusy('colour');
    try {
      const a = await call('POST', '/api/admin/catalogue/colours', { nameEn, hex });
      if (a.status !== 201) return say(refusalText(d, a.data.error, a.data.details));
      const created = a.data.created as { colour: ColourOption; warnings: { key: string }[] };
      setColours((list) => [...list, created.colour]);
      setDraft((s) => ({ ...s, colours: [...s.colours, created.colour.id] }));
      if (newName.current) newName.current.value = '';
      say(created.warnings.length ? t(d, 'products.colours.similar', { name: nameEn, other: created.warnings.map((w) => w.key).join(t(d, 'checks.sep')) }) : t(d, 'products.colours.added', { name: nameEn }));
    } finally {
      setBusy(null);
    }
  };

  // ---------------------------------------------------------------- variants grid
  const live = liveVariants(product);
  const byCombo = new Map(live.map((v) => [comboKey(v.colour?.id ?? null, v.size?.id ?? null), v]));
  const loose = live.filter((v) => !v.colour || !v.size);
  const setPrice = (v: VariantView, k: 'price' | 'compareAt', value: string) =>
    setDraft((s) => ({ ...s, prices: { ...s.prices, [v.id]: { price: s.prices[v.id]?.price ?? '', compareAt: s.prices[v.id]?.compareAt ?? '', [k]: value } } }));
  const setFresh = (key: string, k: 'sku' | 'price' | 'compareAt', value: string) =>
    setDraft((s) => {
      const was = s.fresh[key] ?? { sku: '', price: '', compareAt: '' };
      return { ...s, fresh: { ...s.fresh, [key]: { ...was, [k]: value } } };
    });
  const suggestion = (colourId: string, sizeId: string) => {
    const c = colourById.get(colourId);
    const z = sizeById.get(sizeId);
    return suggestSku(skuTemplate, { style: draft.erpStyleCode || null, colour: c ? (c.erpColorCode ?? c.key) : null, size: z ? (z.erpSizeCode ?? z.label) : null });
  };
  const missingCombos = draft.colours.flatMap((c) => draft.sizes.filter((z) => !byCombo.has(comboKey(c, z))).map((z) => [c, z] as const));
  const fillSkus = () => {
    let n = 0;
    setDraft((s) => {
      const fresh = { ...s.fresh };
      for (const [c, z] of missingCombos) {
        const key = comboKey(c, z);
        const sku = suggestion(c, z);
        if (!sku || fresh[key]?.sku) continue;
        fresh[key] = { price: fresh[key]?.price ?? '', compareAt: fresh[key]?.compareAt ?? '', sku };
        n++;
      }
      return { ...s, fresh };
    });
    say(n ? t(d, 'products.variants.filled', { n: num(n) }) : t(d, draft.erpStyleCode ? 'products.variants.nothingToFill' : 'products.variants.needStyle'));
  };
  const [samePrice, setSamePrice] = useState('');
  const applyPrice = () => {
    if (!samePrice.trim()) return;
    setDraft((s) => {
      const prices = { ...s.prices };
      for (const v of live) prices[v.id] = { price: samePrice, compareAt: prices[v.id]?.compareAt ?? '' };
      const fresh = { ...s.fresh };
      for (const [c, z] of missingCombos) {
        const key = comboKey(c, z);
        fresh[key] = { sku: fresh[key]?.sku ?? '', compareAt: fresh[key]?.compareAt ?? '', price: samePrice };
      }
      return { ...s, prices, fresh };
    });
  };

  // ---------------------------------------------------------------- photos
  const uploadAndPlace = async (file: File, role: string, colourId: string | null, replace: ProductPhoto | null) => {
    setBusy(`photo:${role}:${colourId ?? ''}`);
    try {
      const form = new FormData();
      form.append('file', file);
      let up: { ok?: boolean; error?: string; details?: string[]; asset?: { id: string } };
      try {
        const res = await fetch('/api/admin/media', { method: 'POST', body: form, credentials: 'same-origin' });
        up = (await res.json().catch(() => ({ ok: false, error: 'server-error' }))) as typeof up;
      } catch {
        up = { ok: false, error: 'network' };
      }
      if (!up.ok || !up.asset) return say(refusalText(d, up.error, up.details));
      const url = `/api/admin/media/products/${product.id}`;
      const a = await call('POST', url, { action: 'attach', assetId: up.asset.id, role, colourId });
      if (a.status !== 200) return say(refusalText(d, a.data.error, a.data.details));
      if (replace && replace.assetId !== up.asset.id) await call('POST', url, { action: 'detach', productMediaId: replace.id });
      say(t(d, 'products.photos.uploaded'));
      router.refresh();
    } finally {
      setBusy(null);
    }
  };
  const takeOff = async (p: ProductPhoto) => {
    if (!window.confirm(t(d, 'products.photos.confirmOff'))) return;
    setBusy(`off:${p.id}`);
    try {
      const a = await call('POST', `/api/admin/media/products/${product.id}`, { action: 'detach', productMediaId: p.id });
      say(a.status === 200 ? t(d, 'products.photos.removed') : refusalText(d, a.data.error, a.data.details));
      if (a.status === 200) router.refresh();
    } finally {
      setBusy(null);
    }
  };

  const savedColours = product.colours.filter((c) => !c.archived);
  const required = readiness.photos.required;
  const slots: { role: string; colourId: string | null; label: string }[] = [
    ...(frontPerColour ? savedColours.map((c) => ({ role: 'FRONT', colourId: c.colourId, label: t(d, 'products.photos.frontOf', { colour: nameIn(lang, c) }) })) : []),
    ...required.filter((r) => !(frontPerColour && savedColours.length && r === 'FRONT')).map((r) => ({ role: r as string, colourId: null, label: t(d, `products.photos.kinds.${r}`) })),
  ];
  const used = new Set<string>();
  const slotPhoto = (role: string, colourId: string | null) => {
    const list = (gallery ?? []).filter((g) => g.role === role && !used.has(g.id));
    const p = colourId ? list.find((g) => g.colourId === colourId) : (list.find((g) => !g.colourId) ?? list[0]);
    if (p) used.add(p.id);
    return p ?? null;
  };
  const filled = slots.map((s) => ({ ...s, photo: slotPhoto(s.role, s.colourId) }));
  const others = (gallery ?? []).filter((g) => !used.has(g.id) && g.role !== 'VIDEO');

  const photoTile = (key: string, label: string, photo: ProductPhoto | null, place: { role: string; colourId: string | null } | null, sub?: ReactNode) => {
    const img = photo ? images[photo.assetId] : undefined;
    const inputId = `ph-${key}`;
    const working = busy === `photo:${place?.role}:${place?.colourId ?? ''}` || (photo ? busy === `off:${photo.id}` : false);
    return (
      <div key={key} className={`pa-slot${photo ? ' has' : ''}`}>
        <div className="pa-slotimg">
          {img ? <ResponsiveImage image={img} slot="thumb" sizes="(max-width: 767px) 45vw, 160px" alt={altFor(img, lang, label)} /> : photo ? <span className="ad-mini">{t(d, 'products.photos.processing')}</span> : <Icon name="camera" size={28} />}
        </div>
        <div className="pa-slotf">
          <span className="ad-mini pa-slotl">{label}</span>
          {sub}
          {can.upload && place ? (
            <>
              <input
                id={inputId}
                className="pa-file"
                type="file"
                accept="image/*"
                disabled={working}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (f) void uploadAndPlace(f, place.role, place.colourId, photo);
                }}
              />
              <label htmlFor={inputId} className="pa-link">
                {working ? t(d, 'products.photos.uploading') : t(d, photo ? 'products.photos.replace' : 'products.photos.upload')}
              </label>
            </>
          ) : null}
          {can.upload && photo ? (
            <button type="button" className="pa-link" disabled={working} onClick={() => takeOff(photo)}>
              {t(d, 'products.photos.remove')}
            </button>
          ) : null}
        </div>
      </div>
    );
  };

  // ---------------------------------------------------------------- naming helpers
  const field = (k: 'seoTitle' | 'metaDescription', l: 'en' | 'bn') => naming[k][l];
  const counter = (value: string, fallback: string, max: number) => {
    const n = (value || fallback).length;
    return <span className={`ad-mini${n > max ? ' bad' : ''}`}>{t(d, 'products.fields.chars', { n: num(n), max: num(max) })}</span>;
  };
  const prefix = naming.path.endsWith(naming.slug) ? naming.path.slice(0, naming.path.length - naming.slug.length) : '';
  const previewTitle = (lang === 'bn' ? draft.seoTitleBn || field('seoTitle', 'bn').value : '') || draft.seoTitleEn || field('seoTitle', 'en').value;
  const previewDesc = (lang === 'bn' ? draft.metaDescriptionBn || field('metaDescription', 'bn').value : '') || draft.metaDescriptionEn || field('metaDescription', 'en').value;

  const st = statusKey(product);
  const isLive = product.status === 'PUBLISHED';
  const failing = readiness.checks.filter((c) => !c.ok).sort((a, b) => (a.level === b.level ? 0 : a.level === 'block' ? -1 : 1));
  const passing = readiness.checks.filter((c) => c.ok);
  const disabledWrite = !can.write;
  const opt = <span className="opt">{t(d, 'products.fields.optional')}</span>;

  return (
    <>
      <div className="pa-ed">
        <div className="pa-edmain">
          {/* ---------------- Basics ---------------- */}
          <section className="ad-card" aria-labelledby="sec-basics">
            <h2 id="sec-basics">{t(d, 'products.sections.basics')}</h2>
            <p className="ad-sub">{t(d, 'products.sections.basicsSub')}</p>
            <div className="pa-f2">
              <Field label={t(d, 'products.fields.nameEn')} id="f-nameEn" help={t(d, 'products.fields.nameHelp')}>
                <input id="f-nameEn" className="ad-input" maxLength={200} {...text('nameEn')} aria-invalid={!draft.nameEn.trim() || undefined} />
              </Field>
              <Field label={t(d, 'products.fields.nameBn')} id="f-nameBn" extra={opt}>
                <input id="f-nameBn" className="ad-input" lang="bn" maxLength={200} {...text('nameBn')} />
              </Field>
              <Field label={t(d, 'products.fields.category')} id="f-cat">
                <select id="f-cat" className="ad-input" value={draft.categoryId} disabled={disabledWrite} onChange={(e) => set('categoryId', e.target.value)}>
                  <option value="">{t(d, 'products.fields.choose')}</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {`${'· '.repeat(Math.max(0, c.depth - 1))}${nameIn(lang, c)}`}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={t(d, 'products.fields.fabric')} id="f-fab">
                <select id="f-fab" className="ad-input" value={draft.fabricId} disabled={disabledWrite} onChange={(e) => set('fabricId', e.target.value)}>
                  <option value="">{t(d, 'products.fields.choose')}</option>
                  {fabrics.map((f) => (
                    <option key={f.id} value={f.id}>
                      {nameIn(lang, f)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={t(d, 'products.fields.style')} id="f-style" help={t(d, 'products.fields.styleHelp')} extra={opt}>
                <input id="f-style" className="ad-input" maxLength={60} {...text('erpStyleCode')} />
              </Field>
              <div className="pa-fld">
                <span className="ad-label">{t(d, 'products.fields.sizeChart')}</span>
                <div className="pa-ro">
                  {readiness.sizeChart ? t(d, readiness.sizeChart.via === 'product' ? 'products.fields.sizeChartOwn' : 'products.fields.sizeChartCat', { name: readiness.sizeChart.name }) : t(d, 'products.fields.sizeChartNone')}
                </div>
              </div>
            </div>
            <Field label={t(d, 'products.fields.descriptionEn')} id="f-den">
              <textarea id="f-den" className="ad-input pa-ta" rows={3} maxLength={10000} {...text('descriptionEn')} />
            </Field>
            <Field label={t(d, 'products.fields.descriptionBn')} id="f-dbn" extra={opt}>
              <textarea id="f-dbn" className="ad-input pa-ta" lang="bn" rows={3} maxLength={10000} {...text('descriptionBn')} />
            </Field>
            <div className="pa-f2">
              <Field label={t(d, 'products.fields.careEn')} id="f-cen" extra={opt}>
                <textarea id="f-cen" className="ad-input pa-ta" rows={2} maxLength={1000} {...text('careEn')} />
              </Field>
              <Field label={t(d, 'products.fields.careBn')} id="f-cbn" extra={opt}>
                <textarea id="f-cbn" className="ad-input pa-ta" lang="bn" rows={2} maxLength={1000} {...text('careBn')} />
              </Field>
            </div>
          </section>

          {/* ---------------- Name, link & Google ---------------- */}
          <section className="ad-card" aria-labelledby="sec-naming">
            <h2 id="sec-naming">{t(d, 'products.sections.naming')}</h2>
            <p className="ad-sub">{t(d, 'products.sections.namingSub')}</p>
            <Field label={t(d, 'products.fields.slug')} id="f-slug" help={t(d, 'products.fields.slugHelp')}>
              <div className="pa-prefix">
                <span className="ad-mini">{prefix}</span>
                <input id="f-slug" className="ad-input" maxLength={200} {...text('slug')} />
              </div>
              {draft.slug !== naming.templateSlug && can.write ? (
                <button type="button" className="pa-link" onClick={() => set('slug', naming.templateSlug)}>
                  {t(d, 'products.fields.useTemplateSlug', { slug: naming.templateSlug })}
                </button>
              ) : null}
            </Field>
            <div className="pa-f2">
              {(['en', 'bn'] as const).map((l) => {
                const k = l === 'en' ? 'seoTitleEn' : 'seoTitleBn';
                const f = field('seoTitle', l);
                return (
                  <Field key={k} label={t(d, `products.fields.${k}`)} id={`f-${k}`} extra={counter(draft[k], f.source === 'template' ? f.value : '', f.max)} help={t(d, 'products.fields.templateHint')}>
                    <input id={`f-${k}`} className="ad-input" lang={l} maxLength={300} placeholder={f.source === 'template' ? f.value : ''} {...text(k)} />
                  </Field>
                );
              })}
              {(['en', 'bn'] as const).map((l) => {
                const k = l === 'en' ? 'metaDescriptionEn' : 'metaDescriptionBn';
                const f = field('metaDescription', l);
                return (
                  <Field key={k} label={t(d, `products.fields.${k}`)} id={`f-${k}`} extra={counter(draft[k], f.source === 'template' ? f.value : '', f.max)}>
                    <textarea id={`f-${k}`} className="ad-input pa-ta" lang={l} rows={3} maxLength={1000} placeholder={f.source === 'template' ? f.value : ''} {...text(k)} />
                  </Field>
                );
              })}
            </div>
            <Field label={t(d, 'products.fields.feedTitle')} id="f-feed" extra={counter(draft.feedTitle, naming.feedTitle.source === 'template' ? naming.feedTitle.value : '', naming.feedTitle.max)}>
              <input id="f-feed" className="ad-input" maxLength={300} placeholder={naming.feedTitle.source === 'template' ? naming.feedTitle.value : ''} {...text('feedTitle')} />
            </Field>
            <div className="pa-google" aria-label={t(d, 'products.fields.preview')}>
              <div className="ad-mini">{t(d, 'products.fields.preview')}</div>
              <div className="pa-g-url">{`${prefix}${draft.slug}`}</div>
              <div className="pa-g-title">{previewTitle}</div>
              <div className="pa-g-desc">{previewDesc}</div>
            </div>
          </section>

          {/* ---------------- Colours ---------------- */}
          <section className="ad-card" aria-labelledby="sec-colours">
            <h2 id="sec-colours">{t(d, 'products.sections.colours')}</h2>
            <p className="ad-sub">{t(d, 'products.sections.coloursSub', { n: num(draft.colours.length) })}</p>
            <div className="pa-cols">
              {draft.colours.length ? (
                draft.colours.map((id) => {
                  const c = colourById.get(id);
                  return (
                    <span key={id} className="pa-col on">
                      <i style={{ background: c?.hex }} />
                      {colourName(id)}
                      {can.write ? (
                        <button type="button" className="pa-x" aria-label={t(d, 'products.colours.remove', { name: colourName(id) })} onClick={() => toggleColour(id)}>
                          <Icon name="close" size={14} />
                        </button>
                      ) : null}
                    </span>
                  );
                })
              ) : (
                <span className="ad-mini">{t(d, 'products.colours.none')}</span>
              )}
            </div>
            {can.write ? (
              <>
                <div className="ad-label pa-gap">{t(d, 'products.colours.add')}</div>
                <div className="pa-cols">
                  {colours
                    .filter((c) => !draft.colours.includes(c.id))
                    .map((c) => (
                      <button key={c.id} type="button" className="pa-col" onClick={() => toggleColour(c.id)}>
                        <i style={{ background: c.hex }} />
                        {nameIn(lang, c)}
                      </button>
                    ))}
                </div>
                <div className="pa-newcol">
                  <label className="pa-vh" htmlFor="f-newcol">
                    {t(d, 'products.colours.newName')}
                  </label>
                  <input id="f-newcol" ref={newName} className="ad-input" maxLength={60} placeholder={t(d, 'products.colours.newName')} />
                  <input ref={newHex} type="color" className="pa-hex" aria-label={t(d, 'products.colours.newHex')} />
                  <button type="button" className="ad-btn ad-btn-ghost ad-btn-sm" disabled={busy === 'colour'} onClick={addColour}>
                    <Icon name="plus" size={16} />
                    {t(d, 'products.colours.newAdd')}
                  </button>
                </div>
              </>
            ) : null}
          </section>

          {/* ---------------- Sizes ---------------- */}
          <section className="ad-card" aria-labelledby="sec-sizes">
            <h2 id="sec-sizes">{t(d, 'products.sections.sizes')}</h2>
            <p className="ad-sub">{t(d, 'products.sections.sizesSub')}</p>
            <div className="pa-sizes" role="group" aria-labelledby="sec-sizes">
              {sizes.map((z) => (
                <button key={z.id} type="button" className="pa-size" aria-pressed={draft.sizes.includes(z.id)} disabled={disabledWrite} onClick={() => toggleSize(z.id)}>
                  {z.label}
                </button>
              ))}
            </div>
          </section>

          {/* ---------------- SKUs, prices and stock ---------------- */}
          <section className="ad-card" aria-labelledby="sec-variants">
            <h2 id="sec-variants">{t(d, 'products.sections.variants')}</h2>
            <p className="ad-sub">{t(d, 'products.sections.variantsSub')}</p>
            {can.write ? (
              <div className="pa-tools">
                <button type="button" className="ad-btn ad-btn-ghost ad-btn-sm" onClick={fillSkus} disabled={!missingCombos.length}>
                  {t(d, 'products.variants.fill')}
                </button>
                {can.prices ? (
                  <span className="pa-same">
                    <label className="pa-vh" htmlFor="f-same">
                      {t(d, 'products.variants.samePrice')}
                    </label>
                    <input id="f-same" className="ad-input" inputMode="decimal" placeholder={t(d, 'products.variants.samePrice')} value={samePrice} onChange={(e) => setSamePrice(e.target.value)} />
                    <button type="button" className="ad-btn ad-btn-ghost ad-btn-sm" onClick={applyPrice}>
                      {t(d, 'products.variants.apply')}
                    </button>
                  </span>
                ) : (
                  <span className="ad-mini">{t(d, 'products.variants.pricesLocked')}</span>
                )}
              </div>
            ) : null}
            <div className="pa-stks">
              {draft.colours.map((cid) => {
                const c = colourById.get(cid);
                const pieces = draft.sizes.reduce((sum, z) => {
                  const v = byCombo.get(comboKey(cid, z));
                  return sum + (v ? (stock[v.id] ?? 0) : 0);
                }, 0);
                return (
                  <div key={cid} className="pa-stk">
                    <div className="pa-stkh">
                      <i style={{ background: c?.hex }} />
                      <b>{colourName(cid)}</b>
                      <span className="ad-mini">{t(d, 'products.variants.pieces', { n: num(pieces) })}</span>
                    </div>
                    {draft.sizes.length ? (
                      <div className="pa-stkg">
                        {draft.sizes.map((zid) => {
                          const key = comboKey(cid, zid);
                          const v = byCombo.get(key);
                          const z = sizeById.get(zid);
                          if (v) {
                            const cell = draft.prices[v.id] ?? { price: '', compareAt: '' };
                            return (
                              <div key={key} className="pa-sk">
                                <div className="pa-skh">
                                  <b>{z?.label}</b>
                                  <span className="ad-mini">{t(d, 'products.variants.stock', { n: num(stock[v.id] ?? 0) })}</span>
                                </div>
                                <span className="ad-mini pa-sku" translate="no">
                                  {v.sku}
                                </span>
                                <PriceInputs d={d} id={v.id} cell={cell} disabled={!can.prices || !can.write} onChange={(k, value) => setPrice(v, k, value)} />
                              </div>
                            );
                          }
                          const cell = draft.fresh[key] ?? { sku: '', price: '', compareAt: '' };
                          return (
                            <div key={key} className="pa-sk new">
                              <div className="pa-skh">
                                <b>{z?.label}</b>
                                <span className="ad-mini">{t(d, 'products.variants.new')}</span>
                              </div>
                              <label className="pa-vh" htmlFor={`sku-${key}`}>
                                {t(d, 'products.variants.skuFor', { colour: colourName(cid), size: z?.label ?? '' })}
                              </label>
                              <input id={`sku-${key}`} className="ad-input pa-skin" maxLength={64} placeholder={t(d, 'products.variants.sku')} value={cell.sku} disabled={disabledWrite} onChange={(e) => setFresh(key, 'sku', e.target.value)} />
                              <PriceInputs d={d} id={key} cell={cell} disabled={!can.prices || !can.write} onChange={(k, value) => setFresh(key, k, value)} />
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <span className="ad-mini">{t(d, 'products.variants.noSizes')}</span>
                    )}
                  </div>
                );
              })}
              {loose.length ? (
                <div className="pa-stk">
                  <div className="pa-stkh">
                    <b>{t(d, 'products.variants.other')}</b>
                  </div>
                  <div className="pa-stkg">
                    {loose.map((v) => (
                      <div key={v.id} className="pa-sk">
                        <div className="pa-skh">
                          <b>{v.size?.label ?? v.colour?.nameEn ?? ''}</b>
                          <span className="ad-mini">{t(d, 'products.variants.stock', { n: num(stock[v.id] ?? 0) })}</span>
                        </div>
                        <span className="ad-mini pa-sku" translate="no">
                          {v.sku}
                        </span>
                        <PriceInputs d={d} id={v.id} cell={draft.prices[v.id] ?? { price: '', compareAt: '' }} disabled={!can.prices || !can.write} onChange={(k, value) => setPrice(v, k, value)} />
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
              {!draft.colours.length && !loose.length ? <span className="ad-mini">{t(d, 'products.variants.none')}</span> : null}
            </div>
            <p className="ad-mini pa-gap">{t(d, 'products.variants.note')}</p>
          </section>

          {/* ---------------- Photos ---------------- */}
          <section className="ad-card" aria-labelledby="sec-photos">
            <h2 id="sec-photos">{t(d, 'products.sections.photos')}</h2>
            <p className="ad-sub">{t(d, 'products.photos.count', { count: num(readiness.photos.count), minimum: num(readiness.photos.minimum) })}</p>
            {gallery === null ? (
              <p className="ad-mini">{t(d, 'products.photos.noRead')}</p>
            ) : (
              <>
                <div className="pa-slots">{filled.map((s, i) => photoTile(`s${i}`, s.label, s.photo, { role: s.role, colourId: s.colourId }))}</div>
                {others.length || can.upload ? <div className="ad-label pa-gap">{t(d, 'products.photos.other')}</div> : null}
                <div className="pa-slots">
                  {others.map((p) => photoTile(`o-${p.id}`, p.colourId ? `${t(d, `products.photos.kinds.${p.role}`)}${t(d, 'products.row.metaSep')}${colourName(p.colourId)}` : t(d, `products.photos.kinds.${p.role}`), p, null))}
                  {can.upload
                    ? photoTile(
                        'extra',
                        t(d, 'products.photos.addMore'),
                        null,
                        { role: extraKind, colourId: null },
                        <select className="pa-kind" aria-label={t(d, 'products.photos.kind')} value={extraKind} onChange={(e) => setExtraKind(e.target.value)}>
                          {EXTRA_KINDS.map((k) => (
                            <option key={k} value={k}>
                              {t(d, `products.photos.kinds.${k}`)}
                            </option>
                          ))}
                        </select>,
                      )
                    : null}
                </div>
                {!can.upload ? <p className="ad-mini pa-gap">{t(d, 'products.photos.noUpload')}</p> : null}
              </>
            )}
          </section>
        </div>

        <aside className="pa-edside">
          {/* ---------------- On the shop ---------------- */}
          <section className="ad-card" aria-labelledby="sec-publish">
            <h2 id="sec-publish">{t(d, 'products.sections.publish')}</h2>
            <div className="pa-pubst">
              <span className={`pa-status s-${st}`}>{t(d, `products.status.${st}`)}</span>
            </div>
            {product.archived ? (
              <p className="ad-mini">{t(d, 'products.publish.archivedNote')}</p>
            ) : isLive ? (
              <p className="ad-mini">{t(d, readiness.ready ? 'products.publish.liveNote' : 'products.publish.liveFailing')}</p>
            ) : (
              <p className="ad-mini">{t(d, readiness.ready ? 'products.publish.readyNote' : 'products.publish.blockedNote')}</p>
            )}
            {dirty ? <p className="ad-mini bad">{t(d, 'products.publish.saveFirst')}</p> : null}
            {!can.publish ? <p className="ad-mini">{t(d, 'products.publish.noPermission')}</p> : null}
            <div className="pa-pubacts">
              {!product.archived && !isLive && can.publish ? (
                <button type="button" className="ad-btn ad-btn-primary ad-btn-block" disabled={!readiness.ready || dirty || busy !== null} onClick={() => publish('publish')}>
                  <Icon name="check" size={18} />
                  {t(d, 'products.publish.publish')}
                </button>
              ) : null}
              {isLive && can.publish ? (
                <button type="button" className="ad-btn ad-btn-ghost ad-btn-block" disabled={busy !== null} onClick={() => publish('unpublish')}>
                  {t(d, 'products.publish.unpublish')}
                </button>
              ) : null}
              {can.write && !isLive ? (
                <button type="button" className="ad-btn ad-btn-ghost ad-btn-sm" disabled={busy !== null || dirty} onClick={() => archive(!product.archived)}>
                  {t(d, product.archived ? 'products.publish.restore' : 'products.publish.archive')}
                </button>
              ) : null}
            </div>
          </section>

          {/* ---------------- Ready to go live? ---------------- */}
          <section className="ad-card" aria-labelledby="sec-ready">
            <h2 id="sec-ready">{t(d, 'products.sections.ready')}</h2>
            <div className="pa-score">
              <span className={`pa-big b-${readiness.band}`}>{num(readiness.score)}</span>
              <span>
                <b>{t(d, 'products.ready.score')}</b>
                <span className="ad-mini pa-block">{t(d, `products.ready.band.${readiness.band}`)}</span>
              </span>
            </div>
            <ul className="pa-hl">
              {failing.map((c) => (
                <li key={c.key} className="pa-hli">
                  <span className={c.level === 'block' ? 'ad-dot bad' : 'ad-dot warn'} />
                  <span>
                    <b>{t(d, `checks.${c.key}.label`)}</b>
                    <span className="ad-mini pa-block">
                      {t(d, c.level === 'block' ? 'products.ready.must' : 'products.ready.reminder')}
                      {t(d, 'products.row.metaSep')}
                      {checkText(d, c, colourName)}
                    </span>
                  </span>
                </li>
              ))}
              {passing.map((c) => (
                <li key={c.key} className="pa-hli ok">
                  <Icon name="check" size={16} />
                  <span>{t(d, `checks.${c.key}.label`)}</span>
                </li>
              ))}
            </ul>
            <p className="ad-mini pa-gap">{t(d, failing.length ? 'products.ready.note' : 'products.ready.allGood')}</p>
          </section>
        </aside>
      </div>

      {can.write ? (
        <div className="pa-savebar">
          <div className="pa-savein">
            <span className={`ad-mini pa-savemsg${dirty ? ' bad' : ''}`}>{t(d, dirty ? 'products.save.dirty' : 'products.save.note')}</span>
            <button type="button" className="ad-btn ad-btn-ghost" disabled={!dirty || busy === 'save'} onClick={() => setDraft(base)}>
              {t(d, 'products.save.cancel')}
            </button>
            <button type="button" className="ad-btn ad-btn-primary" disabled={busy === 'save'} onClick={save}>
              <Icon name="check" size={16} />
              {t(d, busy === 'save' ? 'products.save.saving' : 'products.save.save')}
            </button>
          </div>
        </div>
      ) : null}
      {toast ? (
        <div className="ad-toast" role="status">
          {toast}
        </div>
      ) : null}
    </>
  );
}

function Field({ label, id, help, extra, children }: { label: string; id: string; help?: string; extra?: ReactNode; children: ReactNode }) {
  return (
    <div className="pa-fld">
      <label className="ad-label pa-lbl" htmlFor={id}>
        <span>{label}</span>
        {extra}
      </label>
      {children}
      {help ? <p className="ad-mini pa-help">{help}</p> : null}
    </div>
  );
}

function PriceInputs({ d, id, cell, disabled, onChange }: { d: Dict; id: string; cell: { price: string; compareAt: string }; disabled: boolean; onChange: (k: 'price' | 'compareAt', v: string) => void }) {
  return (
    <div className="pa-prices">
      <span className="pa-pp">
        <label className="pa-pl" htmlFor={`p-${id}`}>
          {t(d, 'products.variants.price')}
        </label>
        <input id={`p-${id}`} className="ad-input" inputMode="decimal" value={cell.price} disabled={disabled} onChange={(e) => onChange('price', e.target.value)} />
      </span>
      <span className="pa-pp">
        <label className="pa-pl" htmlFor={`c-${id}`}>
          {t(d, 'products.variants.compareAt')}
        </label>
        <input id={`c-${id}`} className="ad-input" inputMode="decimal" value={cell.compareAt} disabled={disabled} onChange={(e) => onChange('compareAt', e.target.value)} />
      </span>
    </div>
  );
}

