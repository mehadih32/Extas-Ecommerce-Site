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
import type { FormValue, GiftValue, PaymentsValue, Tick, WalletKind } from '@/lib/admin-checkout/service';

const API = '/api/admin/settings/checkout';
const KINDS: WalletKind[] = ['merchant', 'personal', 'agent'];

export interface CheckoutProps {
  payments: ApiScreen<PaymentsValue>;
  form: ApiScreen<FormValue>;
  gift: ApiScreen<GiftValue>;
  /** Minor units in one whole unit of the shop's currency (the fixed gift advance is typed in whole units). */
  unit: number;
  /** The wallet providers and card types the checkout can list, in their shipped order. */
  wallets: readonly string[];
  texts: Record<string, string>;
  canEdit: boolean;
  /** Only an owner changes Cash on Delivery and the gift card. */
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

        <h3 className="a2-h4 a2-mt12">{x('payments.show')}</h3>
        <p className="a2-xs a2-mute">{x('payments.showHelp')}</p>
        <Show on={v.showNumbers} label={x('payments.showOn')} disabled={card.off} onChange={(showNumbers) => set({ showNumbers })} testId="ck-show-numbers" />

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

const FORM_LIMITS = { nameMin: [0, 20], addressMin: [4, 60], noteMax: [20, 1000], manyMin: [2, 20] } as const;
type LimitKey = keyof typeof FORM_LIMITS;

function FormCard(props: CheckoutProps & { x: X }) {
  const { x } = props;
  const id = useId();
  const check = (v: FormValue) => ((Object.keys(FORM_LIMITS) as LimitKey[]).some((k) => !Number.isInteger(v[k]) || v[k] < FORM_LIMITS[k][0] || v[k] > FORM_LIMITS[k][1]) ? x('form.range') : null);
  const card = useApiCard(API, props.form, x, props.canEdit, check);
  const v = card.draft;
  const set = (change: Partial<FormValue>) => card.edit({ ...v, ...change });
  const drag = useDragging({
    disabled: card.off,
    onDrop: (f, t) => set({ order: place(v.order, f.id, t.before) }),
    onNudge: (f, d) => set({ order: nudgeIn(v.order, f.id, d) }),
  });
  const num = (k: LimitKey) => (
    <div className="a2-fld" key={k}>
      <label className="a2-lbl" htmlFor={`${id}-${k}`}>
        {x(`form.${k}`)}
      </label>
      <input id={`${id}-${k}`} className="a2-inp" type="number" inputMode="numeric" min={FORM_LIMITS[k][0]} max={FORM_LIMITS[k][1]} value={String(v[k])} disabled={card.off} onChange={(e) => set({ [k]: e.target.value === '' ? 0 : Number(e.target.value) })} data-testid={`ck-form-${k}`} />
      <span className="a2-xs a2-mute">{x(`form.${k}Help`).replace('{min}', String(FORM_LIMITS[k][0])).replace('{max}', String(FORM_LIMITS[k][1]))}</span>
    </div>
  );
  return (
    <Frame id={`${id}-f`} title={x('form.h')} sub={x('form.d')} testId="ck-form" canEdit={props.canEdit} readOnly={x('readOnly')} card={card} x={x}>
      <div className="bm-stack a2-mt12">
        <h3 className="a2-h4">{x('form.order')}</h3>
        <p className="a2-xs a2-mute">{x('form.orderHelp')}</p>
        <List kind="fields" list="fields" drag={drag} empty="" label={x('form.order')} isEmpty={false} testId="ck-fields">
          {v.order.map((f, i) => (
            <Row key={f.id} kind="fields" list="fields" id={f.id} index={i} count={v.order.length} drag={drag} nudge={(d) => set({ order: nudgeIn(v.order, f.id, d) })} disabled={card.off} x={x} name={x(`form.field.${f.id}`)} testId={`ck-field-${f.id}`}>
              <span className="bm-name">{x(`form.field.${f.id}`)}</span>
              <span className="a2-xs a2-mute">{x('form.always')}</span>
            </Row>
          ))}
        </List>

        <h3 className="a2-h4 a2-mt12">{x('form.lengths')}</h3>
        {num('nameMin')}
        {num('addressMin')}

        <h3 className="a2-h4 a2-mt12">{x('form.lines')}</h3>
        <Show on={v.help} label={x('form.help')} disabled={card.off} onChange={(help) => set({ help })} testId="ck-form-help" />
        <Show on={v.tryOn} label={x('form.tryOn')} disabled={card.off} onChange={(tryOn) => set({ tryOn })} testId="ck-form-tryon" />
        <Show on={v.note} label={x('form.note')} disabled={card.off} onChange={(note) => set({ note })} testId="ck-form-note" />
        {num('noteMax')}
        <Show on={v.many} label={x('form.many')} disabled={card.off} onChange={(many) => set({ many })} testId="ck-form-many" />
        {num('manyMin')}

        <h3 className="a2-h4 a2-mt12">{x('form.confirmH')}</h3>
        <div className="a2-fld">
          <label className="a2-lbl" htmlFor={`${id}-confirm`}>
            {x('form.confirm')}
          </label>
          <select id={`${id}-confirm`} className="a2-sel" value={v.confirm} disabled={card.off} onChange={(e) => set({ confirm: e.target.value as FormValue['confirm'] })} data-testid="ck-form-confirm">
            <option value="ask">{x('form.confirmAsk')}</option>
            <option value="disable">{x('form.confirmDisable')}</option>
          </select>
          <span className="a2-xs a2-mute">{x('form.confirmHelp')}</span>
        </div>
      </div>
    </Frame>
  );
}

function GiftCard(props: CheckoutProps & { x: X }) {
  const { x } = props;
  const id = useId();
  const check = (v: GiftValue) => {
    if (!Number.isInteger(v.noteMax) || v.noteMax < 0 || v.noteMax > 1000 || !Number.isInteger(v.maxDays) || v.maxDays < 0 || v.maxDays > 365) return x('gift.range');
    if (v.advanceType === 'fixed' && !(v.amount !== null && v.amount > 0)) return x('gift.needAmount');
    if (v.advanceType === 'percent' && !(v.percent !== null && Number.isInteger(v.percent) && v.percent >= 1 && v.percent <= 100)) return x('gift.needPercent');
    return null;
  };
  // the advance is money: only an owner changes this card
  const card = useApiCard(API, props.gift, x, props.canEdit && props.owner, check);
  const v = card.draft;
  const set = (change: Partial<GiftValue>) => card.edit({ ...v, ...change });
  const numIn = (k: 'noteMax' | 'maxDays') => (
    <div className="a2-fld" key={k}>
      <label className="a2-lbl" htmlFor={`${id}-${k}`}>
        {x(`gift.${k}`)}
      </label>
      <input id={`${id}-${k}`} className="a2-inp" type="number" inputMode="numeric" min={0} max={k === 'noteMax' ? 1000 : 365} value={String(v[k])} disabled={card.off} onChange={(e) => set({ [k]: e.target.value === '' ? 0 : Number(e.target.value) })} data-testid={`ck-gift-${k}`} />
      <span className="a2-xs a2-mute">{x(`gift.${k}Help`)}</span>
    </div>
  );
  return (
    <Frame id={`${id}-g`} title={x('gift.h')} sub={x('gift.d')} testId="ck-gift" canEdit={props.canEdit && props.owner} readOnly={x(props.canEdit ? 'gift.ownerOnly' : 'readOnly')} card={card} x={x}>
      <div className="bm-stack a2-mt12">
        <Show on={v.enabled} label={x('gift.on')} disabled={card.off} onChange={(enabled) => set({ enabled })} testId="ck-gift-on" />
        {numIn('noteMax')}
        {numIn('maxDays')}
        <Show on={v.hidePrices} label={x('gift.hidePrices')} disabled={card.off} onChange={(hidePrices) => set({ hidePrices })} testId="ck-gift-hide" />

        <h3 className="a2-h4 a2-mt12">{x('gift.advanceH')}</h3>
        <p className="a2-xs a2-mute">{x('gift.advanceHelp')}</p>
        <Show on={v.advanceRequired} label={x('gift.advanceOn')} disabled={card.off} onChange={(advanceRequired) => set({ advanceRequired })} testId="ck-gift-adv" />
        <div className="a2-fld">
          <label className="a2-lbl" htmlFor={`${id}-type`}>
            {x('gift.type')}
          </label>
          <select id={`${id}-type`} className="a2-sel" value={v.advanceType} disabled={card.off || !v.advanceRequired} onChange={(e) => set({ advanceType: e.target.value as GiftValue['advanceType'] })} data-testid="ck-gift-type">
            <option value="full">{x('gift.typeFull')}</option>
            <option value="percent">{x('gift.typePercent')}</option>
            <option value="fixed">{x('gift.typeFixed')}</option>
          </select>
        </div>
        {v.advanceType === 'percent' ? (
          <div className="a2-fld">
            <label className="a2-lbl" htmlFor={`${id}-pct`}>
              {x('gift.percent')}
            </label>
            <input id={`${id}-pct`} className="a2-inp" type="number" inputMode="numeric" min={1} max={100} value={v.percent === null ? '' : String(v.percent)} disabled={card.off || !v.advanceRequired} onChange={(e) => set({ percent: e.target.value === '' ? null : Number(e.target.value) })} data-testid="ck-gift-percent" />
          </div>
        ) : null}
        {v.advanceType === 'fixed' ? (
          <div className="a2-fld">
            <label className="a2-lbl" htmlFor={`${id}-amt`}>
              {x('gift.amount')}
            </label>
            <input id={`${id}-amt`} className="a2-inp" type="number" inputMode="decimal" min={0} step={1 / props.unit} value={v.amount === null ? '' : String(v.amount)} disabled={card.off || !v.advanceRequired} onChange={(e) => set({ amount: e.target.value === '' ? null : Number(e.target.value) })} data-testid="ck-gift-amount" />
          </div>
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
      <FormCard {...props} x={x} />
      <GiftCard {...props} x={x} />
    </>
  );
}
