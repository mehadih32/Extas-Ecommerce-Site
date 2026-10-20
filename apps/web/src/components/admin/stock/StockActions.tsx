'use client';
// PR 206, 207 — the stock page's buttons: re-sync all stock now, re-sync one product by its SKU, check every stock
// number against the ERP (it changes nothing; the differences are listed), and (PR 199/200/206) send the ERP documents
// that failed again. Each one is refused by the server without `inventory.sync`; the page only shows them to people who
// hold it.
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import type { MismatchKind, ProductResyncResult, ReconcileResult, StockPullResult } from '@extas/inventory';
import { t, type Dict } from '@/lib/i18n';
import { call } from '../api';
import { Icon } from '../Icon';
import { formatNumber } from '../products/model';
import { useToast } from '../products/useToast';
import { stockRefusal } from './text';

const KINDS: MismatchKind[] = ['MISSING_IN_SHOP', 'MISSING_IN_ERP', 'ON_HAND_DIFFERS', 'RESERVED_DIFFERS'];

type Props = { dict: Dict; locale: string };
/** One button's work: the text to show when it is done, or null. */
type Job = { (): Promise<string | null> };

function useRun(dict: Dict) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, say] = useToast();
  const run = async (name: string, fn: Job) => {
    setBusy(name);
    try {
      const text = await fn();
      if (text) say(text);
      router.refresh();
    } catch {
      say(t(dict, 'errors.server-error'));
    } finally {
      setBusy(null);
    }
  };
  return { busy, toast, run };
}

function pullText(d: Dict, r: StockPullResult | ProductResyncResult, locale: string): string {
  if (r.status === 'skipped') return t(d, `stock.resync.skipped.${r.reason ?? 'ERP_ON_PRACTICE'}`);
  if (r.status === 'failed') return t(d, 'stock.resync.failed', { code: r.error?.code ?? '' });
  return t(d, 'stock.resync.done', { n: formatNumber(r.applied, locale), same: formatNumber(r.unchanged, locale) });
}

export function ResyncButtons({ dict: d, locale }: Props) {
  const { busy, toast, run } = useRun(d);
  const [sku, setSku] = useState('');

  const all = () =>
    run('all', async () => {
      const a = await call('POST', '/api/admin/inventory/resync', {});
      if (a.status !== 200) return stockRefusal(d, a.data.error, a.data.details);
      return pullText(d, a.data.stock as StockPullResult, locale);
    });
  const one = (e: FormEvent) => {
    e.preventDefault();
    const code = sku.trim();
    if (!code) return;
    void run('one', async () => {
      const a = await call('POST', '/api/admin/inventory/resync', { sku: code });
      if (a.status !== 200) return stockRefusal(d, a.data.error, a.data.details);
      const r = a.data.product as ProductResyncResult;
      if (r.status === 'succeeded' && r.notFound) return t(d, 'stock.resync.notInErp', { sku: code });
      return pullText(d, r, locale);
    });
  };

  return (
    <div className="st-acts">
      <button type="button" className="ad-btn ad-btn-primary ad-btn-sm" disabled={busy !== null} onClick={all}>
        <Icon name="sync" size={16} />
        {t(d, busy === 'all' ? 'stock.resync.running' : 'stock.resync.all')}
      </button>
      <form className="st-one" onSubmit={one}>
        <label className="pa-vh" htmlFor="st-sku">
          {t(d, 'stock.resync.skuLabel')}
        </label>
        <input id="st-sku" className="ad-input" value={sku} maxLength={64} autoComplete="off" spellCheck={false} placeholder={t(d, 'stock.resync.skuPlaceholder')} onChange={(e) => setSku(e.target.value)} />
        <button type="submit" className="ad-btn ad-btn-ghost ad-btn-sm" disabled={busy !== null || !sku.trim()}>
          {t(d, busy === 'one' ? 'stock.resync.running' : 'stock.resync.one')}
        </button>
      </form>
      {toast ? (
        <div className="ad-toast" role="status">
          {toast}
        </div>
      ) : null}
    </div>
  );
}

export function ReconcileButton({ dict: d, locale }: Props) {
  const { busy, toast, run } = useRun(d);
  const [result, setResult] = useState<ReconcileResult | null>(null);
  const num = (n: number) => formatNumber(n, locale);

  const go = () =>
    run('check', async () => {
      const a = await call('POST', '/api/admin/inventory/reconcile');
      if (a.status !== 200) return stockRefusal(d, a.data.error, a.data.details);
      const r = a.data.reconcile as ReconcileResult;
      setResult(r);
      if (r.status === 'skipped') return t(d, `stock.reconcile.skipped.${r.reason ?? 'ERP_ON_PRACTICE'}`);
      if (r.status === 'failed') return t(d, 'stock.reconcile.failed', { code: r.error?.code ?? '' });
      return null;
    });

  const total = result ? KINDS.reduce((s, k) => s + result.counts[k], 0) : 0;
  return (
    <div className="st-check">
      <button type="button" className="ad-btn ad-btn-ghost ad-btn-sm" disabled={busy !== null} onClick={go}>
        <Icon name="check" size={16} />
        {t(d, busy ? 'stock.reconcile.running' : 'stock.reconcile.button')}
      </button>
      {result?.status === 'succeeded' ? (
        <div className="st-check-res" role="status">
          <p className={total ? 'ad-mini bad' : 'ad-mini ok'}>{total ? t(d, 'stock.reconcile.found', { n: num(total), ok: num(result.matched) }) : t(d, 'stock.reconcile.allMatch', { ok: num(result.matched) })}</p>
          {total ? (
            <ul className="st-list">
              {KINDS.filter((k) => result.counts[k]).map((k) => (
                <li key={k} className="st-li">
                  <span className="ad-dot warn" />
                  <span className="st-li-main">{t(d, `stock.reconcile.kind.${k}`, { n: num(result.counts[k]) })}</span>
                </li>
              ))}
              {result.mismatches.slice(0, 10).map((m) => (
                <li key={`${m.kind}:${m.sku}:${m.locationId}`} className="st-li">
                  <span className="st-sku" translate="no">
                    {m.sku}
                  </span>
                  <span className="st-li-main ad-mini">{t(d, 'stock.reconcile.line', { erp: m.erp ? num(m.erp.onHand) : '–', shop: m.shop ? num(m.shop.onHand) : '–' })}</span>
                </li>
              ))}
            </ul>
          ) : null}
          {!result.complete ? <p className="ad-mini">{t(d, 'stock.reconcile.partial')}</p> : null}
          {result.unknownSku ? <p className="ad-mini">{t(d, 'stock.reconcile.unknown', { n: num(result.unknownSku) })}</p> : null}
        </div>
      ) : null}
      {toast ? (
        <div className="ad-toast" role="status">
          {toast}
        </div>
      ) : null}
    </div>
  );
}

export function RetryDocuments({ dict: d, locale, count }: Props & { count: number }) {
  const { busy, toast, run } = useRun(d);
  const go = () =>
    run('retry', async () => {
      const a = await call('POST', '/api/admin/inventory/pushes/retry', { all: true });
      if (a.status !== 200) return stockRefusal(d, a.data.error, a.data.details);
      return t(d, 'stock.docs.queued', { n: formatNumber(Number(a.data.queued ?? 0), locale) });
    });
  return (
    <>
      <button type="button" className="ad-btn ad-btn-ghost ad-btn-sm" disabled={busy !== null || !count} onClick={go}>
        <Icon name="sync" size={16} />
        {t(d, 'stock.docs.retry', { n: formatNumber(count, locale) })}
      </button>
      {toast ? (
        <div className="ad-toast" role="status">
          {toast}
        </div>
      ) : null}
    </>
  );
}

interface Style {
  styleCode: string | null;
  styleName: string | null;
  skus: { sku: string }[];
}

/** PR 204 — asks the ERP which of its styles the shop does not have yet (only on a press: the page never waits on it). */
export function NewStylesButton({ dict: d, locale }: Props) {
  const { busy, toast, run } = useRun(d);
  const [styles, setStyles] = useState<{ state: string; styles: Style[]; truncated: boolean } | null>(null);
  const num = (n: number) => formatNumber(n, locale);
  const go = () =>
    run('styles', async () => {
      const a = await call('GET', '/api/admin/inventory/erp/styles');
      if (a.status !== 200) return stockRefusal(d, a.data.error, a.data.details);
      const s = a.data.styles as { state: string; styles: Style[]; truncated: boolean };
      setStyles(s);
      return s.state === 'skipped' ? t(d, 'stock.queue.stylesNone') : null;
    });
  return (
    <div className="st-check">
      <button type="button" className="ad-btn ad-btn-ghost ad-btn-sm" disabled={busy !== null} onClick={go}>
        <Icon name="search" size={16} />
        {t(d, busy ? 'stock.queue.looking' : 'stock.queue.findStyles')}
      </button>
      {styles && styles.state !== 'skipped' ? (
        <div className="st-check-res" role="status">
          {styles.state === 'practice' ? <p className="ad-mini">{t(d, 'stock.queue.practice')}</p> : null}
          {styles.styles.length ? (
            <ul className="st-list">
              {styles.styles.slice(0, 20).map((s) => (
                <li key={s.styleCode ?? ''} className="st-li">
                  <span className="st-sku" translate="no">
                    {s.styleCode ?? '–'}
                  </span>
                  <span className="st-li-main">{s.styleName ?? ''}</span>
                  <span className="ad-mini">{t(d, 'stock.queue.skus', { n: num(s.skus.length) })}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="ad-mini ok">{t(d, 'stock.queue.stylesNoneNew')}</p>
          )}
          {styles.truncated ? <p className="ad-mini">{t(d, 'stock.queue.truncated')}</p> : null}
        </div>
      ) : null}
      {toast ? (
        <div className="ad-toast" role="status">
          {toast}
        </div>
      ) : null}
    </div>
  );
}
