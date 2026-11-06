// S02 · PR 83 — version B on a shop page. For one request: which running tests show B to this visitor (his random id is
// the bag's own cookie, or the one the proxy just gave him), counted once per test (lib/experiments/live.ts), and the
// changes laid over the settings the page reads (lib/shop/context.ts). A preview link from Reports › Experiments
// (`?abPreview=<test id>.a|b`, kept from page to page in a session cookie; the proxy copies it into a request header)
// shows that test's version to whoever opens it and counts nothing. Outside a shop page (the admin, an API call, `next build`) nothing changes.
import { cache } from 'react';
import { cookies, headers } from 'next/headers';
import { getPrisma } from '@extas/db/client';
import { BAG_COOKIE } from '../shop/bag-model';
import { PATH_HEADER } from '../shop/lang';
import { AB_PREVIEW_HEADER, AB_VISITOR_HEADER, BOT, previewOf, visitorIdOf } from './edge';
import { liveTests, recordSeen, showing } from './live';
import { bucket, merged, overlay, storedB, type BChanges } from './model';

export interface ShopOverlay {
  b: BChanges;
  /** Lay version B over one setting's value. */
  apply: (key: string, value: unknown) => unknown;
}

const make = (b: BChanges): ShopOverlay | null => (Object.keys(b.eye).length || Object.keys(b.words).length ? { b, apply: (key, value) => overlay(b, key, value) } : null);

async function previewB(id: string): Promise<BChanges | null> {
  const t = await getPrisma().abTest.findFirst({ where: { id, archivedAt: null }, select: { variants: true } });
  return t ? storedB(t.variants) : null;
}

/** Version B for this shop request (null: the shop as it is). Never throws. */
export const shopOverlay = cache(async (storeId: number): Promise<ShopOverlay | null> => {
  try {
    const h = await headers();
    if (!h.get(PATH_HEADER)) return null;
    const preview = previewOf(h.get(AB_PREVIEW_HEADER));
    if (preview) return preview.version === 'b' ? make((await previewB(preview.id)) ?? { eye: {}, words: {} }) : null;
    const live = await liveTests(storeId);
    const tests = showing(live);
    if (!tests.length || BOT.test(h.get('user-agent') ?? '')) return null;
    const visitor = visitorIdOf((await cookies()).get(BAG_COOKIE)?.value) ?? visitorIdOf(h.get(AB_VISITOR_HEADER));
    if (!visitor) return null;
    const shown: BChanges[] = [];
    for (const t of tests) {
      const v = bucket(t.id, visitor, t.shareB);
      recordSeen(storeId, t.id, visitor, v);
      if (v === 'b') shown.push(t.b);
    }
    return make(merged(shown));
  } catch {
    return null;
  }
});

/** Settings with version B laid over them (only the keys B touches change). */
export function withOverlay<T extends Record<string, unknown>>(values: T, ov: ShopOverlay | null): T {
  if (!ov) return values;
  const out: Record<string, unknown> = { ...values };
  for (const k of Object.keys(out)) out[k] = ov.apply(k, out[k]);
  return out as T;
}
