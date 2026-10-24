// S08 · PR 185 — ORD-05 Returns & exchanges (demo V12.2 97s-adm2-orders2.js, #/admin/orders/returns): the board of
// exchange cases in four columns (Requested / Approved · on the way / Received & QC / Done), one case's card when a card
// is chosen (`?case=<id>`: the pieces, the money box, who pays the second delivery, the root cause of a wrong item, and
// the decisions open now), and "Start an exchange" for a delivered order (`?order=<number>&line=<id>&reason=&size=`:
// the order's lines, then what the first tier with stock offers, each with its money box). Drawn on the server; only
// the buttons run in the browser (ReturnsActions). No money moves here; approving books the linked exchange order.
// PR 188: each piece going out shows its other sizes at the same price (the size switcher) until the courier has it.
// PR 189: under "Start an exchange", a return after receipt — only when the policy allows it (no returns after receipt
// by default, said in words). PR 190: who pays the second delivery — waive (reason logged), the "your mistake" claim
// and its decision, the one-trip swap box, and the re-ship of a parcel refused after a try-on.
import Link from 'next/link';
import type { ExchangeChoices, ExchangeSizes, ExchangeView, ReturnChoices } from '@extas/orders';
import type { AdminView } from '@/lib/admin-page';
import { boardOf, BOARD_COLUMNS, reasonTone, returnsHref, sizeChips, statusTone } from '@/lib/admin-returns/model';
import { t, type Dict } from '@/lib/i18n';
import { formatMoney, formatNumber, type Money } from '@/components/admin/products/model';
import { ShellIcon } from '../shell/ShellIcon';
import { ClaimForm, OpenExchangeForm, OpenReturnForm, ReturnsAction, SizeSwitch, type ActionTexts } from './ReturnsActions';

export interface StartStep {
  number: string;
  found: { orderId: string; number: string; status: string; customerName: string | null; lines: { id: string; sku: string; productName: string; colourName: string | null; sizeLabel: string | null; quantity: number }[] } | null;
  line: string | null;
  reason: string | null;
  size: string | null;
  choices: ExchangeChoices | null;
  /** PR 189: a return after receipt for the chosen line — the policy, the window, the pieces left (null: no line). */
  ret: ReturnChoices | null;
}

export interface ReturnsData {
  rows: ExchangeView[];
  chosen: ExchangeView | null;
  start: StartStep;
  money: Money;
  canDecide: boolean;
  /** PR 187: may receive and check returned parcels (`returns.qc`). */
  canQc: boolean;
  causes: { key: string; label: string }[];
  /** PR 188: the other sizes of each piece going out, when the chosen case may still switch (else null). */
  sizes: ExchangeSizes[] | null;
  /** PR 190: may waive a charge (`returns.waive`), decide a claim (`returns.claims.decide`); a claim needs a photo. */
  canWaive: boolean;
  canClaims: boolean;
  claimPhoto: boolean;
}


const r = (d: Dict, key: string, vars?: Record<string, string | number>) => t(d, `returns.${key}`, vars);

export function actionTexts(d: Dict): ActionTexts {
  const errors = (d.returns as Dict | undefined)?.errors;
  return { send: r(d, 'act.send'), cancel: r(d, 'act.cancel'), errors: Object.fromEntries(Object.entries((errors ?? {}) as Dict).map(([k, v]) => [k, String(v)])) };
}

const pieceText = (name: string | null, colour: string | null, size: string | null) => [name, colour, size].filter(Boolean).join(' · ');

function BoardCard({ view, x, on }: { view: AdminView; x: ExchangeView; on: boolean }) {
  const d = view.dict;
  return (
    <Link className={`a2-bc${on ? ' on' : ''}`} href={returnsHref({ case: x.id })} scroll={false} aria-current={on ? 'true' : undefined} data-testid="exchange-card" data-number={x.number}>
      <div className="a2-between rt-nowrap">
        <b className="a2-h4">{`${x.orderNumber} · ${x.customerName ?? ''}`}</b>
        <span className={`a2-pill ${reasonTone(x.reason)}`}>{r(d, `reason.${x.reason}`)}</span>
      </div>
      {x.items.map((i) => (
        <div key={i.id} className="a2-xs a2-mt6">
          {`${i.oldSku ?? ''} → ${pieceText(i.newName, i.newColourName, i.newSizeLabel)}`}
        </div>
      ))}
      <div className="a2-xs a2-mute a2-mt6">{`${x.number} · ${r(d, `status.${x.status}`)}${x.money.chargeState ? ` · ${r(d, `charge.${x.money.chargeState}`)}` : ''}`}</div>
    </Link>
  );
}

function Board({ view, rows, chosen }: { view: AdminView; rows: ExchangeView[]; chosen: string | null }) {
  const d = view.dict;
  const b = boardOf(rows);
  return (
    <div className="a2-board" data-testid="returns-board">
      {BOARD_COLUMNS.map((c) => (
        <div key={c} className="a2-col" data-col={c}>
          <div className="a2-colh">
            <span>{r(d, `col.${c}`)}</span>
            <span className="a2-pill line">{formatNumber(b[c].length, view.locale)}</span>
          </div>
          {b[c].length ? b[c].map((x) => <BoardCard key={x.id} view={view} x={x} on={x.id === chosen} />) : <div className="a2-xs a2-mute rt-empty">{r(d, 'empty')}</div>}
        </div>
      ))}
    </div>
  );
}

function CaseCard({ view, x, data }: { view: AdminView; x: ExchangeView; data: ReturnsData }) {
  const d = view.dict;
  const m = (n: number) => formatMoney(n, data.money);
  const dt = new Intl.DateTimeFormat(view.locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: view.timeZone, numberingSystem: 'latn' });
  const texts = actionTexts(d);
  const cause = x.rootCause ? (data.causes.find((c) => c.key === x.rootCause)?.label ?? x.rootCause) : null;
  const kv: [string, React.ReactNode][] = [
    [r(d, 'case.order'), <Link key="o" className="a2-lnk" href={`/admin/orders/${x.orderId}`}>{x.orderNumber}</Link>],
    ...(x.newOrderId ? ([[r(d, 'case.newOrder'), <Link key="n" className="a2-lnk" href={`/admin/orders/${x.newOrderId}`}>{x.newOrderNumber}</Link>]] as [string, React.ReactNode][]) : []),
    [r(d, 'case.reason'), r(d, `reason.${x.reason}`)],
    ...(cause ? ([[r(d, 'case.rootCause'), cause]] as [string, string][]) : []),
    ...(x.reasonNote ? ([[r(d, 'case.note'), x.reasonNote]] as [string, string][]) : []),
    [r(d, 'case.diff'), m(x.money.differenceMinor)],
    ...(x.money.creditMinor ? ([[r(d, 'case.credit'), m(x.money.creditMinor)]] as [string, string][]) : []),
    [r(d, 'case.charge'), `${m(x.money.chargeMinor)}${x.money.chargeState ? ` · ${r(d, `charge.${x.money.chargeState}`)}` : ''}`],
    [r(d, 'case.cod'), <b key="c">{m(x.money.codMinor)}</b>],
    ...(x.windowEndsAt ? ([[r(d, 'case.window'), dt.format(new Date(x.windowEndsAt))]] as [string, string][]) : []),
    ...(x.decisionNote ? ([[r(d, 'case.decision'), x.decisionNote]] as [string, string][]) : []),
    ...(x.oneTrip ? ([[r(d, 'case.oneTrip'), r(d, 'case.yes')]] as [string, string][]) : []),
    ...(x.waiveReason ? ([[r(d, 'case.waived'), x.waiveReason]] as [string, string][]) : []),
    ...(x.claimState ? ([[r(d, 'case.claim'), `${r(d, `claim.${x.claimState}`)}${x.claimNote ? ` · ${x.claimNote}` : ''}`]] as [string, string][]) : []),
  ];
  const base = `/api/admin/returns/exchanges/${x.id}`;
  const p = x.pickup;
  const pickupOpen = !!p && (p.status === 'EXPECTED' || p.status === 'RECEIVED');
  // PR 190: who pays the second delivery, while the exchange is only requested
  const free = ['WAIVED', 'CLAIM_ACCEPTED', 'STORE', 'FREE_OUR_MISTAKE'].includes(x.money.chargeState ?? '');
  const charge =
    x.status === 'REQUESTED' ? (
      <>
        {data.canWaive && !free && x.money.chargeMinor > 0 ? (
          <ReturnsAction label={r(d, 'act.waive')} url={`${base}/waive`} body={{ version: x.version }} note={{ label: r(d, 'act.waiveNote', { amount: m(x.money.chargeMinor), cod: m(Math.max(0, x.money.codMinor - x.money.chargeMinor)) }), required: true }} noteKey="reason" texts={texts} testId="exchange-waive" />
        ) : null}
        {data.canDecide && !free && !x.isOurMistake && x.claimState !== 'PENDING' ? (
          <ClaimForm url={`${base}/claim`} version={x.version} photoNeeded={data.claimPhoto} texts={{ ...texts, open: r(d, 'act.claim'), note: r(d, 'act.claimNote'), photo: r(d, 'act.claimPhoto'), photoDone: r(d, 'qc.photoDone'), photoNeeded: r(d, 'act.claimPhotoNeeded'), save: r(d, 'act.claimSave') }} />
        ) : null}
        {data.canClaims && x.claimState === 'PENDING' ? (
          <>
            <ReturnsAction label={r(d, 'act.claimAccept')} url={`${base}/claim-decision`} body={{ accept: true, version: x.version }} tone="pri" texts={texts} testId="exchange-claim-accept" />
            <ReturnsAction label={r(d, 'act.claimRefuse')} url={`${base}/claim-decision`} body={{ accept: false, version: x.version }} tone="badf" note={{ label: r(d, 'act.claimRefuseNote'), required: true }} texts={texts} testId="exchange-claim-refuse" />
          </>
        ) : null}
      </>
    ) : null;
  const acts =
    x.status === 'REQUESTED' && data.canDecide ? (
      <>
        <ReturnsAction label={r(d, 'act.approve')} url={`${base}/approve`} body={{ version: x.version }} tone="pri" texts={texts} testId="exchange-approve" />
        <ReturnsAction label={r(d, 'act.refuse')} url={`${base}/refuse`} body={{ version: x.version }} tone="badf" note={{ label: r(d, 'act.refuseNote'), required: true }} texts={texts} testId="exchange-refuse" />
      </>
    ) : pickupOpen && data.canQc ? (
      <Link className="a2-btn pri" href={`${returnsHref()}/qc?id=${p!.returnId}`} data-testid="exchange-qc">
        {r(d, 'qc.open')}
      </Link>
    ) : (x.status === 'QC_PASSED' || x.status === 'QC_FAILED') && data.canDecide ? (
      <ReturnsAction label={r(d, 'act.complete')} url={`${base}/complete`} body={{ version: x.version }} tone="pri" note={x.status === 'QC_FAILED' ? { label: r(d, 'act.completeNote'), required: true } : undefined} texts={texts} testId="exchange-complete" />
    ) : null;
  const sizesOf = (itemId: string) => {
    const s = data.sizes?.find((z) => z.exchangeItemId === itemId);
    if (!s) return null;
    const chips = sizeChips(s, x.status === 'REQUESTED', { price: r(d, 'switch.price'), out: r(d, 'switch.out') });
    if (!chips.some((c) => !c.current && !c.why)) return <div className="a2-xs a2-mute a2-mt6">{r(d, 'switch.none')}</div>;
    return <SizeSwitch url={`${base}/switch`} exchangeItemId={itemId} version={x.version} chips={chips} title={r(d, 'switch.title')} texts={texts} />;
  };
  const stateTone = (s: string | null) => (s === 'RESTOCKED' ? 'ok' : s === 'ERP_FAILED' || s === 'LOSS_RECORDED' ? 'bad' : 'warn');
  return (
    <section className="a2-card" data-testid="exchange-case" data-number={x.number} data-status={x.status}>
      <div className="a2-ch">
        <div>
          <div className="a2-xs a2-mute">{r(d, 'case.eyebrow', { number: x.number })}</div>
          <h2 className="a2-h3">{`${x.orderNumber} · ${x.customerName ?? ''}`}</h2>
          <div className="a2-gap8 a2-mt6">
            <span className={`a2-pill ${statusTone(x.status)}`}>{r(d, `status.${x.status}`)}</span>
            <span className={`a2-pill ${reasonTone(x.reason)}`}>{r(d, `reason.${x.reason}`)}</span>
          </div>
        </div>
        <Link className="a2-btn sm" href={returnsHref()} scroll={false} aria-label={r(d, 'act.cancel')}>
          <ShellIcon name="x" size={14} />
        </Link>
      </div>
      <div className="a2-h4 a2-mt12">{r(d, 'case.items')}</div>
      {x.items.map((i) => (
        <div key={i.id} className="a2-sm a2-mt6" data-testid="exchange-item">
          <div>
            <span className="a2-mono">{i.oldSku}</span>
            {` → ${pieceText(i.newName, i.newColourName, i.newSizeLabel)} `}
            <span className="a2-mono">{i.newSku}</span>
            {` × ${formatNumber(i.quantity, view.locale)}`}
            {i.tier ? <span className="a2-pill line rt-ml">{r(d, 'case.tier', { n: i.tier })}</span> : null}
          </div>
          {i.receivedSku ? <div className="a2-xs a2-mute">{r(d, 'case.coming', { sku: i.receivedSku })}</div> : null}
          {sizesOf(i.id)}
        </div>
      ))}
      {p ? (
        <div className="a2-mt12" data-testid="exchange-pickup" data-status={p.status}>
          <div className="a2-h4">
            {r(d, 'case.pickup')}
            <span className={`a2-pill ${pickupOpen ? 'warn' : 'ok'} rt-ml`}>{r(d, `qc.parcel.${p.status}`)}</span>
          </div>
          {p.items.map((i) => (
            <div key={i.id} className="a2-xs a2-mt6">
              <span className="a2-mono">{i.scannedSku ?? i.expectedSku}</span>
              {i.dispositionState ? <span className={`a2-pill ${stateTone(i.dispositionState)} rt-ml`}>{r(d, `qc.state.${i.dispositionState}`)}</span> : null}
            </div>
          ))}
          {p.items.some((i) => i.dispositionState === 'ERP_FAILED') ? (
            <Link className="a2-lnk a2-mt6" href="/admin/stock">
              {r(d, 'case.erpAgain')}
            </Link>
          ) : null}
        </div>
      ) : null}
      <div className="a2-kv2 a2-mt12">{kv.flatMap(([k, v]) => [<span key={`${k}-k`}>{k}</span>, <span key={`${k}-v`}>{v}</span>])}</div>
      <div className="a2-cmds a2-mt12">{acts ?? <span className="a2-sm a2-mute">{r(d, 'case.nothing')}</span>}</div>
      {charge ? <div className="a2-cmds a2-mt12" data-testid="exchange-charge">{charge}</div> : null}
      <div className="a2-note">
        <ShellIcon name="info" size={15} />
        <span>{r(d, 'case.never')}</span>
      </div>
    </section>
  );
}

function StartCard({ view, data }: { view: AdminView; data: ReturnsData }) {
  const d = view.dict;
  const s = data.start;
  const m = (n: number) => formatMoney(n, data.money);
  const n = (x: number) => formatNumber(x, view.locale);
  const c = s.choices;
  const texts = {
    ...actionTexts(d),
    open: r(d, 'start.open'),
    rootCause: r(d, 'start.rootCause'),
    received: r(d, 'start.received'),
    reasonNote: r(d, 'start.reasonNote'),
    ...(c?.oneTrip ? { oneTrip: r(d, 'start.oneTrip', { amount: c.oneTrip.chargeMinor === null ? r(d, 'charge.NOT_SET') : m(c.oneTrip.chargeMinor) }) } : {}),
  };
  return (
    <section className="a2-card" data-testid="exchange-start">
      <div className="a2-ch">
        <div>
          <h2 className="a2-h3">{r(d, 'start.title')}</h2>
          <div className="a2-cs">{r(d, 'start.sub')}</div>
        </div>
      </div>
      <form method="get" action={returnsHref()} className="a2-gap8 rt-nowrap">
        <label className="a2-sr" htmlFor="rt-order">
          {r(d, 'start.number')}
        </label>
        <input id="rt-order" name="order" className="a2-inp" defaultValue={s.number} placeholder={r(d, 'start.number')} maxLength={40} />
        <button type="submit" className="a2-btn pri">
          <ShellIcon name="search" size={15} />
          {r(d, 'start.find')}
        </button>
      </form>
      {s.number && !s.found ? <p className="a2-sm rt-bad a2-mt12">{r(d, 'start.notFound')}</p> : null}
      {s.found ? (
        <div className="a2-mt12" data-testid="exchange-start-lines">
          <div className="a2-h4">{`${s.found.number} · ${s.found.customerName ?? ''}`}</div>
          {s.found.lines.map((l) => (
            <Link key={l.id} className={`a2-qi a2-mt6${s.line === l.id ? ' on' : ''}`} href={returnsHref({ order: s.found!.number, line: l.id })} scroll={false} aria-current={s.line === l.id ? 'true' : undefined}>
              <div>
                <b>{pieceText(l.productName, l.colourName, l.sizeLabel)}</b>
                <span className="a2-mono">{`${l.sku} × ${n(l.quantity)}`}</span>
              </div>
            </Link>
          ))}
        </div>
      ) : null}
      {s.found && s.line && c ? (
        <form method="get" action={returnsHref()} className="rt-form a2-mt12" data-testid="exchange-start-reason">
          <input type="hidden" name="order" value={s.found.number} />
          <input type="hidden" name="line" value={s.line} />
          <div>
            <label className="a2-lbl" htmlFor="rt-reason">
              {r(d, 'start.reason')}
            </label>
            <select id="rt-reason" name="reason" className="a2-sel" defaultValue={s.reason ?? ''}>
              {c.reasons.map((x) => (
                <option key={x} value={x}>
                  {r(d, `reason.${x}`)}
                </option>
              ))}
            </select>
          </div>
          {c.sizes.length ? (
            <div>
              <label className="a2-lbl" htmlFor="rt-size">
                {r(d, 'start.size')}
              </label>
              <select id="rt-size" name="size" className="a2-sel" defaultValue={s.size ?? c.neededSizeKey ?? ''}>
                {c.sizes.map((x) => (
                  <option key={x.key} value={x.key}>
                    {x.label}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          <div className="rt-formr">
            <button type="submit" className="a2-btn">
              {r(d, 'start.see')}
            </button>
          </div>
        </form>
      ) : null}
      {c && s.reason ? (
        <div className="a2-mt12" data-testid="exchange-options">
          <div className="a2-xs a2-mute">
            {c.window.state === 'OPEN' ? r(d, 'start.left', { n: n(c.window.hoursLeft), total: n(c.windowHours) }) : null}
            {c.perItemLeft !== null ? ` · ${r(d, 'start.perItem', { n: n(c.perItemLeft) })}` : null}
          </div>
          {c.closed ? (
            <div className="a2-note warn" data-testid="exchange-closed" data-why={c.closed}>
              <ShellIcon name="alert" size={15} />
              <span>{r(d, `start.closed.${c.closed}`)}</span>
            </div>
          ) : !c.options.length ? (
            <div className="a2-note warn">
              <ShellIcon name="alert" size={15} />
              <span>{r(d, 'start.none')}</span>
            </div>
          ) : (
            <>
              {c.reship ? (
                <div className="a2-note" data-testid="exchange-reship">
                  <ShellIcon name="info" size={15} />
                  <span>{r(d, 'start.reship')}</span>
                </div>
              ) : null}
              <div className="a2-h4 a2-mt12">{r(d, 'start.options', { n: c.tier ?? '' })}</div>
              <div className="a2-xs a2-mute">{r(d, 'start.note')}</div>
              {c.options.map((o) => (
                <div key={o.variantId} className="a2-card tight a2-mt12" data-testid="exchange-option" data-sku={o.sku}>
                  {data.canDecide ? (
                    <OpenExchangeForm url={`/api/admin/returns/orders/${c.orderId}/exchange`} reason={s.reason!} orderItemId={c.item.id} newVariantId={o.variantId} causes={s.reason === 'wrong' ? data.causes : null} texts={texts} caseHref={`${returnsHref()}?case=`}>
                      <OptionFacts view={view} o={o} m={m} />
                    </OpenExchangeForm>
                  ) : (
                    <OptionFacts view={view} o={o} m={m} />
                  )}
                </div>
              ))}
            </>
          )}
        </div>
      ) : null}
      {s.found && s.line && s.ret ? <ReturnStart view={view} data={data} ret={s.ret} line={s.line} /> : null}
    </section>
  );
}

/** PR 189: "Or a return" — the policy said in words when it is closed, else the form (with `returns.decide`). */
function ReturnStart({ view, data, ret, line }: { view: AdminView; data: ReturnsData; ret: ReturnChoices; line: string }) {
  const d = view.dict;
  const n = (x: number) => formatNumber(x, view.locale);
  const l = ret.lines.find((x) => x.id === line);
  if (!l) return null;
  const texts = { ...actionTexts(d), reason: r(d, 'retStart.reason'), quantity: r(d, 'retStart.quantity'), note: r(d, 'retStart.note'), noteOther: r(d, 'retStart.noteOther'), open: r(d, 'retStart.open') };
  return (
    <div className="a2-mt12" data-testid="return-start" data-closed={ret.closed ?? undefined}>
      <div className="a2-h4">{r(d, 'retStart.title')}</div>
      <div className="a2-xs a2-mute">{r(d, 'retStart.sub')}</div>
      {ret.closed ? (
        <div className="a2-note warn" data-testid="return-closed" data-why={ret.closed}>
          <ShellIcon name="alert" size={15} />
          <span>{r(d, `retStart.closed.${ret.closed}`)}</span>
        </div>
      ) : l.returnable < 1 ? (
        <div className="a2-note warn">
          <ShellIcon name="alert" size={15} />
          <span>{r(d, 'retStart.none')}</span>
        </div>
      ) : (
        <>
          <div className="a2-xs a2-mute a2-mt6">
            {ret.window.state === 'OPEN' ? r(d, 'start.left', { n: n(ret.window.hoursLeft), total: n(ret.windowHours) }) : null}
            {` · ${r(d, 'retStart.paid', { amount: formatMoney(l.paidPerPieceMinor * l.returnable, data.money) })}`}
          </div>
          {data.canDecide ? (
            <div className="a2-card tight a2-mt12">
              <OpenReturnForm url={`/api/admin/returns/orders/${ret.orderId}/return`} orderItemId={l.id} max={l.returnable} reasons={ret.reasons.map((x) => ({ code: x.code, label: r(d, `retReason.${x.code}`) }))} texts={texts} nextHref={data.canQc ? `${returnsHref()}/qc?id=` : null} />
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

function OptionFacts({ view, o, m }: { view: AdminView; o: ExchangeChoices['options'][number]; m: (n: number) => string }) {
  const d = view.dict;
  return (
    <div>
      <div className="a2-between">
        <b className="a2-h4">{pieceText(o.productName, o.colourName, o.sizeLabel)}</b>
        <span className="a2-pill line">{r(d, 'case.tier', { n: o.tier })}</span>
      </div>
      <div className="a2-xs a2-mute a2-mt6">
        <span className="a2-mono">{o.sku}</span>
        {` · ${r(d, 'start.price')} ${m(o.priceMinor)} · ${r(d, 'start.stock', { n: formatNumber(o.sellable, view.locale) })}`}
      </div>
      <div className="a2-kv2 a2-mt6 a2-sm">
        <span>{r(d, 'case.diff')}</span>
        <span>{m(o.money.differenceMinor)}</span>
        {o.money.creditMinor ? (
          <>
            <span>{r(d, 'case.credit')}</span>
            <span>{m(o.money.creditMinor)}</span>
          </>
        ) : null}
        <span>{r(d, 'case.charge')}</span>
        <span>{`${m(o.money.chargeMinor)} · ${r(d, `charge.${o.money.chargeState}`)}`}</span>
        <span>{r(d, 'case.cod')}</span>
        <b>{m(o.money.codMinor)}</b>
      </div>
    </div>
  );
}

export function ReturnsBoard({ view, data, head, tabs }: { view: AdminView; data: ReturnsData; head: React.ReactNode; tabs: React.ReactNode }) {
  return (
    <div className="a2-z" data-testid="orders-returns">
      {head}
      {tabs}
      {data.chosen ? (
        <div className="a2-row">
          <CaseCard view={view} x={data.chosen} data={data} />
        </div>
      ) : null}
      <Board view={view} rows={data.rows} chosen={data.chosen?.id ?? null} />
      <div className="a2-row a2-mt12 rt-start">
        <StartCard view={view} data={data} />
      </div>
    </div>
  );
}
