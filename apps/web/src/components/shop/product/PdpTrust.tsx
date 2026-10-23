// PR 62 — the promise row under the buttons (Blueprint D3.5, demo 30-product.js pdp_trust): three short promises in
// three columns on one row, each only while it is true (lib/shop/pdp-trust). Drawn on the server: nothing in it
// changes with the shopper's choice.
import { Icon } from '../Icon';
import type { TrustId } from '@/lib/shop/pdp-trust';
import { Bold } from './Bold';

const ICON: Record<TrustId, 'swap' | 'truck' | 'shield'> = { exchange: 'swap', freeDelivery: 'truck', original: 'shield' };

export function PdpTrust({ items }: { items: { id: TrustId; text: string }[] }) {
  if (!items.length) return null;
  return (
    <div className="pdp-sec pdp-trust" data-testid="pdp-trust" data-n={items.length}>
      {items.map((it) => (
        <span key={it.id} data-id={it.id}>
          <Icon name={ICON[it.id]} size={16} />
          <Bold text={it.text} />
        </span>
      ))}
    </div>
  );
}
