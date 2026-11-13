'use client';
// S15 · PR 583 (C10.2) — "Ask the chief" (`POST /api/admin/ai/agents-chief {question}`, `ai.control`). After a tap
// the whole page refreshes (`router.refresh()`, the same pattern `ApprovalDecideButtons.tsx` already uses) since a
// new investigation (and, when a real agent was found, a new assignment) appears in lists this page already reads
// straight from the database — never a second, client-held copy of what the server just wrote.
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { runCall, withBody, type LmCall } from '@/lib/admin-lumen/safety';
import { showToast } from '@/components/admin/lumen/Toast';

const CALL: LmCall = { method: 'POST', url: '/api/admin/ai/agents-chief' };

export function AskChiefForm({ placeholder, label, askLabel, askedText, failedText }: { placeholder: string; label: string; askLabel: string; askedText: string; failedText: string }) {
  const router = useRouter();
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);

  const ask = async () => {
    const q = question.trim();
    if (!q || busy) return;
    setBusy(true);
    const ok = await runCall(withBody(CALL, { question: q }));
    setBusy(false);
    if (!ok) {
      showToast({ text: failedText, tone: 'bad' });
      return;
    }
    setQuestion('');
    showToast({ text: askedText });
    router.refresh();
  };

  return (
    <form
      className="ac-ask"
      data-testid="chief-ask-form"
      onSubmit={(e) => {
        e.preventDefault();
        void ask();
      }}
    >
      <label className="a2-sr-only" htmlFor="chief-ask-q">
        {label}
      </label>
      <input
        id="chief-ask-q"
        type="text"
        className="a2-inp"
        value={question}
        placeholder={placeholder}
        disabled={busy}
        data-testid="chief-ask-input"
        onChange={(e) => setQuestion(e.target.value)}
      />
      <button type="submit" className="a2-btn" disabled={busy || !question.trim()} data-testid="chief-ask-submit">
        {askLabel}
      </button>
    </form>
  );
}
