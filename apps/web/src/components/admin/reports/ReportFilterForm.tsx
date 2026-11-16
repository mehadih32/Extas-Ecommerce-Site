"use client";
// Final round (prototype v5): the filter selects of a report sit inside the toolbar card and apply as soon as one is chosen
// (no "Apply" button to press). The button stays for keyboards and for a browser without scripts, visible to screen readers only.
import Link from "next/link";
import { useRef } from "react";
import type { FilterField } from "./ReportFilters";

export function ReportFilterForm({
  action,
  keep,
  fields,
  testId,
  applyLabel,
  clearLabel,
  clearHref,
  on,
}: {
  action: string;
  keep: Record<string, string>;
  fields: readonly FilterField[];
  testId: string;
  applyLabel: string;
  clearLabel: string;
  clearHref: string;
  on: boolean;
}) {
  const form = useRef<HTMLFormElement>(null);
  return (
    <form ref={form} className="rpf" action={action} method="get" data-testid={testId}>
      {Object.entries(keep).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      {fields.map((f) => (
        <label key={f.name} className="a2-xs a2-mute">
          <span className="a2-sr">{f.label}</span>
          <select name={f.name} className="a2-inp" defaultValue={f.value} aria-label={f.label} data-testid={`${testId}-${f.name}`} onChange={() => form.current?.requestSubmit()}>
            <option value="all">{f.all}</option>
            {f.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      ))}
      <button type="submit" className="a2-sr" data-testid={`${testId}-apply`}>
        {applyLabel}
      </button>
      {on ? (
        <Link className="a2-btn sm ghost cr-tap" href={clearHref} data-testid={`${testId}-clear`}>
          {clearLabel}
        </Link>
      ) : null}
    </form>
  );
}
