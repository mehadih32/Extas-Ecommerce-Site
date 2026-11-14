'use client';
// PR 726 — Website › Brand & menus: the one way every list on that page is rearranged. A row is grabbed by its handle
// and dragged with a mouse or a finger (pointer events: the handle has `touch-action: none`), dropped before another row
// or into another list of the same kind (footer links between columns), or moved with the arrow keys on the focused handle
// (and the page's own "Move up" / "Move down" buttons). A drop only calls `onDrop`; the card decides what it means, so
// nothing here knows about menus or footers. The pure moves are lib/admin-brand/model (moveBy, dropInto, moveLink).
import { useState, type KeyboardEvent, type PointerEvent } from 'react';

export interface DragFrom {
  kind: string;
  list: string;
  id: string;
}
export interface DragTo {
  list: string;
  /** The row it lands before, or null: at the end of the list. */
  before: string | null;
}

/** Where a point on the screen would drop a row of `kind`: the row under it (upper half: before it, lower half: after it) or the list. */
export function dropTarget(kind: string, x: number, y: number): DragTo | null {
  const el = document.elementFromPoint(x, y);
  let row: HTMLElement | null = null;
  let list: HTMLElement | null = null;
  for (let n: Element | null = el; n; n = n.parentElement) {
    if (!(n instanceof HTMLElement) || n.dataset.slKind !== kind) continue;
    if (n.dataset.slId !== undefined) {
      row = n;
      list = n.closest<HTMLElement>(`[data-sl-list][data-sl-kind="${kind}"]`);
      break;
    }
    if (n.dataset.slList !== undefined) {
      list = n;
      break;
    }
  }
  if (!list) return null;
  const id = list.dataset.slList ?? '';
  if (!row) return { list: id, before: null };
  const r = row.getBoundingClientRect();
  if (y < r.top + r.height / 2) return { list: id, before: row.dataset.slId ?? null };
  let next = row.nextElementSibling;
  while (next && !(next instanceof HTMLElement && next.dataset.slId !== undefined)) next = next.nextElementSibling;
  return { list: id, before: next instanceof HTMLElement ? (next.dataset.slId ?? null) : null };
}

export interface Dragging {
  from: DragFrom | null;
  over: DragTo | null;
  /** The handle's props for one row. */
  grip: (kind: string, list: string, id: string) => {
    onPointerDown: (e: PointerEvent<HTMLElement>) => void;
    onPointerMove: (e: PointerEvent<HTMLElement>) => void;
    onPointerUp: (e: PointerEvent<HTMLElement>) => void;
    onPointerCancel: () => void;
    onKeyDown: (e: KeyboardEvent<HTMLElement>) => void;
  };
}

export function useDragging(opts: { disabled: boolean; onDrop: (from: DragFrom, to: DragTo) => void; onNudge: (from: DragFrom, delta: -1 | 1) => void }): Dragging {
  const [from, setFrom] = useState<DragFrom | null>(null);
  const [over, setOver] = useState<DragTo | null>(null);
  const reset = () => {
    setFrom(null);
    setOver(null);
  };
  return {
    from,
    over,
    grip: (kind, list, id) => ({
      onPointerDown: (e) => {
        if (opts.disabled || (e.pointerType === 'mouse' && e.button !== 0)) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        setFrom({ kind, list, id });
      },
      onPointerMove: (e) => {
        if (from) setOver(dropTarget(from.kind, e.clientX, e.clientY));
      },
      onPointerUp: (e) => {
        if (from && from.id === id) {
          const to = dropTarget(from.kind, e.clientX, e.clientY) ?? over;
          if (to && !(to.list === from.list && (to.before === from.id))) opts.onDrop(from, to);
        }
        reset();
      },
      onPointerCancel: reset,
      onKeyDown: (e) => {
        if (opts.disabled) return;
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
          e.preventDefault();
          opts.onNudge({ kind, list, id }, e.key === 'ArrowUp' ? -1 : 1);
        }
      },
    }),
  };
}
