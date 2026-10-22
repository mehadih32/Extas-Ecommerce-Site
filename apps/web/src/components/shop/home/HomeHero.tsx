// PR 41 — the home hero's text panel (demo 20-home.js hm_hero): the small line, the title, the line under it (one
// sentence per line on a desktop, H1), one to three buttons sharing the row (Note 3.12) and the promise lines under
// them — one line with a bar between them on a phone, the desktop's own wording in two columns (H2). A promise line
// shows only when its rule is on. Every word, link and look is the setting `home.hero`. `media` is the sliding
// picture panel beside the text (PR 43); without it the panel is the text alone.
import { Fragment, type CSSProperties, type ReactNode } from 'react';
import type { ShopContext } from '@/lib/shop/context';
import { heroButtons, heroTrust, sentences, type HeroTrust } from '@/lib/shop/home-model';
import { Icon } from '../Icon';

function TrustRow({ items, desk }: { items: HeroTrust[]; desk: boolean }) {
  return (
    <div className={desk ? `hm-hero-trust hm-trust-d n${items.length} hide-m` : 'hm-hero-trust hide-d'}>
      {items.map((x, i) => (
        <Fragment key={x.id}>
          {i > 0 ? <i className="hm-trust-bar" aria-hidden="true" /> : null}
          <span>
            <Icon name={x.icon} size={15} />
            {desk ? x.desk : x.text}
          </span>
        </Fragment>
      ))}
    </div>
  );
}

export function HomeHero({ c, media }: { c: ShopContext; media?: ReactNode }) {
  const hero = c.s['home.hero'];
  const eyebrow = c.t.label(hero.eyebrow, c.vars);
  const title = c.t.label(hero.title, c.vars);
  const sub = c.t.label(hero.sub, c.vars);
  const buttons = heroButtons(hero, c.t, c.vars);
  const trust = heroTrust(hero, c.flags, c.t, c.vars);
  const style = hero.shift ? ({ '--hero-shift': `${hero.shift}px` } as CSSProperties) : undefined;
  return (
    <section className="hm-hero" aria-label={eyebrow || title} style={style}>
      <div className="container hm-hero-in">
        <div className="hm-hero-txt">
          {eyebrow ? <div className="eyebrow">{eyebrow}</div> : null}
          {title ? <h1 className="display hm-hero-title">{title}</h1> : null}
          {sub ? (
            <p className="hm-hero-sub">
              {sentences(sub).map((s, i) => (
                <Fragment key={i}>
                  {i > 0 ? ' ' : null}
                  <span className="hm-sub-s">{s}</span>
                </Fragment>
              ))}
            </p>
          ) : null}
          {buttons.length ? (
            <div className={`hm-hero-btns n${buttons.length}`}>
              {buttons.map((b) => (
                <a key={b.id} className={b.className} href={b.href}>
                  {b.label}
                </a>
              ))}
            </div>
          ) : null}
          {trust.length ? (
            <>
              <TrustRow items={trust} desk={false} />
              <TrustRow items={trust} desk />
            </>
          ) : null}
        </div>
        {media ? <div className="hm-hero-media">{media}</div> : null}
      </div>
    </section>
  );
}
