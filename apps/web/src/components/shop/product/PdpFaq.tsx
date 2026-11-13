// S28 · PR 682 — "Frequently asked questions" on the product page: the product's own questions, then its category's,
// then the shop's, each folded in the browser's own <details> (no script). Nothing while `catalogue.faq` is off or there
// are none. The same list feeds the page's FAQ markup, so search engines see only what a customer can read.
import type { PickedFaq } from '@extas/catalogue';
import type { ShopContext } from '@/lib/shop/context';
import { Icon } from '../Icon';

export function PdpFaq({ c, items }: { c: ShopContext; items: readonly PickedFaq[] }) {
  if (!items.length) return null;
  return (
    <div className="container pdp-faq" data-testid="pdp-faq">
      <div className="pdp-box p20">
        <h2 className="pdp-faq-h">{c.t('pdpx.faq.title')}</h2>
        {items.map((f) => (
          <details key={`${f.scope}:${f.question}`} className="pdp-qa-i" data-scope={f.scope.toLowerCase()}>
            <summary>
              <span className="pdp-qa-q">{f.question}</span>
              <Icon name="plus" size={16} />
            </summary>
            <div className="pdp-qa-a small text2">{f.answer}</div>
          </details>
        ))}
      </div>
    </div>
  );
}
