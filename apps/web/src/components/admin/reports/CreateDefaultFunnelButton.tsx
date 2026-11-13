'use client';
// S15 · PR 340 — the Funnels page's own one-click "create the shop funnel" action, shown only while the store has
// no saved funnel yet (`POST /api/admin/reports/analytics/funnels {action: 'create', input}`,
// `reports.analytics.write`, audited server-side). The same `runCall`/`router.refresh()` pattern
// `ApprovalDecideButtons.tsx` (PR 317) already uses for a one-tap write with no separate confirm step.
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { runCall, withBody, type LmCall } from '@/lib/admin-lumen/safety';
import { showToast } from '@/components/admin/lumen/Toast';
import type { DefaultFunnelStep } from '@/lib/analytics/default-funnel';

const CALL: LmCall = { method: 'POST', url: '/api/admin/reports/analytics/funnels' };

export function CreateDefaultFunnelButton({
  name,
  steps,
  label,
  createdText,
  failedText,
}: {
  name: string;
  steps: DefaultFunnelStep[];
  label: string;
  createdText: string;
  failedText: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const create = async () => {
    if (busy) return;
    setBusy(true);
    const ok = await runCall(withBody(CALL, { action: 'create', input: { name, steps } }));
    setBusy(false);
    if (!ok) {
      showToast({ text: failedText, tone: 'bad' });
      return;
    }
    showToast({ text: createdText });
    router.refresh();
  };

  return (
    <button type="button" className="a2-btn pri" disabled={busy} data-testid="fn-create-default" onClick={create}>
      {label}
    </button>
  );
}
