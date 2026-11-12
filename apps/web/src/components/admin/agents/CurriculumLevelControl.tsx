'use client';
// S15 · PR 579 (C10) — the owner's own hand on one curriculum level: a status dropdown and, for "Passed", a score
// (0-100), through `POST /api/admin/agents/:key {action: 'curriculum', level, status, score?}` (`ai.control`).
// Until the sandbox exam runner (PR 322) is merged, this is the only way a level ever changes. The page reruns
// server-side on success (Next's own router refresh), so the fresh status shows without a second fetch here.
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { runCall, type LmCall } from '@/lib/admin-lumen/safety';
import { showToast } from '@/components/admin/lumen/Toast';

export type CurriculumStatusId = 'notStarted' | 'inProgress' | 'passed' | 'failed';

export function CurriculumLevelControl({
  agentKey,
  level,
  status,
  score,
  statusLabels,
  labels,
}: {
  agentKey: string;
  level: string;
  status: CurriculumStatusId;
  score: number | null;
  statusLabels: Record<CurriculumStatusId, string>;
  labels: { score: string; save: string; saved: string; failed: string; scoreRequired: string };
}) {
  const router = useRouter();
  const [nextStatus, setNextStatus] = useState<CurriculumStatusId>(status);
  const [nextScore, setNextScore] = useState(score === null ? '' : String(score));
  const [busy, setBusy] = useState(false);

  const dirty = nextStatus !== status || nextScore !== (score === null ? '' : String(score));

  const save = async () => {
    if (busy || !dirty) return;
    const scoreNum = nextScore.trim() === '' ? null : Number(nextScore);
    if (nextStatus === 'passed' && (scoreNum === null || Number.isNaN(scoreNum))) {
      showToast({ text: labels.scoreRequired, tone: 'bad' });
      return;
    }
    const call: LmCall = { method: 'POST', url: `/api/admin/agents/${agentKey}`, body: { action: 'curriculum', level, status: nextStatus, score: Number.isNaN(scoreNum) ? null : scoreNum } };
    setBusy(true);
    const ok = await runCall(call);
    setBusy(false);
    if (!ok) {
      showToast({ text: labels.failed, tone: 'bad' });
      return;
    }
    showToast({ text: labels.saved, tone: 'ok' });
    router.refresh();
  };

  return (
    <div className="ag-inline" data-testid={`curriculum-control-${level}`}>
      <select
        className="a2-inp"
        value={nextStatus}
        disabled={busy}
        onChange={(e) => setNextStatus(e.target.value as CurriculumStatusId)}
        data-testid={`curriculum-status-${level}`}
      >
        {(Object.keys(statusLabels) as CurriculumStatusId[]).map((id) => (
          <option key={id} value={id}>
            {statusLabels[id]}
          </option>
        ))}
      </select>
      {nextStatus === 'passed' || nextStatus === 'failed' ? (
        <input
          className="a2-inp"
          style={{ width: 72 }}
          type="number"
          min={0}
          max={100}
          placeholder={labels.score}
          value={nextScore}
          disabled={busy}
          onChange={(e) => setNextScore(e.target.value)}
          data-testid={`curriculum-score-${level}`}
        />
      ) : null}
      <button type="button" className="a2-btn sm ghost" disabled={busy || !dirty} onClick={() => void save()} data-testid={`curriculum-save-${level}`}>
        {labels.save}
      </button>
    </div>
  );
}
