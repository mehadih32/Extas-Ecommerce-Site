'use client';
// S28 · PR 704 — Orders → Bulk: the KPI row, the new enquiries, the quote form, one card per quote (advance and balance
// marks with the owner's PIN, delivery batches, quotation and company invoice on paper) and the settings. Writes go to
// /api/admin/bulk-orders/*. Nothing here moves money: "received" is a mark.
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import { t, type Dict } from '@/lib/i18n';
import { typedMinor } from '@/lib/admin-books/money';
import { figures, parseSizes, type BulkLine } from '@/lib/bulk-orders-pure';
import type { BulkView, QuoteRow } from '@/lib/bulk-orders';
import { call } from '../api';
import { showToast } from '../lumen/Toast';
import { formatMoney, type Money } from '../products/model';

export interface BulkOrdersScreenProps {
  dict: Dict;
  money: Money;
  view: BulkView;
  canEdit: boolean;
  canSettings: boolean;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

interface TierDraft {
  from: string;
  price: string;
}

export function BulkOrdersScreen(p: BulkOrdersScreenProps) {
  const id = useId();
  const router = useRouter();
  const c = (k: string, vars?: Record<string, string | number>) => t(p.dict, `bulkOrders.${k}`, vars);
  const m = (minor: number) => formatMoney(minor, p.money);
  const digits = p.money.digits;
  const cfg = p.view.cfg;
  const [formOpen, setFormOpen] = useState(false);
  const [enquiryId, setEnquiryId] = useState<string | null>(null);
  const [enquiryRef, setEnquiryRef] = useState('');
  const [company, setCompany] = useState('');
  const [contact, setContact] = useState('');
  const [phone, setPhone] = useState('');
  const [lines, setLines] = useState<BulkLine[]>([]);
  const [style, setStyle] = useState('');
  const [colour, setColour] = useState('');
  const [sizes, setSizes] = useState('');
  const [pricing, setPricing] = useState<'PIECE' | 'TIER'>('PIECE');
  const [price, setPrice] = useState('');
  const [tiers, setTiers] = useState<TierDraft[]>([{ from: '0', price: '' }]);
  const [advance, setAdvance] = useState(String(cfg.defaultAdvancePct));
  const [batches, setBatches] = useState('1');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<{ text: string; bad: boolean } | null>(null);
  const [pinFor, setPinFor] = useState<{ quote: QuoteRow; which: 'advance' | 'balance' } | null>(null);
  const [pin, setPin] = useState('');
  const [tracking, setTracking] = useState<Record<string, string>>({});
  const [sEnabled, setSEnabled] = useState(cfg.enabled);
  const [sAdv, setSAdv] = useState(String(cfg.defaultAdvancePct));
  const [sValid, setSValid] = useState(String(cfg.quoteValidDays));
  const [sMax, setSMax] = useState(String(cfg.maxBatches));
  const [sGap, setSGap] = useState(String(cfg.batchGapDays));
  const [sFirst, setSFirst] = useState(String(cfg.firstBatchAfterDays));
  const [sPin, setSPin] = useState('');

  const err = (a: { status: number; data: { error?: string } }) => {
    const k = `bulkOrders.errors.${a.status === 0 ? 'network' : (a.data.error ?? 'server-error')}`;
    const v = t(p.dict, k);
    return v === k ? c('errors.server-error') : v;
  };
  const bad = (a: { status: number; data: { error?: string } }) => setSaid({ text: err(a), bad: true });

  const priceInput = () => ({
    pricing,
    pieceMinor: pricing === 'PIECE' ? (typedMinor(price, digits) ?? 0) : 0,
    tiers: pricing === 'TIER' ? tiers.map((x) => ({ from: Number(x.from) || 0, minor: typedMinor(x.price, digits) ?? 0 })).filter((x) => x.minor > 0) : [],
  });
  const live = figures(lines, priceInput(), Math.max(0, Math.min(100, Number(advance) || 0)));

  function addLine() {
    const s = parseSizes(sizes);
    if (!style.trim() || !s || !Object.values(s).some((n) => n > 0)) return setSaid({ text: c('errors.NO_PIECES'), bad: true });
    setLines((l) => [...l, { name: style.trim(), colour: colour.trim(), sizes: s }]);
    setStyle('');
    setColour('');
    setSizes('');
    setSaid(null);
  }
  function fromEnquiry(e: BulkView['enquiries'][number]) {
    setFormOpen(true);
    setEnquiryId(e.id);
    setEnquiryRef(e.ref);
    setCompany(e.company ?? e.name);
    setContact(e.name);
    setPhone(e.phone);
    setNote(e.itemsText ?? '');
  }
  async function saveQuote() {
    setBusy(true);
    setSaid(null);
    const a = await call('POST', '/api/admin/bulk-orders', { enquiryId, company, contact, phone, lines, ...priceInput(), advancePct: Number(advance), batches: Number(batches), note: note.trim() || null });
    setBusy(false);
    if (a.data.ok) {
      showToast({ text: c('new.saved'), tone: 'ok' });
      setFormOpen(false);
      setLines([]);
      setEnquiryId(null);
      router.refresh();
    } else bad(a);
  }
  async function confirmMark() {
    if (!pinFor) return;
    setBusy(true);
    const a = await call('POST', `/api/admin/bulk-orders/quotes/${pinFor.quote.id}/received`, { which: pinFor.which, pin });
    setBusy(false);
    if (a.data.ok) {
      setPinFor(null);
      setPin('');
      router.refresh();
    } else bad(a);
  }
  async function next(batchId: string) {
    setBusy(true);
    const a = await call('POST', `/api/admin/bulk-orders/batches/${batchId}/next`, { tracking: (tracking[batchId] ?? '').trim() || null });
    setBusy(false);
    if (a.data.ok) router.refresh();
    else bad(a);
  }
  async function saveSettings() {
    setBusy(true);
    setSaid(null);
    const a = await call('POST', '/api/admin/bulk-orders/settings', { enabled: sEnabled, defaultAdvancePct: Number(sAdv), quoteValidDays: Number(sValid), maxBatches: Number(sMax), batchGapDays: Number(sGap), firstBatchAfterDays: Number(sFirst), pin: sPin });
    setBusy(false);
    if (a.data.ok) {
      setSPin('');
      setSaid({ text: c('settings.saved'), bad: false });
      router.refresh();
    } else bad(a);
  }
  function paper(q: QuoteRow, invoice: boolean) {
    const w = window.open('', '_blank');
    if (!w) return;
    const row = (l: BulkLine) => {
      const n = Object.values(l.sizes).reduce((x, y) => x + y, 0);
      return `<tr><td>${esc(l.name)}${l.colour ? ` · ${esc(l.colour)}` : ''}</td><td>${esc(Object.entries(l.sizes).map(([k, v]) => `${k} ${v}`).join(', '))}</td><td style="text-align:right">${n}</td><td style="text-align:right">${esc(m(q.unitMinor))}</td><td style="text-align:right">${esc(m(n * q.unitMinor))}</td></tr>`;
    };
    const tiersLine = q.pricing === 'TIER' ? `<p>${esc(c('paper.tiers'))}: ${esc(q.tiers.map((x) => `${x.from}+ → ${m(x.minor)}`).join(' · '))}</p>` : '';
    w.document.write(`<!doctype html><title>${esc(q.ref)}</title><body style="font-family:sans-serif;padding:24px;max-width:780px;margin:auto"><h2>${esc(c(invoice ? 'paper.invoice' : 'paper.quotation'))} ${esc(q.ref)}</h2><p><b>${esc(q.company)}</b><br>${esc(q.contact)} · ${esc(q.phone)}</p><table style="width:100%;border-collapse:collapse" border="1" cellpadding="6"><thead><tr><th>${esc(c('paper.item'))}</th><th>${esc(c('paper.sizes'))}</th><th>${esc(c('paper.pieces'))}</th><th>${esc(c('paper.price'))}</th><th>${esc(c('paper.amount'))}</th></tr></thead><tbody>${q.lines.map(row).join('')}</tbody></table><p><b>${esc(c('paper.total'))}: ${esc(m(q.totalMinor))}</b> (${q.pieces})<br>${esc(c('paper.advance', { pct: q.advancePct }))}: ${esc(m(q.advanceMinor))}${q.advanceReceivedAt ? ' ✓' : ''}<br>${esc(c('paper.balance'))}: ${esc(m(q.balanceMinor))}${q.balanceReceivedAt ? ' ✓' : ''}</p>${tiersLine}<p>${esc(c('paper.batches', { n: q.batches.length }))} ${invoice ? '' : esc(c('paper.validNote', { date: q.validUntil }))}</p><p><button onclick="print()">${esc(c('paper.print'))}</button></p></body>`);
    w.document.close();
  }

  const tone = (s: QuoteRow['state']) => (s === 'DONE' ? 's28-good' : s === 'BALANCE_DUE' ? 's28-bad' : 's28-warn');
  return (
    <>
      {!p.view.enabled ? <p className="a2-sm a2-mt12" data-testid="bulk-off">{c('off')}</p> : null}
      <div className="s28-grid a2-mt12" data-testid="bulk-kpi">
        <div className="a2-card"><div className="a2-xs a2-mute">{c('kpi.open')}</div><b className="a2-h3">{p.view.totals.open}</b><div className="a2-xs a2-mute">{c('kpi.pieces', { n: p.view.totals.openPieces })}</div></div>
        <div className="a2-card"><div className="a2-xs a2-mute">{c('kpi.value')}</div><b className="a2-h3">{m(p.view.totals.openMinor)}</b></div>
        <div className="a2-card"><div className="a2-xs a2-mute">{c('kpi.due')}</div><b className="a2-h3">{m(p.view.totals.balanceToCollectMinor)}</b></div>
      </div>

      {p.view.enabled ? (
        <section className="a2-card a2-mt12" aria-labelledby={`${id}-e`} data-testid="bulk-enquiries">
          <h2 className="a2-h3" id={`${id}-e`}>{c('enq.title')}</h2>
          <p className="a2-cs">{c('enq.sub')}</p>
          <div className="s28-list a2-mt6">
            {p.view.enquiries.length ? p.view.enquiries.map((e) => (
              <div key={e.id} className="s28-row">
                <b>{e.ref}</b>
                <span className="grow">{e.company ?? e.name} · {e.phone} · {c('enq.pcs', { n: e.quantity })}</span>
                {p.canEdit ? <button type="button" className="a2-btn" onClick={() => fromEnquiry(e)}>{c('enq.make')}</button> : null}
              </div>
            )) : <p className="a2-sm a2-mute">{c('enq.none')}</p>}
          </div>
        </section>
      ) : null}

      {p.view.enabled && p.canEdit ? (
        <section className="a2-card a2-mt12" data-testid="bulk-form">
          <div className="s28-row">
            <h2 className="a2-h3 grow">{c('new.title')}</h2>
            <button type="button" className="a2-btn" onClick={() => setFormOpen((v) => !v)} data-testid="bulk-new">{formOpen ? c('new.cancel') : c('new.open')}</button>
          </div>
          {formOpen ? (
            <div className="a2-mt12">
              {enquiryId ? <p className="a2-xs a2-mute">{c('new.from', { ref: enquiryRef })}</p> : null}
              <div className="s28-grid">
                <label>{c('new.company')}<input className="a2-inp" value={company} onChange={(e) => setCompany(e.target.value)} data-testid="bulk-company" /></label>
                <label>{c('new.contact')}<input className="a2-inp" value={contact} onChange={(e) => setContact(e.target.value)} /></label>
                <label>{c('new.phone')}<input className="a2-inp" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} data-testid="bulk-phone" /></label>
              </div>
              <div className="s28-grid a2-mt12">
                <label>{c('new.style')}<input className="a2-inp" value={style} onChange={(e) => setStyle(e.target.value)} data-testid="bulk-style" /></label>
                <label>{c('new.colour')}<input className="a2-inp" value={colour} onChange={(e) => setColour(e.target.value)} /></label>
                <label>{c('new.sizes')}<input className="a2-inp" value={sizes} onChange={(e) => setSizes(e.target.value)} data-testid="bulk-sizes" /></label>
              </div>
              <button type="button" className="a2-btn a2-mt6" onClick={addLine} data-testid="bulk-add">{c('new.add')}</button>
              <div className="s28-list a2-mt6">
                <b className="a2-sm">{c('new.lines')}</b>
                {lines.length ? lines.map((l, i) => (
                  <div key={`${l.name}-${i}`} className="s28-row">
                    <span className="grow">{l.name}{l.colour ? ` · ${l.colour}` : ''} · {Object.entries(l.sizes).map(([k, v]) => `${k} ${v}`).join(', ')}</span>
                    <button type="button" className="a2-btn" onClick={() => setLines((x) => x.filter((_, j) => j !== i))}>{c('new.remove')}</button>
                  </div>
                )) : <span className="a2-sm a2-mute">{c('new.noLines')}</span>}
              </div>
              <div className="s28-row a2-mt12">
                <b>{c('new.pricing')}</b>
                <label className="s28-row"><input type="radio" name={`${id}-pr`} checked={pricing === 'PIECE'} onChange={() => setPricing('PIECE')} /> {c('new.piece')}</label>
                <label className="s28-row"><input type="radio" name={`${id}-pr`} checked={pricing === 'TIER'} onChange={() => setPricing('TIER')} /> {c('new.tier')}</label>
              </div>
              {pricing === 'PIECE' ? (
                <label className="a2-mt6" style={{ display: 'block' }}>{c('new.agreed')}<input className="a2-inp" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} style={{ maxWidth: 160 }} data-testid="bulk-price" /></label>
              ) : (
                <div className="a2-mt6">
                  {tiers.map((x, i) => (
                    <div key={i} className="s28-row">
                      <label>{c('new.tierFrom')}<input className="a2-inp" inputMode="numeric" value={x.from} style={{ width: 90 }} onChange={(e) => setTiers((l) => l.map((y, j) => (j === i ? { ...y, from: e.target.value } : y)))} /></label>
                      <label>{c('new.tierPrice')}<input className="a2-inp" inputMode="decimal" value={x.price} style={{ width: 110 }} onChange={(e) => setTiers((l) => l.map((y, j) => (j === i ? { ...y, price: e.target.value } : y)))} /></label>
                    </div>
                  ))}
                  <button type="button" className="a2-btn a2-mt6" onClick={() => setTiers((l) => [...l, { from: '', price: '' }])}>{c('new.addTier')}</button>
                </div>
              )}
              <div className="s28-row a2-mt12">
                <label>{c('new.advance')}<input className="a2-inp" inputMode="numeric" value={advance} style={{ width: 90 }} onChange={(e) => setAdvance(e.target.value)} /></label>
                <label>{c('new.batches')}<input className="a2-inp" inputMode="numeric" value={batches} style={{ width: 90 }} onChange={(e) => setBatches(e.target.value)} /></label>
              </div>
              <label className="a2-mt6" style={{ display: 'block' }}>{c('new.note')}<input className="a2-inp" value={note} onChange={(e) => setNote(e.target.value)} /></label>
              <div className="s28-list a2-mt12" data-testid="bulk-sum">
                <div className="s28-row"><span className="grow">{c('sum.pieces')}</span><b>{live.pieces}</b></div>
                <div className="s28-row"><span className="grow">{c('sum.unit')}</span><b>{m(live.unitMinor)}</b></div>
                <div className="s28-row"><span className="grow">{c('sum.total')}</span><b>{m(live.totalMinor)}</b></div>
                <div className="s28-row"><span className="grow">{c('sum.advance', { pct: Number(advance) || 0 })}</span><b>{m(live.advanceMinor)}</b></div>
                <div className="s28-row"><span className="grow">{c('sum.balance')}</span><b>{m(live.balanceMinor)}</b></div>
              </div>
              <button type="button" className="a2-btn a2-mt12" disabled={busy} onClick={saveQuote} data-testid="bulk-save">{busy ? c('new.saving') : c('new.save')}</button>
            </div>
          ) : null}
        </section>
      ) : null}

      <div className="s28-grid a2-mt12" data-testid="bulk-quotes">
        {p.view.quotes.map((q) => (
          <section key={q.id} className="a2-card" data-testid="bulk-quote">
            <div className="s28-row">
              <b>{q.ref}</b>
              <span className={tone(q.state)}>{c(`state.${q.state}`)}</span>
              <b className="grow" style={{ textAlign: 'right' }}>{m(q.totalMinor)}</b>
            </div>
            <div className="a2-sm"><b>{q.company}</b> · {q.contact} · {q.phone}</div>
            <div className="a2-xs a2-mute">{q.pieces} · {m(q.unitMinor)} · {c('card.valid', { date: q.validUntil })}</div>
            <div className="s28-list a2-mt6">
              {q.lines.map((l, i) => <div key={i} className="a2-xs">{l.name}{l.colour ? ` · ${l.colour}` : ''} · {Object.entries(l.sizes).map(([k, v]) => `${k} ${v}`).join(' · ')}</div>)}
            </div>
            <div className="s28-list a2-mt6">
              <div className="s28-row">
                <span className="grow">{c('sum.advance', { pct: q.advancePct })}</span><b>{m(q.advanceMinor)}</b>
                {q.advanceReceivedAt ? <span className="s28-good">{c('card.advanceDone')}</span> : p.canEdit && p.view.enabled ? <button type="button" className="a2-btn" onClick={() => setPinFor({ quote: q, which: 'advance' })}>{c('card.advanceBtn')}</button> : null}
              </div>
              <div className="s28-row">
                <span className="grow">{c('sum.balance')}</span><b>{m(q.balanceMinor)}</b>
                {q.balanceReceivedAt ? <span className="s28-good">{c('card.advanceDone')}</span> : q.state === 'BALANCE_DUE' && p.canEdit ? <button type="button" className="a2-btn" onClick={() => setPinFor({ quote: q, which: 'balance' })}>{c('card.balanceBtn')}</button> : <span className="a2-xs a2-mute">{c('card.afterLast')}</span>}
              </div>
            </div>
            <div className="s28-list a2-mt6">
              {q.batches.map((b) => (
                <div key={b.id} className="s28-row" data-testid="bulk-batch">
                  <b>{c('batch.title', { n: b.no })}</b>
                  <span>{c('batch.pcs', { n: b.pieces })}</span>
                  <span className="a2-xs a2-mute grow">{b.plannedOn}{b.tracking ? ` · ${b.tracking}` : ''}</span>
                  <span className="s28-chip">{c(`batch.${b.status}`)}</span>
                  {p.canEdit && q.advanceReceivedAt && b.status !== 'DELIVERED' ? (
                    <>
                      {b.status === 'PACKED' ? <input className="a2-inp" style={{ width: 130 }} placeholder={c('batch.tracking')} aria-label={c('batch.tracking')} value={tracking[b.id] ?? ''} onChange={(e) => setTracking((x) => ({ ...x, [b.id]: e.target.value }))} /> : null}
                      <button type="button" className="a2-btn" disabled={busy} onClick={() => next(b.id)}>{c('batch.next')}</button>
                    </>
                  ) : null}
                </div>
              ))}
            </div>
            <div className="s28-row a2-mt6">
              <button type="button" className="a2-btn" onClick={() => paper(q, false)}>{c('card.quote')}</button>
              <button type="button" className="a2-btn" onClick={() => paper(q, true)}>{c('card.invoice')}</button>
            </div>
          </section>
        ))}
      </div>

      {pinFor ? (
        <section className="a2-card a2-mt12" role="dialog" aria-label={c('card.pin')} data-testid="bulk-pin">
          <p className="a2-sm">{c('card.confirmText', { company: pinFor.quote.company, amount: m(pinFor.which === 'advance' ? pinFor.quote.advanceMinor : pinFor.quote.balanceMinor) })}</p>
          <div className="s28-row a2-mt6">
            <input className="a2-inp" type="password" inputMode="numeric" autoComplete="off" maxLength={12} value={pin} placeholder={c('card.pin')} aria-label={c('card.pin')} onChange={(e) => setPin(e.target.value)} style={{ maxWidth: 160 }} data-testid="bulk-pin-input" />
            <button type="button" className="a2-btn" disabled={busy || !pin.trim()} onClick={confirmMark} data-testid="bulk-pin-ok">{c('card.confirm')}</button>
            <button type="button" className="a2-btn" onClick={() => setPinFor(null)}>{c('new.cancel')}</button>
          </div>
        </section>
      ) : null}

      {p.canSettings ? (
        <section className="a2-card a2-mt12" data-testid="bulk-settings">
          <h2 className="a2-h3">{c('settings.title')}</h2>
          <label className="s28-row a2-mt6"><input type="checkbox" checked={sEnabled} onChange={(e) => setSEnabled(e.target.checked)} data-testid="bulk-on" /> {c('settings.enabled')}</label>
          <div className="s28-row a2-mt6">
            <label>{c('settings.advance')}<input className="a2-inp" inputMode="numeric" value={sAdv} style={{ width: 90 }} onChange={(e) => setSAdv(e.target.value)} /></label>
            <label>{c('settings.valid')}<input className="a2-inp" inputMode="numeric" value={sValid} style={{ width: 90 }} onChange={(e) => setSValid(e.target.value)} /></label>
            <label>{c('settings.maxBatches')}<input className="a2-inp" inputMode="numeric" value={sMax} style={{ width: 90 }} onChange={(e) => setSMax(e.target.value)} /></label>
            <label>{c('settings.gap')}<input className="a2-inp" inputMode="numeric" value={sGap} style={{ width: 90 }} onChange={(e) => setSGap(e.target.value)} /></label>
            <label>{c('settings.first')}<input className="a2-inp" inputMode="numeric" value={sFirst} style={{ width: 90 }} onChange={(e) => setSFirst(e.target.value)} /></label>
          </div>
          <div className="s28-row a2-mt12">
            <input className="a2-inp" type="password" inputMode="numeric" autoComplete="off" maxLength={12} value={sPin} placeholder={c('settings.pin')} aria-label={c('settings.pin')} onChange={(e) => setSPin(e.target.value)} style={{ maxWidth: 160 }} />
            <button type="button" className="a2-btn" disabled={busy || !sPin.trim()} onClick={saveSettings} data-testid="bulk-settings-save">{c('settings.save')}</button>
          </div>
        </section>
      ) : null}
      {said ? <p className={`a2-sm a2-mt6 ${said.bad ? 's28-bad' : 'a2-mute'}`} role={said.bad ? 'alert' : 'status'}>{said.text}</p> : null}
    </>
  );
}
