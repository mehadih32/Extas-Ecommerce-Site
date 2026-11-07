// Follow-up 155 — which press opens the size guide window (lib/shop/size-guide-link).
import { describe, expect, it } from 'vitest';
import { sizeGuidePress, type PressLike } from './size-guide-link';

const a = { tagName: 'A' };
const el = (hit: unknown) => ({ closest: (sel: string) => (sel === 'a[data-act="size-guide"]' ? hit : null) }) as unknown as EventTarget;
const press = (o: Partial<PressLike> = {}): PressLike => ({ target: el(a), button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, defaultPrevented: false, ...o });

describe('a size guide press (follow-up 155)', () => {
  it('a plain click on (or inside) a marked link opens the window', () => {
    expect(sizeGuidePress(press())).toBe(a);
  });
  it('a modified or middle click, one already handled, or any other link stays a link', () => {
    for (const o of [{ metaKey: true }, { ctrlKey: true }, { shiftKey: true }, { altKey: true }, { button: 1 }, { defaultPrevented: true }, { target: el(null) }, { target: null }])
      expect(sizeGuidePress(press(o))).toBeNull();
  });
});
