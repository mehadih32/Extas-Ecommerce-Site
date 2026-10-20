'use client';
// PR 203 — one stock count: scan a barcode (or type the SKU) and press Enter; the field stays ready for the next scan,
// so a scanner that types and presses Enter just works. "Compare with the ERP" freezes what the ERP says is there and
// adds what nobody scanned; every line that differs then needs its reason before the count can be finished. Finishing
// records the result only — the stock numbers stay the ERP's.
import { useRef, useState, type FormEvent } from 'react';
import type { AuditView } from '@extas/inventory';
import { t, type Dict } from '@/lib/i18n';
import { call, type Answer } from '../api';
import { Icon } from '../Icon';
import { formatNumber, nameIn } from '../products/model';
import { useToast } from '../products/useToast';
import { linesToShow, stockRefusal } from './text';

export interface ReasonChoice {
  key: string;
  label: string;
}

/** One call to the stock API. */
type Sender = { (): Promise<Answer> };

type Props = { dict: Dict; lang: 'bn' | 'en'; locale: string; initial: AuditView; reasons: ReasonChoice[]; canCount: boolean; maxPerScan: number };

export function AuditScreen({ dict: d, lang, locale, initial, reasons, canCount, maxPerScan }: Props) {
  const [audit, setAudit] = useState(initial);
  const [code, setCode] = useState('');
  const [qty, setQty] = useState('1');
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<{ code: string; known: boolean; counted: number } | null>(null);
  const [toast, say] = useToast();
  const input = useRef<HTMLInputElement>(null);
  const num = (n: number) => formatNumber(n, locale);
  const open = audit.status === 'COUNTING' || audit.status === 'REVIEW';
  const review = audit.status === 'REVIEW';
  const editable = open && canCount;
  const compared = review || audit.status === 'COMPLETED';
  // once compared with the ERP, the lines that differ come first, and the list can show only them
  const [onlyDiff, setOnlyDiff] = useState(true);
  const differing = audit.lines.filter((l) => l.variance !== 0);
  const shown = linesToShow(audit.lines, compared, onlyDiff);

  const send = async (fn: Sender, done?: (a: Answer) => void) => {
    setBusy(true);
    try {
      const a = await fn();
      if (a.status !== 200) {
        say(stockRefusal(d, a.data.error, a.data.details));
        return;
      }
      if (a.data.audit) setAudit(a.data.audit as AuditView);
      done?.(a);
    } finally {
      setBusy(false);
    }
  };

  const scan = (e: FormEvent) => {
    e.preventDefault();
    const c = code.trim();
    const n = Number(qty);
    if (!c) return;
    if (!Number.isInteger(n) || n < 1 || n > maxPerScan) return say(t(d, 'stock.count.qtyBad', { max: num(maxPerScan) }));
    void send(
      () => call('POST', `/api/admin/inventory/audits/${audit.id}`, { action: 'scan', code: c, quantity: n }),
      (a) => {
        setLast({ code: c, known: a.data.known === true, counted: Number(a.data.counted ?? 0) });
        setCode('');
        setQty('1');
        input.current?.focus();
      },
    );
  };
  const step = (action: 'review' | 'complete' | 'cancel') => {
    if (action === 'cancel' && !window.confirm(t(d, 'stock.count.cancelConfirm'))) return;
    void send(() => call('POST', `/api/admin/inventory/audits/${audit.id}`, { action }));
  };
  const reason = (lineId: string, value: string) => void send(() => call('PATCH', `/api/admin/inventory/audit-lines/${lineId}`, { reason: value || null }));

  const tot = audit.totals;
  return (
    <>
      <div className="st-grid">
        <section className="ad-card st-card" aria-labelledby="st-scan">
          <h2 id="st-scan">{t(d, `stock.count.head.${audit.status}`)}</h2>
          <p className="ad-sub">{t(d, `stock.count.sub.${audit.status}`)}</p>
          {editable ? (
            <form className="st-scan" onSubmit={scan}>
              <div className="st-scan-code">
                <label className="ad-label" htmlFor="st-code">
                  {t(d, 'stock.count.code')}
                </label>
                <input id="st-code" ref={input} className="ad-input" value={code} maxLength={64} autoFocus autoComplete="off" spellCheck={false} inputMode="text" placeholder={t(d, 'stock.count.codePlaceholder')} onChange={(e) => setCode(e.target.value)} />
              </div>
              <div className="st-scan-qty">
                <label className="ad-label" htmlFor="st-qty">
                  {t(d, 'stock.count.qty')}
                </label>
                <input id="st-qty" className="ad-input" value={qty} inputMode="numeric" pattern="[0-9]*" maxLength={6} onChange={(e) => setQty(e.target.value.replace(/[^0-9]/g, ''))} />
              </div>
              <button type="submit" className="ad-btn ad-btn-primary ad-btn-sm st-scan-btn" disabled={busy || !code.trim()}>
                <Icon name="plus" size={16} />
                {t(d, 'stock.count.add')}
              </button>
            </form>
          ) : null}
          {last ? (
            <p className={last.known ? 'ad-mini ok' : 'ad-mini bad'} role="status">
              {t(d, last.known ? 'stock.count.added' : 'stock.count.unknown', { code: last.code, n: num(last.counted) })}
            </p>
          ) : null}
          <div className="st-counts">
            <span className="st-count">
              <b>{num(tot.lines)}</b> {t(d, 'stock.count.totals.lines')}
            </span>
            <span className="st-count">
              <b>{num(tot.counted)}</b> {t(d, 'stock.count.totals.counted')}
            </span>
            {review || audit.status === 'COMPLETED' ? (
              <>
                <span className="st-count">
                  <b>{num(tot.expected)}</b> {t(d, 'stock.count.totals.expected')}
                </span>
                <span className="st-count c-failed">
                  <b>{num(tot.differing)}</b> {t(d, 'stock.count.totals.differing')}
                </span>
              </>
            ) : null}
            {tot.unknown ? (
              <span className="st-count c-dead">
                <b>{num(tot.unknown)}</b> {t(d, 'stock.count.totals.unknown')}
              </span>
            ) : null}
          </div>
          {editable ? (
            <div className="st-card-acts st-row-acts">
              {audit.status === 'COUNTING' ? (
                <button type="button" className="ad-btn ad-btn-primary ad-btn-sm" disabled={busy} onClick={() => step('review')}>
                  <Icon name="check" size={16} />
                  {t(d, 'stock.count.review')}
                </button>
              ) : (
                <button type="button" className="ad-btn ad-btn-primary ad-btn-sm" disabled={busy || tot.withoutReason > 0} onClick={() => step('complete')}>
                  <Icon name="check" size={16} />
                  {t(d, 'stock.count.complete')}
                </button>
              )}
              <button type="button" className="ad-btn ad-btn-ghost ad-btn-sm" disabled={busy} onClick={() => step('cancel')}>
                {t(d, 'stock.count.cancel')}
              </button>
            </div>
          ) : null}
          {review && tot.withoutReason ? <p className="ad-mini bad">{t(d, 'stock.count.needReasons', { n: num(tot.withoutReason) })}</p> : null}
        </section>

        <section className="ad-card st-card st-wide" aria-labelledby="st-lines">
          <div className="st-card-hd">
            <h2 id="st-lines">{t(d, 'stock.count.linesTitle')}</h2>
            {compared && differing.length !== audit.lines.length ? (
              <button type="button" className="ad-btn ad-btn-ghost ad-btn-sm" aria-pressed={!onlyDiff} onClick={() => setOnlyDiff((v) => !v)}>
                <Icon name="list" size={16} />
                {onlyDiff ? t(d, 'stock.count.showAll', { n: num(audit.lines.length) }) : t(d, 'stock.count.onlyDiff', { n: num(differing.length) })}
              </button>
            ) : null}
          </div>
          {shown.length ? (
            <ul className="st-list">
              {shown.map((l) => {
                const differs = compared && l.variance !== 0;
                const oldReason = !!l.reason && !reasons.some((r) => r.key === l.reason);
                return (
                  <li key={l.id} className="st-li st-aline">
                    <span className="st-li-main">
                      <b className="st-block">{l.productName ? nameIn(lang, { nameEn: l.productName.en, nameBn: l.productName.bn }) : t(d, 'stock.count.unknownItem')}</b>
                      <span className="ad-mini st-block">
                        <span translate="no">{l.sku ?? l.barcode}</span>
                        {l.colour ? `${t(d, 'stock.sep')}${l.colour}` : ''}
                        {l.size ? `${t(d, 'stock.sep')}${l.size}` : ''}
                      </span>
                    </span>
                    <span className="st-nums">
                      <span className="st-num">
                        <span className="ad-mini">{t(d, 'stock.count.counted')}</span>
                        <b>{num(l.counted)}</b>
                      </span>
                      {review || audit.status === 'COMPLETED' ? (
                        <>
                          <span className="st-num">
                            <span className="ad-mini">{t(d, 'stock.count.expected')}</span>
                            <b>{num(l.expected)}</b>
                          </span>
                          <span className={`st-num ${l.variance > 0 ? 'over' : l.variance < 0 ? 'short' : ''}`}>
                            <span className="ad-mini">{t(d, 'stock.count.variance')}</span>
                            <b>{l.variance > 0 ? t(d, 'stock.count.plus', { n: num(l.variance) }) : num(l.variance)}</b>
                          </span>
                        </>
                      ) : null}
                    </span>
                    {differs ? (
                      <span className="st-reason">
                        <label className="pa-vh" htmlFor={`st-r-${l.id}`}>
                          {t(d, 'stock.count.reason')}
                        </label>
                        <select id={`st-r-${l.id}`} className="ad-input" value={l.reason ?? ''} disabled={!editable || busy} aria-invalid={!l.reason && review ? true : undefined} onChange={(e) => reason(l.id, e.target.value)}>
                          <option value="">{t(d, 'stock.count.pickReason')}</option>
                          {reasons.map((r) => (
                            <option key={r.key} value={r.key}>
                              {r.label}
                            </option>
                          ))}
                          {oldReason ? <option value={l.reason ?? ''}>{l.reason}</option> : null}
                        </select>
                      </span>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="pa-empty">{t(d, compared && audit.lines.length ? 'stock.count.noDiff' : 'stock.count.noLines')}</p>
          )}
        </section>
      </div>
      {toast ? (
        <div className="ad-toast" role="status">
          {toast}
        </div>
      ) : null}
    </>
  );
}
