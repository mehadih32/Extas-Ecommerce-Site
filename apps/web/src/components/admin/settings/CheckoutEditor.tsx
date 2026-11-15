'use client';
// PR 748 + 749 — Settings › Checkout: the cards (Payments; PR 749 adds Delivery details). Wallets and card types are dragged
// into the order the customer sees them (mouse, touch, or the arrow keys and Move up / Move down), a box shows or hides one;
// Cash on Delivery is a choice only an owner can change; the numbers customers send money to and the bank accounts are
// rows added and taken off. Each card is saved whole with its version to /api/admin/settings/checkout (STALE: read again).
// Words come from the page (messages/admin-checkout.<lang>.json), never from here.
import { useId } from 'react';
import { Frame, List, Row, Show, nudgeIn, patch, place } from '../website/BrandMenusEditor';
import { useDragging } from '../website/Sortable';
import { useApiCard, type ApiScreen } from '../website/useApiCard';
import type { PaymentsValue, Tick, WalletKind } from '@/lib/admin-checkout/service';

const API = '/api/admin/settings/checkout';
const KINDS: WalletKind[] = ['merchant', 'personal', 'agent'];

export interface CheckoutProps {
  payments: ApiScreen<PaymentsValue>;
  /** The wallet providers and card types the checkout can list, in their shipped order. */
  wallets: readonly string[];
  texts: Record<string, string>;
  canEdit: boolean;
  /** Only an owner changes Cash on Delivery. */
  owner: boolean;
}

type X = (k: string) => string;
const nextId = (prefix: string, rows: { id: string }[]) => `${prefix}${rows.reduce((m, r) => Math.max(m, Number(r.id.slice(prefix.length)) || 0), 0) + 1}`;

type Drag = ReturnType<typeof useDragging>;
interface TickListProps {
  kind: string;
  label: string;
  ticks: Tick[];
  word: (id: string) => string;
  off: boolean;
  x: X;
  drag: Drag;
  onChange: (next: Tick[]) => void;
  testId: string;
}

function TickList(props: TickListProps) {
  const { x, ticks } = props;
  return (
    <List kind={props.kind} list={props.kind} drag={props.drag} empty="" label={props.label} isEmpty={false} testId={props.testId}>
      {ticks.map((t, i) => (
        <Row key={t.id} kind={props.kind} list={props.kind} id={t.id} index={i} count={ticks.length} drag={props.drag} nudge={(d) => props.onChange(nudgeIn(ticks, t.id, d))} disabled={props.off} x={x} name={props.word(t.id)} testId={`${props.testId}-${t.id}`}>
          <span className="bm-name">{props.word(t.id)}</span>
          <Show on={t.on} label={x('show')} disabled={props.off} onChange={(on) => props.onChange(patch(ticks, t.id, { on }))} testId={`${props.testId}-${t.id}-on`} />
        </Row>
      ))}
    </List>
  );
}

function PaymentsCard(props: CheckoutProps & { x: X }) {
  const { x } = props;
  const id = useId();
  const check = (v: PaymentsValue) => {
    if ((v.mobile.on && !v.mobile.list.some((t) => t.on)) || (v.card.on && !v.card.list.some((t) => t.on))) return x('payments.needOne');
    if (v.wallets.some((w) => !w.number.trim()) || v.banks.some((b) => !b.bankName.trim() || !b.accountName.trim() || !b.accountNumber.trim())) return x('payments.fillRows');
    return null;
  };
  const card = useApiCard(API, props.payments, x, props.canEdit, check);
  const v = card.draft;
  const set = (change: Partial<PaymentsValue>) => card.edit({ ...v, ...change });
  const drag = useDragging({
    disabled: card.off,
    onDrop: (f, t) => {
      if (f.kind === 'mobile') set({ mobile: { ...v.mobile, list: place(v.mobile.list, f.id, t.before) } });
      else if (f.kind === 'card') set({ card: { ...v.card, list: place(v.card.list, f.id, t.before) } });
      else if (f.kind === 'wallets') set({ wallets: place(v.wallets, f.id, t.before) });
      else if (f.kind === 'banks') set({ banks: place(v.banks, f.id, t.before) });
    },
    onNudge: (f, d) => {
      if (f.kind === 'mobile') set({ mobile: { ...v.mobile, list: nudgeIn(v.mobile.list, f.id, d) } });
      else if (f.kind === 'card') set({ card: { ...v.card, list: nudgeIn(v.card.list, f.id, d) } });
      else if (f.kind === 'wallets') set({ wallets: nudgeIn(v.wallets, f.id, d) });
      else if (f.kind === 'banks') set({ banks: nudgeIn(v.banks, f.id, d) });
    },
  });
  const codOff = card.off || !props.owner;
  return (
    <Frame id={id} title={x('payments.h')} sub={x('payments.d')} testId="ck-payments" canEdit={props.canEdit} readOnly={x('readOnly')} card={card} x={x}>
      <div className="bm-stack a2-mt12">
        <h3 className="a2-h4">{x('payments.mobile')}</h3>
        <Show on={v.mobile.on} label={x('payments.mobileOn')} disabled={card.off} onChange={(on) => set({ mobile: { ...v.mobile, on } })} testId="ck-mobile-on" />
        <TickList kind="mobile" label={x('payments.mobile')} ticks={v.mobile.list} word={(k) => x(`wallet.${k}`)} off={card.off} x={x} drag={drag} onChange={(list) => set({ mobile: { ...v.mobile, list } })} testId="ck-mobile" />

        <h3 className="a2-h4 a2-mt12">{x('payments.card')}</h3>
        <Show on={v.card.on} label={x('payments.cardOn')} disabled={card.off} onChange={(on) => set({ card: { ...v.card, on } })} testId="ck-card-on" />
        <TickList kind="card" label={x('payments.card')} ticks={v.card.list} word={(k) => x(`cardType.${k}`)} off={card.off} x={x} drag={drag} onChange={(list) => set({ card: { ...v.card, list } })} testId="ck-card" />

        <h3 className="a2-h4 a2-mt12">{x('payments.online')}</h3>
        <Show on={v.online} label={x('payments.onlineOn')} disabled={card.off} onChange={(online) => set({ online })} testId="ck-online-on" />

        <h3 className="a2-h4 a2-mt12">{x('payments.cod')}</h3>
        <p className="a2-xs a2-mute">{x(props.owner ? 'payments.codHelp' : 'payments.codOwnerOnly')}</p>
        <div className="a2-fld">
          <label className="a2-lbl" htmlFor={`${id}-cod`}>
            {x('payments.codLabel')}
          </label>
          <select id={`${id}-cod`} className="a2-sel" value={v.cod} disabled={codOff} onChange={(e) => set({ cod: e.target.value as PaymentsValue['cod'] })} data-testid="ck-cod">
            {props.payments.value.cod === 'unset' ? <option value="unset">{x('payments.codUnset')}</option> : null}
            <option value="on">{x('payments.codOn')}</option>
            <option value="off">{x('payments.codOff')}</option>
          </select>
        </div>

        <h3 className="a2-h4 a2-mt12">{x('payments.wallets')}</h3>
        <p className="a2-xs a2-mute">{x('payments.walletsHelp')}</p>
        <List kind="wallets" list="wallets" drag={drag} empty={x('payments.walletsEmpty')} label={x('payments.wallets')} isEmpty={!v.wallets.length} testId="ck-wallets">
          {v.wallets.map((w, i) => (
            <Row key={w.id} kind="wallets" list="wallets" id={w.id} index={i} count={v.wallets.length} drag={drag} nudge={(d) => set({ wallets: nudgeIn(v.wallets, w.id, d) })} disabled={card.off} x={x} name={w.number || w.id} testId={`ck-wallet-${w.id}`}
              actions={
                <button type="button" className="a2-btn bm-btn" disabled={card.off} onClick={() => set({ wallets: v.wallets.filter((r) => r.id !== w.id) })} data-testid={`ck-wallet-${w.id}-remove`}>
                  {x('remove')}
                </button>
              }
            >
              <div className="a2-fld">
                <label className="a2-lbl" htmlFor={`${id}-wp-${w.id}`}>
                  {x('payments.provider')}
                </label>
                <select id={`${id}-wp-${w.id}`} className="a2-sel" value={w.provider} disabled={card.off} onChange={(e) => set({ wallets: patch(v.wallets, w.id, { provider: e.target.value }) })} data-testid={`ck-wallet-${w.id}-provider`}>
                  {[...new Set([...props.wallets, w.provider])].map((p) => (
                    <option key={p} value={p}>
                      {x(`wallet.${p}`) !== `wallet.${p}` ? x(`wallet.${p}`) : p}
                    </option>
                  ))}
                </select>
              </div>
              <div className="a2-fld">
                <label className="a2-lbl" htmlFor={`${id}-wn-${w.id}`}>
                  {x('payments.number')}
                </label>
                <input id={`${id}-wn-${w.id}`} className="a2-inp" type="tel" inputMode="tel" maxLength={20} placeholder="01XXXXXXXXX" value={w.number} disabled={card.off} onChange={(e) => set({ wallets: patch(v.wallets, w.id, { number: e.target.value }) })} data-testid={`ck-wallet-${w.id}-number`} />
              </div>
              <div className="a2-fld">
                <label className="a2-lbl" htmlFor={`${id}-wk-${w.id}`}>
                  {x('payments.kind')}
                </label>
                <select id={`${id}-wk-${w.id}`} className="a2-sel" value={w.kind} disabled={card.off} onChange={(e) => set({ wallets: patch(v.wallets, w.id, { kind: e.target.value as WalletKind }) })} data-testid={`ck-wallet-${w.id}-kind`}>
                  {KINDS.map((k) => (
                    <option key={k} value={k}>
                      {x(`payments.kinds.${k}`)}
                    </option>
                  ))}
                </select>
              </div>
            </Row>
          ))}
        </List>
        {v.wallets.length < 10 && props.canEdit ? (
          <span>
            <button type="button" className="a2-btn bm-btn" disabled={card.off} onClick={() => set({ wallets: [...v.wallets, { id: nextId('w', v.wallets), provider: props.wallets[0] ?? 'bkash', number: '', kind: 'merchant' }] })} data-testid="ck-wallet-add">
              {x('payments.walletAdd')}
            </button>
          </span>
        ) : null}

        <h3 className="a2-h4 a2-mt12">{x('payments.banks')}</h3>
        <p className="a2-xs a2-mute">{x('payments.banksHelp')}</p>
        <List kind="banks" list="banks" drag={drag} empty={x('payments.banksEmpty')} label={x('payments.banks')} isEmpty={!v.banks.length} testId="ck-banks">
          {v.banks.map((b, i) => (
            <Row key={b.id} kind="banks" list="banks" id={b.id} index={i} count={v.banks.length} drag={drag} nudge={(d) => set({ banks: nudgeIn(v.banks, b.id, d) })} disabled={card.off} x={x} name={b.bankName || b.id} testId={`ck-bank-${b.id}`}
              actions={
                <button type="button" className="a2-btn bm-btn" disabled={card.off} onClick={() => set({ banks: v.banks.filter((r) => r.id !== b.id) })} data-testid={`ck-bank-${b.id}-remove`}>
                  {x('remove')}
                </button>
              }
            >
              {(['bankName', 'accountName', 'accountNumber', 'branch', 'routingNumber'] as const).map((k) => (
                <div className="a2-fld" key={k}>
                  <label className="a2-lbl" htmlFor={`${id}-b-${b.id}-${k}`}>
                    {x(`payments.bank.${k}`)}
                  </label>
                  <input id={`${id}-b-${b.id}-${k}`} className="a2-inp" maxLength={k === 'routingNumber' ? 20 : k === 'accountNumber' ? 40 : 120} value={b[k]} disabled={card.off} onChange={(e) => set({ banks: patch(v.banks, b.id, { [k]: e.target.value }) })} data-testid={`ck-bank-${b.id}-${k}`} />
                </div>
              ))}
            </Row>
          ))}
        </List>
        {v.banks.length < 10 && props.canEdit ? (
          <span>
            <button type="button" className="a2-btn bm-btn" disabled={card.off} onClick={() => set({ banks: [...v.banks, { id: nextId('b', v.banks), bankName: '', accountName: '', accountNumber: '', branch: '', routingNumber: '' }] })} data-testid="ck-bank-add">
              {x('payments.bankAdd')}
            </button>
          </span>
        ) : null}
      </div>
    </Frame>
  );
}

export function CheckoutEditor(props: CheckoutProps) {
  const x: X = (k) => props.texts[k] ?? k;
  return (
    <>
      <PaymentsCard {...props} x={x} />
    </>
  );
}
