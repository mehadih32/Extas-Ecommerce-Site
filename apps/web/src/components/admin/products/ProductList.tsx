'use client';
// PR 21 — the rows of the product list and the bulk bar (demo 90-admin-catalog.js, zp-row). A row: the photo, the
// name, category, colours and sizes, what is still missing (PR 26, 29: the stored checklist), the price from the
// cheapest size and the stock, its status, Edit and Select. The bulk bar sends one request; each product is done on
// its own and the refusals are listed by name (a product that does not pass its checklist is never published).
// PR 634 (CN-036): the result is the admin's one toast; publish, take off, archive and restore offer Undo (BULK_UNDO).
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { AdminProductRow, BulkResult } from '@extas/catalogue';
import type { ImageSource } from '@extas/media/delivery';
import { ResponsiveImage, altFor } from '@/components/media/ResponsiveImage';
import { t, type Dict } from '@/lib/i18n';
import type { ProductExtras } from '@/lib/admin-products';
import { call } from '../api';
import { Icon } from '../Icon';
import { formatMoney, formatNumber, nameIn, refusalText, type Lang, type Money } from './model';
import { say, sayBad } from './useToast';

type Action = 'publish' | 'unpublish' | 'recheck' | 'archive' | 'restore';

interface Props {
  dict: Dict;
  lang: Lang;
  rows: AdminProductRow[];
  photos: Record<string, ImageSource>;
  money: Money;
  issuesShown: number;
  bulkMax: number;
  canWrite: boolean;
  canPublish: boolean;
  emptyText: string;
  /** PR 722 (prototype v5 parity): the table's extra columns, whether buying prices may be shown, and the owner's margin floor. */
  extras: Record<string, ProductExtras>;
  showsBuying: boolean;
  floorMarginPct: number | null;
}

const CONFIRM: Partial<Record<Action, string>> = { archive: 'products.bulk.confirmArchive', unpublish: 'products.bulk.confirmUnpublish' };

/** PR 634 (CN-036): the bulk actions that are reversible shop actions, their kind (lib/admin-lumen/safety.ts) and the
 *  action that takes them back. The toast offers Undo for these only, on the products that were done; prices,
 *  discounts and deleting never pass through here. */
export const BULK_UNDO: Partial<Record<Action, { kind: string; back: Action }>> = {
  publish: { kind: 'show', back: 'unpublish' },
  unpublish: { kind: 'hide', back: 'publish' },
  archive: { kind: 'archive', back: 'restore' },
  restore: { kind: 'unarchive', back: 'archive' },
};

export function statusKey(r: { status: string; archived: boolean }) {
  return r.archived ? 'ARCHIVED' : r.status;
}

export function ProductList({ dict, lang, rows, photos, money, issuesShown, bulkMax, canWrite, canPublish, emptyText, extras, showsBuying, floorMarginPct }: Props) {
  const router = useRouter();
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState<{ name: string; text: string }[]>([]);
  const d = dict;
  const num = (n: number) => formatNumber(n, money.locale);
  const live = picked.filter((id) => rows.some((r) => r.id === id));
  const allOn = rows.length > 0 && live.length === rows.length;

  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const nameOf = (id: string) => {
    const r = rows.find((x) => x.id === id);
    return r ? nameIn(lang, r) : id;
  };

  const run = async (action: Action) => {
    if (!live.length) return;
    if (live.length > bulkMax) return say(t(d, 'products.bulk.tooMany', { max: num(bulkMax) }));
    const confirmKey = CONFIRM[action];
    if (confirmKey && !window.confirm(t(d, confirmKey, { n: num(live.length) }))) return;
    setBusy(true);
    setRefused([]);
    try {
      const a = await call('POST', '/api/admin/catalogue/products/bulk', { action, productIds: live });
      if (a.status !== 200) return sayBad(refusalText(d, a.data.error, a.data.details));
      const res = a.data.bulk as BulkResult;
      setRefused(res.results.filter((r) => !r.ok).map((r) => ({ name: nameOf(r.productId), text: refusalText(d, r.error, r.details) })));
      const doneIds = res.results.filter((r) => r.ok).map((r) => r.productId);
      const back = BULK_UNDO[action];
      const undo =
        back && doneIds.length
          ? {
              kind: back.kind,
              run: async () => {
                const u = await call('POST', '/api/admin/catalogue/products/bulk', { action: back.back, productIds: doneIds });
                const ok = u.status === 200 && !(u.data.bulk as BulkResult).failed;
                router.refresh();
                return ok;
              },
            }
          : undefined;
      say(t(d, res.failed ? 'products.bulk.someDone' : 'products.bulk.allDone', { done: num(res.done), failed: num(res.failed) }), undo);
      setPicked([]);
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  const sizesText = (s: string[]) => (s.length === 0 ? '' : s.length === 1 ? s[0]! : t(d, 'products.row.sizeRange', { from: s[0]!, to: s[s.length - 1]! }));
  const actions: { a: Action; when: boolean }[] = [
    { a: 'publish', when: canPublish },
    { a: 'unpublish', when: canPublish },
    { a: 'recheck', when: true },
    { a: 'archive', when: canWrite },
    { a: 'restore', when: canWrite },
  ];

  return (
    <>
      {refused.length ? (
        <div className="ad-note warn ad-note-top" role="status">
          <Icon name="info" size={16} />
          <div>
            <strong>{t(d, 'products.bulk.refused')}</strong>
            <ul className="pa-refused">
              {refused.map((r, i) => (
                <li key={i}>
                  <b>{r.name}</b>
                  {t(d, 'products.bulk.dash')}
                  {r.text}
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}

      {rows.length ? (
        <div className="a2-tblw pa-tblw" data-testid="products-table">
          <table className="a2-tbl a2-ptbl pa-tbl">
            <thead>
              <tr>
                <th className="w0">
                  <label className="pa-chkw">
                    <input type="checkbox" checked={allOn} onChange={() => setPicked(allOn ? [] : rows.map((r) => r.id))} aria-label={t(d, 'products.bulk.selectAll')} />
                  </label>
                </th>
                <th>{t(d, 'products.cols.product')}</th>
                <th className="a2-hm">{t(d, 'products.cols.category')}</th>
                <th className="a2-hm">{t(d, 'products.cols.colours')}</th>
                <th className="r">{t(d, 'products.cols.price')}</th>
                {showsBuying ? <th className="r a2-hm">{t(d, 'products.cols.buyingMargin')}</th> : null}
                <th className="r">{t(d, 'products.cols.stock')}</th>
                <th className="r a2-hm">{t(d, 'products.cols.sold30')}</th>
                <th>{t(d, 'products.cols.status')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const name = nameIn(lang, r);
                const x = extras[r.id];
                const img = r.thumbAssetId ? photos[r.thumbAssetId] : undefined;
                const leaf = (lang === 'bn' && r.categoryPathBn.length ? r.categoryPathBn : r.categoryPathEn).slice(-1)[0] ?? '';
                const issues = r.issues ?? [];
                const shown = issues.slice(0, issuesShown);
                const on = live.includes(r.id);
                const st = statusKey(r);
                const mg = x?.marginPct ?? null;
                const mgTone = mg === null ? '' : floorMarginPct !== null ? (mg < floorMarginPct ? 'warn' : 'ok') : mg > 0 ? 'ok' : 'bad';
                return (
                  <tr key={r.id} className={on ? 'sel' : undefined} data-testid="product-row">
                    <td className="w0 a2-tdc">
                      <label className="pa-chkw">
                        <input type="checkbox" checked={on} onChange={() => toggle(r.id)} aria-label={t(d, 'products.row.select', { name })} />
                      </label>
                    </td>
                    <td className="a2-tdh">
                      <div className="pa-pc">
                        <Link className="pa-th" href={`/admin/products/${r.id}`} tabIndex={-1} aria-hidden="true">
                          {img ? <ResponsiveImage image={img} slot="thumb" sizes="40px" alt={altFor(img, lang, name)} /> : <span className="pa-th-none"><Icon name="camera" size={18} /></span>}
                        </Link>
                        <div className="pa-main">
                          <Link className="pa-nm" href={`/admin/products/${r.id}`}>
                            {name}
                          </Link>
                          {x?.styleCode ? <div className="ad-mini pa-code">{x.styleCode}</div> : null}
                          {r.issues !== null && shown.length ? (
                            <div className="pa-health">
                              {shown.map((i) => (
                                <span key={i.key} className={`pa-miss${i.level === 'warn' ? ' soft' : ''}`}>
                                  {t(d, `checks.${i.key}.short`)}
                                </span>
                              ))}
                              {issues.length - shown.length > 0 ? <span className="pa-miss soft">{t(d, 'checks.more', { n: num(issues.length - shown.length) })}</span> : null}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </td>
                    <td className="a2-hm" data-l={t(d, 'products.cols.category')}>{leaf || t(d, 'products.row.none')}</td>
                    <td className="a2-hm" data-l={t(d, 'products.cols.colours')}>
                      {r.colours.length ? (
                        <span className="pa-dots" title={r.colours.map((c) => (lang === 'bn' && c.nameBn ? c.nameBn : c.nameEn)).join(', ')}>
                          {r.colours.slice(0, 5).map((c, i) => (
                            <i key={i} style={{ background: c.hex }} />
                          ))}
                          <span className="pa-sr">{t(d, r.colours.length === 1 ? 'products.row.colour1' : 'products.row.colours', { n: num(r.colours.length) })}</span>
                        </span>
                      ) : (
                        <span className="a2-faint">{t(d, 'products.row.none')}</span>
                      )}
                    </td>
                    <td className="r" data-l={t(d, 'products.cols.price')}>
                      <b>{r.fromPriceMinor != null ? formatMoney(r.fromPriceMinor, money) : t(d, 'products.row.noPrice')}</b>
                      {x?.compareAtMinor ? <s className="ad-mini pa-was">{formatMoney(x.compareAtMinor, money)}</s> : null}
                    </td>
                    {showsBuying ? (
                      <td className="r pa-bm a2-hm" data-l={t(d, 'products.cols.buyingMargin')}>
                        {x?.buyingMinor != null ? <span className="pa-buy">{formatMoney(x.buyingMinor, money)}</span> : <span className="a2-faint">{t(d, 'products.row.none')}</span>}
                        {mg !== null ? <span className={`a2-pill ${mgTone}`}>{`${num(Math.round(mg))}%`}</span> : null}
                      </td>
                    ) : null}
                    <td className="r" data-l={t(d, 'products.cols.stock')}>
                      <b>{num(r.stockPieces)}</b>
                      {x && x.lowSizes > 0 ? <span className="ad-mini pa-low">{t(d, 'products.row.lowSizes', { n: num(x.lowSizes) })}</span> : null}
                    </td>
                    <td className="r a2-hm" data-l={t(d, 'products.cols.sold30')}>
                      {num(x?.sold30 ?? 0)}
                    </td>
                    <td data-l={t(d, 'products.cols.status')}>
                      <span className={`pa-status s-${st}`}>{t(d, `products.status.${st}`)}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="ad-card pa-listcard">
          <p className="pa-empty">{emptyText}</p>
        </div>
      )}

      {live.length ? (
        <div className="pa-bulk" role="region" aria-label={t(d, 'products.bulk.label')}>
          <div className="pa-bulk-in">
            <span className="pa-bulk-n">{t(d, 'products.bulk.selected', { n: num(live.length) })}</span>
            <div className="pa-bulk-acts">
              {actions
                .filter((x) => x.when)
                .map((x) => (
                  <button key={x.a} type="button" className={`ad-btn ad-btn-sm ${x.a === 'publish' ? 'ad-btn-primary' : 'ad-btn-ghost'}`} disabled={busy} onClick={() => run(x.a)}>
                    {t(d, `products.bulk.${x.a}`)}
                  </button>
                ))}
              <button type="button" className="ad-btn ad-btn-ghost ad-btn-sm" disabled={busy} onClick={() => setPicked([])}>
                {t(d, 'products.bulk.clear')}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
