// PR 799 (prototype v5 Reports): the filter row under the period bar — the prototype's "All channels / All categories / All areas" selects
// with "Clear". A plain form (GET), so a filter is an address a saved view or a link can keep; the period, the comparison and the other
// filters ride along as hidden fields. Server component; the page works the options out and applies the filter.
import { ReportFilterForm } from "./ReportFilterForm";

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
  return <ReportFilterForm action={action} keep={keep} fields={fields} testId={testId} applyLabel={applyLabel} clearLabel={clearLabel} clearHref={clear} on={on} />;
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
