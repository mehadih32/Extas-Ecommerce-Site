// PR 98, 100 — "Build your own set" at /combos/build-your-own and /combos/build-your-own/<group> (and /bn/…), in the
// store shell. The group is a set tier rule's key; an unknown one opens the first group with a note.
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { BuildPage, buildMetadata, type BuildSearch } from '@/components/shop/build/BuildPage';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ group?: string[] }>; searchParams: Promise<BuildSearch> };

/** The group's key from the address (one segment at most). */
async function groupOf(props: Props): Promise<string | null | undefined> {
  const parts = (await props.params).group ?? [];
  if (parts.length > 1) return undefined;
  if (!parts[0]) return null;
  try {
    return decodeURIComponent(parts[0]);
  } catch {
    return parts[0];
  }
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const group = await groupOf(props);
  return group === undefined ? {} : buildMetadata(group, await props.searchParams);
}

export default async function BuildYourOwn(props: Props) {
  const group = await groupOf(props);
  if (group === undefined) notFound();
  return <BuildPage group={group} search={await props.searchParams} />;
}
