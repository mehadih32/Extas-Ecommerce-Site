// PR 75 — a help page (demo 71-pages.js pg_render / pg_contact; desktop help centre D-017, r12-zzdesk-a.css §11): the
// title and its line, the questions as an accordion (native <details>: it works before any script, by touch, mouse and
// keyboard), the rules' texts and the owner's words in a card, the store's details, the ways to reach the shop on the
// contact page, and "Still need a hand?" with WhatsApp. On a computer: the topic list on the left, the breadcrumb, and
// "Still stuck?" with WhatsApp and the hotline on the right. Server-drawn, no script of its own.
import './help.css';
import type { HelpSlug } from '@extas/settings';
import type { ShopContext } from '@/lib/shop/context';
import type { HelpData } from '@/lib/shop/help-data';
import { helpTopics, type TextBlock } from '@/lib/shop/help-pages';
import { hrefIn } from '@/lib/shop/lang';
import { telHref, waHref } from '@/lib/shop/links';
import { ROUTES } from '@/lib/shop/routes';
import { Icon, WaGlyph } from '../Icon';
import { contactFormWords } from '@/lib/shop/contact-form-words';
import { ContactForm } from './ContactForm';

function Blocks({ blocks }: { blocks: TextBlock[] }) {
  return (
    <>
      {blocks.map((b, i) =>
        b.kind === 'h' ? (
          <h2 key={i}>{b.text}</h2>
        ) : b.kind === 'p' ? (
          <p key={i}>{b.text}</p>
        ) : (
          <ul key={i}>
            {b.items.map((x, j) => (
              <li key={j}>{x}</li>
            ))}
          </ul>
        ),
      )}
    </>
  );
}

export function HelpPage({ c, slug, data }: { c: ShopContext; slug: HelpSlug; data: HelpData }) {
  const t = c.t;
  const m = data.models[slug];
  const { set, facts } = data;
  const shown = new Set((Object.keys(data.models) as HelpSlug[]).filter((s) => !data.models[s].soon));
  const titles = Object.fromEntries(Object.entries(data.models).map(([s, x]) => [s, x.title])) as Record<HelpSlug, string>;
  const topics = set.desk ? helpTopics(set, shown, slug, c.lang, titles) : [];
  const wa = waHref(facts.whatsapp, facts.waText);
  const tel = telHref(facts.phone);
  const firstHelp = topics[0]?.href ?? hrefIn(c.lang, ROUTES.help('faq'));
  const rules = (['delivery', 'exchange'] as const).filter((s) => shown.has(s) && s !== slug);
  // PR 75 follow-up: the contact page's form, first in the grid as in the demo, when the shop switched it on
  const form = slug === 'contact' && data.form.on ? contactFormWords(t) : null;

  const page = (
    <div className="pg" data-testid="help-page" data-help={slug}>
      {set.desk ? (
        <nav className="crumbs pg-crumbs hide-m" aria-label={t('helpPage.crumbs')}>
          <a href={hrefIn(c.lang, ROUTES.home)}>{t('helpPage.home')}</a>
          <span aria-hidden="true">/</span>
          <a href={firstHelp}>{t('helpPage.help')}</a>
          <span aria-hidden="true">/</span>
          <span aria-current="page">{m.title}</span>
        </nav>
      ) : null}
      <h1>{m.title}</h1>
      {m.lede ? <p className="pg-lede">{m.lede}</p> : null}

      {m.qa.length ? (
        <div className="card pg-qa" data-testid="help-qa">
          {m.qa.map((q) => (
            <details key={q.id} className="pg-q">
              <summary className="pg-qh">
                <span>{q.q}</span>
                <Icon name="plus" size={17} className="pg-plus" />
                <Icon name="minus" size={17} className="pg-minus" />
              </summary>
              <div className="pg-qb">
                <Blocks blocks={q.a} />
              </div>
            </details>
          ))}
        </div>
      ) : null}

      {m.channels.length || form ? (
        <div className="pg-contact">
          {form ? <ContactForm words={form} lang={c.lang} maxChars={data.form.maxChars} /> : null}
          <div className={form ? 'pg-side' : 'pg-contents'}>
            <div className="pg-chs">
              {m.channels.map((ch) => {
                const inner = (
                  <>
                    <span className="ic">{ch.id === 'whatsapp' ? <WaGlyph size={19} /> : <Icon name={ch.icon} size={19} />}</span>
                    <span>
                      <b>{ch.title}</b>
                      <span>{ch.sub}</span>
                    </span>
                  </>
                );
                return ch.href ? (
                  <a key={ch.id} className="pg-ch" href={ch.href} data-testid={`help-ch-${ch.id}`} {...(ch.external ? { target: '_blank', rel: 'noopener' } : {})}>
                    {inner}
                  </a>
                ) : (
                  <div key={ch.id} className="pg-ch" data-testid={`help-ch-${ch.id}`}>
                    {inner}
                  </div>
                );
              })}
            </div>
            {rules.length ? (
              <div className="card pg-before">
                <div className="h3">{t('helpPage.before')}</div>
                <p className="small text2">{t('helpPage.beforeText')}</p>
                <div className="pg-links">
                  {rules.map((s) => (
                    <a key={s} className="pg-in" href={hrefIn(c.lang, ROUTES.help(s))}>
                      {titles[s]}
                    </a>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {m.sections.length || m.details ? (
        <div className="card pg-body">
          {m.sections.map((s) => (
            <section key={s.id} data-testid={s.id.startsWith('rule-') ? 'help-rule' : 'help-own'}>
              {s.title ? <h2>{s.title}</h2> : null}
              <Blocks blocks={s.blocks} />
            </section>
          ))}
          {m.details ? (
            <section data-testid="help-details">
              <h2>{m.details.title}</h2>
              {m.details.lines.map((l, i) => (
                <p key={i}>{l}</p>
              ))}
            </section>
          ) : null}
        </div>
      ) : null}

      {set.hand && wa && slug !== 'contact' ? (
        <div className="card mt16 pg-hand">
          <span className="small text2">{t('helpPage.hand')}</span>
          <a className="wa-btn" href={wa} target="_blank" rel="noopener">
            <WaGlyph size={18} />
            {t('helpPage.wa')}
          </a>
        </div>
      ) : null}
    </div>
  );

  if (!set.desk) return page;
  return (
    <div className="pg-d">
      {topics.length ? (
        <nav className="pg-rail hide-m" aria-label={t('helpPage.topics')}>
          <div className="pg-rail-h">{t('helpPage.centre')}</div>
          {topics.map((x) => (
            <a key={x.slug} className={x.current ? 'pg-rail-a on' : 'pg-rail-a'} href={x.href} {...(x.current ? { 'aria-current': 'page' as const } : {})}>
              <Icon name={x.icon} size={17} />
              <span>{x.label}</span>
            </a>
          ))}
        </nav>
      ) : (
        <div className="hide-m" />
      )}
      <div className="pg-mid">{page}</div>
      {wa || tel ? (
        <aside className="pg-aside hide-m">
          <div className="card pg-stuck">
            <div className="h3">{t('helpPage.stuck')}</div>
            <p className="small text2">{facts.hours ? t('helpPage.stuckHours', { hours: facts.hours }) : t('helpPage.stuckText')}</p>
            {wa ? (
              <a className="wa-btn" href={wa} target="_blank" rel="noopener">
                <WaGlyph size={18} />
                {t('helpPage.wa')}
              </a>
            ) : null}
            {tel && facts.phone ? (
              <a className="btn btn-ghost btn-block mt8" href={tel}>
                <Icon name="phone" size={16} />
                {t('helpPage.hotline', { number: facts.phone })}
              </a>
            ) : null}
          </div>
        </aside>
      ) : (
        <div className="hide-m" />
      )}
    </div>
  );
}
