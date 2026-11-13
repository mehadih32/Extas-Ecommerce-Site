'use client';
// PR 66 follow-up 184 — one product question's answer box and buttons on Products › Reviews › Questions: write or
// change the shop's answer (Save, or Save and publish), publish an answered one, hide, back to the queue, archive and
// bring back. Each calls /api/admin/questions (reviews.moderate, checked again there). Shown only to someone with
// `reviews.moderate`. The words after a button worked are the admin's one toast; a refusal stays beside the buttons.
// No Undo toast: each move has its own way back on this card (Hide ↔ Publish, Archive ↔ Bring back).
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import { showToast } from '@/components/admin/lumen/Toast';
import { t, type Dict } from '@/lib/i18n';

type State = 'PENDING' | 'APPROVED' | 'HIDDEN' | 'REJECTED';
type Move = 'publish' | 'hide' | 'restore' | 'archive' | 'unarchive';

/** The moves that make sense from each place (the API refuses the rest). */
export function movesOf(state: State, archived: boolean, answered: boolean): Move[] {
  if (archived) return ['unarchive'];
  if (state === 'APPROVED') return ['hide', 'archive'];
  if (state === 'PENDING') return [...(answered ? (['publish'] as Move[]) : []), 'hide', 'archive'];
  return [...(answered ? (['publish'] as Move[]) : []), 'restore', 'archive'];
}

export interface QuestionActionsProps {
  dict: Dict;
  id: string;
  state: State;
  archived: boolean;
  answer: string | null;
  max: number;
}

export function QuestionActions({ dict: d, id, state, archived, answer, max }: QuestionActionsProps) {
  const router = useRouter();
  const uid = useId();
  const [text, setText] = useState(answer ?? '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const answered = !!answer?.trim();
  const changed = text.trim() !== (answer ?? '').trim();

  async function post(path: 'answer' | 'move', body: unknown) {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/admin/questions/${id}/${path}`, {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({ ok: false }))) as { ok?: boolean; error?: string };
      if (!data.ok) return setErr(t(d, 'revq.act.failed', { code: data.error ?? String(res.status) }));
      showToast({ text: t(d, 'revq.act.saved'), tone: 'ok' });
      router.refresh();
    } catch {
      setErr(t(d, 'revq.act.failed', { code: 'network' }));
    } finally {
      setBusy(false);
    }
  }

  /** S28 · PR 682 — "Make this an FAQ": copies the question and the shop's answer into an FAQ (own product, its category, or all). */
  async function makeFaq(scope: 'PRODUCT' | 'CATEGORY' | 'SHOP') {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch('/api/admin/faqs', {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ fromQuestionId: id, scope }),
      });
      const data = (await res.json().catch(() => ({ ok: false }))) as { ok?: boolean; error?: string; details?: string[] };
      if (!data.ok) return setErr(data.details?.includes('ALREADY') ? t(d, 'revq.faq.already') : t(d, 'revq.act.failed', { code: data.error ?? String(res.status) }));
      showToast({ text: t(d, 'revq.faq.made'), tone: 'ok' });
      router.refresh();
    } catch {
      setErr(t(d, 'revq.act.failed', { code: 'network' }));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="revq-acts" data-testid="question-actions">
      {!archived ? (
        <div className="lm-fl">
          <label htmlFor={`${uid}-a`}>{t(d, 'revq.answer')}</label>
          <textarea
            id={`${uid}-a`}
            className="lm-inp"
            rows={3}
            maxLength={max}
            value={text}
            placeholder={t(d, 'revq.answerPh')}
            disabled={busy}
            onChange={(e) => setText(e.target.value)}
            data-testid="question-answer"
          />
        </div>
      ) : null}
      <div className="rev-acts">
        {!archived ? (
          <>
            <button
              type="button"
              className="a2-btn pri"
              disabled={busy || !text.trim() || (!changed && state === 'APPROVED')}
              onClick={() => post('answer', { answer: text, publish: true })}
              data-action="answer-publish"
            >
              {t(d, state === 'APPROVED' ? 'revq.act.update' : 'revq.act.answerPublish')}
            </button>
            {state !== 'APPROVED' ? (
              <button type="button" className="a2-btn" disabled={busy || !text.trim() || !changed} onClick={() => post('answer', { answer: text })} data-action="answer-save">
                {t(d, 'revq.act.answerSave')}
              </button>
            ) : null}
          </>
        ) : null}
        {movesOf(state, archived, answered)
          .filter((m) => m !== 'publish' || !changed)
          .map((m) => (
            <button key={m} type="button" className="a2-btn" disabled={busy} onClick={() => post('move', { action: m })} data-action={m}>
              {t(d, `revq.act.${m}`)}
            </button>
          ))}
        {state === 'APPROVED' && !archived && answered && !changed ? (
          <span className="rev-faq" data-testid="make-faq">
            <span className="a2-xs a2-mute" title={t(d, 'revq.faq.note')}>
              {t(d, 'revq.faq.make')}:
            </span>
            {(['PRODUCT', 'CATEGORY', 'SHOP'] as const).map((sc) => (
              <button key={sc} type="button" className="a2-btn" disabled={busy} onClick={() => makeFaq(sc)} data-action={`faq-${sc.toLowerCase()}`}>
                {t(d, `revq.faq.${sc}`)}
              </button>
            ))}
          </span>
        ) : null}
        {err ? (
          <p className="a2-xs" role="alert" style={{ color: 'var(--lm-bad)' }}>
            {err}
          </p>
        ) : null}
      </div>
    </div>
  );
}
