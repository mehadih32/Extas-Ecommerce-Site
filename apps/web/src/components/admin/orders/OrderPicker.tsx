'use client';
// Follow-up 223 (PR 140) — the one client part of the order list's table: a single click listener and a single change
// listener on the table's box (the rows themselves are drawn by the server with no handlers, OrderTable.tsx), and the
// bulk bar for what is ticked. A tap on a row opens the order, a plain click on the order number goes through the
// router (a new tab still works), and the tick boxes are the browser's own (unticked on "Clear"). A ticked row is
// styled from its own box (:has(.a2-chk:checked)), so nothing redraws 50 rows when one is ticked.
import { useRouter } from 'next/navigation';
import { useCallback, useRef, useState, type ChangeEvent, type MouseEvent, type ReactNode } from 'react';
import type { BulkCommand, BulkRow } from '@/lib/admin-orders/bulk';
import { ROW_CONTROLS, isPlainClick, pick, rowTap } from '@/lib/admin-orders/row-pick';
import type { BulkFile } from '@/lib/admin-orders/bulk-files';
import type { FieldOption } from '@/lib/admin-orders/spec';
import type { Dict } from '@/lib/i18n';
import { BulkBar } from './BulkBar';

export type PickRow = BulkRow & { href: string };

export function OrderPicker({ dict, rows, bulk, children }: { dict: Dict; rows: PickRow[]; bulk: { commands: BulkCommand[]; holdOptions: FieldOption[]; files?: BulkFile[] } | null; children: ReactNode }) {
  const router = useRouter();
  const box = useRef<HTMLDivElement>(null);
  const [sel, setSel] = useState<ReadonlySet<string>>(new Set());
  const ids = rows.map((r) => r.id);

  /** The header box follows the row boxes: ticked when every shown row is. */
  const syncAll = (next: ReadonlySet<string>) => {
    const all = box.current?.querySelector<HTMLInputElement>('input[data-pick-all]');
    if (all) all.checked = ids.length > 0 && ids.every((id) => next.has(id));
  };

  const onClick = (ev: MouseEvent<HTMLDivElement>) => {
    const target = ev.target as HTMLElement;
    const control = target.closest<HTMLElement>(ROW_CONTROLS);
    const link = control instanceof HTMLAnchorElement && control.dataset.rowLink !== undefined ? control.getAttribute('href') : null;
    const tap = rowTap(control ? { linkHref: link } : null, target.closest<HTMLElement>('tr[data-href]')?.dataset.href ?? null, isPlainClick(ev));
    if (tap.kind === 'none') return;
    if (tap.kind === 'link') ev.preventDefault();
    router.push(tap.href);
  };

  const onChange = (ev: ChangeEvent<HTMLDivElement>) => {
    const input = ev.target as unknown as HTMLInputElement;
    if (input.type !== 'checkbox' || !bulk) return;
    const id = input.dataset.pickAll !== undefined ? 'all' : (input.dataset.pick ?? '');
    if (!id) return;
    const next = pick(sel, ids, id, input.checked);
    if (id === 'all') box.current?.querySelectorAll<HTMLInputElement>('input[data-pick]').forEach((b) => (b.checked = input.checked));
    syncAll(next);
    setSel(next);
  };

  const clear = useCallback(() => {
    box.current?.querySelectorAll<HTMLInputElement>('input[data-pick],input[data-pick-all]').forEach((b) => (b.checked = false));
    setSel(new Set());
  }, []);

  const chosen = rows.filter((r) => sel.has(r.id));
  return (
    <>
      <div ref={box} className="a2-tblw" onClick={onClick} onChange={onChange}>
        {children}
      </div>
      {bulk && chosen.length ? <BulkBar dict={dict} rows={chosen} commands={bulk.commands} holdOptions={bulk.holdOptions} files={bulk.files} onClear={clear} /> : null}
    </>
  );
}
