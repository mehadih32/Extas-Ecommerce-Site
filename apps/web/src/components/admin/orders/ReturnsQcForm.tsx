'use client';
// S08 · PR 187 — ORD-05a Receive & QC in the browser (demo V12.2 97s-adm2-orders2.js, #/admin/orders/returns/qc step 2):
// for each piece of the parcel, the SKU scanned from the piece (a scanner types it; typing works too), Sellable or Not
// sellable, the reason (and a photo when the setting asks) for a piece that is not sellable, and — when the SKU scanned
// is not the one expected — "record what really came back" with a note (SIM-F-022: what is scanned is what is
// restocked). One save records the whole parcel with the parcel's version; the page is then read again from the server.
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import { call, type Answer } from '@/components/admin/api';
import { uploadReturnPhoto } from './return-photo';

export interface QcPiece {
  id: string;
  expectedSku: string | null;
  text: string;
  quantity: number;
}

export interface QcTexts {
  expectedSku: string;
  scanned: string;
  sellable: string;
  unsellable: string;
  reason: string;
  choose: string;
  photo: string;
  photoAdd: string;
  photoDone: string;
  photoNeeded: string;
  otherSku: string;
  otherNote: string;
  note: string;
  save: string;
  saveHint: string;
  receive: string;
  errors: Record<string, string>;
}

type Line = { sku: string; disposition: '' | 'SELLABLE' | 'UNSELLABLE'; reason: string; photo: string | null; otherSku: boolean; note: string };

const differs = (expected: string | null, sku: string) => !!expected && !!sku.trim() && expected.trim().toLowerCase() !== sku.trim().toLowerCase();

const errorOf = (a: Answer, t: QcTexts) => t.errors[a.data.error ?? ''] ?? t.errors['server-error'] ?? '';


export function ReturnsQcForm({ url, receiveUrl, version, pieces, reasons, photoForLoss, acceptOtherSku, canReceive, texts }: { url: string; receiveUrl: string | null; version: number; pieces: QcPiece[]; reasons: { key: string; label: string }[]; photoForLoss: boolean; acceptOtherSku: boolean; canReceive: boolean; texts: QcTexts }) {
  const router = useRouter();
  const base = useId();
  const [lines, setLines] = useState<Record<string, Line>>(() => Object.fromEntries(pieces.map((p) => [p.id, { sku: '', disposition: '', reason: '', photo: null, otherSku: false, note: '' }])));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const set = (id: string, patch: Partial<Line>) => setLines((all) => ({ ...all, [id]: { ...all[id]!, ...patch } }));
  const ready = pieces.every((p) => {
    const l = lines[p.id]!;
    if (!l.sku.trim() || !l.disposition) return false;
    if (l.disposition === 'UNSELLABLE' && (!l.reason || (photoForLoss && !l.photo))) return false;
    if (differs(p.expectedSku, l.sku) && (!acceptOtherSku || !l.otherSku || !l.note.trim())) return false;
    return true;
  });
  const save = async () => {
    setBusy(true);
    setErr('');
    const items = pieces.map((p) => {
      const l = lines[p.id]!;
      return {
        returnItemId: p.id,
        scannedSku: l.sku.trim(),
        disposition: l.disposition,
        ...(l.disposition === 'UNSELLABLE' ? { lossReason: l.reason } : {}),
        ...(l.photo ? { photoAssetIds: [l.photo] } : {}),
        ...(l.note.trim() ? { note: l.note.trim() } : {}),
        ...(l.otherSku ? { otherSku: true } : {}),
      };
    });
    const a = await call('POST', url, { version, items });
    setBusy(false);
    if (!a.data.ok) {
      setErr(errorOf(a, texts));
      if (a.data.error === 'STALE' || a.data.error === 'RETURN_STATE') router.refresh();
      return;
    }
    router.refresh();
  };
  const receive = async () => {
    if (!receiveUrl) return;
    setBusy(true);
    const a = await call('POST', receiveUrl, { version });
    setBusy(false);
    if (!a.data.ok) return setErr(errorOf(a, texts));
    router.refresh();
  };
  return (
    <div className="a2-stack" data-testid="qc-form">
      {pieces.map((p, n) => {
        const l = lines[p.id]!;
        const id = `${base}-${n}`;
        const other = differs(p.expectedSku, l.sku);
        return (
          <div key={p.id} className="a2-card tight rt-piece" data-testid="qc-piece">
            <div className="a2-h4">{`${p.text} × ${p.quantity}`}</div>
            {p.expectedSku ? <div className="a2-xs a2-mute a2-mono">{texts.expectedSku.replace('{sku}', p.expectedSku)}</div> : null}
            <div className="a2-mt12">
              <label className="a2-lbl" htmlFor={`${id}-sku`}>
                {texts.scanned}
              </label>
              <input id={`${id}-sku`} className="a2-inp a2-mono" autoComplete="off" autoCapitalize="characters" spellCheck={false} maxLength={64} value={l.sku} onChange={(e) => set(p.id, { sku: e.target.value })} data-testid="qc-sku" />
            </div>
            {other && acceptOtherSku ? (
              <div className="a2-mt12">
                <label className="rt-check">
                  <input type="checkbox" checked={l.otherSku} onChange={(e) => set(p.id, { otherSku: e.target.checked })} />
                  <span>{texts.otherSku}</span>
                </label>
              </div>
            ) : null}
            <div className="a2-seg rt-seg a2-mt12" role="group">
              {(['SELLABLE', 'UNSELLABLE'] as const).map((v) => (
                <button key={v} type="button" className={l.disposition === v ? 'on' : ''} aria-pressed={l.disposition === v} onClick={() => set(p.id, { disposition: v })} data-testid={`qc-${v.toLowerCase()}`}>
                  {v === 'SELLABLE' ? texts.sellable : texts.unsellable}
                </button>
              ))}
            </div>
            {l.disposition === 'UNSELLABLE' ? (
              <div className="a2-mt12">
                <label className="a2-lbl" htmlFor={`${id}-reason`}>
                  {texts.reason}
                </label>
                <select id={`${id}-reason`} className="a2-sel" value={l.reason} onChange={(e) => set(p.id, { reason: e.target.value })}>
                  <option value="">{texts.choose}</option>
                  {reasons.map((r) => (
                    <option key={r.key} value={r.key}>
                      {r.label}
                    </option>
                  ))}
                </select>
                <div className="a2-mt12">
                  <label className="a2-lbl" htmlFor={`${id}-photo`}>
                    {texts.photo}
                  </label>
                  <input
                    id={`${id}-photo`}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="a2-xs"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const got = await uploadReturnPhoto(file);
                      set(p.id, { photo: got });
                      if (!got) setErr(texts.errors['server-error'] ?? '');
                    }}
                  />
                  {l.photo ? <div className="a2-xs a2-mute">{texts.photoDone}</div> : photoForLoss ? <div className="a2-xs rt-bad">{texts.photoNeeded}</div> : null}
                </div>
              </div>
            ) : null}
            <div className="a2-mt12">
              <label className="a2-lbl" htmlFor={`${id}-note`}>
                {other ? texts.otherNote : texts.note}
              </label>
              <input id={`${id}-note`} className="a2-inp" maxLength={500} value={l.note} onChange={(e) => set(p.id, { note: e.target.value })} />
            </div>
          </div>
        );
      })}
      {err ? (
        <p className="a2-sm rt-bad" role="alert">
          {err}
        </p>
      ) : null}
      <div className="a2-gap8">
        <button type="button" className="a2-btn pri lg" disabled={busy || !ready} onClick={save} data-testid="qc-save">
          {texts.save}
        </button>
        {receiveUrl && canReceive ? (
          <button type="button" className="a2-btn" disabled={busy} onClick={receive} data-testid="qc-receive">
            {texts.receive}
          </button>
        ) : null}
        {receiveUrl ? <span className="a2-xs a2-mute">{texts.saveHint}</span> : null}
      </div>
    </div>
  );
}
