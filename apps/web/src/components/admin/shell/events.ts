// PR 12 — how a page asks the shell to open its panels (the guide, the search palette) without holding the shell's
// state: a window event the shell listens for. A page drawn on the server uses the small client buttons that send them.
export const GUIDE_EVENT = 'a2:guide';
export const PALETTE_EVENT = 'a2:palette';

export interface GuideRequest {
  slug: string;
  /** The section's name, for the panel's title. */
  section: string;
}

export function openGuide(detail: GuideRequest): void {
  window.dispatchEvent(new CustomEvent<GuideRequest>(GUIDE_EVENT, { detail }));
}

export function openPalette(): void {
  window.dispatchEvent(new CustomEvent(PALETTE_EVENT));
}
