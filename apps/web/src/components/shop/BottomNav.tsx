// PR 40 — the phone's bottom bar (`shell.menu.bottom`: 3–5 items, each well over 44 px wide on a 320 px phone). The
// bag keeps its count (PR 105: the bag's piece count, a dot on the icon). Hidden on a desktop (CSS).
import type { ShopContext } from '@/lib/shop/context';
import { bottomItems, isCurrent } from '@/lib/shop/shell-model';
import { Icon } from './Icon';

export function BottomNav({ c, bagCount = 0 }: { c: ShopContext; bagCount?: number }) {
  const items = bottomItems(c.s['shell.menu'], c.t);
  return (
    <nav className="bnav" aria-label={c.t('bottom.label')}>
      {items.map((x) => {
        const raw = x.href.replace(/^\/bn(?=\/|$)/, '') || '/';
        const on = x.kind === 'account' ? isCurrent(c.path, raw) : c.path === raw.split(/[?#]/)[0];
        const bag = x.kind === 'bag';
        const cls = [on ? 'on' : '', bag ? `bn-bag${bagCount ? ' has' : ''}` : ''].filter(Boolean).join(' ');
        return (
          <a key={x.id} className={cls} href={x.href} style={{ position: 'relative' }} aria-current={on ? 'page' : undefined}>
            <Icon name={x.icon} size={bag ? 23 : 21} stroke={bag ? 1.9 : 1.7} />
            {bag && bagCount ? (
              <span className="count-dot" aria-hidden="true" data-testid="bnav-bag-count">
                {c.num(bagCount)}
              </span>
            ) : null}
            <span>{x.label}</span>
          </a>
        );
      })}
    </nav>
  );
}
