// Follow-up 223 (PR 140) — the order list's rows are drawn by the server and carry no per-row React handlers; one
// listener on the table (OrderPicker.tsx) reads what was tapped. These helpers are that listener's whole logic, kept
// pure so the rules are tested: a tap on a row opens it unless it landed on a control, a plain click on the order
// number goes through the app's router (a new tab or window keeps the browser's own way), and a tick adds or removes
// one order (or every shown one) from the selection.

/** The controls inside a row that do their own job; a tap on them never opens the row. */
export const ROW_CONTROLS = 'a,button,input,select,label,textarea';

/** The minimum a pointer event needs for the decisions below (MouseEvent fits). */
export interface PointerLike {
  button: number;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  defaultPrevented: boolean;
}

/** A left click with no key held: the only click the page takes over (the rest stay the browser's: new tab, window). */
export const isPlainClick = (e: PointerLike): boolean => !e.defaultPrevented && e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;

/** What a click on the table should do: open a row, follow the order number's link, or nothing (a tick box, a button). */
export type RowTap = { kind: 'row'; href: string } | { kind: 'link'; href: string } | { kind: 'none' };

/**
 * `control` is the nearest ROW_CONTROLS element of the click target inside the table (null: none), `rowHref` the
 * data-href of the nearest row (null: not on a row), `linkHref` the href when the control is the row's own order link.
 */
export function rowTap(control: { linkHref: string | null } | null, rowHref: string | null, plain: boolean): RowTap {
  if (!plain) return { kind: 'none' };
  if (control) return control.linkHref ? { kind: 'link', href: control.linkHref } : { kind: 'none' };
  return rowHref ? { kind: 'row', href: rowHref } : { kind: 'none' };
}

/** The selection after one tick box changed: one id, or every shown id (the header box). */
export function pick(sel: ReadonlySet<string>, ids: readonly string[], id: string | 'all', on: boolean): ReadonlySet<string> {
  if (id === 'all') return on ? new Set(ids) : new Set();
  if (!ids.includes(id)) return sel;
  const n = new Set(sel);
  if (on) n.add(id);
  else n.delete(id);
  return n;
}
