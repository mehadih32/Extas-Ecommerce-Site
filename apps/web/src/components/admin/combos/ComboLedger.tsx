'use client';
// PR 1129 (prototype v5, Products › Combos): every combo in one table — the fixed combos and the colour-pair rules — with a
// search box and the status chips Active, Paused, Scheduled or ended, Off and Archived. Each row: the combo and its pieces,
// the price (the "was" price struck through), sold in 30 days, the dates, the status, and Turn off (or Turn on), Price and
// Archive. Each press goes through the same APIs and checks as the other combo tabs (`combos.publish`, `combos.write`);
// nothing is deleted (Archive ends a fixed combo, "Bring back" on its card returns it; a rule switched off sits in the Archive).
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { AutoRuleView, ComboView } from '@extas/combos';
import { call, errorText } from '../api';
import { t, type Dict } from '@/lib/i18n';
import { COMBOS_API } from './ComboEditor';
import { nameIn, type Lang } from './model';

export const LEDGER_CHIPS = ['active', 'paused', 'scheduled', 'off', 'archived'] as const;
export type LedgerChip = (typeof LEDGER_CHIPS)[number];

export interface LedgerRow {
  id: string;
  kind: 'fixed' | 'rule';
  name: string;
  pieces: string;
  priceMinor: number | null;
  wasMinor: number | null;
  percentOff: number | null;
  sold: number | null;
  starts: string | null;
  ends: string | null;
  chip: LedgerChip;
  on: boolean;
}

/** Which chip a fixed combo sits under (pure; tested). */
export function fixedChip(c: Pick<ComboView, 'status' | 'state'>): LedgerChip {
  if (c.status === 'ENDED') return 'archived';
  if (c.status === 'SOLD_OUT') return 'paused';
  if (c.state === 'live') return 'active';
  if (c.state === 'soon' || c.state === 'ended') return 'scheduled';
  return 'off';
}

/** Which chip a colour-pair rule sits under (pure; tested): a rule with no pair in stock is paused by itself. */
export function ruleChip(r: Pick<AutoRuleView, 'state' | 'counts'>): LedgerChip {
  if (r.state === 'live') return r.counts.withStock > 0 ? 'active' : 'paused';
  if (r.state === 'soon') return 'scheduled';
  if (r.state === 'ended') return 'archived';
  return 'off';
}

export function ledgerRows(lang: Lang, combos: readonly ComboView[], rules: readonly AutoRuleView[], sold: Record<string, number>): LedgerRow[] {
  const fixed = combos.map(
    (c): LedgerRow => ({
      id: c.id,
      kind: 'fixed',
      name: nameIn(lang, c.nameEn, c.nameBn),
      pieces: c.items.map((i) => nameIn(lang, i.productNameEn ?? i.labelEn ?? '', i.productNameBn ?? i.labelBn)).filter(Boolean).join(' + '),
      priceMinor: c.pricing.payMinor,
      wasMinor: c.pricing.offer ? c.pricing.regularMinor : null,
      percentOff: null,
      sold: sold[c.id] ?? 0,
      starts: c.startsOn,
      ends: c.endsOn,
      chip: fixedChip(c),
      on: c.state === 'live' || c.state === 'soon',
    }),
  );
  const auto = rules
    .filter((r) => !r.upsellOf)
    .map(
      (r): LedgerRow => ({
        id: r.id,
        kind: 'rule',
        name: nameIn(lang, r.nameEn, r.nameBn),
        pieces: r.bound.map((b) => nameIn(lang, b.nameEn, b.nameBn)).join(' + '),
        priceMinor: r.priceMode === 'FIXED' ? r.priceMinor : null,
        wasMinor: null,
        percentOff: r.priceMode === 'PERCENT' ? r.percentOff : null,
        sold: null,
        starts: r.startsOn,
        ends: r.endsOn,
        chip: ruleChip(r),
        on: r.state === 'live' || r.state === 'soon',
      }),
    );
  return [...fixed, ...auto];
}

export function ComboLedger({ dict: d, lang, fmt, num, rows, canPublish, canWrite, onPrice, ruleHref }: { dict: Dict; lang: Lang; fmt: (m: number | null) => string; num: (n: number) => string; rows: LedgerRow[]; canPublish: boolean; canWrite: boolean; onPrice: (id: string) => void; ruleHref: (id: string) => string }) {
  const tt = (k: string, v?: Record<string, string | number>) => t(d, `combos.ledger.${k}`, v);
  const router = useRouter();
  const [chip, setChip] = useState<LedgerChip>('active');
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState('');
  const [asking, setAsking] = useState<string | null>(null);
  const shown = rows.filter((r) => r.chip === chip && (!q.trim() || `${r.name} ${r.pieces}`.toLowerCase().includes(q.trim().toLowerCase())));
  const post = async (r: LedgerRow, body: Record<string, unknown>) => {
    setBusy(r.id);
    setErr('');
    const a = await call('POST', r.kind === 'rule' ? `${COMBOS_API}/rules/${r.id}/active` : `${COMBOS_API}/${r.id}/active`, body);
    setBusy(null);
    setAsking(null);
    if (!a.data.ok) return setErr(errorText(d, a));
    router.refresh();
  };
  const dates = (r: LedgerRow) => (r.starts || r.ends ? `${r.starts ?? '…'} – ${r.ends ?? '…'}` : tt('always'));
  void lang;
  return (
    <section className="ad-card cb-ledger" data-testid="cb-ledger">
      <input className="ad-input cb-ledger-q" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={tt('search')} aria-label={tt('search')} data-testid="cb-ledger-q" />
      <div className="cb-ledger-chips" role="group" aria-label={tt('chipsLabel')}>
        {LEDGER_CHIPS.map((k) => (
          <button key={k} type="button" className={`ad-chip${chip === k ? ' on' : ''}`} aria-pressed={chip === k} onClick={() => setChip(k)} data-testid={`cb-ledger-chip-${k}`}>
            {tt(`chip.${k}`)} <span className="cb-chip-n">{num(rows.filter((r) => r.chip === k).length)}</span>
          </button>
        ))}
      </div>
      {err ? (
        <p className="ad-mini cb-err" role="alert">
          {err}
        </p>
      ) : null}
      {shown.length ? (
        <div className="cb-ledger-tw">
          <table className="cb-ledger-t">
            <thead>
              <tr>
                <th>{tt('col.combo')}</th>
                <th className="r">{tt('col.price')}</th>
                <th className="r">{tt('col.sold')}</th>
                <th>{tt('col.dates')}</th>
                <th>{tt('col.status')}</th>
                <th>
                  <span className="cb-sr">{tt('col.actions')}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id} data-testid="cb-ledger-row" data-kind={r.kind}>
                  <td>
                    <b>{r.name}</b>
                    <span className="ad-mini cb-dim cb-block">{[r.pieces, tt(`kind.${r.kind}`)].filter(Boolean).join(' · ')}</span>
                  </td>
                  <td className="r">
                    {r.percentOff !== null ? (
                      <b>{tt('percent', { n: r.percentOff })}</b>
                    ) : (
                      <>
                        <b>{fmt(r.priceMinor)}</b>
                        {r.wasMinor !== null ? <s className="ad-mini cb-dim cb-block">{fmt(r.wasMinor)}</s> : null}
                      </>
                    )}
                  </td>
                  <td className="r">{r.sold === null ? '—' : num(r.sold)}</td>
                  <td className="ad-mini">{dates(r)}</td>
                  <td>
                    <span className={`cb-state ${r.chip}`}>{tt(`state.${r.chip}`)}</span>
                  </td>
                  <td className="r">
                    <span className="cb-ledger-acts">
                      {canPublish && r.chip !== 'archived' ? (
                        <button type="button" className="ad-btn ad-btn-sm" disabled={busy === r.id} onClick={() => void post(r, { on: !r.on })} data-testid="cb-ledger-onoff">
                          {r.on ? tt('turnOff') : tt('turnOn')}
                        </button>
                      ) : null}
                      {canWrite ? (
                        r.kind === 'rule' ? (
                          <Link className="ad-btn ad-btn-sm" href={ruleHref(r.id)} data-testid="cb-ledger-price">
                            {tt('price')}
                          </Link>
                        ) : (
                          <button type="button" className="ad-btn ad-btn-sm" onClick={() => onPrice(r.id)} data-testid="cb-ledger-price">
                            {tt('price')}
                          </button>
                        )
                      ) : null}
                      {canPublish && r.kind === 'fixed' && r.chip !== 'archived' ? (
                        asking === r.id ? (
                          <button type="button" className="ad-btn ad-btn-sm ad-btn-primary" disabled={busy === r.id} onClick={() => void post(r, { on: false, archive: true })} data-testid="cb-ledger-archive-yes">
                            {tt('archiveYes')}
                          </button>
                        ) : (
                          <button type="button" className="ad-btn ad-btn-sm ad-btn-ghost" onClick={() => setAsking(r.id)} data-testid="cb-ledger-archive">
                            {tt('archive')}
                          </button>
                        )
                      ) : null}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="ad-mini cb-dim" data-testid="cb-ledger-empty">
          {tt('empty')}
        </p>
      )}
    </section>
  );
}
