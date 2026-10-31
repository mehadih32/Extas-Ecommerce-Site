// S08 · PR 186 — the account's exchange page (demo 61-exchange.js, V12.2), at /account/orders/<number>/exchange: the
// title and the order strip (number, delivered date, the hours left), then the four steps (ExchangeFlow, client). Signed
// out or not his order: log in with the way back here. Closed (not delivered, the window over, nothing left): one card
// that says why, with "Back to order" and WhatsApp. The owner turns the page on (`orders.exchange.account`, off by default).
import '../bag/bag.css';
import './account.css';
import './exchange.css';
import type { Receipt } from '@extas/checkout';
import type { CustomerExchangeState } from '@extas/orders';
import { cardsByIds, colourName } from '@/lib/shop/catalogue';
import type { ShopContext } from '@/lib/shop/context';
import { dateText } from '@/lib/shop/account-view';
import { keysOf, SHOP_DICTS } from '@/lib/shop/dict';
import { plural } from '@/lib/shop/bag-model';
import { hrefIn } from '@/lib/shop/lang';
import { waHref } from '@/lib/shop/links';
import { ROUTES } from '@/lib/shop/routes';
import { Icon, WaGlyph } from '../Icon';
import { nameOf, Thumb } from '../bag/BagLines';
import { AccountCrumbs } from './AccountShell';
import { ExchangeFlow, type ExchangeLineView } from './ExchangeFlow';

const P = 'account.exchange.';

/** Every exchange word with its prefix taken off, slots left for the client ("account.exchange.next" → "next"). */
function exchangeWords(c: ShopContext): Record<string, string> {
  return Object.fromEntries(
    keysOf(SHOP_DICTS[c.lang])
      .filter((k) => k.startsWith(P))
      .map((k) => [k.slice(P.length), c.t(k, c.vars)]),
  );
}

function crumbsOf(c: ShopContext, number: string) {
  const t = c.t;
  return (
    <AccountCrumbs
      c={c}
      trail={[
        [t('account.title'), hrefIn(c.lang, ROUTES.account)],
        [t('account.order.crumb', { number }), hrefIn(c.lang, ROUTES.order(number))],
        [t('account.exchange.crumb'), null],
      ]}
    />
  );
}

/** Signed out, or not his order: log in (with the order's number), then come back to this exchange. */
export function ExchangePrompt({ c, number, signedIn, line }: { c: ShopContext; number: string; signedIn: boolean; line: string | null }) {
  const t = c.t;
  const back = `${hrefIn(c.lang, ROUTES.exchange(number))}${line ? `?line=${encodeURIComponent(line)}` : ''}`;
  return (
    <div className="container acc-page" data-testid="exchange-prompt">
      {crumbsOf(c, number)}
      <section className="card acc-prompt mt16">
        <span className="acc-prompt-i">
          <Icon name="lock" size={24} />
        </span>
        <h1 className="h2">{t(signedIn ? 'account.order.notYours' : 'account.exchange.loginTitle')}</h1>
        <p className="small text2">{signedIn ? t('account.order.notYoursText', { number }) : t('account.exchange.loginText')}</p>
        <a className="btn btn-primary" href={`${hrefIn(c.lang, ROUTES.login)}?next=${encodeURIComponent(back)}`} data-testid="exchange-prompt-login">
          <Icon name="user" size={17} />
          {t('account.prompt.button')}
        </a>
      </section>
    </div>
  );
}

export async function ExchangePage({ c, state, receipt, waOn, initialLine }: { c: ShopContext; state: CustomerExchangeState; receipt: Receipt | null; waOn: boolean; initialLine: string | null }) {
  const t = c.t;
  const number = state.number;
  const orderHref = hrefIn(c.lang, ROUTES.order(number));
  const wa = waOn ? waHref(c.s['contact.whatsapp'], t('account.exchange.waMsg', { ...c.vars, number })) : null;
  const productIds = state.lines.map((l) => l.productId).filter((x): x is string => !!x);
  const cards = await cardsByIds(c.storeId, productIds);
  const units = state.lines.reduce((s, l) => s + l.quantity, 0);
  const deliveredAt = receipt?.times.deliveredAt ?? null;
  const hoursLeft = state.window?.state === 'OPEN' ? state.window.hoursLeft : null;

  const lines: ExchangeLineView[] = state.lines.map((l) => {
    const r = receipt?.lines.find((x) => x.id === l.lineId);
    const name = r ? nameOf(r, c) : l.productName;
    const colour = r?.colour ? colourName(r.colour, c.lang) : l.colourName;
    return {
      lineId: l.lineId,
      size: l.size,
      problem: l.problem,
      sizes: l.sizes,
      currentSizeKey: l.currentSizeKey,
      name,
      detail: [colour, l.sizeLabel].filter(Boolean).join(' · '),
      sizeLabel: l.sizeLabel,
      paidMinor: l.paidPerPieceMinor,
      thumb: <Thumb c={c} card={l.productId ? cards.get(l.productId) : undefined} colourKey={r?.colour?.key || undefined} hex={r?.colour?.hex ?? ''} alt={name} />,
    };
  });

  const chip =
    hoursLeft !== null ? (
      <span className="tag warn" data-testid="exc-hours">
        <Icon name="clock" size={12} />
        {plural(t, 'account.exchange.hoursLeft', hoursLeft, c.num)}
      </span>
    ) : deliveredAt ? (
      <span className="tag plain">{t('account.exchange.windowClosed')}</span>
    ) : (
      <span className="tag plain">{t('account.exchange.closed.NOT_DELIVERED.title')}</span>
    );
  const head = (
    <>
      <div className="exc-top">
        <h1 className="h1">{t('account.exchange.title')}</h1>
        <span className="small muted hide-m">{t('account.exchange.sub')}</span>
      </div>
      <section className="card exc-strip" aria-label={t('account.exchange.order', { number })} data-testid="exc-strip">
        <div className="row" style={{ gap: 10, minWidth: 0 }}>
          <a className="iconbtn" href={orderHref} aria-label={t('account.exchange.back')}>
            <Icon name="back" size={20} />
          </a>
          <div style={{ minWidth: 0 }}>
            <div className="h3">{t('account.exchange.order', { number })}</div>
            <div className="small text2">
              {[deliveredAt ? t('account.exchange.delivered', { date: dateText(c, deliveredAt) }) : null, plural(t, 'account.exchange.items', units, c.num)].filter(Boolean).join(' · ')}
            </div>
          </div>
          <div className="row hide-m" style={{ gap: 6, marginLeft: 12 }}>
            {lines.slice(0, 4).map((l) => (
              <span key={l.lineId} className="exc-stripthumb" style={{ width: 34, display: 'inline-block' }}>
                {l.thumb}
              </span>
            ))}
          </div>
        </div>
        {chip}
      </section>
    </>
  );

  if (!state.open) {
    const why = state.closed ?? 'NONE_LEFT';
    return (
      <div className="container acc-page exc-page" data-testid="exchange-page" data-closed={why}>
        {crumbsOf(c, number)}
        {head}
        <section className="card p24" aria-labelledby="exc-closed-h" data-testid="exc-closed">
          <div className="row top" style={{ gap: 14, alignItems: 'flex-start' }}>
            <span className="acc-prompt-i shrink0" style={{ margin: 0 }}>
              <Icon name="clock" size={22} />
            </span>
            <div style={{ minWidth: 0 }}>
              <h2 className="h2" id="exc-closed-h">
                {t(`account.exchange.closed.${why}.title`)}
              </h2>
              <p className="small text2" style={{ margin: '6px 0 0' }}>
                {t(`account.exchange.closed.${why}.text`, { hours: c.num(state.windowHours ?? 0) })}
              </p>
              <div className="soft p16 small mt12">{t('account.exchange.rules')}</div>
              <div className="row wrap mt16" style={{ gap: 10 }}>
                <a className="btn btn-secondary" href={orderHref}>
                  {t('account.exchange.back')}
                </a>
                {wa ? (
                  <a className="btn btn-secondary" href={wa} target="_blank" rel="noopener noreferrer">
                    <WaGlyph size={18} />
                    {t('account.exchange.wa')}
                  </a>
                ) : null}
              </div>
            </div>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="container acc-page exc-page" data-testid="exchange-page">
      {crumbsOf(c, number)}
      <ExchangeFlow
        words={exchangeWords(c)}
        number={number}
        orderHref={orderHref}
        waHref={wa}
        money={{ currency: c.s['store.currency'], lang: c.lang, bnDigits: c.bnDigits }}
        lines={lines}
        problemReason={state.problemReason}
        rules={state.rules}
        initialLine={initialLine}
        head={head}
      />
    </div>
  );
}
