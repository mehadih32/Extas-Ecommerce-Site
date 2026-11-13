'use client';
// S15 · PR 314 (C2.3's "one-click presets… sets the model for every job at once") — applies Economy, Balanced or
// Premium (`POST /api/admin/ai/cost-book {preset}`, `ai.control`, audited server-side as one combined entry). The
// card beside this button already shows what WOULD change (from the server-computed preview, no second fetch);
// after a real tap this refreshes the whole page (`router.refresh()`, the same pattern as `StockActions.tsx`)
// since a bulk change touches every row's own model selector, not just one. No Undo here — a preset is reversed by
// applying another preset, or by picking a job's own model back, same as any other change in this table.
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { runCall, withBody, type LmCall } from '@/lib/admin-lumen/safety';
import { showToast } from '@/components/admin/lumen/Toast';

const CALL: LmCall = { method: 'POST', url: '/api/admin/ai/cost-book' };

export function CostBookPresetButton({
  preset,
  label,
  changedText,
  failedText,
}: {
  preset: 'economy' | 'balanced' | 'premium';
  label: string;
  changedText: string;
  failedText: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const apply = async () => {
    if (busy) return;
    setBusy(true);
    const ok = await runCall(withBody(CALL, { preset }));
    setBusy(false);
    if (!ok) {
      showToast({ text: failedText, tone: 'bad' });
      return;
    }
    showToast({ text: changedText });
    router.refresh();
  };

  return (
    <button type="button" className="a2-btn cb-preset-btn" data-testid={`cb-preset-${preset}`} disabled={busy} onClick={apply}>
      {label}
    </button>
  );
}
