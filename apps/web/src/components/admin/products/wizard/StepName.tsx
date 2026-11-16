'use client';
// S28 · PR 1031 — wizard step 2, "Name & category" (prototype v5): the ERP's name (read only) and the name on the site, brand, who it is
// for, category and sub-category, the category's own detail questions and the collections and tags. Every change saves by itself.
import { useEffect, useMemo, useRef, useState } from 'react';
import { detailKeysFor, suggestName, WIZARD_FOR, type WizardFor } from '@extas/catalogue/wizard-model';
import { t } from '@/lib/i18n';
import { nameIn } from '../model';
import { sayBad } from '../useToast';
import { patchNaming, patchProduct, postSpec, putTags } from './api';
import type { Ctx, Guard } from './ctx';
import { Fld, Tag, useDebounced } from '../wizard-ui';

export function StepName({ c, setGuard }: { c: Ctx; setGuard: (f: Guard | null) => void }) {
  const { d, data, lists, lang } = c;
  const id = data.productId;
  const cats = lists.categories;
  const byId = useMemo(() => new Map(cats.map((x) => [x.id, x])), [cats]);
  const cur = data.categoryId ? byId.get(data.categoryId) : undefined;
  const [top, setTop] = useState<string>(cur ? (cur.depth > 1 && cur.parentId ? cur.parentId : cur.id) : '');
  const [sub, setSub] = useState<string>(cur && cur.depth > 1 ? cur.id : '');
  const [name, setName] = useState(data.nameEn);
  const [brand, setBrand] = useState<string>(data.brandId ?? '');
  const [forWho, setForWho] = useState<WizardFor | ''>(data.spec.forWho ?? '');
  const [details, setDetails] = useState<Record<string, string>>(data.spec.details);
  const [tags, setTags] = useState<string[]>(data.tagIds);
  const lastSuggest = useRef(data.nameEn);

  const topCats = cats.filter((x) => x.depth === 1);
  const subs = cats.filter((x) => x.parentId === top);
  const picked = byId.get(sub || top);
  const garment = picked?.effectiveGarmentType?.key ?? data.garmentKey;
  const keys = detailKeysFor(garment);
  const brandName = lists.brands.find((b) => b.id === brand)?.name ?? null;
  const ownBrand = lists.brands.find((b) => b.id === c.ownBrandId)?.name ?? null;
  const catName = (x: { nameEn: string; nameBn: string | null }) => nameIn(lang, x);

  useDebounced(name, 700, (v) => {
    if (v.trim().length < 3) return;
    void patchNaming(id, { nameEn: v.trim() }).then((a) => (a.status === 200 ? c.saved() : c.refuse(a)));
  });
  useEffect(() => c.setLive({ name }), [name]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => c.setLive({ brandId: brand || null, forWho: forWho || null }), [brand, forWho]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setGuard(async () => {
      if (name.trim().length < 3) {
        sayBad(t(d, 'products.wiz.name.needName'));
        return false;
      }
      return true;
    });
    return () => setGuard(null);
  }, [setGuard, name, d]);

  const run = async (p: Promise<{ status: number; data: Record<string, unknown> }>, after?: () => void) => {
    const a = await p;
    if (a.status === 200) {
      c.saved();
      after?.();
    } else c.refuse(a as never);
  };

  const changeBrand = (v: string) => {
    setBrand(v);
    const b = lists.brands.find((x) => x.id === v)?.name ?? null;
    // The name follows the brand only while it is still the one the wizard suggested.
    const next = suggestName({ brand: b, ownBrand, erpName: data.erpName, sub: subs.find((s) => s.id === sub)?.nameEn ?? null });
    if (name === lastSuggest.current && next) {
      lastSuggest.current = next;
      setName(next);
    }
    void run(patchNaming(id, { brandId: v || null }));
  };
  const saveCategory = (topId: string, subId: string) => {
    c.setLive({ categoryId: subId || topId || null });
    const target = subId || topId;
    void run(patchProduct(id, { categoryId: target || null }), () => c.refresh());
  };

  const toggleTag = (tid: string) => {
    const next = tags.includes(tid) ? tags.filter((x) => x !== tid) : [...tags, tid];
    setTags(next);
    void run(putTags(id, next));
  };
  const saveDetail = (k: string, v: string) => {
    const next = { ...details, [k]: v };
    setDetails(next);
  };
  useDebounced(details, 700, (v) => void run(postSpec(id, { details: v })));

  return (
    <>
      <div className="wzp-grid2">
        <Fld dict={d} label={t(d, 'products.wiz.name.erpName')} tag="e">
          <div className="ad-input wzp-ro" data-testid="wiz-erp-name">{data.erpName || '—'}</div>
        </Fld>
        <Fld dict={d} label={t(d, 'products.wiz.name.siteName')} tag="a" htmlFor="wz-name" hint={t(d, 'products.wiz.name.siteNameHint')}>
          <input id="wz-name" className="ad-input" value={name} maxLength={200} onChange={(e) => setName(e.target.value)} disabled={!c.can.write} />
        </Fld>
        <Fld dict={d} label={t(d, 'products.wiz.name.brand')} tag="y" htmlFor="wz-brand">
          <select id="wz-brand" className="ad-input" value={brand} onChange={(e) => changeBrand(e.target.value)} disabled={!c.can.write}>
            <option value="">—</option>
            {lists.brands.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </Fld>
        <Fld dict={d} label={t(d, 'products.wiz.name.for')} tag="y" htmlFor="wz-for">
          <select
            id="wz-for"
            className="ad-input"
            value={forWho}
            onChange={(e) => {
              const v = e.target.value as WizardFor | '';
              setForWho(v);
              void run(postSpec(id, { forWho: v || null }));
            }}
            disabled={!c.can.write}
          >
            <option value="">—</option>
            {WIZARD_FOR.map((x) => (
              <option key={x} value={x}>
                {t(d, `products.wiz.name.for_${x}`)}
              </option>
            ))}
          </select>
        </Fld>
        <Fld dict={d} label={t(d, 'products.wiz.name.category')} tag="y" htmlFor="wz-cat">
          <select
            id="wz-cat"
            className="ad-input"
            value={top}
            onChange={(e) => {
              setTop(e.target.value);
              setSub('');
              saveCategory(e.target.value, '');
            }}
            disabled={!c.can.write}
          >
            <option value="">—</option>
            {topCats.map((x) => (
              <option key={x.id} value={x.id}>
                {catName(x)}
              </option>
            ))}
          </select>
        </Fld>
        <Fld dict={d} label={t(d, 'products.wiz.name.sub')} tag="y" htmlFor="wz-sub">
          <select
            id="wz-sub"
            className="ad-input"
            value={sub}
            onChange={(e) => {
              setSub(e.target.value);
              saveCategory(top, e.target.value);
            }}
            disabled={!c.can.write || !subs.length}
          >
            <option value="">—</option>
            {subs.map((x) => (
              <option key={x.id} value={x.id}>
                {catName(x)}
              </option>
            ))}
          </select>
        </Fld>
      </div>
      <div className="wzp-box">
        <div className="ad-mini" style={{ marginBottom: 8 }}>
          <b>{t(d, 'products.wiz.name.details', { category: picked ? catName(picked) : t(d, 'products.wiz.name.thisProduct') })}</b> <Tag dict={d} kind="y" />
        </div>
        <div className="wzp-grid2">
          {keys.map((k) => (
            <Fld key={k} dict={d} label={t(d, `products.wiz.det.${k}`)} htmlFor={`wz-det-${k}`}>
              <input id={`wz-det-${k}`} className="ad-input" value={details[k] ?? ''} placeholder={t(d, `products.wiz.det.${k}Ph`)} maxLength={300} onChange={(e) => saveDetail(k, e.target.value)} disabled={!c.can.write} />
            </Fld>
          ))}
        </div>
        <div className="ad-mini" style={{ marginTop: 6 }}>{t(d, 'products.wiz.name.detailsNote')}</div>
      </div>
      <Fld dict={d} label={t(d, 'products.wiz.name.tags')} tag="y">
        <div className="wzp-chips">
          {lists.tags.map((x) => (
            <button key={x.id} type="button" className={`wzp-chip${tags.includes(x.id) ? ' on' : ''}`} aria-pressed={tags.includes(x.id)} onClick={() => toggleTag(x.id)} disabled={!c.can.write}>
              {x.name}
            </button>
          ))}
          {!lists.tags.length ? <span className="ad-mini">{t(d, 'products.wiz.name.noTags')}</span> : null}
        </div>
      </Fld>
    </>
  );
}
