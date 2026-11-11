'use client';
// S15 · PR 308 (C1.6) — one agent's own schedule: always / daily at a clock time / weekly on chosen weekdays, all
// in the store's own time zone. Unlike the model picker (one `<select>`, commits on change), a schedule has several
// fields that only make sense together, so this edits a local draft and commits them all at once on "Save" through
// the admin's own API (`POST /api/admin/ai {key, schedule}`, `ai.control`, audited server-side, `setting.switch` so
// the toast offers Undo). Drawn only for someone who holds `ai.control`; everyone else sees the plain schedule and
// its next-run preview as text (built by the page, not this file).
import { useState } from 'react';
import { runCall, withBody, type LmCall } from '@/lib/admin-lumen/safety';
import { showToast } from '@/components/admin/lumen/Toast';

const CALL: LmCall = { method: 'POST', url: '/api/admin/ai' };

export interface ScheduleDraft {
  mode: 'always' | 'daily' | 'weekly';
  time?: string;
  days?: number[];
}

function sameDraft(a: ScheduleDraft, b: ScheduleDraft): boolean {
  return JSON.stringify({ mode: a.mode, time: a.time ?? null, days: [...(a.days ?? [])].sort() }) === JSON.stringify({ mode: b.mode, time: b.time ?? null, days: [...(b.days ?? [])].sort() });
}

export function ScheduleEditor({
  agentKey,
  value,
  dayLabels,
  modeLabels,
  selectLabel,
  timeLabel,
  daysLabel,
  saveLabel,
  savedText,
  failedText,
  invalidText,
}: {
  agentKey: string;
  value: ScheduleDraft;
  /** 7 labels, Sunday first (index 0) through Saturday (index 6). */
  dayLabels: string[];
  modeLabels: { always: string; daily: string; weekly: string };
  selectLabel: string;
  timeLabel: string;
  daysLabel: string;
  saveLabel: string;
  savedText: string;
  failedText: string;
  invalidText: string;
}) {
  const [saved, setSaved] = useState(value);
  const [draft, setDraft] = useState(value);
  const [busy, setBusy] = useState(false);

  const dirty = !sameDraft(draft, saved);

  const toggleDay = (d: number) => {
    const days = draft.days ?? [];
    const next = days.includes(d) ? days.filter((x) => x !== d) : [...days, d].sort((a, b) => a - b);
    setDraft({ ...draft, days: next });
  };

  const toBody = (d: ScheduleDraft) => (d.mode === 'always' ? null : { mode: d.mode, time: d.time, days: d.mode === 'weekly' ? d.days : undefined });

  const save = async () => {
    if (busy) return;
    if (draft.mode !== 'always' && !draft.time) {
      showToast({ text: invalidText, tone: 'bad' });
      return;
    }
    if (draft.mode === 'weekly' && !(draft.days && draft.days.length)) {
      showToast({ text: invalidText, tone: 'bad' });
      return;
    }
    const prev = saved;
    setBusy(true);
    const ok = await runCall(withBody(CALL, { key: agentKey, schedule: toBody(draft) }));
    setBusy(false);
    if (!ok) {
      showToast({ text: failedText, tone: 'bad' });
      return;
    }
    setSaved(draft);
    showToast({
      text: savedText,
      undo: {
        kind: 'setting.switch',
        run: async () => {
          const u = await runCall(withBody(CALL, { key: agentKey, schedule: toBody(prev) }));
          if (u) {
            setSaved(prev);
            setDraft(prev);
          }
          return u;
        },
      },
    });
  };

  return (
    <div className="ai-sched" data-testid={`ai-agent-schedule-${agentKey}`}>
      <select aria-label={selectLabel} className="a2-sel ai-schedmode" data-testid={`ai-agent-schedule-mode-${agentKey}`} value={draft.mode} disabled={busy} onChange={(e) => setDraft({ mode: e.target.value as ScheduleDraft['mode'], time: draft.time, days: draft.days })}>
        <option value="always">{modeLabels.always}</option>
        <option value="daily">{modeLabels.daily}</option>
        <option value="weekly">{modeLabels.weekly}</option>
      </select>
      {draft.mode !== 'always' ? (
        <input type="time" aria-label={timeLabel} className="a2-sel ai-schedtime" data-testid={`ai-agent-schedule-time-${agentKey}`} value={draft.time ?? ''} disabled={busy} onChange={(e) => setDraft({ ...draft, time: e.target.value })} />
      ) : null}
      {draft.mode === 'weekly' ? (
        <div className="ai-schedddays" role="group" aria-label={daysLabel}>
          {dayLabels.map((d, i) => (
            <label key={i} className="a2-xs ai-schedday">
              <input type="checkbox" checked={(draft.days ?? []).includes(i)} disabled={busy} onChange={() => toggleDay(i)} />
              {d}
            </label>
          ))}
        </div>
      ) : null}
      {dirty ? (
        <button type="button" className="a2-btn sm pri" disabled={busy} onClick={() => void save()} data-testid={`ai-agent-schedule-save-${agentKey}`}>
          {saveLabel}
        </button>
      ) : null}
    </div>
  );
}
