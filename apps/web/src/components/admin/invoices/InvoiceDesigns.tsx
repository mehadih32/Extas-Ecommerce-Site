'use client';
// S20 · PR 409 (ORD-04d) — "Invoice design" on Orders › Packing & print › Invoices: the seven designs as buttons; the
// chosen one shows a live preview (the latest issued invoice drawn in that design, GET /api/admin/invoices/preview, only
// with `orders.invoice`, and only once an invoice was issued: no request that can only fail) and "Use this design" saves it (the `documents.invoice.design` card, with its version; a save
// by someone else in between is STALE). Words from the page's messages (`inv.design.*`).
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { t, type Dict } from '@/lib/i18n';

export function InvoiceDesigns({ dict, designs, current, version, canEdit, canPreview, hasInvoice }: { dict: Dict; designs: readonly string[]; current: string; version: string; canEdit: boolean; canPreview: boolean; hasInvoice: boolean }) {
  const router = useRouter();
  const [pick, setPick] = useState(current);
  const [saved, setSaved] = useState({ design: current, version });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [broken, setBroken] = useState<string | null>(null);
  const w = (k: string, v?: Record<string, string | number>) => t(dict, `inv.design.${k}`, v);
  const use = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch('/api/admin/invoices/settings', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ key: 'documents.invoice.design', value: { design: pick }, version: saved.version }) });
      const j = (await r.json()) as { ok: boolean; error?: string; cards?: Record<string, { version: string }> };
      if (!r.ok || !j.ok) {
        setMsg({ ok: false, text: w(j.error === 'STALE' ? 'stale' : 'err') });
        return;
      }
      setSaved({ design: pick, version: j.cards?.['documents.invoice.design']?.version ?? saved.version });
      setMsg({ ok: true, text: w('saved', { name: w(`name.${pick}`) }) });
      router.refresh();
    } catch {
      setMsg({ ok: false, text: w('err') });
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="a2-card a2-mt12" aria-label={w('h')} data-testid="invoice-designs">
      <h2 className="a2-h4">{w('h')}</h2>
      <p className="a2-xs a2-mute a2-mt6">{w('d')}</p>
      <div className="inv-designs a2-mt12" role="radiogroup" aria-label={w('h')}>
        {designs.map((x) => (
          <button key={x} type="button" role="radio" aria-checked={pick === x} className={`a2-btn sm ${pick === x ? 'pri' : 'ghost'}`} onClick={() => setPick(x)} data-testid={`invoice-design-${x}`}>
            {w(`name.${x}`)}
            {saved.design === x ? ` · ${w('inUse')}` : ''}
          </button>
        ))}
      </div>
      <p className="a2-xs a2-mt6">{w(`about.${pick}`)}</p>
      {canPreview ? (
        <div className="inv-preview a2-mt12">
          {!hasInvoice || broken === pick ? (
            <p className="a2-xs a2-mute" data-testid="invoice-preview-none">
              {w('noPreview')}
            </p>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element -- a picture the API draws on request, not a static asset
            <img key={pick} src={`/api/admin/invoices/preview?design=${encodeURIComponent(pick)}`} alt={w('previewAlt', { name: w(`name.${pick}`) })} loading="lazy" onError={() => setBroken(pick)} data-testid="invoice-preview" />
          )}
        </div>
      ) : null}
      {canEdit ? (
        <div className="a2-gap8 a2-mt12">
          <button type="button" className="a2-btn pri" onClick={use} disabled={busy || pick === saved.design} data-testid="invoice-design-use">
            {busy ? w('saving') : w('use')}
          </button>
        </div>
      ) : (
        <p className="a2-xs a2-mute a2-mt6">{w('readOnly')}</p>
      )}
      {msg ? (
        <p className="a2-xs a2-mt6" role={msg.ok ? 'status' : 'alert'} style={msg.ok ? undefined : { color: 'var(--bad)' }}>
          {msg.text}
        </p>
      ) : null}
    </section>
  );
}
