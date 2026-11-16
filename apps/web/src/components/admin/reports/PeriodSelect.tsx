"use client";
// Final round (prototype v5, phone): the period is one drop-down ("30 days") instead of a grid of buttons. It only shows
// below a tablet's width (report-bar.css); the buttons stay for a laptop. A choice opens the same address a button does.
export function PeriodSelect({
  label,
  value,
  options,
  testId,
}: {
  label: string;
  value: string;
  options: readonly { value: string; label: string; href: string }[];
  testId: string;
}) {
  return (
    <select
      className="a2-inp rpsel"
      aria-label={label}
      value={value}
      data-testid={testId}
      onChange={(e) => {
        const o = options.find((x) => x.value === e.target.value);
        if (o) window.location.assign(o.href);
      }}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
