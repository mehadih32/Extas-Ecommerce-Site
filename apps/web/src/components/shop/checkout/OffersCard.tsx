'use client';
// PR 122 — "Your offers" (demo 51-checkout.js co_offers): a signed-in customer with money in his wallet ticks "Use my
// wallet" to pay from it; the amount it takes off this order shows beside his balance and as its own line (on a phone
// the summary is folded away, CO27). The offers themselves are lines of the summary.
import type { WalletView } from '@extas/checkout/pure';

export function OffersCard({ wallet, w, m, onToggle }: { wallet: WalletView | null; w: (k: string, v?: Record<string, string | number>) => string; m: (minor: number) => string; onToggle: (on: boolean) => void }) {
  if (!wallet) return null;
  return (
    <section className="card co-sec" data-testid="co-offers">
      <div className="h3">{w('wallet.title')}</div>
      <div className="stack s12 mt12">
        <label className="check">
          <input type="checkbox" checked={wallet.on} onChange={(e) => onToggle(e.target.checked)} data-testid="co-wallet" />
          <span>
            {w('wallet.use')} <b>{m(wallet.balanceMinor)}</b>
            {wallet.usedMinor > 0 ? <span className="brandc"> · {w('wallet.onOrder', { amount: `−${m(wallet.usedMinor)}` })}</span> : null}
          </span>
        </label>
        {wallet.usedMinor > 0 ? (
          <div className="row between small" data-testid="co-wallet-row">
            <span>{w('wallet.row')}</span>
            <b className="brandc">−{m(wallet.usedMinor)}</b>
          </div>
        ) : null}
      </div>
    </section>
  );
}
