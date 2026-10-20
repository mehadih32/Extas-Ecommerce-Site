// S10 · PR 215 — a rule's text where the storefront shows it ("Exchange within 72 hours for size or fault" on the
// product page, the bag and the invoice): read from the live rule on the server, never written in the page. Plain
// markup with no styling of its own — the storefront owner (S02) gives it a class. Nothing is drawn when the rule is
// not live or a value it needs is not set yet.
import type { TextSlot } from '@extas/rules/pure';
import { ruleText } from '@/lib/rules-public';

export async function RuleText({ storeId, ruleKey, slot = 'short', locale, className, as: Tag = 'span' }: { storeId: number; ruleKey: string; slot?: TextSlot; locale?: string; className?: string; as?: 'span' | 'p' | 'div' }) {
  const text = await ruleText({ storeId, key: ruleKey, slot, ...(locale ? { locale } : {}) });
  if (!text) return null;
  return (
    <Tag className={className} data-rule={ruleKey} data-slot={slot}>
      {text}
    </Tag>
  );
}
