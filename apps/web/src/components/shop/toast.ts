// The shop's one short message at the bottom of the screen (demo 02-core.js toast()): a status line that goes away on
// its own after a few seconds. Drawn inside the shop wrapper, so it wears the theme.
import { holdOn, holdTimer } from '@/lib/shop/hold-timer';

const SHOW_MS = 2600;
let timer: ReturnType<typeof setTimeout> | undefined;

export function showToast(from: Element, text: string): void {
  const host = from.closest('.shop') ?? document.body;
  host.querySelector('.toast')?.remove();
  const d = document.createElement('div');
  d.className = 'toast';
  d.setAttribute('role', 'status');
  d.textContent = text;
  host.appendChild(d);
  clearTimeout(timer);
  timer = setTimeout(() => d.remove(), SHOW_MS);
}

/**
 * PR 91 · the message with a way on (demo cb_toast: "Polo + Chino (Navy + Khaki) added to your bag · View bag"): it
 * stays a little longer, and holds while a mouse rests on it or the keyboard is on its link (lib/shop/hold-timer).
 */
export function showLinkToast(from: Element, text: string, link: { href: string; label: string; testId?: string }, ms: number): void {
  const host = from.closest('.shop') ?? document.body;
  host.querySelector('.toast')?.remove();
  clearTimeout(timer);
  const d = document.createElement('div');
  d.className = 'toast cb-toast';
  d.setAttribute('role', 'status');
  const span = document.createElement('span');
  span.textContent = text;
  const a = document.createElement('a');
  a.href = link.href;
  a.textContent = link.label;
  if (link.testId) a.setAttribute('data-testid', link.testId);
  d.append(span, a);
  host.appendChild(d);
  holdOn(d, holdTimer({ ms, onDone: () => d.remove() }));
}

/** Takes the status line away now (PR 49): a popup that opens over it — the added-to-bag panel — must not sit under
 * an older message ("White selected") that covers its buttons. */
export function hideToast(from: Element): void {
  (from.closest('.shop') ?? document.body).querySelector('.toast')?.remove();
}
