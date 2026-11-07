'use client';
// Follow-up 155 (PR 58, 75) — opens the size guide window. The shell (ShellEffects) fetches this module only when a
// "Size guide" link (`data-act="size-guide"`: the footer's, the menu's, the size guide page's own button) is pressed,
// so no page carries the window's code or data before. It asks GET /api/shop/size-guide in the page's language once
// per page, draws the window in its own small React root and takes it away again on close. With nothing to offer
// (Find My Size off, no chart it can read, the answer failed) the link does what a link does: the size guide page.
import { createRoot, type Root } from 'react-dom/client';
import { splitLang } from '@/lib/shop/lang';
import type { SizeGuideAnswer } from '@/lib/shop/size-guide-api';
import { SizeGuideWindow } from './SizeGuideWindow';

export const SIZE_GUIDE_API = '/api/shop/size-guide';

let asked: Promise<SizeGuideAnswer | null> | null = null;
let open: { root: Root; el: HTMLElement } | null = null;

function answer(lang: string): Promise<SizeGuideAnswer | null> {
  asked ??= fetch(`${SIZE_GUIDE_API}?lang=${lang}`, { headers: { accept: 'application/json' } })
    .then((r) => (r.ok ? (r.json() as Promise<SizeGuideAnswer>) : null))
    .catch(() => null)
    .then((a) => {
      if (!a) asked = null; // a failed answer is asked again next time
      return a;
    });
  return asked;
}

function close(): void {
  const o = open;
  open = null;
  if (!o) return;
  o.root.unmount();
  o.el.remove();
}

/** Opens the window for a pressed link; false when the link should simply be followed. */
export async function openSizeGuide(from: HTMLAnchorElement): Promise<boolean> {
  if (open) return true;
  from.setAttribute('aria-busy', 'true');
  const a = await answer(splitLang(location.pathname).lang);
  from.removeAttribute('aria-busy');
  if (!a?.finder || !a.entries.length) return false;
  if (open) return true;
  const el = document.createElement('div');
  el.setAttribute('data-size-guide', '');
  document.body.appendChild(el);
  const root = createRoot(el);
  open = { root, el };
  root.render(<SizeGuideWindow data={{ ...a, finder: a.finder }} opener={from} onClose={close} />);
  return true;
}
