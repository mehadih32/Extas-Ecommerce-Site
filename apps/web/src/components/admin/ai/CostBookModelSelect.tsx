'use client';
// S15 · PR 312 (C2.2 — "Model selector: change the model in the row — it takes effect immediately") — one job's
// own model pick. Every candidate model's own per-run/per-month cost is already computed server-side (the same
// numbers the row's "Alternatives" column shows), so switching the pick re-shows the right figures at once, with no
// second fetch; the change is still saved through the admin's own API (`POST /api/admin/ai/cost-book`,
// `ai.control`, audited server-side, `setting.switch` so the toast offers Undo). Drawn only for someone who holds
// `ai.control`; everyone else sees the plain pick as text (built by the page, not this file).
import { useMemo, useState } from 'react';
import { runCall, withBody, type LmCall } from '@/lib/admin-lumen/safety';
import { showToast } from '@/components/admin/lumen/Toast';

const CALL: LmCall = { method: 'POST', url: '/api/admin/ai/cost-book' };

export interface CostBookModelOption {
  modelKey: string;
  label: string;
  isRecommended: boolean;
  perRunText: string;
  perMonthText: string;
}

export function CostBookModelSelect({
  jobKey,
  selected,
  options,
  label,
  changedText,
  failedText,
  recommendedText,
  onPicked,
}: {
  jobKey: string;
  selected: string;
  options: CostBookModelOption[];
  label: string;
  changedText: string;
  failedText: string;
  recommendedText: string;
  onPicked?: (opt: CostBookModelOption) => void;
}) {
  const [value, setValue] = useState(selected);
  const [busy, setBusy] = useState(false);
  const current = useMemo(() => options.find((o) => o.modelKey === value) ?? options[0], [options, value]);

  const pick = async (next: string) => {
    if (busy || next === value) return;
    const prev = value;
    setBusy(true);
    const ok = await runCall(withBody(CALL, { jobKey, modelKey: next }));
    setBusy(false);
    if (!ok) {
      showToast({ text: failedText, tone: 'bad' });
      return;
    }
    setValue(next);
    const opt = options.find((o) => o.modelKey === next);
    if (opt) onPicked?.(opt);
    showToast({
      text: changedText,
      undo: {
        kind: 'setting.switch',
        run: async () => {
          const u = await runCall(withBody(CALL, { jobKey, modelKey: prev }));
          if (u) {
            setValue(prev);
            const back = options.find((o) => o.modelKey === prev);
            if (back) onPicked?.(back);
          }
          return u;
        },
      },
    });
  };

  return (
    <div className="cb-sel-wrap">
      <select aria-label={label} className="a2-sel cb-sel" data-testid={`cb-model-${jobKey}`} value={value} disabled={busy} onChange={(e) => pick(e.target.value)}>
        {options.map((o) => (
          <option key={o.modelKey} value={o.modelKey}>
            {o.label}
          </option>
        ))}
      </select>
      {current ? (
        <span className="a2-xs a2-mute cb-sel-cost">
          {current.perRunText}/run · {current.perMonthText}/mo
          {current.isRecommended ? ` · ${recommendedText}` : ''}
        </span>
      ) : null}
    </div>
  );
}
