// PR 574 — what the bag reads on the server to draw its sets in the templates B1–B5: each set's look (its own, or a
// `?btpl=` preview while `combos.template.preview` is on), B5's compact rows from `combos.bag.compactFrom` sets, and
// B3's "Add 1 more" from the pair's rule as its own page reads it (@extas/combos `rulePage`: the 3-piece companion's
// pairs, stock and set prices). A slow database or a rule that is not on sale only leaves "Add 1 more" out.
import type { BagSetView } from '@extas/cart';
import { rulePage } from '@extas/combos';
import { settingsTimeoutMs, withTimeout } from '../settings';
import { cartDeps } from './bag';
import { readPageSettings } from './context';
import { bagDrawOf, bagTemplateOf, nudgeOf, type BagDraw, type BagTemplate, type Nudge } from './combo-bag-model';

export const BAG_SET_KEYS = ['combos.bag.compactFrom', 'combos.template.preview'] as const;

export interface BagSetLooks {
  /** The template the page shows (a preview, else the shop's — for the preview bar). */
  preview: BagTemplate | null;
  draw: Map<string, BagDraw>;
  nudges: Map<string, Nudge>;
}

export async function bagSetLooks(storeId: number, sets: readonly BagSetView[], btpl: string | null): Promise<BagSetLooks> {
  const s = await readPageSettings(BAG_SET_KEYS, storeId);
  const previewOn = s['combos.template.preview'];
  const preview = previewOn && btpl ? bagTemplateOf('current', btpl, true) : null;
  const draw = new Map(sets.map((x) => [x.groupKey, bagDrawOf(bagTemplateOf(x.bagTemplate, btpl, previewOn), sets.length, s['combos.bag.compactFrom'])] as const));
  const nudges = new Map<string, Nudge>();
  const deps = cartDeps();
  const wanted = sets.filter((x) => draw.get(x.groupKey) === 'B3' && x.ruleId && x.pieces.length === 2);
  if (deps && wanted.length) {
    try {
      await withTimeout(
        Promise.all(
          [...new Set(wanted.map((x) => x.ruleId!))].map(async (ruleId) => {
            const page = await rulePage(deps, storeId, { id: ruleId });
            const side = page?.companion && page.companion.onSale ? page.companion : null;
            for (const x of wanted.filter((w) => w.ruleId === ruleId)) {
              const n = nudgeOf(x.pieces, side);
              if (n) nudges.set(x.groupKey, n);
            }
          }),
        ),
        settingsTimeoutMs(),
      );
    } catch {
      // "Add 1 more" is a nudge: without it the set still shows, and can still change size
    }
  }
  return { preview, draw, nudges };
}
