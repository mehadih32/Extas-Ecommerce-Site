// PR 103 — the sets landing page at /combos and /bn/combos, in the store shell ("Coming soon" while it is switched off).
import type { Metadata } from 'next';
import { CombosHub, combosMetadata } from '@/components/shop/combo/CombosHub';

export const dynamic = 'force-dynamic';

export function generateMetadata(): Promise<Metadata> {
  return combosMetadata();
}

export default function Combos() {
  return <CombosHub />;
}
