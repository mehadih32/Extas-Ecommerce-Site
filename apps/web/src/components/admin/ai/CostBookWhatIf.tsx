'use client';
// S15 · PR 314 (C2.3's "what if" slider — "if I post 3 times a day instead of 1… same for articles per week,
// support volume, order volume") — one multiplier per section, recomputed purely in the browser from numbers the
// page already rendered (`cost-book-whatif.ts`, zero DB/Prisma imports so it is safe to bundle client-side). It
// saves nothing and calls no API: moving a slider only previews a number, exactly like turning a page is not
// a commitment. Reset puts every slider back to 1× ("no change").
import { useMemo, useState } from 'react';
import {
  fullMultiplier,
  whatIfTotal,
  WHAT_IF_MAX,
  WHAT_IF_MIN,
  type WhatIfJob,
} from '@/lib/admin-ai/cost-book-whatif';

export function CostBookWhatIf({
  jobs,
  sections,
  money,
  title,
  resetText,
}: {
  jobs: WhatIfJob[];
  sections: { id: WhatIfJob['section']; name: string }[];
  money: (storeMinor: number | null, usdMinor: number) => string;
  title: string;
  resetText: string;
}) {
  const [mult, setMult] = useState<Partial<Record<WhatIfJob['section'], number>>>({});
  const total = useMemo(() => whatIfTotal(jobs, mult), [jobs, mult]);
  const full = fullMultiplier(mult);

  return (
    <section className="a2-sc a2-mt12 cb-whatif" aria-labelledby="cb-whatif-h" data-testid="cb-whatif">
      <h2 className="a2-h3" id="cb-whatif-h">
        {title}
      </h2>
      <div className="cb-whatif-total" data-testid="cb-whatif-total">
        {money(total.storeMinor, total.usdMinor)}
      </div>
      <div className="cb-whatif-rows">
        {sections.map((s) => (
          <label key={s.id} className="cb-whatif-row">
            <span className="cb-whatif-name">{s.name}</span>
            <input
              type="range"
              min={WHAT_IF_MIN}
              max={WHAT_IF_MAX}
              step={0.25}
              value={full[s.id]}
              data-testid={`cb-whatif-${s.id}`}
              onChange={(e) => setMult((m) => ({ ...m, [s.id]: Number(e.target.value) }))}
            />
            <span className="cb-whatif-x">{full[s.id].toFixed(2)}×</span>
          </label>
        ))}
      </div>
      <button type="button" className="a2-btn a2-ghost cb-whatif-reset" data-testid="cb-whatif-reset" onClick={() => setMult({})}>
        {resetText}
      </button>
    </section>
  );
}
