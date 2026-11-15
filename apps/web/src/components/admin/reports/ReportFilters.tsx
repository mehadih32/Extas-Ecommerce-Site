// PR 799 (prototype v5 Reports): the filter row under the period bar — the prototype's "All channels / All categories / All areas" selects
// with "Clear". A plain form (GET), so a filter is an address a saved view or a link can keep; the period, the comparison and the other
// filters ride along as hidden fields. Server component; the page works the options out and applies the filter.
import Link from "next/link";

export interface FilterField {
  name: string;
  label: string;
  /** The "all" option's words ("All categories"). */
  all: string;
  options: readonly { value: string; label: string }[];
  value: string;
}

export function ReportFilters({
  action,
  keep,
  fields,
  testId,
  applyLabel,
  clearLabel,
}: {
  action: string;
  keep: Record<string, string>;
  fields: readonly FilterField[];
  testId: string;
  applyLabel: string;
  clearLabel: string;
}) {
  const on = fields.some((f) => f.value !== "all");
  const clear = `${action}?${new URLSearchParams(keep).toString()}`;
  return (
    <form className="rpf" action={action} method="get" data-testid={testId}>
      {Object.entries(keep).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      {fields.map((f) => (
        <label key={f.name} className="a2-xs a2-mute">
          <span className="a2-sr">{f.label}</span>
          <select
            name={f.name}
            className="a2-inp"
            defaultValue={f.value}
            aria-label={f.label}
            data-testid={`${testId}-${f.name}`}
          >
            <option value="all">{f.all}</option>
            {f.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      ))}
      <button
        type="submit"
        className="a2-btn sm cr-tap"
        data-testid={`${testId}-apply`}
      >
        {applyLabel}
      </button>
      {on ? (
        <Link
          className="a2-btn sm ghost cr-tap"
          href={clear}
          data-testid={`${testId}-clear`}
        >
          {clearLabel}
        </Link>
      ) : null}
    </form>
  );
}

/** The hidden fields a filter form keeps: the period (`p`, `from`, `to`), the comparison and the other filters that are on. */
export function keepOf(
  sp: Record<string, string | string[] | undefined>,
  drop: readonly string[] = [],
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of ["p", "from", "to", "cmp", "cat", "div", "ch", "adch"]) {
    const v = sp[k];
    if (typeof v === "string" && v && v !== "all" && !drop.includes(k))
      out[k] = v;
  }
  return out;
}
