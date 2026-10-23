// PR 111 / 112 / 113 — the order summary (demo 50-bag.js bag_summary): one row per item ("name · size") and per set
// (with what it saves), the subtotal, every offer the rules engine applied (with its code), delivery only when it is
// free (a FREE badge), the code box with its honest answer (SIM-F-009), the total in bold, "You save" in sale red,
// Checkout, and the reassurance row — each line only when its setting or flag backs it (CN-018).
import type { BagView, CodeState } from '@extas/cart';
import type { ShopContext } from '@/lib/shop/context';
import { hrefIn } from '@/lib/shop/lang';
import { ROUTES } from '@/lib/shop/routes';
import type { Reassurance } from '@/lib/shop/bag-model';
import { Icon } from '../Icon';
import { nameOf } from './BagLines';

/** The code box's line for its state, or null when there is nothing to say. */
export function codeMessage(c: ShopContext, code: CodeState): { text: string; ok: boolean; login: boolean } | null {
  const t = c.t;
  switch (code.state) {
    case 'none':
      return null;
    case 'applied':
      return { text: t('bag.code.added', { code: code.code }), ok: true, login: false };
    case 'needsMore':
      return { text: t('bag.code.needsMore', { code: code.code, amount: c.money(code.moreMinor) }), ok: false, login: false };
    case 'betterOffer':
      return { text: t(code.by === 'set' ? 'bag.code.betterSet' : 'bag.code.betterOffer', { code: code.code }), ok: false, login: false };
    case 'notForItems':
      return { text: t('bag.code.notForItems', { code: code.code }), ok: false, login: false };
    case 'refused':
      return { text: t(`bag.code.r.${code.reason}`, { code: code.code }), ok: false, login: code.reason === 'MEMBERS_ONLY' };
  }
}

export function BagSummary({ c, view, codeOn, trust, blocked }: { c: ShopContext; view: BagView; codeOn: boolean; trust: Reassurance; blocked: boolean }) {
  const t = c.t;
  const s = view.summary;
  const msg = codeMessage(c, view.code);
  const typed = view.code.state === 'none' ? null : view.code.code;
  // A refused code stays in the open box with its reason, so the customer can fix it; a code that works shows as kept.
  const refused = view.code.state === 'refused';
  const kept = typed && !refused ? typed : null;
  const checkout = hrefIn(c.lang, ROUTES.checkout);
  return (
    <div className="card p20" data-testid="bag-summary">
      <h2 className="h2" style={{ marginBottom: 12 }}>
        {t('bag.summary.title')}
      </h2>
      {s.rows.map((r) => (
        <div key={r.lineId}>
          <div className="bg-sr bg-sr-item" data-testid="bag-sr">
            <span>
              {nameOf(r, c)}
              {r.size ? ` · ${r.size}` : ''}
              {r.quantity > 1 && r.kind === 'item' ? ` ${t('bag.summary.times', { n: c.num(r.quantity) })}` : ''}
            </span>
            <span className="b">{c.money(r.amountMinor)}</span>
          </div>
          {r.kind === 'set' && r.savingMinor && r.regularMinor ? (
            <div className="zc-rsub2" data-testid="bag-set-sub">
              {t('bag.summary.setSub', { regular: c.money(r.regularMinor), saving: c.money(r.savingMinor) })}
            </div>
          ) : null}
        </div>
      ))}
      <div className="bg-sr bg-sr-sub">
        <span>{t('bag.summary.subtotal', { n: c.num(s.count) })}</span>
        <span className="b" data-testid="bag-subtotal">
          {c.money(s.subtotalMinor)}
        </span>
      </div>
      {s.offers.map((o) => (
        <div key={o.ruleKey} className="bg-sr disc" data-testid="bag-offer">
          <span>
            {(c.lang === 'bn' ? o.label.bn || o.label.en : o.label.en) || t('bag.summary.offer')}
            {o.code ? (
              <>
                {' '}
                <span className="tag plain">{o.code}</span>
              </>
            ) : null}
          </span>
          <span>−{c.money(o.amountMinor)}</span>
        </div>
      ))}
      {s.freeDelivery ? (
        <div className="bg-sr bg-free" data-testid="bag-freerow">
          <span>
            <Icon name="truck" size={16} /> {t('bag.summary.delivery')}
          </span>
          <span className="bg-freeb">
            <Icon name="check" size={13} />
            {t('bag.free.badge')}
          </span>
        </div>
      ) : null}
      {codeOn ? (
        <div className="bg-code" style={{ padding: '6px 0 2px' }} data-testid="bag-code" data-state={view.code.state}>
          {kept ? (
            <div className="row between small">
              <span>
                <b>{kept}</b>
              </span>
              <button type="button" className="link" data-bag-act="code-remove">
                {t('bag.code.remove')}
              </button>
            </div>
          ) : refused ? null : (
            <button type="button" className="link" data-bag-act="code-open" aria-expanded="false" aria-controls="bag-code-form">
              {t('bag.code.open')}
            </button>
          )}
          <form id="bag-code-form" className="row wrap" style={{ gap: 8 }} data-bag-form="code" hidden={!refused || undefined}>
            <label className="sr" htmlFor="bag-code-in">
              {t('bag.code.label')}
            </label>
            <input
              id="bag-code-in"
              name="code"
              className="input"
              placeholder={t('bag.code.placeholder')}
              autoComplete="off"
              maxLength={40}
              defaultValue={refused ? (typed ?? '') : ''}
              aria-invalid={refused || undefined}
              aria-describedby={msg ? 'bag-code-msg' : undefined}
              style={{ textTransform: 'uppercase', padding: '10px 12px', flex: '1 1 140px', minWidth: 0 }}
            />
            <button className="btn btn-secondary btn-sm" style={{ minHeight: 44 }}>
              {t('bag.code.apply')}
            </button>
          </form>
          {msg ? (
            <div className={`xs mt8 ${msg.ok ? 'brandc bold' : 'bg-codemsg'}`} id="bag-code-msg" role={msg.ok ? 'status' : 'alert'} data-testid="bag-code-msg">
              {msg.text}
              {msg.login ? (
                <>
                  {' '}
                  <a className="link xs" href={hrefIn(c.lang, ROUTES.login)}>
                    {t('bag.code.login')}
                  </a>
                </>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
      <div className="bg-tot">
        <span>{t('bag.summary.total')}</span>
        <span className="price" data-testid="bag-total">
          {c.money(s.totalMinor)}
        </span>
      </div>
      {s.youSaveMinor > 0 ? (
        <div className="xs bold bg-yousave" data-testid="bag-yousave">
          {t('bag.summary.youSave', { amount: c.money(s.youSaveMinor) })}
        </div>
      ) : null}
      {!s.freeDelivery ? <div className="xs muted bg-dlater">{t('bag.summary.deliveryLater')}</div> : null}
      {blocked ? (
        <button type="button" className="btn btn-primary btn-block mt16" disabled data-testid="bag-checkout">
          {t('bag.summary.fix')}
        </button>
      ) : (
        <a className="btn btn-primary btn-block mt16" href={checkout} data-testid="bag-checkout">
          {t('bag.summary.checkout')}
          <Icon name="right" size={18} />
        </a>
      )}
      {trust.cod || trust.exchange || trust.secure ? (
        <div className="bg-trust">
          {trust.cod ? (
            <div>
              <Icon name="cash" size={16} />
              <span>{t('bag.trust.cod')}</span>
            </div>
          ) : null}
          {trust.exchange ? (
            <div>
              <Icon name="swap" size={16} />
              <span>{t('bag.trust.exchange', c.vars)}</span>
            </div>
          ) : null}
          {trust.secure ? (
            <div>
              <Icon name="lock" size={16} />
              <span>{t('bag.trust.secure')}</span>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
