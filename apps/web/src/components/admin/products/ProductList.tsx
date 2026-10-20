'use client';
// PR 21 — the rows of the product list and the bulk bar (demo 90-admin-catalog.js, zp-row). A row: the photo, the
// name, category, colours and sizes, what is still missing (PR 26, 29: the stored checklist), the price from the
// cheapest size and the stock, its status, Edit and Select. The bulk bar sends one request; each product is done on
// its own and the refusals are listed by name (a product that does not pass its checklist is never published).
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { AdminProductRow, BulkResult } from '@extas/catalogue';
import type { ImageSource } from '@extas/media/delivery';
import { ResponsiveImage, altFor } from '@/components/media/ResponsiveImage';
import { t, type Dict } from '@/lib/i18n';
import { call } from '../api';
import { Icon } from '../Icon';
import { formatMoney, formatNumber, nameIn, refusalText, type Lang, type Money } from './model';
import { useToast } from './useToast';

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
}

const CONFIRM: Partial<Record<Action, string>> = { archive: 'products.bulk.confirmArchive', unpublish: 'products.bulk.confirmUnpublish' };

export function statusKey(r: { status: string; archived: boolean }) {
  return r.archived ? 'ARCHIVED' : r.status;
}

export function ProductList({ dict, lang, rows, photos, money, issuesShown, bulkMax, canWrite, canPublish, emptyText }: Props) {
  const router = useRouter();
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState<{ name: string; text: string }[]>([]);
  const [toast, say] = useToast();
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
      if (a.status !== 200) return say(refusalText(d, a.data.error, a.data.details));
      const res = a.data.bulk as BulkResult;
      setRefused(res.results.filter((r) => !r.ok).map((r) => ({ name: nameOf(r.productId), text: refusalText(d, r.error, r.details) })));
      say(t(d, res.failed ? 'products.bulk.someDone' : 'products.bulk.allDone', { done: num(res.done), failed: num(res.failed) }));
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

      <div className="ad-card pa-listcard">
        {rows.length ? (
          <label className="pa-selall">
            <input type="checkbox" checked={allOn} onChange={() => setPicked(allOn ? [] : rows.map((r) => r.id))} />
            {t(d, 'products.bulk.selectAll')}
          </label>
        ) : (
          <p className="pa-empty">{emptyText}</p>
        )}
        {rows.map((r) => {
          const name = nameIn(lang, r);
          const img = r.thumbAssetId ? photos[r.thumbAssetId] : undefined;
          const path = (lang === 'bn' && r.categoryPathBn.length ? r.categoryPathBn : r.categoryPathEn).join(t(d, 'products.row.pathSep'));
          const issues = r.issues ?? [];
          const shown = issues.slice(0, issuesShown);
          const on = live.includes(r.id);
          const st = statusKey(r);
          return (
            <div key={r.id} className={`pa-row${on ? ' on' : ''}`}>
              <Link className="pa-th" href={`/admin/products/${r.id}`} tabIndex={-1} aria-hidden="true">
                {img ? <ResponsiveImage image={img} slot="thumb" sizes="56px" alt={altFor(img, lang, name)} /> : <span className="pa-th-none"><Icon name="camera" size={20} /></span>}
              </Link>
              <div className="pa-main">
                <Link className="pa-nm" href={`/admin/products/${r.id}`}>
                  {name}
                </Link>
                {path ? <div className="ad-mini pa-path">{path}</div> : null}
                <div className="pa-meta">
                  {r.colours.length ? (
                    <span className="pa-dots" aria-hidden="true">
                      {r.colours.slice(0, 4).map((c, i) => (
                        <i key={i} style={{ background: c.hex }} />
                      ))}
                    </span>
                  ) : null}
                  <span>
                    {r.variants
                      ? [t(d, r.colours.length === 1 ? 'products.row.colour1' : 'products.row.colours', { n: num(r.colours.length) }), sizesText(r.sizes)].filter(Boolean).join(t(d, 'products.row.metaSep'))
                      : t(d, 'products.row.noVariants')}
                  </span>
                </div>
                {r.issues === null ? (
                  <div className="pa-health">
                    <span className="pa-miss off">{t(d, 'products.row.notChecked')}</span>
                  </div>
                ) : shown.length ? (
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
              <div className="pa-num">
                <b>{r.fromPriceMinor != null ? formatMoney(r.fromPriceMinor, money) : t(d, 'products.row.noPrice')}</b>
                <span className="ad-mini">{t(d, 'products.row.stock', { n: num(r.stockPieces) })}</span>
              </div>
              <div className="pa-st">
                <span className={`pa-status s-${st}`}>{t(d, `products.status.${st}`)}</span>
                <span className="ad-mini">{t(d, 'products.row.score', { n: num(r.healthScore) })}</span>
              </div>
              <div className="pa-act">
                <Link className="ad-btn ad-btn-ghost ad-btn-sm pa-edit" href={`/admin/products/${r.id}`}>
                  <Icon name="edit" size={16} />
                  {t(d, 'products.row.edit')}
                </Link>
                <label className={`ad-btn ad-btn-ghost ad-btn-sm pa-pick${on ? ' on' : ''}`}>
                  <input type="checkbox" checked={on} onChange={() => toggle(r.id)} aria-label={t(d, 'products.row.select', { name })} />
                  {t(d, 'products.row.selectShort')}
                </label>
              </div>
            </div>
          );
        })}
      </div>

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
      {toast ? (
        <div className="ad-toast" role="status">
          {toast}
        </div>
      ) : null}
    </>
  );
}
