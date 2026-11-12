'use client';
// PR 140, 154 — the list's search and filters (demo a2List's filter bar): the search box finds an order by its number,
// the phone (any way it is written), the name or the courier's tracking number; the selects narrow by status, payment
// method and channel. It is a plain GET form (it works without JavaScript); a changed select sends it at once and the
// search waits for Enter or the button, so typing never reloads the page under the person.
import { useRouter } from 'next/navigation';
import { useRef, type FormEvent } from 'react';
import { ShellIcon } from '../shell/ShellIcon';

export interface FilterSelect {
  name: string;
  label: string;
  any: string;
  value: string;
  options: { value: string; label: string }[];
  /** PR 660: the date bar's own day boxes, drawn after this select (a custom range). */
  custom?: { from: string; to: string; fromLabel: string; toLabel: string };
}

export function OrderFilters({ action, view, defaultView, q, search, go, aria, selects, clear, keep }: { action: string; view: string; defaultView: string; q: string; search: string; go: string; aria: string; selects: FilterSelect[]; clear: { href: string; label: string } | null; /** PR 287: more parts of the address the search keeps (the Customers list's segment). */ keep?: Record<string, string> }) {
  const form = useRef<HTMLFormElement>(null);
  const router = useRouter();
  // With JavaScript: the same address without the empty fields (a clean, shareable link), and no full reload.
  const submit = (ev: FormEvent<HTMLFormElement>) => {
    ev.preventDefault();
    const sp = new URLSearchParams();
    for (const [k, v] of new FormData(ev.currentTarget)) if (typeof v === 'string' && v.trim()) sp.set(k, v.trim());
    const qs = sp.toString();
    router.push(qs ? `${action}?${qs}` : action);
  };
  return (
    <form ref={form} className="a2-fbar" action={action} method="get" role="search" aria-label={aria} onSubmit={submit} data-testid="orders-filters">
      {view !== defaultView ? <input type="hidden" name="view" value={view} /> : null}
      {Object.entries(keep ?? {}).map(([k, v]) => (v ? <input key={k} type="hidden" name={k} value={v} /> : null))}
      <label className="a2-fsrch">
        <span className="a2-sr">{search}</span>
        <ShellIcon name="search" size={16} />
        <input className="a2-inp" type="search" name="q" defaultValue={q} placeholder={search} autoComplete="off" enterKeyHint="search" maxLength={80} data-testid="orders-q" />
      </label>
      {selects.map((s) => (
        <span key={s.name} className="a2-fsel">
          <label className="a2-sr" htmlFor={`of-${s.name}`}>
            {s.label}
          </label>
          <select
            id={`of-${s.name}`}
            className="a2-sel"
            name={s.name}
            defaultValue={s.value}
            onChange={() => {
              // a preset replaces any custom days (the page reads the days first, so they are emptied here)
              if (s.custom && form.current) for (const n of ['from', 'to']) (form.current.elements.namedItem(n) as HTMLInputElement | null)!.value = '';
              form.current?.requestSubmit();
            }}
          >
            <option value="">{s.any}</option>
            {s.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          {s.custom ? (
            <>
              <label className="a2-sr" htmlFor="of-from">
                {s.custom.fromLabel}
              </label>
              <input id="of-from" className="a2-inp" type="date" name="from" defaultValue={s.custom.from} aria-label={s.custom.fromLabel} onChange={() => form.current?.requestSubmit()} />
              <label className="a2-sr" htmlFor="of-to">
                {s.custom.toLabel}
              </label>
              <input id="of-to" className="a2-inp" type="date" name="to" defaultValue={s.custom.to} aria-label={s.custom.toLabel} onChange={() => form.current?.requestSubmit()} />
            </>
          ) : null}
        </span>
      ))}
      <button type="submit" className="a2-btn">
        {go}
      </button>
      {clear ? (
        <a className="a2-btn ghost" href={clear.href}>
          {clear.label}
        </a>
      ) : null}
    </form>
  );
}
