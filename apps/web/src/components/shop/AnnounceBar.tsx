'use client';
// PR 40 / 501 — the announcement bar (`shell.announce`): one line, or several that take turns every few seconds. The
// turns stop while the mouse is on the bar or the keyboard is in it, and go on when it leaves (rule 7: every pause has
// its resume). Reduced motion: no fade (the stylesheet). Only messages that are live today and promise nothing the
// owner has not switched on reach this component (shell-model liveAnnouncements).
import { useEffect, useRef, useState } from 'react';
import type { Announcement } from '@/lib/shop/shell-model';

function Item({ a }: { a: Announcement }) {
  return a.href ? (
    <a className="sb-ann-a" href={a.href}>
      {a.text}
    </a>
  ) : (
    <>{a.text}</>
  );
}

export function AnnounceBar({ items, rotateSeconds }: { items: Announcement[]; rotateSeconds: number }) {
  const [at, setAt] = useState(0);
  const held = useRef({ mouse: false, focus: false });
  useEffect(() => {
    if (items.length < 2) return;
    const id = setInterval(() => {
      if (held.current.mouse || held.current.focus) return;
      setAt((i) => (i + 1) % items.length);
    }, rotateSeconds * 1000);
    return () => clearInterval(id);
  }, [items.length, rotateSeconds]);
  if (!items.length) return null;
  if (items.length < 2) {
    return (
      <div className="announce">
        <Item a={items[0]!} />
      </div>
    );
  }
  return (
    <div
      className="announce sb-ann"
      data-rot={rotateSeconds}
      aria-live="polite"
      onPointerEnter={(e) => e.pointerType === 'mouse' && (held.current.mouse = true)}
      onPointerLeave={(e) => e.pointerType === 'mouse' && (held.current.mouse = false)}
      onFocus={() => (held.current.focus = true)}
      onBlur={() => (held.current.focus = false)}
    >
      {items.map((a, i) => (
        <span key={a.id} className={`sb-ann-i${i === at ? ' on' : ''}`} aria-hidden={i === at ? undefined : true}>
          <Item a={a} />
        </span>
      ))}
    </div>
  );
}
