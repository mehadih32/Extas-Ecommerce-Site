'use client';
// PR 815 (prototype v5 Settings › Data & privacy) — the cards the prototype puts beside the customers' requests: "Export your data"
// (orders, customers with the owner's PIN, products and stock), "How long things are kept", "Import old customers", the “My own data”
// chips and the Start fresh card. Calls POST /api/admin/privacy/board (lib/admin-privacy/board.ts); orders and products export through
// their own routes with their own permissions.
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { call } from '../api';
import { showToast } from '../lumen/Toast';
import { buildZip } from '@/lib/zip-store';
import { ConfirmDialog } from './ConfirmDialog';

const BOARD = '/api/admin/privacy/board';

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
const fileName = (res: Response, fallback: string) => /filename="([^"]+)"/.exec(res.headers.get('content-disposition') ?? '')?.[1] ?? fallback;

export interface PrivacyBoardProps {
  w: Record<string, string>;
  chips: string[];
  keep: { media: number; chat: number };
  /** PR 846: the days the shop has to answer a customer's privacy request (setting `privacy.answerDays`). */
  answerDays: number;
  answerMax: number;
  mediaOptions: readonly number[];
  chatOptions: readonly number[];
  canEdit: boolean;
  isOwner: boolean;
  importHref: string;
  freshHref: string | null;
  /** Date text for the file names (today, in the shop's time zone). */
  today: string;
}

const optionLabel = (w: Record<string, string>, months: number) => (months === 6 ? w['prv.board.keep.m6'] : months === 12 ? w['prv.board.keep.y1'] : months === 24 ? w['prv.board.keep.y2'] : w['prv.board.keep.y5']);

export function PrivacyBoard(p: PrivacyBoardProps) {
  const router = useRouter();
  const w = p.w;
  const x = (k: string) => w[`prv.board.${k}`]!;
  const err = (code: unknown) => w[`prv.board.err.${String(code)}`] ?? x('err.other');
  const [media, setMedia] = useState(p.keep.media);
  const [chat, setChat] = useState(p.keep.chat);
  const [busy, setBusy] = useState<string | null>(null);
  const [pin, setPin] = useState<'customers' | 'all' | null>(null);
  const [answer, setAnswer] = useState(String(p.answerDays));
  const answerN = Number(answer);
  const answerOk = Number.isInteger(answerN) && answerN >= 1 && answerN <= p.answerMax;
  const dirty = media !== p.keep.media || chat !== p.keep.chat || (answerOk && answerN !== p.answerDays);

  async function saveKeep() {
    setBusy('keep');
    const a = await call('POST', BOARD, { action: 'keep', media, chat, answerDays: answerN });
    setBusy(null);
    if (a.data.ok) {
      showToast({ text: x('keep.saved'), tone: 'ok' });
      router.refresh();
    } else showToast({ text: a.status === 0 ? err('network') : err(a.data.error), tone: 'bad' });
  }
  async function simple(kind: 'orders' | 'products') {
    setBusy(kind);
    try {
      const res = kind === 'orders' ? await fetch('/api/admin/orders/export', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: '{}' }) : await fetch('/api/admin/catalogue/csv/export', { credentials: 'same-origin' });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        showToast({ text: res.status === 403 ? err('FORBIDDEN') : err(j.error), tone: 'bad' });
      } else {
        download(await res.blob(), fileName(res, `${kind}-${p.today}.csv`));
        showToast({ text: x('export.done'), tone: 'ok' });
      }
    } catch {
      showToast({ text: err('network'), tone: 'bad' });
    }
    setBusy(null);
  }
  /** PR 846: "Everything (one ZIP)" — the three exports the page already makes, in one file. The PIN is for the customers file. */
  async function everything(pinText: string): Promise<string | null> {
    try {
      const cust = await fetch(BOARD, { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'exportCustomers', pin: pinText }) });
      if (!cust.ok) {
        const j = (await cust.json().catch(() => ({}))) as { error?: string };
        return err(j.error);
      }
      const files = [{ name: fileName(cust, `customers-${p.today}.csv`), data: await cust.text() }];
      const orders = await fetch('/api/admin/orders/export', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: '{}' });
      if (orders.ok) files.push({ name: fileName(orders, `orders-${p.today}.csv`), data: await orders.text() });
      const products = await fetch('/api/admin/catalogue/csv/export', { credentials: 'same-origin' });
      if (products.ok) files.push({ name: fileName(products, `products-${p.today}.csv`), data: await products.text() });
      download(new Blob([buildZip(files) as BlobPart], { type: 'application/zip' }), `extas-data-${p.today}.zip`);
      showToast({ text: files.length === 3 ? x('export.done') : x('export.partial'), tone: files.length === 3 ? 'ok' : 'bad' });
      return null;
    } catch {
      return err('network');
    }
  }
  async function customers(pinText: string): Promise<string | null> {
    try {
      const res = await fetch(BOARD, { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'exportCustomers', pin: pinText }) });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        return err(j.error);
      }
      download(await res.blob(), fileName(res, `customers-${p.today}.csv`));
      showToast({ text: x('export.done'), tone: 'ok' });
      return null;
    } catch {
      return err('network');
    }
  }
  const sample = () => download(new Blob([`${x('import.sampleBody')}\n`], { type: 'text/csv' }), x('import.sampleFile'));

  return (
    <>
      <div className="s28-grid" data-testid="privacy-board">
        <section className="a2-card" data-testid="privacy-export" aria-labelledby="prv-exp-h">
          <h2 className="a2-h3" id="prv-exp-h">{x('export.h')}</h2>
          <ul className="s28-list">
            {(['orders', 'customers', 'products'] as const).map((k) => (
              <li key={k} className="s28-row between" style={{ alignItems: 'center' }}>
                <span className="s28-grow">{x(`export.${k}`)}</span>
                <button type="button" className="a2-btn sm" disabled={busy !== null || (k === 'customers' && !p.isOwner)} onClick={() => (k === 'customers' ? setPin('customers') : void simple(k))} data-testid={`privacy-export-${k}`}>
                  {x('export.button')}
                </button>
              </li>
            ))}
            <li className="s28-row between" style={{ alignItems: 'center' }}>
              <span className="s28-grow">{x('export.all')}</span>
              <button type="button" className="a2-btn sm" disabled={busy !== null || !p.isOwner} onClick={() => setPin('all')} data-testid="privacy-export-all">
                {x('export.button')}
              </button>
            </li>
          </ul>
        </section>

        <section className="a2-card" data-testid="privacy-keepmonths" aria-labelledby="prv-keep-h">
          <h2 className="a2-h3" id="prv-keep-h">{x('keep.h')}</h2>
          <label className="a2-lbl a2-mt12" htmlFor="pv-m">{x('keep.media')}</label>
          <select id="pv-m" className="a2-sel" value={media} disabled={!p.canEdit} onChange={(e) => setMedia(Number(e.target.value))}>
            {p.mediaOptions.map((m) => <option key={m} value={m}>{optionLabel(w, m)}</option>)}
          </select>
          <label className="a2-lbl a2-mt12" htmlFor="pv-c">{x('keep.chat')}</label>
          <select id="pv-c" className="a2-sel" value={chat} disabled={!p.canEdit} onChange={(e) => setChat(Number(e.target.value))}>
            {p.chatOptions.map((m) => <option key={m} value={m}>{optionLabel(w, m)}</option>)}
          </select>
          <label className="a2-lbl a2-mt12" htmlFor="pv-a">{x('keep.answer')}</label>
          <input id="pv-a" className="a2-inp" type="number" inputMode="numeric" min={1} max={p.answerMax} value={answer} disabled={!p.canEdit} onChange={(e) => setAnswer(e.target.value)} aria-invalid={!answerOk} data-testid="pv-answer" style={{ maxWidth: 120 }} />
          <p className="a2-xs a2-mute a2-mt12">{x('keep.hint')}</p>
          <div className="a2-mt12">
            <button type="button" className="a2-btn sm" disabled={!p.canEdit || !dirty || !answerOk || busy !== null} onClick={() => void saveKeep()} data-testid="pv-save">{x('keep.save')}</button>
          </div>
        </section>

        <section className="a2-card" data-testid="privacy-import" aria-labelledby="prv-imp-h">
          <h2 className="a2-h3" id="prv-imp-h">{x('import.h')}</h2>
          <p className="a2-sm a2-mute">{x('import.text')}</p>
          <div className="s28-row a2-mt12">
            <Link className="a2-btn pri sm" href={p.importHref} data-testid="pv-imp">{x('import.choose')}</Link>
            <button type="button" className="a2-btn sm" onClick={sample} data-testid="pv-tpl">{x('import.sample')}</button>
          </div>
        </section>

        {p.freshHref ? (
          <section className="a2-card" data-testid="privacy-fresh" aria-labelledby="prv-fresh-h">
            <h2 className="a2-h3" id="prv-fresh-h">{x('fresh.h')}</h2>
            <p className="a2-sm a2-mute">{x('fresh.text')}</p>
            <div className="a2-mt12"><Link className="a2-btn sm" href={p.freshHref}>{x('fresh.open')}</Link></div>
          </section>
        ) : null}
      </div>

      <section className="a2-card a2-mt12" data-testid="privacy-own" aria-labelledby="prv-own-h">
        <h2 className="a2-h3" id="prv-own-h">{x('own.h')}</h2>
        <div className="s28-row a2-mt6" style={{ gap: 6 }}>
          {p.chips.map((c) => <span key={c} className="a2-pill line">{c}</span>)}
        </div>
        <p className="a2-xs a2-mute a2-mt12">{x('own.hint')}</p>
      </section>

      {pin ? (
        <ConfirmDialog
          testId="privacy-export-pin"
          tone="pri"
          texts={{ title: x('export.pinTitle'), effects: [x('export.pinText')], reason: null, cancel: w['prv.board.export.cancel'] ?? 'Cancel', ok: x('export.pinOk'), working: '…', close: w['prv.board.export.cancel'] ?? 'Cancel', pin: w['board.dlg.pin'] ?? 'PIN' }}
          onClose={() => setPin(null)}
          onConfirm={async (_r, pinText) => {
            if (!pinText) return err('PIN_REQUIRED');
            const bad = await (pin === 'all' ? everything(pinText) : customers(pinText));
            if (!bad) setPin(null);
            return bad;
          }}
        />
      ) : null}
    </>
  );
}
