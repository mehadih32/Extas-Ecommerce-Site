// PR 40 / 501 — the store header, drawn from settings exactly as the approved demo draws it (03-layout.js storeHeader):
// the announcement bar, the menu button and the wordmark with its slogan, the desktop nav row and the icons in the
// owner's order (`shell.header`). The bag can never be switched off — it is how every order starts. The desktop
// wordmark wears the owner's logo style (`brand.logoStyle`, H5); the phone wordmark never changes.
import type { ShopIcon } from '@extas/settings';
import type { ShopContext } from '@/lib/shop/context';
import { hrefIn } from '@/lib/shop/lang';
import { waHref } from '@/lib/shop/links';
import { ROUTES } from '@/lib/shop/routes';
import { deskNavItems, liveAnnouncements, phoneMenuRows, helpRows, type ShopCategory } from '@/lib/shop/shell-model';
import { AnnounceBar } from './AnnounceBar';
import { DeskNav, type MegaData } from './DeskNav';
import { Icon, WaGlyph } from './Icon';
import { LangSwitch } from './LangSwitch';
import { LogoText } from './LogoText';
import { MenuButton, type MenuData } from './MenuButton';

function Slogan({ c, where }: { c: ShopContext; where: 'phone' | 'desk' }) {
  const h = c.s['shell.header'].slogan;
  const full = c.s['brand.slogan'];
  if (!h.on || !h[where] || !full) return null;
  const f = full[c.lang] || full.en;
  const short = c.s['brand.sloganShort'];
  const sh = short ? short[c.lang] || short.en : '';
  return (
    <span className={`sb-slog sb-slog-${where}`} data-l="0">
      <span className="sb-sf">{f}</span>
      {sh && sh !== f ? <span className="sb-ss">{sh}</span> : null}
    </span>
  );
}

export function HeaderWa({ c, auto = false }: { c: ShopContext; auto?: boolean }) {
  const href = waHref(c.s['contact.whatsapp'], c.t('header.waMessage', c.vars));
  if (!href) return null;
  const tip = c.t('header.waTip');
  return (
    <a className={`hdr-wa${auto ? ' hdr-wa-auto' : ''}`} href={href} target="_blank" rel="noopener" aria-label={c.t('header.waLabel', { tip })} data-testid="hdr-wa">
      <span className="hdr-wa-disc">
        <WaGlyph size={22} />
      </span>
      <span className="hdr-wa-tip" role="tooltip">
        {tip}
      </span>
    </a>
  );
}

function megaFor(c: ShopContext, cats: readonly ShopCategory[]): Record<string, MegaData> {
  const out: Record<string, MegaData> = {};
  for (const cat of cats) {
    const name = c.lang === 'bn' && cat.nameBn ? cat.nameBn : cat.nameEn;
    out[cat.slug] = {
      title: c.t('nav.megaShop', { name }),
      name,
      styles: cat.count === 1 ? c.t('nav.style') : c.t('nav.styles', { n: c.num(cat.count) }),
      all: { href: hrefIn(c.lang, ROUTES.category(cat.slug)), label: c.t('nav.megaAll', { name }), n: c.num(cat.count) },
      links: cat.children
        .filter((k) => k.count > 0)
        .map((k) => ({ href: hrefIn(c.lang, ROUTES.category(k.slug)), label: c.lang === 'bn' && k.nameBn ? k.nameBn : k.nameEn, n: c.num(k.count) })),
    };
  }
  return out;
}

export function menuData(c: ShopContext): MenuData {
  const m = c.s['shell.menu'];
  const t = c.t;
  const quickIcon: Record<string, ShopIcon> = { search: 'search', bag: 'bag', wish: 'heart', account: 'user' };
  const quickHref: Record<string, string> = { search: ROUTES.search, bag: ROUTES.bag, wish: ROUTES.wishlist, account: ROUTES.account };
  return {
    title: t('menu.title'),
    close: t('menu.close'),
    quick: m.quick.filter((q) => q.on).map((q) => ({ id: q.id, href: hrefIn(c.lang, quickHref[q.id]!), label: t(`quick.${q.id}`), icon: quickIcon[q.id]! })),
    rows: phoneMenuRows(m, c.cats, t),
    helpTitle: t.label(m.helpTitle),
    help: helpRows(m, t),
    wa: { href: waHref(c.s['contact.whatsapp'], t('footer.waMessage', c.vars)), label: t('menu.whatsapp') },
    hotline: c.s['contact.phone'] ? { href: `tel:${c.s['contact.phone'].replace(/[^\d+]/g, '')}`, label: t('menu.hotline', { number: c.s['contact.phone'] }) } : null,
    hours: c.s['contact.hours'] ? c.s['contact.hours'][c.lang] || c.s['contact.hours'].en : null,
  };
}

export function StoreHeader({ c, bagCount = 0 }: { c: ShopContext; bagCount?: number }) {
  const t = c.t;
  const head = c.s['shell.header'];
  const home = hrefIn(c.lang, ROUTES.home);
  const announcements = liveAnnouncements(c.s['shell.announce'], c.today, c.flags, t, c.vars);
  const sD = <Slogan c={c} where="desk" />;
  const sP = <Slogan c={c} where="phone" />;
  const hasSlogan = (w: 'phone' | 'desk') => Boolean(head.slogan.on && head.slogan[w] && c.s['brand.slogan']);
  const nav = deskNavItems(c.s['shell.menu'], c.s['shell.desktopNav'], c.cats, t, c.path);
  const icons: Record<string, () => React.ReactNode> = {
    whatsapp: () => <HeaderWa key="wa" c={c} />,
    search: () => (
      <a key="search" className="iconbtn" href={hrefIn(c.lang, ROUTES.search)} aria-label={t('header.search')} data-tip={t('header.search')}>
        <Icon name="search" size={21} />
      </a>
    ),
    wish: () => (
      <a
        key="wish"
        className={`iconbtn hdr-wish${head.wishOnPhone ? '' : ' hide-m'}`}
        href={hrefIn(c.lang, ROUTES.wishlist)}
        aria-label={t('header.wishlist')}
        data-tip={t('header.wishlist')}
      >
        <Icon name="heart" size={22} />
      </a>
    ),
    account: () => (
      <a key="account" className="iconbtn hide-m" href={hrefIn(c.lang, ROUTES.account)} aria-label={t('header.account')} data-tip={t('header.login')}>
        <Icon name="user" size={21} />
      </a>
    ),
    bag: () => (
      <a key="bag" className={`iconbtn hdr-bag${bagCount ? ' has' : ''}`} href={hrefIn(c.lang, ROUTES.bag)} aria-label={t('header.bagItems', { n: c.num(bagCount) })} data-tip={t('header.bag')}>
        <Icon name="bag" size={25} stroke={1.9} />
        {bagCount ? (
          <span className="count-dot" aria-hidden="true" data-testid="hdr-bag-count">
            {c.num(bagCount)}
          </span>
        ) : null}
      </a>
    ),
  };
  const seen = new Set<string>();
  const right: React.ReactNode[] = [];
  for (const x of head.icons) {
    if (seen.has(x.id) || !icons[x.id]) continue;
    seen.add(x.id);
    if (x.on || x.id === 'bag') right.push(icons[x.id]!());
  }
  if (!seen.has('bag')) right.push(icons.bag!());
  const mega = c.s['shell.desktopNav'].mega ? megaFor(c, c.cats) : {};
  return (
    <>
      <AnnounceBar items={announcements} rotateSeconds={c.s['shell.announce'].rotateSeconds} />
      <header className="hdr">
        <div className="container hdr-in">
          <div className="row" style={{ gap: 2 }}>
            <MenuButton label={t('header.menu')} data={menuData(c)} lang={<LangSwitch c={c} />} />
            <a className={`logo hide-m${hasSlogan('desk') ? ' sb-hasslog' : ''}`} href={home}>
              <LogoText text={c.storeName} styleNo={c.s['brand.logoStyle']} />
              {sD}
            </a>
          </div>
          <a className={`logo hide-d${hasSlogan('phone') ? ' sb-hasslog' : ''}`} href={home}>
            {c.storeName}
            {sP}
          </a>
          <DeskNav
            label={t('nav.main')}
            items={nav}
            layout={c.s['shell.desktopNav'].layout}
            megaStyle={c.s['shell.desktopNav'].megaStyle}
            allStyles={t('nav.allStyles')}
            mega={mega}
            enterMs={c.s['shell.desktopNav'].megaEnterMs}
            leaveMs={c.s['shell.desktopNav'].megaLeaveMs}
          />
          <div className="row hdr-r" style={{ gap: 2 }}>
            {right}
          </div>
        </div>
      </header>
    </>
  );
}
