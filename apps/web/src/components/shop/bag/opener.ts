// PR 106 — the button that opened the added-to-bag panel, so the panel can hand keyboard focus back to it when it
// closes (checklist L33.25). One per tab; a button that has left the page is skipped.
let opener: HTMLElement | null = null;

export function rememberOpener(el: HTMLElement | null): void {
  opener = el;
}

export function focusOpener(): void {
  const el = opener;
  opener = null;
  if (el && el.isConnected) el.focus({ preventScroll: true });
}
