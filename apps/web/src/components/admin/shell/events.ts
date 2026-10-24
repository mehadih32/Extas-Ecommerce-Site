// PR 12 — how a page asks the shell to open its panels (the guide, the search palette) without holding the shell's
// state: a window event the shell listens for. A page drawn on the server uses the small client buttons that send them.
export const GUIDE_EVENT = 'a2:guide';
export const PALETTE_EVENT = 'a2:palette';
/** PR 12 (CN-025): the "To do" drawer (the top bar's tray, the T key, a page's "All lists" button). */
export const TODO_EVENT = 'a3:todo';

export interface GuideRequest {
  /** One guide by its file name (docs/admin-guide/<slug>.md: the palette's section guides). */
  slug?: string;
  /** PR 594 (CN-026): the guide of the page at this address (the page the person is on). */
  path?: string;
  /** PR 594: one page guide by its id (`<section>/<page>`, a tap on the section's page list). */
  page?: string;
  /** The section's name, for the panel's title until the guide has loaded. */
  section: string;
}

export function openGuide(detail: GuideRequest): void {
  window.dispatchEvent(new CustomEvent<GuideRequest>(GUIDE_EVENT, { detail }));
}

export function openPalette(): void {
  window.dispatchEvent(new CustomEvent(PALETTE_EVENT));
}

export function openTodo(): void {
  window.dispatchEvent(new CustomEvent(TODO_EVENT));
}
