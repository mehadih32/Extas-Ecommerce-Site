// PR 45 / 222 · follow-ups 35, 61 — the page's JSON-LD blocks (lib/shop/structured-data), drawn on the server in the
// first response; `<` is escaped so no name can end the script early. Nothing is drawn for an empty block.
import { ldJson } from '@/lib/shop/structured-data';

export function JsonLd({ data }: { data: ReadonlyArray<Record<string, unknown> | null> }) {
  const list = data.filter((d): d is Record<string, unknown> => d !== null);
  if (!list.length) return null;
  return (
    <>
      {list.map((d, i) => (
        <script key={i} type="application/ld+json" data-testid="json-ld" dangerouslySetInnerHTML={{ __html: ldJson(d) }} />
      ))}
    </>
  );
}
