// PR 40 — the slim checkout header (demo 03-layout.js slimHeader, R15 3.2): back to the bag and the wordmark on the
// left, the three steps in the middle (desktop), and "Secure" with its lock on the right. The header's WhatsApp waits
// hidden while the page's own "Need help?" button is on screen and fades in once that scrolls away (ShellEffects).
import type { ShopContext } from '@/lib/shop/context';
import { hrefIn } from '@/lib/shop/lang';
import { ROUTES } from '@/lib/shop/routes';
import { Icon } from './Icon';
import { HeaderWa } from './StoreHeader';

function Step({ n, label, on, done }: { n: string; label: string; on: boolean; done: boolean }) {
  return (
    <span className={`ckh-s${on ? ' on' : ''}${done ? ' done' : ''}`}>
      <span className="n">{done ? <Icon name="check" size={12} /> : n}</span>
      {label}
    </span>
  );
}

export function SlimHeader({ c, done = false }: { c: ShopContext; done?: boolean }) {
  const t = c.t;
  return (
    <header className="hdr ckh">
      <div className="container hdr-in">
        <span className="ckh-l">
          {done ? (
            <a className="iconbtn" href={hrefIn(c.lang, ROUTES.home)} aria-label={t('checkout.home')}>
              <Icon name="home" size={21} />
            </a>
          ) : (
            <a className="iconbtn" href={hrefIn(c.lang, ROUTES.bag)} aria-label={t('checkout.backToBag')}>
              <Icon name="back" size={21} />
            </a>
          )}
          <a className="logo" href={hrefIn(c.lang, ROUTES.home)}>
            {c.storeName}
          </a>
        </span>
        <span className="ckh-steps dm-only">
          <Step n={c.num(1)} label={t('checkout.stepBag')} on={false} done />
          <span className="ckh-d" />
          <Step n={c.num(2)} label={t('checkout.stepDelivery')} on={!done} done={done} />
          <span className="ckh-d" />
          <Step n={c.num(3)} label={t('checkout.stepDone')} on={done} done={false} />
        </span>
        <span className="row ckh-rr" style={{ gap: 10 }}>
          <HeaderWa c={c} auto />
          <span className="row xs bold brandc ckh-r" style={{ gap: 5 }}>
            <Icon name="lock" size={15} />
            {t('checkout.secure')}
          </span>
        </span>
      </div>
    </header>
  );
}
