// Follow-up 155 (PR 58, 75) — which press opens the size guide window instead of following its link: a plain left click
// (or Enter) on a link marked `data-act="size-guide"` (the footer's "Size guide", the size guide page's own button).
// A press with Ctrl, Cmd, Shift or Alt, a middle click, or one a part of the page already handled stays a link (a new
// tab, a new window: the size guide page).
export const SIZE_GUIDE_ACT = 'size-guide';

export interface PressLike {
  target: EventTarget | null;
  button: number;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  defaultPrevented: boolean;
}

export function sizeGuidePress(e: PressLike): HTMLAnchorElement | null {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return null;
  const t = e.target;
  if (!t || typeof (t as Element).closest !== 'function') return null;
  const a = (t as Element).closest(`a[data-act="${SIZE_GUIDE_ACT}"]`);
  return a && a.tagName === 'A' ? (a as HTMLAnchorElement) : null;
}
