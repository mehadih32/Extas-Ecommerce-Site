'use client';
// PR 33 — import from a link: paste a product page's link, read it, look at what the page says (the price, the
// supplier's code and the sizes are shown only), change the draft and make it. The draft opens in the product editor;
// nothing goes on the shop from here.
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import type { LinkImportPreview } from '@extas/catalogue';
import { t, type Dict } from '@/lib/i18n';
import { call } from '../api';
import { Icon } from '../Icon';
import { nameIn, type CategoryOption, type ColourOption, type FabricOption, type Lang } from './model';
import { importErrorText, unmatchedText } from './tools-model';
import { useToast } from './useToast';

interface Props {
  dict: Dict;
  lang: Lang;
  canWrite: boolean;
  brands: { id: string; name: string }[];
  categories: CategoryOption[];
  fabrics: FabricOption[];
  colours: ColourOption[];
}

interface Draft {
  nameEn: string;
  descriptionEn: string;
  brandId: string;
  categoryId: string;
  fabricId: string;
  colourIds: string[];
}

const draftOf = (p: LinkImportPreview): Draft => ({
  nameEn: p.draft.nameEn,
  descriptionEn: p.draft.descriptionEn ?? '',
  brandId: p.draft.brandId ?? '',
  categoryId: p.draft.categoryId ?? '',
  fabricId: p.draft.fabricId ?? '',
  colourIds: p.draft.colourIds,
});

export function LinkImport({ dict: d, lang, canWrite, brands, categories, fabrics, colours }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<'' | 'read' | 'make'>('');
  const [err, setErr] = useState('');
  const [preview, setPreview] = useState<LinkImportPreview | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [made, setMade] = useState<string | null>(null);
  const [toast, say] = useToast();
  const none = t(d, 'linkImport.facts.none');

  const read = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const url = String(new FormData(e.currentTarget).get('url') ?? '').trim();
    if (!url) return;
    setErr('');
    setMade(null);
    setBusy('read');
    try {
      const a = await call('POST', '/api/admin/catalogue/link-import', { action: 'preview', url });
      if (a.status !== 200) {
        setPreview(null);
        setErr(importErrorText(d, a.data.error, a.data.details));
      } else {
        const p = a.data.preview as LinkImportPreview;
        setPreview(p);
        setDraft(draftOf(p));
      }
      router.refresh();
    } finally {
      setBusy('');
    }
  };

  const make = async () => {
    if (!preview || !draft) return;
    setErr('');
    setBusy('make');
    try {
      const a = await call('POST', '/api/admin/catalogue/link-import', {
        action: 'draft',
        jobId: preview.jobId,
        edits: {
          nameEn: draft.nameEn.trim() || undefined,
          descriptionEn: draft.descriptionEn.trim() || null,
          brandId: draft.brandId || null,
          categoryId: draft.categoryId || null,
          fabricId: draft.fabricId || null,
          colourIds: draft.colourIds,
        },
      });
      if (a.status !== 200) return setErr(importErrorText(d, a.data.error, a.data.details));
      const id = (a.data.draft as { productId: string }).productId;
      setMade(id);
      say(t(d, 'linkImport.made'));
      router.refresh();
    } finally {
      setBusy('');
    }
  };

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((x) => (x ? { ...x, [k]: v } : x));
  const f = preview?.facts;
  const earlierDraft = preview?.earlier.find((e) => e.productId)?.productId;

  return (
    <>
      <form className="ad-card pa-imp" onSubmit={read} noValidate>
        <label className="ad-label" htmlFor="li-url">
          {t(d, 'linkImport.urlLabel')}
        </label>
        <div className="pa-imp-row">
          <input id="li-url" name="url" type="url" inputMode="url" className="ad-input" placeholder={t(d, 'linkImport.urlPlaceholder')} maxLength={2000} required autoComplete="off" spellCheck={false} />
          <button type="submit" className="ad-btn ad-btn-primary" disabled={busy !== ''}>
            <Icon name="search" size={16} />
            {t(d, busy === 'read' ? 'linkImport.reading' : 'linkImport.read')}
          </button>
        </div>
        {err ? (
          <p className="ad-err" role="alert">
            {err}
          </p>
        ) : null}
      </form>

      {preview && f && draft ? (
        <div className="pa-ed pa-gap">
          <div className="pa-edmain">
            <section className="ad-card" aria-labelledby="li-draft">
              <h2 id="li-draft">{t(d, 'linkImport.draftTitle')}</h2>
              <p className="ad-sub">{t(d, 'linkImport.draftIntro')}</p>
              {preview.earlier.length ? (
                <div className="ad-note warn ad-note-top">
                  <Icon name="info" size={16} />
                  <div>
                    {t(d, 'linkImport.earlier', { n: String(preview.earlier.length) })}{' '}
                    {earlierDraft ? <Link href={`/admin/products/${earlierDraft}`}>{t(d, 'linkImport.earlierDraft')}</Link> : null}
                  </div>
                </div>
              ) : null}
              <div className="pa-fld">
                <label className="ad-label" htmlFor="li-name">
                  {t(d, 'linkImport.fields.nameEn')}
                </label>
                <input id="li-name" className="ad-input" maxLength={200} value={draft.nameEn} onChange={(e) => set('nameEn', e.target.value)} />
              </div>
              <div className="pa-fld">
                <label className="ad-label" htmlFor="li-desc">
                  {t(d, 'linkImport.fields.descriptionEn')}
                </label>
                <textarea id="li-desc" className="ad-input pa-ta" rows={4} maxLength={10000} value={draft.descriptionEn} onChange={(e) => set('descriptionEn', e.target.value)} />
              </div>
              <div className="pa-f2">
                <Pick id="li-brand" label={t(d, 'linkImport.fields.brand')} none={t(d, 'linkImport.fields.none')} value={draft.brandId} onChange={(v) => set('brandId', v)} options={brands.map((b) => ({ id: b.id, label: b.name }))} hint={preview.draft.brand ? t(d, 'linkImport.matched', { from: preview.draft.brand.from }) : ''} />
                <Pick
                  id="li-cat"
                  label={t(d, 'linkImport.fields.category')}
                  none={t(d, 'linkImport.fields.none')}
                  value={draft.categoryId}
                  onChange={(v) => set('categoryId', v)}
                  options={categories.map((c) => ({ id: c.id, label: `${'· '.repeat(Math.max(0, c.depth - 1))}${nameIn(lang, c)}` }))}
                  hint={preview.draft.category ? t(d, 'linkImport.matched', { from: preview.draft.category.from }) : ''}
                />
                <Pick id="li-fab" label={t(d, 'linkImport.fields.fabric')} none={t(d, 'linkImport.fields.none')} value={draft.fabricId} onChange={(v) => set('fabricId', v)} options={fabrics.map((x) => ({ id: x.id, label: nameIn(lang, x) }))} hint={preview.draft.fabric ? t(d, 'linkImport.matched', { from: preview.draft.fabric.from }) : ''} />
              </div>
              <fieldset className="pa-fld pa-imp-cols">
                <legend className="ad-label">{t(d, 'linkImport.fields.colours')}</legend>
                <div className="pa-cols">
                  {colours.map((c) => {
                    const on = draft.colourIds.includes(c.id);
                    return (
                      <label key={c.id} className={`pa-col${on ? ' on' : ''}`}>
                        <input type="checkbox" className="pa-vh" checked={on} onChange={() => set('colourIds', on ? draft.colourIds.filter((x) => x !== c.id) : [...draft.colourIds, c.id])} />
                        <i style={{ background: c.hex }} aria-hidden="true" />
                        {nameIn(lang, c)}
                      </label>
                    );
                  })}
                </div>
              </fieldset>
              {preview.draft.unmatched.length ? <p className="ad-mini">{unmatchedText(d, preview.draft.unmatched)}</p> : null}
              <p className="ad-mini">
                {t(d, `linkImport.method.${preview.method}`)} {preview.notes.map((n) => t(d, `linkImport.notes.${n}`)).join(' ')}
              </p>
              <div className="pa-qacts">
                {made ? (
                  <>
                    <Link className="ad-btn ad-btn-primary" href={`/admin/products/${made}`}>
                      <Icon name="edit" size={16} />
                      {t(d, 'linkImport.open')}
                    </Link>
                    <button type="button" className="ad-btn ad-btn-ghost" onClick={() => (setPreview(null), setDraft(null), setMade(null))}>
                      {t(d, 'linkImport.again')}
                    </button>
                  </>
                ) : (
                  <button type="button" className="ad-btn ad-btn-primary" disabled={!canWrite || busy !== '' || !draft.nameEn.trim()} onClick={make}>
                    <Icon name="plus" size={16} />
                    {t(d, busy === 'make' ? 'linkImport.making' : 'linkImport.make')}
                  </button>
                )}
              </div>
              {!canWrite ? <p className="ad-mini">{t(d, 'linkImport.noWrite')}</p> : null}
            </section>
          </div>
          <aside className="pa-edside">
            <section className="ad-card" aria-labelledby="li-found">
              <h2 id="li-found">{t(d, 'linkImport.found')}</h2>
              <p className="ad-mini pa-imp-url" translate="no">
                {preview.finalUrl}
              </p>
              <dl className="pa-facts">
                <dt>{t(d, 'linkImport.facts.name')}</dt>
                <dd>{f.name ?? none}</dd>
                <dt>{t(d, 'linkImport.facts.brand')}</dt>
                <dd>{f.brand ?? none}</dd>
                <dt>{t(d, 'linkImport.facts.colours')}</dt>
                <dd>{f.colours.length ? f.colours.join(t(d, 'checks.sep')) : none}</dd>
                <dt>{t(d, 'linkImport.facts.material')}</dt>
                <dd>{f.material ?? none}</dd>
                <dt>{t(d, 'linkImport.facts.sizes')}</dt>
                <dd>
                  {preview.draft.sizes.length ? preview.draft.sizes.map((s) => s.label).join(t(d, 'checks.sep')) : none}
                  <span className="ad-mini pa-block">{t(d, 'linkImport.sizesNote')}</span>
                </dd>
                <dt>{t(d, 'linkImport.facts.sku')}</dt>
                <dd>
                  {f.sku ?? none}
                  {f.sku ? <span className="ad-mini pa-block">{t(d, 'linkImport.skuNote')}</span> : null}
                </dd>
                <dt>{t(d, 'linkImport.facts.price')}</dt>
                <dd>
                  {f.price ? `${f.price.amount}${f.price.currency ? ` ${f.price.currency}` : ''}` : none}
                  <span className="ad-mini pa-block">{t(d, 'linkImport.priceNote')}</span>
                </dd>
                <dt>{t(d, 'linkImport.facts.photos')}</dt>
                <dd>{t(d, 'linkImport.photosNote', { n: String(f.images.length) })}</dd>
              </dl>
            </section>
          </aside>
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

function Pick({ id, label, none, value, options, hint, onChange }: { id: string; label: string; none: string; value: string; options: { id: string; label: string }[]; hint: string; onChange: (v: string) => void }) {
  return (
    <div className="pa-fld">
      <label className="ad-label" htmlFor={id}>
        {label}
      </label>
      <select id={id} className="ad-input" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{none}</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
      {hint ? <p className="ad-mini pa-help">{hint}</p> : null}
    </div>
  );
}
