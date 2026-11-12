'use client';
// S15 · PR 578 — Agent reports' "Generate now": one press through the admin's own API (`ai.control`, checked again
// server-side); on success the page re-reads the fresh report (`router.refresh()`, the same shape PR 414/417's
// "Run now"/"Measure now" buttons already use for a one-shot action with no Undo — a generated report replaces
// itself, it is not a reversible shop action).
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { call } from '@/components/admin/api';
import { showToast } from '@/components/admin/lumen/Toast';

export function GenerateAppraisalButton({ agentKey, period, texts }: { agentKey: string; period: string; texts: { generate: string; generating: string; generated: string; err: Record<string, string> } }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function go() {
    if (busy) return;
    setBusy(true);
    const a = await call('POST', '/api/admin/ai/appraisals', { key: agentKey, period });
    setBusy(false);
    if (a.status === 200) {
      showToast({ text: texts.generated });
      router.refresh();
      return;
    }
    const code = a.status === 0 ? 'network' : (a.data.error ?? 'other');
    showToast({ text: texts.err[code] ?? texts.err.other ?? code, tone: 'bad' });
  }

  return (
    <button type="button" className="a2-btn pri" disabled={busy} onClick={go} data-testid="ai-report-generate">
      {busy ? texts.generating : texts.generate}
    </button>
  );
}
