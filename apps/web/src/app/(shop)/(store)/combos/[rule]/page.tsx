// PR 572 — one auto colour-pair rule's own page at /combos/<rule key> and /bn/combos/<rule key>, in the store shell, in
// the template the rule or the shop chose (L1–L5). "build-your-own" is its own page beside it.
import type { Metadata } from 'next';
import { RuleList, ruleListMetadata } from '@/components/shop/combo/RuleList';
import type { Search } from '@/lib/shop/combo-list-model';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ rule: string }>; searchParams: Promise<Search> };

const keyOf = (raw: string) => {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
};

export async function generateMetadata(props: Props): Promise<Metadata> {
  return ruleListMetadata(keyOf((await props.params).rule), await props.searchParams);
}

export default async function ComboRule(props: Props) {
  return <RuleList ruleKey={keyOf((await props.params).rule)} search={await props.searchParams} />;
}
