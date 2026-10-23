// PR 91–95 — one combo's page at /combo/<link> and /bn/combo/<link> (a fixed set or a generated colour pair), in the
// store shell. The link is the one the admin's combo list shows.
import type { Metadata } from 'next';
import { ComboPage, comboMetadata, type ComboSearch } from '@/components/shop/combo/ComboPage';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<ComboSearch> };

const slugOf = (raw: string) => {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
};

export async function generateMetadata(props: Props): Promise<Metadata> {
  return comboMetadata(slugOf((await props.params).slug), await props.searchParams);
}

export default async function Combo(props: Props) {
  return <ComboPage slug={slugOf((await props.params).slug)} search={await props.searchParams} />;
}
