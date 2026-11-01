'use client';
// S21 · PR 594 (HLP-02) — the working buttons of Help & Build: "Report a problem (on this PR)" opens a small form (the
// PR number unless the card gives it, what is wrong, where it was seen) and posts it to /api/admin/build/problems; a
// reported problem's status (being fixed, fixed with how, closed with why, open again) is set the same way. The server
// checks `build.report`, the PR number against the register and the note again; the page is read again after.
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import { errWords, post, type Words } from '@/components/admin/money/RefundActions';

const API = '/api/admin/build/problems';
const fill = (s: string | undefined, vars: Record<string, string> = {}) => (s ?? '').replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? `{${k}}`);

export function ReportProblem({ w, pr, page, primary, testId }: { w: Words; pr?: number; page?: string; primary?: boolean; testId: string }) {
  const id = useId();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [num, setNum] = useState(pr ? String(pr) : '');
  const [note, setNote] = useState('');
  const [where, setWhere] = useState(page ?? '');
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<{ text: string; bad: boolean } | null>(null);
  const ready = !busy && /^\d+$/.test(num.trim()) && note.trim().length >= 3;

  async function send() {
    if (!ready) return;
    setBusy(true);
    const body = { action: 'report', pr: Number(num.trim()), note: note.trim(), ...(where.trim() ? { page: where.trim() } : {}) };
    let n = '';
    let a: { error: string | null };
    try {
      const res = await fetch(API, { method: 'POST', credentials: 'same-origin', cache: 'no-store', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const data = (await res.json().catch(() => ({}))) as { error?: string; problem?: { number?: number } };
      a = { error: res.ok ? null : (data.error ?? 'other') };
      n = String(data.problem?.number ?? '');
    } catch {
      a = { error: 'network' };
    }
    setBusy(false);
    if (!a.error) {
      setOpen(false);
      setNote('');
      if (!pr) setNum('');
      setSaid({ text: fill(w['report.done'], { n }), bad: false });
      return router.refresh();
    }
    setSaid({ text: errWords(w, a.error), bad: true });
  }

  return (
    <div className="bd-act" data-testid={testId}>
      <button type="button" className={`a2-btn${primary ? ' pri' : ' sm'}`} aria-expanded={open} aria-controls={`${id}-f`} onClick={() => (setOpen(!open), setSaid(null))} data-testid={`${testId}-open`}>
        {pr ? w['report.btnPr'] : w['report.btn']}
      </button>
      {open ? (
        <div className="bd-form a2-mt6" id={`${id}-f`} data-testid={`${testId}-form`}>
          <p className="a2-xs">{w['report.what']}</p>
          {pr ? null : (
            <label className="bd-fld">
              <span className="a2-xs">{w['report.pr']}</span>
              <input className="a2-inp" inputMode="numeric" value={num} disabled={busy} onChange={(e) => setNum(e.target.value.replace(/\D/g, ''))} data-testid={`${testId}-pr`} />
            </label>
          )}
          <label className="bd-fld">
            <span className="a2-xs">{w['report.note']}</span>
            <textarea className="a2-ta" rows={3} value={note} placeholder={w['report.notePh']} disabled={busy} onChange={(e) => setNote(e.target.value)} data-testid={`${testId}-note`} />
          </label>
          <label className="bd-fld">
            <span className="a2-xs">{w['report.page']}</span>
            <input className="a2-inp" value={where} placeholder="/admin/…" disabled={busy} onChange={(e) => setWhere(e.target.value)} data-testid={`${testId}-page`} />
          </label>
          <div className="a2-gap8">
            <button type="button" className="a2-btn pri" disabled={!ready} onClick={send} data-testid={`${testId}-send`}>
              {w['report.send']}
            </button>
            <button type="button" className="a2-btn" disabled={busy} onClick={() => setOpen(false)}>
              {w['report.cancel']}
            </button>
          </div>
        </div>
      ) : null}
      {said ? (
        <p className={`a2-xs a2-mt6${said.bad ? ' bk-warn' : ''}`} role="status" data-testid={`${testId}-said`}>
          {said.text}
        </p>
      ) : null}
    </div>
  );
}

type Status = 'OPEN' | 'FIXING' | 'FIXED' | 'CLOSED';
const NEXT: Record<Status, Status[]> = { OPEN: ['FIXING', 'FIXED', 'CLOSED'], FIXING: ['FIXED', 'CLOSED', 'OPEN'], FIXED: ['OPEN'], CLOSED: ['OPEN'] };

export function ProblemStatus({ w, id, status, testId }: { w: Words; id: string; status: Status; testId: string }) {
  const fid = useId();
  const router = useRouter();
  const [to, setTo] = useState<Status | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<{ text: string; bad: boolean } | null>(null);
  const needsNote = to === 'FIXED' || to === 'CLOSED';
  const ready = !busy && !!to && (!needsNote || note.trim().length >= 3);

  async function save() {
    if (!to || !ready) return;
    setBusy(true);
    const a = await post(API, { action: 'status', id, status: to, ...(note.trim() ? { note: note.trim() } : {}) });
    setBusy(false);
    if (!a.error) {
      setTo(null);
      setSaid({ text: w['status.done'] ?? '', bad: false });
      return router.refresh();
    }
    setSaid({ text: errWords(w, a.error), bad: true });
  }

  return (
    <div className="bd-act" data-testid={testId}>
      <div className="a2-gap8">
        {NEXT[status].map((s) => (
          <button
            key={s}
            type="button"
            className={`a2-btn sm${s === 'FIXED' ? ' pri' : ''}`}
            aria-expanded={to === s}
            aria-controls={`${fid}-f`}
            onClick={() => {
              setTo(to === s ? null : s);
              setNote('');
              setSaid(null);
            }}
            data-testid={`${testId}-${s}`}
          >
            {w[`status.${s}`]}
          </button>
        ))}
      </div>
      {to ? (
        <div className="bd-form a2-mt6" id={`${fid}-f`} data-testid={`${testId}-form`}>
          <label className="bd-fld">
            <span className="a2-xs">{w['status.note']}</span>
            <textarea className="a2-ta" rows={2} value={note} disabled={busy} onChange={(e) => setNote(e.target.value)} data-testid={`${testId}-note`} />
          </label>
          <div className="a2-gap8">
            <button type="button" className="a2-btn pri" disabled={!ready} onClick={save} data-testid={`${testId}-save`}>
              {w['status.save']}
            </button>
            <button type="button" className="a2-btn" disabled={busy} onClick={() => setTo(null)}>
              {w['status.cancel']}
            </button>
          </div>
        </div>
      ) : null}
      {said ? (
        <p className={`a2-xs a2-mt6${said.bad ? ' bk-warn' : ''}`} role="status" data-testid={`${testId}-said`}>
          {said.text}
        </p>
      ) : null}
    </div>
  );
}
