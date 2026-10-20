'use client';
// PR 21 — "New product" (demo #/admin/products/new): the name, category, fabric, style code and description. The
// product starts as a draft (never on the shop); colours, sizes, SKUs, prices and photos are added on its own page,
// where the form opens next.
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { t, type Dict } from '@/lib/i18n';
import { call } from '../api';
import { Icon } from '../Icon';
import { nameIn, refusalText, type CategoryOption, type FabricOption, type Lang } from './model';
import { useToast } from './useToast';

interface Props {
  dict: Dict;
  lang: Lang;
  categories: CategoryOption[];
  fabrics: FabricOption[];
  cancelHref: string;
}

export function NewProductForm({ dict: d, lang, categories, fabrics, cancelHref }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [toast, say] = useToast();

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const val = (k: string) => {
      const v = f.get(k);
      return typeof v === 'string' && v.trim() ? v.trim() : null;
    };
    const nameEn = val('nameEn');
    if (!nameEn) return setErr(t(d, 'products.new.needName'));
    setErr('');
    setBusy(true);
    try {
      const a = await call('POST', '/api/admin/catalogue/products', {
        nameEn,
        nameBn: val('nameBn'),
        categoryId: val('categoryId'),
        fabricId: val('fabricId'),
        erpStyleCode: val('erpStyleCode'),
        descriptionEn: val('descriptionEn'),
        descriptionBn: val('descriptionBn'),
      });
      if (a.status !== 201) {
        setErr(refusalText(d, a.data.error, a.data.details));
        return;
      }
      const id = (a.data.created as { id: string }).id;
      say(t(d, 'products.new.created'));
      router.push(`/admin/products/${id}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="ad-card pa-newform" onSubmit={submit} noValidate>
      <h2>{t(d, 'products.sections.basics')}</h2>
      <p className="ad-sub">{t(d, 'products.new.sub')}</p>
      <div className="pa-f2">
        <div className="pa-fld">
          <label className="ad-label" htmlFor="n-nameEn">
            {t(d, 'products.fields.nameEn')}
          </label>
          <input id="n-nameEn" name="nameEn" className="ad-input" maxLength={200} required aria-invalid={err ? true : undefined} />
          <p className="ad-mini pa-help">{t(d, 'products.fields.nameHelp')}</p>
        </div>
        <div className="pa-fld">
          <label className="ad-label" htmlFor="n-nameBn">
            {t(d, 'products.fields.nameBn')} <span className="opt">{t(d, 'products.fields.optional')}</span>
          </label>
          <input id="n-nameBn" name="nameBn" className="ad-input" lang="bn" maxLength={200} />
        </div>
        <div className="pa-fld">
          <label className="ad-label" htmlFor="n-cat">
            {t(d, 'products.fields.category')}
          </label>
          <select id="n-cat" name="categoryId" className="ad-input" defaultValue="">
            <option value="">{t(d, 'products.fields.choose')}</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {`${'· '.repeat(Math.max(0, c.depth - 1))}${nameIn(lang, c)}`}
              </option>
            ))}
          </select>
        </div>
        <div className="pa-fld">
          <label className="ad-label" htmlFor="n-fab">
            {t(d, 'products.fields.fabric')}
          </label>
          <select id="n-fab" name="fabricId" className="ad-input" defaultValue="">
            <option value="">{t(d, 'products.fields.choose')}</option>
            {fabrics.map((f) => (
              <option key={f.id} value={f.id}>
                {nameIn(lang, f)}
              </option>
            ))}
          </select>
        </div>
        <div className="pa-fld">
          <label className="ad-label" htmlFor="n-style">
            {t(d, 'products.fields.style')} <span className="opt">{t(d, 'products.fields.optional')}</span>
          </label>
          <input id="n-style" name="erpStyleCode" className="ad-input" maxLength={60} />
          <p className="ad-mini pa-help">{t(d, 'products.fields.styleHelp')}</p>
        </div>
      </div>
      <div className="pa-fld">
        <label className="ad-label" htmlFor="n-den">
          {t(d, 'products.fields.descriptionEn')} <span className="opt">{t(d, 'products.fields.optional')}</span>
        </label>
        <textarea id="n-den" name="descriptionEn" className="ad-input pa-ta" rows={3} maxLength={10000} />
      </div>
      <div className="pa-fld">
        <label className="ad-label" htmlFor="n-dbn">
          {t(d, 'products.fields.descriptionBn')} <span className="opt">{t(d, 'products.fields.optional')}</span>
        </label>
        <textarea id="n-dbn" name="descriptionBn" className="ad-input pa-ta" lang="bn" rows={3} maxLength={10000} />
      </div>
      {err ? (
        <p className="ad-err" role="alert">
          {err}
        </p>
      ) : null}
      <div className="pa-savebar">
        <div className="pa-savein">
          <span className="ad-mini pa-savemsg">{t(d, 'products.new.note')}</span>
          <a className="ad-btn ad-btn-ghost" href={cancelHref}>
            {t(d, 'products.save.cancel')}
          </a>
          <button type="submit" className="ad-btn ad-btn-primary" disabled={busy}>
            <Icon name="plus" size={16} />
            {t(d, busy ? 'products.new.creating' : 'products.new.create')}
          </button>
        </div>
      </div>
      {toast ? (
        <div className="ad-toast" role="status">
          {toast}
        </div>
      ) : null}
    </form>
  );
}
