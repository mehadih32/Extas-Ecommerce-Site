'use client';
// PR 125 — the delivery note (demo 51-checkout.js `note`, C12 / K6): its own card. On a phone a "+ Add a delivery note"
// button opens the box (and it stays open once there is a note); on a computer the box is always open. The note goes on
// the order for the rider and the packing team; how long it may be is the owner's (`checkout.note.maxChars`).
import { useState } from 'react';
import { Icon } from '../Icon';

export interface NoteCardProps {
  note: string;
  max: number;
  onChange: (note: string) => void;
  w: (k: string) => string;
}

export function NoteCard({ note, max, onChange, w }: NoteCardProps) {
  const [open, setOpen] = useState(false);
  const input = (id: string, autoFocus: boolean) => (
    <>
      <label className="label" htmlFor={id}>
        {w('note')}
      </label>
      <input id={id} className="input" value={note} maxLength={max} placeholder={w('notePh')} onChange={(e) => onChange(e.target.value)} autoFocus={autoFocus} data-testid="co-note" />
    </>
  );
  return (
    <div className="card co-sec co-notecard" data-testid="co-notecard">
      {open || note ? (
        input('co-note', open && !note)
      ) : (
        <>
          <button type="button" className="co-noteadd hide-d" onClick={() => setOpen(true)} data-testid="co-noteadd">
            <Icon name="plus" size={16} />
            <span>{w('noteAdd')}</span>
          </button>
          <div className="hide-m co-note-d">{input('co-note-d', false)}</div>
        </>
      )}
    </div>
  );
}
