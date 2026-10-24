'use client';
// Follow-up 260 (PR 143) — "Change address, phone or size" on the order page (demo 60-account.js ord_editCard and
// ord_editHTML, V12.2): while the owner lets customers edit (`orders.edit.customer`, off by default) and the order is
// still open to it, the card says until when and how many edits are left, and "Edit order (n left)" opens the form in
// place (his delivery address, his mobile number, and a size row per piece: his own size and the other sizes of the
// same piece in the same colour at the same price). Closed, the card says why (we started on it, the time passed, all
// edits used, the courier has it, he asked to cancel). The save goes through POST /api/account/edit — the one order
// service, which checks the window again under the order's lock — and the page then reads the order again.
//
// The phone box uses the one Bangladeshi number cleaner (lib/phone-bd.ts), so a number typed any real way is taken.
// Every word comes from the shop dictionary (`account.edit.*`), so the owner can change all of it.
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { CustomerEditClosed } from '@extas/orders/pure';
import { phoneNormalizeBD } from '@/lib/phone-bd';
import { Icon } from '../Icon';
import { showToast } from '../toast';

export type EditWords = Record<string, string>;

export interface EditLine {
  lineId: string;
  name: string;
  /** The piece's colour as the page names it. */
  detail: string;
  choices: { variantId: string; size: string | null; current: boolean }[];
}

export interface OrderEditCardProps {
  words: EditWords;
  number: string;
  open: boolean;
  closed: CustomerEditClosed | null;
  /** Already in the page's words and digits: "You can edit this order 2 more times…" and the button. */
  leftText: string;
  buttonText: string;
  /** The closed reason, already in words (null while open). */
  closedText: string | null;
  openText: string;
  /** The toast after a save, by the edits left then (index 0: none left), in the page's words and digits. */
  savedTexts: string[];
  can: { phone: boolean; address: boolean; size: boolean };
  phone: string;
  address: string;
  lines: EditLine[];
}

const MIN_ADDRESS = 10;

export function OrderEditCard(p: OrderEditCardProps) {
  const w = (k: string) => p.words[k] ?? k;
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [phone, setPhone] = useState(p.phone);
  const [address, setAddress] = useState(p.address);
  const [sizes, setSizes] = useState<Record<string, string>>(() => Object.fromEntries(p.lines.map((l) => [l.lineId, l.choices.find((x) => x.current)?.variantId ?? ''])));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const sizeLines = p.can.size ? p.lines.filter((l) => l.choices.length) : [];

  return (
    <section className="card p20 ord-edit" aria-labelledby="oe-h" data-testid="order-edit" data-open={p.open ? '1' : '0'} data-closed={p.closed ?? ''}>
      <div className="row between wrap" style={{ gap: 12 }}>
        <div className="ord-edit-t">
          <h2 className="h3" id="oe-h">
            {w('title')}
          </h2>
          <div className="small text2" style={{ marginTop: 3 }}>
            {p.open ? p.openText : p.closedText}
          </div>
        </div>
        {p.open && !editing ? (
          <button type="button" className="btn btn-secondary ord-edit-b" data-testid="order-edit-open" onClick={() => setEditing(true)}>
            <Icon name="edit" size={16} />
            {p.buttonText}
          </button>
        ) : null}
      </div>
      {p.open && editing ? (
        <form
          className="stack s12 mt16"
          noValidate
          data-testid="order-edit-form"
          onSubmit={async (e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const body: Record<string, unknown> = { number: p.number };
            if (p.can.address) {
              const a = address.trim();
              if (a.length < MIN_ADDRESS) return setErr(w('err.address'));
              if (a !== p.address.trim()) body.address = a;
            }
            // the number already on the order is never re-checked: only a newly typed one has to be a real mobile number
            if (p.can.phone && phone.trim() !== p.phone.trim()) {
              const ph = phoneNormalizeBD(phone);
              if (!ph.ok) return setErr(w(ph.reason === 'empty' ? 'err.phoneEmpty' : 'err.phoneBad'));
              setPhone(ph.nice);
              if (ph.digits !== phoneNormalizeBD(p.phone).digits) body.phone = ph.digits;
            }
            const lines = sizeLines.flatMap((l) => {
              const was = l.choices.find((x) => x.current)?.variantId;
              const now = sizes[l.lineId];
              return now && now !== was ? [{ lineId: l.lineId, variantId: now }] : [];
            });
            if (lines.length) body.lines = lines;
            if (Object.keys(body).length === 1) return setErr(w('err.nothing'));
            setErr(null);
            setBusy(true);
            let status = 0;
            let payload: Record<string, unknown> = {};
            try {
              const res = await fetch('/api/account/edit', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
              status = res.status;
              payload = (await res.json().catch(() => ({}))) as Record<string, unknown>;
            } catch {
              status = 0;
            }
            setBusy(false);
            if (payload.ok === true) {
              const left = Number(payload.editsLeft ?? 0);
              showToast(form, p.savedTexts[left] ?? p.savedTexts[0] ?? '');
              setEditing(false);
              return router.refresh();
            }
            const code = String(payload.error ?? '');
            if (code === 'EDIT_CLOSED') {
              setErr(w('err.closed'));
              return router.refresh();
            }
            if (code === 'BAD_PHONE') return setErr(w('err.phoneBad'));
            if (code === 'NOTHING_CHANGED') return setErr(w('err.nothing'));
            if (code === 'OUT_OF_STOCK') return setErr(w('err.stock'));
            if (code === 'PRICE_DIFFERS' || code === 'NOT_SAME_PIECE') return setErr(w('err.price'));
            if (code === 'INVALID_INPUT' && Array.isArray(payload.details) && payload.details.includes('address')) return setErr(w('err.address'));
            setErr(w('err.offline'));
          }}
        >
          <p className="small text2" style={{ margin: 0 }}>
            {p.leftText}
          </p>
          {p.can.address ? (
            <div>
              <label className="label" htmlFor="oe-addr">
                {w('address')}
              </label>
              <textarea id="oe-addr" className="input" rows={2} maxLength={500} value={address} onChange={(e) => setAddress(e.target.value)} data-testid="order-edit-address" />
            </div>
          ) : null}
          {p.can.phone ? (
            <div>
              <label className="label" htmlFor="oe-phone">
                {w('phone')}
              </label>
              <input id="oe-phone" className="input" type="tel" inputMode="tel" autoComplete="tel" maxLength={40} value={phone} onChange={(e) => setPhone(e.target.value)} data-testid="order-edit-phone" />
            </div>
          ) : null}
          {sizeLines.length ? (
            <div>
              <div className="label">{w('sizes')}</div>
              {sizeLines.map((l) => (
                <div className="ord-eline" key={l.lineId}>
                  <div className="small bold">{l.name}</div>
                  {l.detail ? <div className="xs text2">{l.detail}</div> : null}
                  <div className="row wrap mt8" style={{ gap: 6 }} role="group" aria-label={w('sizeFor').replace('{name}', l.name)}>
                    {l.choices.length < 2 ? (
                      <span className="small text2">{l.choices[0]?.size ?? w('oneSize')}</span>
                    ) : (
                      l.choices.map((x) => {
                        const on = sizes[l.lineId] === x.variantId;
                        return (
                          <button
                            key={x.variantId}
                            type="button"
                            className={`size-pill${on ? ' on' : ''}`}
                            aria-pressed={on}
                            data-testid="order-edit-size"
                            onClick={() => setSizes((s) => ({ ...s, [l.lineId]: x.variantId }))}
                          >
                            {x.size ?? w('oneSize')}
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
          <div role="alert">{err ? <div className="acc-err">{err}</div> : null}</div>
          <div className="row wrap" style={{ gap: 10 }}>
            <button type="submit" className="btn btn-primary" disabled={busy} data-testid="order-edit-save">
              {busy ? w('saving') : w('save')}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setEditing(false)} data-testid="order-edit-close">
              {w('close')}
            </button>
          </div>
        </form>
      ) : null}
    </section>
  );
}
