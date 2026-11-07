// PR 66 — "Questions & answers" under the product page (demo 30-product.js pdp_qaSection, r12-pdp.css P10 and 14.14):
// the newest answered question open in its own box with who answered it, the others folded under "Common questions"
// (the first few, then "See all questions · N more"), and "Not answered here?" with the WhatsApp button. Drawn on the
// server with the browser's own <details>, so it costs the page no script. Only the shop's approved answers appear
// (lib/shop/pdp-qa-load); with none, the block is only the WhatsApp ask, and without a WhatsApp number it is not drawn.
// Follow-up 183: while `pdp.qaAsk.on` (off as shipped) an "Ask a question" box sits under the block (and draws the block
// on its own when there is nothing else); the question waits for the team and shows only once answered and published.
import type { PdpQaAskSettings, PdpQaSettings } from '@extas/settings';
import { dateText } from '@/lib/shop/account-view';
import type { ShopContext } from '@/lib/shop/context';
import { hrefIn } from '@/lib/shop/lang';
import { waHref } from '@/lib/shop/links';
import { ROUTES } from '@/lib/shop/routes';
import { qaView, type QaRow } from '@/lib/shop/pdp-qa';
import { answeredQuestionsOnce } from '@/lib/shop/pdp-qa-load';
import { Icon, WaGlyph } from '../Icon';
import { AskQuestion, type AskWords } from './AskQuestion';

const ASK_WORDS = ['open', 'label', 'send', 'sending', 'note', 'thanks', 'again', 'signIn', 'limit', 'invalid', 'closed', 'failed', 'chars'] as const;

/** Follow-up 183: the "Ask a question" box, in its own box under the block. */
function AskBox({ c, productId, ask }: { c: ShopContext; productId: string; ask: PdpQaAskSettings }) {
  const w = Object.fromEntries(ASK_WORDS.map((k) => [k, k === 'chars' ? c.t('qa.form.chars', { n: '{n}', max: '{max}' }) : k === 'invalid' ? c.t('qa.form.invalid', { n: c.num(ask.maxChars) }) : c.t(`qa.form.${k}`)])) as unknown as AskWords;
  return (
    <div className="pdp-box p20 pdp-qa-ask" data-testid="qa-ask-box">
      <AskQuestion productId={productId} words={w} maxChars={ask.maxChars} loginHref={hrefIn(c.lang, ROUTES.login)} />
    </div>
  );
}

function Ask({ c, href, lead, cls }: { c: ShopContext; href: string; lead: string; cls: string }) {
  return (
    <div className={`pdp-qa-wa${cls ? ` ${cls}` : ''}`} data-testid="qa-ask">
      <p className="xs muted">{lead}</p>
      <a className="wa-btn wa-real btn-block" href={href} target="_blank" rel="noopener" data-testid="qa-wa">
        <WaGlyph size={21} />
        <span className="wa-lbl">{c.t('qa.ask')}</span>
      </a>
    </div>
  );
}

function Item({ row }: { row: QaRow }) {
  return (
    <details className="pdp-qa-i">
      <summary>
        <span className="pdp-qa-q">{row.question}</span>
        <Icon name="plus" size={16} />
      </summary>
      <div className="pdp-qa-a small text2">{row.answer}</div>
    </details>
  );
}

export async function PdpQa({ c, set, productId, name, ask = null }: { c: ShopContext; set: PdpQaSettings; productId: string; name: string; ask?: PdpQaAskSettings | null }) {
  if (!set.on) return null;
  const t = c.t;
  const wa = waHref(c.s['contact.whatsapp'], t('qa.waMessage', { ...c.vars, name }));
  const view = qaView(await answeredQuestionsOnce(c.storeId, productId, set.max), set, wa !== null);
  const askBox = ask?.on ? <AskBox c={c} productId={productId} ask={ask} /> : null;
  if (!view && !askBox) return null;
  const hours = c.s['contact.hours']?.[c.lang] ?? null;
  const head = (
    <div className="sec-hd">
      <h2 className="h2">{t('qa.title')}</h2>
    </div>
  );

  if (!view) {
    return (
      <section className="section" id="pdp-qa" data-testid="pdp-qa">
        <div className="container">
          {head}
          <div className="pdp-qa-solo">{askBox}</div>
        </div>
      </section>
    );
  }

  if (view.kind === 'ask') {
    return (
      <section className="section" id="pdp-qa" data-testid="pdp-qa">
        <div className="container">
          {head}
          <div className="pdp-box p20 pdp-qa-solo">
            <Ask c={c} href={wa!} lead={hours ? t('qa.askEmptyHours', { hours }) : t('qa.askEmpty')} cls="pdp-qa-wa0" />
          </div>
          {askBox ? <div className="pdp-qa-solo mt12">{askBox}</div> : null}
        </div>
      </section>
    );
  }

  const lead = hours ? t('qa.askHours', { hours }) : t('qa.askLead');
  const f = view.featured;
  const folded = view.first.length > 0;
  return (
    <section className="section" id="pdp-qa" data-testid="pdp-qa">
      <div className="container">
        {head}
        <div className={`split${f && folded ? '' : ' pdp-qa-one'}`}>
          {f ? (
            <div className="pdp-box p20 pdp-qa-top" data-testid="qa-featured">
              <div className="row top pdp-qa-row">
                <span className="tag dark">{t('qa.q')}</span>
                <div className="small bold">{f.question}</div>
              </div>
              <div className="row top mt12 pdp-qa-row">
                <span className="tag">{t('qa.a')}</span>
                <div>
                  <div className="small text2 pdp-qa-text">{f.answer}</div>
                  {set.answeredBy ? (
                    <div className="xs muted mt8">
                      {f.answeredAt ? t('qa.byDated', { ...c.vars, date: dateText(c, f.answeredAt) }) : t('qa.by', c.vars)}
                    </div>
                  ) : null}
                </div>
              </div>
              {view.ask === 'split' || view.ask === 'featured' ? <Ask c={c} href={wa!} lead={lead} cls={view.ask === 'split' ? 'hide-m pdp-qa-wad' : ''} /> : null}
            </div>
          ) : null}
          {folded ? (
            <div className="pdp-box p20 pdp-qa-more" data-testid="pdp-qa-more">
              <div className="h3">{t('qa.more')}</div>
              {view.first.map((r) => (
                <Item key={r.id} row={r} />
              ))}
              {view.rest.length ? (
                <details className="pdp-qa-rest">
                  <summary className="pdp-qa-all" data-testid="qa-all">
                    <span>{t('qa.all')}</span>
                    <span className="pdp-qa-n">{t('qa.allN', { n: c.num(view.rest.length) })}</span>
                    <Icon name="down" size={16} />
                  </summary>
                  {view.rest.map((r) => (
                    <Item key={r.id} row={r} />
                  ))}
                </details>
              ) : null}
              {view.ask === 'split' || view.ask === 'list' ? <Ask c={c} href={wa!} lead={lead} cls={view.ask === 'split' ? 'hide-d' : ''} /> : null}
            </div>
          ) : null}
        </div>
        {askBox ? <div className={`mt12${f && folded ? '' : ' pdp-qa-solo'}`}>{askBox}</div> : null}
      </div>
    </section>
  );
}
