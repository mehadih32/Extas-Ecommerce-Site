// PR 606 — the bulk / corporate enquiry page (/bulk-order, /bn/bulk-order), while the owner has the lane on: the
// title and its line, what a bulk order gets (one price for the quantity, the logo, delivery in batches), the bag's
// pieces when he came from the bag, the enquiry form, and the ways to talk to the shop when the owner keeps them shown.
// Phone: one column in that order. Computer: the form on the left, the bag's pieces and the ways to talk on the right.
// The demo has no customer screen for this lane; it wears the demo's card, field and button styles. Nothing is priced.
import './bulk.css';
import type { BagView } from '@extas/cart';
import { BULK_TEXT_MAX, type BulkLimits, type BulkSource } from '@extas/checkout/pure';
import type { BulkLaneSettings } from '@extas/settings';
import type { ShopContext } from '@/lib/shop/context';
import { hrefIn } from '@/lib/shop/lang';
import { telHref, waHref } from '@/lib/shop/links';
import { ROUTES } from '@/lib/shop/routes';
import { Icon, WaGlyph } from '../Icon';
import { BulkForm, type BulkWords } from './BulkForm';

const FORM_WORDS = [
  'name',
  'phone',
  'phoneHint',
  'company',
  'email',
  'items',
  'itemsHint',
  'itemsOptional',
  'quantity',
  'logo',
  'neededBy',
  'note',
  'send',
  'sending',
  'doneTitle',
  'doneText',
  'doneBack',
  'err.empty',
  'err.short',
  'err.phone',
  'err.email',
  'err.long',
  'err.few',
  'err.date',
  'err.tooMany',
  'err.closed',
  'err.offline',
] as const;

export interface BulkPageProps {
  c: ShopContext;
  lane: BulkLaneSettings;
  source: BulkSource;
  /** The bag, when he came from it (its pieces go with the enquiry). */
  bag: BagView | null;
  nameMin: number;
}

function bagLines(c: ShopContext, bag: BagView | null): string[] {
  if (!bag) return [];
  const name = (x: { nameEn: string; nameBn: string | null }) => (c.lang === 'bn' && x.nameBn ? x.nameBn : x.nameEn);
  const line = (n: string, colour: string | null, size: string | null, qty: number) =>
    colour ? c.t('bulk.line', { name: n, colour, size: size ?? '', qty: c.num(qty) }) : c.t('bulk.lineNoColour', { name: n, size: size ?? '', qty: c.num(qty) });
  return [
    ...bag.items.map((i) => line(name(i), i.colour ? name(i.colour) : null, i.size?.label ?? null, i.quantity)),
    ...bag.sets.flatMap((s) => s.pieces.map((p) => line(name(p), p.colour ? name(p.colour) : null, p.size, 1))),
  ];
}

export function BulkPage({ c, lane, source, bag, nameMin }: BulkPageProps) {
  const t = c.t;
  const lines = bagLines(c, bag);
  const withBag = source === 'bag' && lines.length > 0;
  const limits: BulkLimits = {
    nameMin,
    textMax: BULK_TEXT_MAX,
    noteMax: lane.noteMaxChars,
    minQuantity: lane.minQuantity,
    maxQuantity: lane.maxQuantity,
    today: c.today,
    hasBagLines: withBag,
  };
  const words: BulkWords = Object.fromEntries(FORM_WORDS.map((k) => [k, t(`bulk.${k}`)]));
  words.quantityMin = t('bulk.quantityMin', { min: c.num(lane.minQuantity ?? 0) });
  words['err.fewMin'] = t('bulk.err.fewMin', { min: c.num(lane.minQuantity ?? 0) });
  words['err.many'] = t('bulk.err.many', { max: c.num(lane.maxQuantity) });
  const phone = lane.showContact ? c.s['contact.phone'] : null;
  const email = lane.showContact ? c.s['contact.email'] : null;
  const tel = telHref(phone);
  const wa = lane.showContact ? waHref(c.s['contact.whatsapp'], t('bulk.waMessage', c.vars)) : null;
  const talk = Boolean(tel || email || wa);

  return (
    <div className="bk-page" data-testid="bulk-page" data-source={source}>
      <div className="container bk-wrap">
        <nav className="crumbs hide-m bk-crumbs" aria-label={t('bulk.crumbs')}>
          <a href={hrefIn(c.lang, ROUTES.home)}>{t('bulk.home')}</a>
          <span aria-hidden="true">/</span>
          <span aria-current="page">{t('bulk.pageTitle')}</span>
        </nav>
        <div className="bk-head">
          <p className="eyebrow">{t('bulk.eyebrow')}</p>
          <h1 className="h1">{t('bulk.title')}</h1>
          <p className="bk-sub text2">{t('bulk.sub')}</p>
          <ul className="bk-why" data-testid="bulk-why">
            {(['why1', 'why2', 'why3'] as const).map((k) => (
              <li key={k}>
                <Icon name="check" size={15} />
                <span>{t(`bulk.${k}`)}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="bk-split">
          <div className="bk-main">
            <BulkForm words={words} limits={limits} lang={c.lang} source={source} withBag={withBag} logoOffered={lane.logo.offered} homeHref={hrefIn(c.lang, ROUTES.home)} />
          </div>
          {withBag || talk ? (
            <aside className="bk-side">
              {withBag ? (
                <div className="card p16 bk-bagbox" data-testid="bulk-bag">
                  <div className="h3">{t('bulk.fromBag')}</div>
                  <ul className="bk-lines">
                    {lines.map((l, i) => (
                      <li key={i}>{l}</li>
                    ))}
                  </ul>
                  <p className="xs muted">{t('bulk.fromBagNote')}</p>
                </div>
              ) : null}
              {talk ? (
                <div className="card p16 bk-talk" data-testid="bulk-talk">
                  <div className="h3">{t('bulk.talkTitle')}</div>
                  <p className="small text2">{t('bulk.talkText')}</p>
                  <div className="bk-talk-btns">
                    {wa ? (
                      <a className="btn btn-secondary btn-block" href={wa} target="_blank" rel="noopener">
                        <WaGlyph size={18} />
                        {t('bulk.whatsapp')}
                      </a>
                    ) : null}
                    {tel && phone ? (
                      <a className="btn btn-secondary btn-block" href={tel}>
                        <Icon name="phone" size={16} />
                        {t('bulk.call', { number: phone })}
                      </a>
                    ) : null}
                    {email ? (
                      <a className="btn btn-secondary btn-block bk-mail" href={`mailto:${email}`}>
                        <Icon name="mail" size={16} />
                        <span>{t('bulk.mail', { email })}</span>
                      </a>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </aside>
          ) : null}
        </div>
      </div>
    </div>
  );
}
