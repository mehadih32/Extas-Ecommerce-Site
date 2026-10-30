'use client';
// PR 609 (CN-028) — import from the ERP by style code: type the style code, see every SKU of it (colour, size, barcode,
// grade and, with the prices permission, "bought from ERP at"), then import it as one draft product (the factory's
// B grade as its own listing when that is switched on). Nothing is priced for the customer here: the selling price is
// set on the product page. Below it, the buying prices the ERP changed, with "Seen".
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import type { ErpStyleImportResult, ErpStylePreview, ShopPriceChange } from '@extas/inventory';
import { t, type Dict } from '@/lib/i18n';
import { call, type Answer } from '../api';
import { Icon } from '../Icon';
import { formatMoney, formatNumber, refusalText, type Money } from './model';
import { useToast } from './useToast';

interface Props {
  dict: Dict;
  money: Money;
  canWrite: boolean;
  /** May this person see buying prices (`catalogue.prices`)? */
  canSeePrices: boolean;
  changes: { total: number; items: ShopPriceChange[] } | null;
}

/** A refusal as text: the stock page's `stock.errors.<code>` first, then the product screens' own. */
export function erpImportErrorText(d: Dict, a: Answer): string {
  const code = a.data.error ?? 'server-error';
  const fields = (a.data.details ?? []).join(', ');
  const key = `stock.errors.${code}`;
  const text = t(d, key, { fields });
  return text === key ? refusalText(d, code, a.data.details ?? []) : text;
}

export function ErpImport({ dict: d, money, canWrite, canSeePrices, changes: initial }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<'' | 'read' | 'import' | 'seen'>('');
  const [err, setErr] = useState('');
  const [preview, setPreview] = useState<ErpStylePreview | null>(null);
  const [done, setDone] = useState<ErpStyleImportResult | null>(null);
  const [changes, setChanges] = useState(initial);
  const [toast, say] = useToast();
  const num = (n: number) => formatNumber(n, money.locale);
  const price = (minor: number | null) => (minor === null ? t(d, 'stock.erpImport.none') : formatMoney(minor, money));
  const sep = t(d, 'checks.sep');

  const read = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const styleCode = String(new FormData(e.currentTarget).get('styleCode') ?? '').trim();
    if (!styleCode) return;
    setErr('');
    setDone(null);
    setBusy('read');
    try {
      const a = await call('GET', `/api/admin/inventory/erp/style?styleCode=${encodeURIComponent(styleCode)}`);
      if (a.status !== 200) {
        setPreview(null);
        setErr(erpImportErrorText(d, a));
      } else setPreview(a.data.preview as ErpStylePreview);
    } finally {
      setBusy('');
    }
  };

  const run = async () => {
    if (!preview) return;
    setErr('');
    setBusy('import');
    try {
      const a = await call('POST', '/api/admin/inventory/erp/style', { styleCode: preview.styleCode });
      if (a.status !== 200) return setErr(erpImportErrorText(d, a));
      const r = a.data.imported as ErpStyleImportResult;
      setDone(r);
      say(t(d, 'stock.erpImport.done', { created: num(r.created), updated: num(r.updated), skipped: num(r.skipped) }));
      router.refresh();
    } finally {
      setBusy('');
    }
  };

  const seen = async (ids: string[] | 'all') => {
    setErr('');
    setBusy('seen');
    try {
      const a = await call('POST', '/api/admin/inventory/shop-prices/seen', ids === 'all' ? { all: true } : { ids });
      if (a.status !== 200) return setErr(erpImportErrorText(d, a));
      say(t(d, 'stock.erpImport.changes.seenDone', { n: num(Number(a.data.seen ?? 0)) }));
      setChanges((c) => (c ? (ids === 'all' ? { total: 0, items: [] } : { total: Math.max(0, c.total - ids.length), items: c.items.filter((i) => !ids.includes(i.variantId)) }) : c));
      router.refresh();
    } finally {
      setBusy('');
    }
  };

  const blocked = preview ? preview.blocking.length > 0 : true;

  return (
    <>
      <form className="ad-card pa-imp" onSubmit={read} noValidate data-testid="erp-style-form">
        <label className="ad-label" htmlFor="erp-style">
          {t(d, 'stock.erpImport.form.label')}
        </label>
        <div className="pa-imp-row">
          <input id="erp-style" name="styleCode" type="text" className="ad-input" placeholder={t(d, 'stock.erpImport.form.placeholder')} maxLength={60} required autoComplete="off" spellCheck={false} translate="no" />
          <button type="submit" className="ad-btn ad-btn-primary" disabled={busy !== ''}>
            <Icon name="search" size={16} />
            {t(d, busy === 'read' ? 'stock.erpImport.form.reading' : 'stock.erpImport.form.read')}
          </button>
        </div>
        <p className="ad-mini pa-help">{t(d, 'stock.erpImport.form.help')}</p>
        {err ? (
          <p className="ad-err" role="alert">
            {err}
          </p>
        ) : null}
      </form>

      {preview ? (
        <section className="ad-card pa-gap" aria-labelledby="erp-preview" data-testid="erp-style-preview">
          <h2 id="erp-preview">{t(d, 'stock.erpImport.preview.title', { style: preview.styleName ?? preview.styleCode })}</h2>
          <p className="ad-mini" translate="no">
            {preview.styleCode}
          </p>
          {preview.state === 'practice' ? (
            <div className="ad-note warn ad-note-top">
              <Icon name="info" size={16} />
              <div>{t(d, 'stock.erpImport.practice')}</div>
            </div>
          ) : null}
          {preview.missingColours.length ? (
            <div className="ad-note warn ad-note-top">
              <Icon name="info" size={16} />
              <div>{t(d, 'stock.erpImport.preview.missingColours', { list: preview.missingColours.join(sep) })}</div>
            </div>
          ) : null}
          {preview.model !== 'v6' ? (
            <div className="ad-note warn ad-note-top" data-testid="erp-style-v5">
              <Icon name="info" size={16} />
              <div>{t(d, 'stock.erpImport.preview.v5')}</div>
            </div>
          ) : null}
          {preview.conflicts.length ? (
            <div className="ad-note warn ad-note-top" data-testid="erp-style-conflicts">
              <Icon name="info" size={16} />
              <div>
                <div>{t(d, 'stock.erpImport.preview.conflicts')}</div>
                <ul className="ad-mini">
                  {preview.conflicts.map((x) => (
                    <li key={x.sku}>
                      <span translate="no">{x.sku}</span>
                      {t(d, 'products.row.metaSep')}
                      <Link href={`/admin/products/${x.productId}`}>{x.productName}</Link>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ) : null}
          {preview.invalid.length ? (
            <div className="ad-note warn ad-note-top" data-testid="erp-style-invalid">
              <Icon name="info" size={16} />
              <div>
                <div>{t(d, 'stock.erpImport.preview.invalid')}</div>
                <ul className="ad-mini">
                  {preview.invalid.map((x) => (
                    <li key={x.sku}>
                      <span translate="no">{x.sku}</span>
                      {t(d, 'products.row.metaSep')}
                      {t(d, `stock.erpImport.invalid.${x.why}`)}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ) : null}
          {preview.newSizes.length ? <p className="ad-mini">{t(d, 'stock.erpImport.preview.newSizes', { list: preview.newSizes.join(sep) })}</p> : null}
          {preview.listings.map((l) => (
            <p key={l.grade} className="ad-mini" data-adopt={l.adopt ? 'yes' : undefined}>
              <b>{t(d, `stock.erpImport.grade.${l.grade}`)}</b>
              {t(d, 'products.row.metaSep')}
              {t(d, l.adopt ? 'stock.erpImport.preview.adopt' : l.productId ? 'stock.erpImport.preview.into' : 'stock.erpImport.preview.newDraft', { name: l.name, n: num(l.lines) })}
            </p>
          ))}
          <ul className="pa-jobs">
            {preview.lines.map((l) => (
              <li key={l.sku} className="pa-job">
                <div className="pa-main">
                  <div className="pa-nm" translate="no">
                    {l.sku}
                  </div>
                  <div className="ad-mini">
                    {[l.colour, l.size].filter(Boolean).join(t(d, 'products.row.metaSep'))}
                    {l.barcode ? `${t(d, 'products.row.metaSep')}${t(d, 'stock.erpImport.preview.barcode', { code: l.barcode })}` : ''}
                  </div>
                  {preview.showsBuyingPrice ? <div className="ad-mini">{t(d, 'stock.erpImport.preview.buying', { price: price(l.shopPriceMinor) })}</div> : null}
                </div>
                <div className="pa-job-st">
                  {l.grade === 'B' ? <span className="pa-miss soft">{t(d, 'stock.erpImport.grade.B')}</span> : null}
                  <span className={`pa-status ${l.action === 'create' ? 's-READY_TO_PUBLISH' : l.action === 'update' ? 's-PUBLISHED' : 's-UNPUBLISHED'}`}>{t(d, `stock.erpImport.action.${l.action}`)}</span>
                  {l.skip ? <span className="ad-mini">{t(d, `stock.erpImport.skip.${l.skip}`)}</span> : null}
                </div>
              </li>
            ))}
          </ul>
          {!preview.showsBuyingPrice ? <p className="ad-mini">{t(d, 'stock.erpImport.noPrices')}</p> : null}
          <p className="ad-mini">{t(d, 'stock.erpImport.preview.noSelling')}</p>
          <div className="pa-qacts">
            {done ? (
              done.products.map((p) => (
                <Link key={p.productId} className="ad-btn ad-btn-primary" href={`/admin/products/${p.productId}`}>
                  <Icon name="edit" size={16} />
                  {t(d, 'stock.erpImport.open', { grade: t(d, `stock.erpImport.grade.${p.grade}`) })}
                </Link>
              ))
            ) : (
              <button type="button" className="ad-btn ad-btn-primary" disabled={!canWrite || busy !== '' || blocked} onClick={run} data-testid="erp-style-import">
                <Icon name="plus" size={16} />
                {t(d, busy === 'import' ? 'stock.erpImport.importing' : 'stock.erpImport.import')}
              </button>
            )}
          </div>
          {!canWrite ? <p className="ad-mini">{t(d, 'stock.erpImport.noWrite')}</p> : null}
        </section>
      ) : null}

      <section className="ad-card pa-gap" aria-labelledby="erp-changes" data-testid="shop-price-changes">
        <h2 id="erp-changes">{t(d, 'stock.erpImport.changes.title')}</h2>
        {!canSeePrices || !changes ? (
          <p className="pa-empty">{t(d, 'stock.erpImport.noPrices')}</p>
        ) : changes.items.length ? (
          <>
            <p className="ad-sub">{t(d, 'stock.erpImport.changes.intro', { n: num(changes.total) })}</p>
            <ul className="pa-jobs">
              {changes.items.map((c) => (
                <li key={c.variantId} className="pa-job">
                  <div className="pa-main">
                    <Link className="pa-nm" href={`/admin/products/${c.productId}`}>
                      {c.productName}
                    </Link>
                    <div className="ad-mini" translate="no">
                      {c.sku}
                    </div>
                    <div className="ad-mini">{t(d, 'stock.erpImport.changes.moved', { before: price(c.previousMinor), now: price(c.shopPriceMinor) })}</div>
                    <div className="ad-mini">
                      {t(d, 'stock.erpImport.changes.selling', { price: price(c.priceMinor) })}
                      {c.floorMinor !== null ? `${t(d, 'products.row.metaSep')}${t(d, 'stock.erpImport.changes.floor', { price: price(c.floorMinor) })}` : ''}
                    </div>
                  </div>
                  <div className="pa-job-st">
                    {c.belowCost ? <span className="pa-miss">{t(d, 'stock.erpImport.changes.belowCost')}</span> : c.belowFloor ? <span className="pa-miss">{t(d, 'stock.erpImport.changes.belowFloor')}</span> : null}
                    <button type="button" className="ad-btn ad-btn-ghost ad-btn-sm" disabled={busy !== ''} onClick={() => seen([c.variantId])}>
                      <Icon name="check" size={14} />
                      {t(d, 'stock.erpImport.changes.seen')}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
            <div className="pa-qacts">
              <button type="button" className="ad-btn ad-btn-ghost" disabled={busy !== ''} onClick={() => seen('all')}>
                {t(d, 'stock.erpImport.changes.seenAll')}
              </button>
            </div>
          </>
        ) : (
          <p className="pa-empty">{t(d, 'stock.erpImport.changes.empty')}</p>
        )}
      </section>
      {toast ? (
        <div className="ad-toast" role="status">
          {toast}
        </div>
      ) : null}
    </>
  );
}
