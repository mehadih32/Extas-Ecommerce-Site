// The shop's one short message at the bottom of the screen (demo 02-core.js toast()): a status line that goes away on
// its own after a few seconds. Drawn inside the shop wrapper, so it wears the theme.
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
