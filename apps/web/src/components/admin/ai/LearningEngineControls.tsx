'use client';
// S15 · PR 585 — AI › Learning engine's own small forms and buttons, every one `POST /api/admin/ai/learning
// {action, ...}`, the same "plain inline form + runCall + router.refresh()" shape `AgentAssignmentForm.tsx`/
// `CompleteAssignmentButton.tsx` (PR 577) already use — no modal dialog needed for any of these.
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { runCall, withBody, type LmCall } from '@/lib/admin-lumen/safety';
import { showToast } from '@/components/admin/lumen/Toast';

const CALL: LmCall = { method: 'POST', url: '/api/admin/ai/learning' };

export interface AgentOption {
  key: string;
  label: string;
}

async function post(body: Record<string, unknown>, failedText: string): Promise<boolean> {
  const ok = await runCall(withBody(CALL, body));
  if (!ok) showToast({ text: failedText, tone: 'bad' });
  return ok;
}

// ---------------------------------------------------------------------------------------------------------------
// Sources
// ---------------------------------------------------------------------------------------------------------------

export function LearningSourceForm({
  agentOptions,
  kindOptions,
  texts: x,
}: {
  agentOptions: readonly AgentOption[];
  kindOptions: readonly AgentOption[];
  texts: { agent: string; kind: string; url: string; add: string; added: string; failed: string };
}) {
  const router = useRouter();
  const [agentKey, setAgentKey] = useState(agentOptions[0]?.key ?? '');
  const [kind, setKind] = useState(kindOptions[0]?.key ?? '');
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);

  const add = async () => {
    if (busy || !url.trim()) return;
    setBusy(true);
    const ok = await post({ action: 'addSource', agentKey, kind, url: url.trim() }, x.failed);
    setBusy(false);
    if (!ok) return;
    setUrl('');
    showToast({ text: x.added, tone: 'ok' });
    router.refresh();
  };

  return (
    <div className="lrn-assign" data-testid="learning-source-form">
      <select className="a2-sel" aria-label={x.agent} value={agentKey} disabled={busy} onChange={(e) => setAgentKey(e.target.value)} data-testid="learning-source-agent">
        {agentOptions.map((a) => (
          <option key={a.key} value={a.key}>
            {a.label}
          </option>
        ))}
      </select>
      <select className="a2-sel" aria-label={x.kind} value={kind} disabled={busy} onChange={(e) => setKind(e.target.value)} data-testid="learning-source-kind">
        {kindOptions.map((k) => (
          <option key={k.key} value={k.key}>
            {k.label}
          </option>
        ))}
      </select>
      <div className="lrn-inline">
        <input className="a2-inp" placeholder={x.url} value={url} disabled={busy} onChange={(e) => setUrl(e.target.value)} data-testid="learning-source-url" />
        <button type="button" className="a2-btn sm ghost" disabled={busy || !url.trim()} onClick={() => void add()} data-testid="learning-source-add">
          {x.add}
        </button>
      </div>
    </div>
  );
}

export function LearningSourceSwitch({ id, on, label, onText, offText, failedText }: { id: string; on: boolean; label: string; onText: string; offText: string; failedText: string }) {
  const [enabled, setEnabled] = useState(on);
  const [busy, setBusy] = useState(false);
  const flip = async () => {
    if (busy) return;
    const next = !enabled;
    setBusy(true);
    const ok = await post({ action: 'setSourceEnabled', id, enabled: next }, failedText);
    setBusy(false);
    if (!ok) return;
    setEnabled(next);
    showToast({ text: next ? onText : offText });
  };
  return (
    <button type="button" role="switch" aria-checked={enabled} aria-label={label} className={`lm-sw${enabled ? ' on' : ''}`} onClick={flip} disabled={busy} data-testid={`learning-source-sw-${id}`}>
      <span aria-hidden="true" />
    </button>
  );
}

export function LearningSourceArchiveButton({ id, label, doneText, failedText }: { id: string; label: string; doneText: string; failedText: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const archive = async () => {
    if (busy) return;
    setBusy(true);
    const ok = await post({ action: 'archiveSource', id }, failedText);
    setBusy(false);
    if (!ok) return;
    showToast({ text: doneText, tone: 'ok' });
    router.refresh();
  };
  return (
    <button type="button" className="a2-btn sm ghost" disabled={busy} onClick={() => void archive()} data-testid={`learning-source-archive-${id}`}>
      {label}
    </button>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// Tips
// ---------------------------------------------------------------------------------------------------------------

export function LearningTipForm({
  agentOptions,
  sourceOptions,
  texts: x,
}: {
  agentOptions: readonly AgentOption[];
  sourceOptions: readonly AgentOption[];
  texts: { agent: string; source: string; sourceNone: string; tip: string; propose: string; proposed: string; failed: string };
}) {
  const router = useRouter();
  const [agentKey, setAgentKey] = useState(agentOptions[0]?.key ?? '');
  const [sourceId, setSourceId] = useState('');
  const [tip, setTip] = useState('');
  const [busy, setBusy] = useState(false);

  const propose = async () => {
    if (busy || !tip.trim()) return;
    setBusy(true);
    const ok = await post({ action: 'proposeTip', agentKey, sourceId: sourceId || undefined, tip: tip.trim() }, x.failed);
    setBusy(false);
    if (!ok) return;
    setTip('');
    showToast({ text: x.proposed, tone: 'ok' });
    router.refresh();
  };

  return (
    <div className="lrn-assign" data-testid="learning-tip-form">
      <div className="lrn-inline">
        <select className="a2-sel" aria-label={x.agent} value={agentKey} disabled={busy} onChange={(e) => setAgentKey(e.target.value)} data-testid="learning-tip-agent">
          {agentOptions.map((a) => (
            <option key={a.key} value={a.key}>
              {a.label}
            </option>
          ))}
        </select>
        <select className="a2-sel" aria-label={x.source} value={sourceId} disabled={busy} onChange={(e) => setSourceId(e.target.value)} data-testid="learning-tip-source">
          <option value="">{x.sourceNone}</option>
          {sourceOptions.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </select>
      </div>
      <textarea className="a2-inp" rows={2} placeholder={x.tip} value={tip} disabled={busy} onChange={(e) => setTip(e.target.value)} data-testid="learning-tip-text" />
      <button type="button" className="a2-btn sm ghost" disabled={busy || !tip.trim()} onClick={() => void propose()} data-testid="learning-tip-propose">
        {x.propose}
      </button>
    </div>
  );
}

export function LearningTipVerifyForm({
  tipId,
  texts: x,
}: {
  tipId: string;
  texts: { testNote: string; confidence: string; confidenceOptions: readonly AgentOption[]; supporting: string; run: string; verified: string; failedGate: string; failed: string };
}) {
  const router = useRouter();
  const [testNote, setTestNote] = useState('');
  const [confidence, setConfidence] = useState(x.confidenceOptions[1]?.key ?? 'medium');
  const [supporting, setSupporting] = useState('');
  const [busy, setBusy] = useState(false);

  const run = async () => {
    if (busy || !testNote.trim()) return;
    setBusy(true);
    const supportingSourceIds = supporting
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const ok = await post({ action: 'verifyTip', tipId, testNote: testNote.trim(), confidence, supportingSourceIds }, x.failed);
    setBusy(false);
    if (!ok) return;
    setTestNote('');
    setSupporting('');
    showToast({ text: x.verified, tone: 'ok' });
    router.refresh();
  };

  return (
    <div className="lrn-assign" data-testid={`learning-tip-verify-${tipId}`}>
      <textarea className="a2-inp" rows={2} placeholder={x.testNote} value={testNote} disabled={busy} onChange={(e) => setTestNote(e.target.value)} data-testid={`learning-tip-testnote-${tipId}`} />
      <div className="lrn-inline">
        <select className="a2-sel" aria-label={x.confidence} value={confidence} disabled={busy} onChange={(e) => setConfidence(e.target.value)} data-testid={`learning-tip-confidence-${tipId}`}>
          {x.confidenceOptions.map((c) => (
            <option key={c.key} value={c.key}>
              {c.label}
            </option>
          ))}
        </select>
        <input className="a2-inp" placeholder={x.supporting} value={supporting} disabled={busy} onChange={(e) => setSupporting(e.target.value)} data-testid={`learning-tip-supporting-${tipId}`} />
        <button type="button" className="a2-btn sm ghost" disabled={busy || !testNote.trim()} onClick={() => void run()} data-testid={`learning-tip-verify-run-${tipId}`}>
          {x.run}
        </button>
      </div>
    </div>
  );
}

export function LearningTipPromoteForm({ tipId, texts: x }: { tipId: string; texts: { name: string; purpose: string; promote: string; promoted: string; failed: string } }) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [purpose, setPurpose] = useState('');
  const [busy, setBusy] = useState(false);

  const promote = async () => {
    if (busy || !name.trim()) return;
    setBusy(true);
    const ok = await post({ action: 'promoteTip', tipId, name: name.trim(), purpose: purpose.trim() || undefined }, x.failed);
    setBusy(false);
    if (!ok) return;
    setName('');
    setPurpose('');
    showToast({ text: x.promoted, tone: 'ok' });
    router.refresh();
  };

  return (
    <div className="lrn-assign" data-testid={`learning-tip-promote-${tipId}`}>
      <div className="lrn-inline">
        <input className="a2-inp" placeholder={x.name} value={name} disabled={busy} onChange={(e) => setName(e.target.value)} data-testid={`learning-tip-skillname-${tipId}`} />
        <input className="a2-inp" placeholder={x.purpose} value={purpose} disabled={busy} onChange={(e) => setPurpose(e.target.value)} data-testid={`learning-tip-skillpurpose-${tipId}`} />
        <button type="button" className="a2-btn sm pri" disabled={busy || !name.trim()} onClick={() => void promote()} data-testid={`learning-tip-promote-go-${tipId}`}>
          {x.promote}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// Practice tasks
// ---------------------------------------------------------------------------------------------------------------

export function PracticeTaskForm({
  agentOptions,
  texts: x,
}: {
  agentOptions: readonly AgentOption[];
  texts: { agent: string; title: string; goal: string; deadline: string; create: string; created: string; failed: string };
}) {
  const router = useRouter();
  const [agentKey, setAgentKey] = useState(agentOptions[0]?.key ?? '');
  const [title, setTitle] = useState('');
  const [goal, setGoal] = useState('');
  const [deadline, setDeadline] = useState('');
  const [busy, setBusy] = useState(false);

  const create = async () => {
    if (busy || !title.trim() || !goal.trim()) return;
    setBusy(true);
    const ok = await post({ action: 'createPracticeTask', agentKey, title: title.trim(), goal: goal.trim(), deadline: deadline || undefined }, x.failed);
    setBusy(false);
    if (!ok) return;
    setTitle('');
    setGoal('');
    setDeadline('');
    showToast({ text: x.created, tone: 'ok' });
    router.refresh();
  };

  return (
    <div className="lrn-assign" data-testid="practice-task-form">
      <select className="a2-sel" aria-label={x.agent} value={agentKey} disabled={busy} onChange={(e) => setAgentKey(e.target.value)} data-testid="practice-task-agent">
        {agentOptions.map((a) => (
          <option key={a.key} value={a.key}>
            {a.label}
          </option>
        ))}
      </select>
      <input className="a2-inp" placeholder={x.title} value={title} disabled={busy} onChange={(e) => setTitle(e.target.value)} data-testid="practice-task-title" />
      <div className="lrn-inline">
        <input className="a2-inp" placeholder={x.goal} value={goal} disabled={busy} onChange={(e) => setGoal(e.target.value)} data-testid="practice-task-goal" />
        <input type="date" className="a2-inp lrn-date" aria-label={x.deadline} value={deadline} disabled={busy} onChange={(e) => setDeadline(e.target.value)} data-testid="practice-task-deadline" />
        <button type="button" className="a2-btn sm ghost" disabled={busy || !title.trim() || !goal.trim()} onClick={() => void create()} data-testid="practice-task-create">
          {x.create}
        </button>
      </div>
    </div>
  );
}

export function PracticeTaskGradeForm({
  taskId,
  texts: x,
}: {
  taskId: string;
  texts: { status: string; statusOptions: readonly AgentOption[]; grade: string; gradeOptions: readonly AgentOption[]; save: string; saved: string; failed: string };
}) {
  const router = useRouter();
  const [status, setStatus] = useState(x.statusOptions[0]?.key ?? 'done');
  const [grade, setGrade] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (busy) return;
    setBusy(true);
    const ok = await post({ action: 'gradePracticeTask', id: taskId, status, grade: grade || undefined }, x.failed);
    setBusy(false);
    if (!ok) return;
    showToast({ text: x.saved, tone: 'ok' });
    router.refresh();
  };

  return (
    <div className="lrn-inline" data-testid={`practice-task-grade-${taskId}`}>
      <select className="a2-sel" aria-label={x.status} value={status} disabled={busy} onChange={(e) => setStatus(e.target.value)} data-testid={`practice-task-status-${taskId}`}>
        {x.statusOptions.map((s) => (
          <option key={s.key} value={s.key}>
            {s.label}
          </option>
        ))}
      </select>
      <select className="a2-sel" aria-label={x.grade} value={grade} disabled={busy} onChange={(e) => setGrade(e.target.value)} data-testid={`practice-task-gradeval-${taskId}`}>
        <option value="">—</option>
        {x.gradeOptions.map((g) => (
          <option key={g.key} value={g.key}>
            {g.label}
          </option>
        ))}
      </select>
      <button type="button" className="a2-btn sm ghost" disabled={busy} onClick={() => void save()} data-testid={`practice-task-grade-go-${taskId}`}>
        {x.save}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// Paid tool proposal
// ---------------------------------------------------------------------------------------------------------------

export function PaidToolProposalForm({
  agentOptions,
  texts: x,
}: {
  agentOptions: readonly AgentOption[];
  texts: { agent: string; toolName: string; cost: string; currency: string; reason: string; propose: string; proposed: string; failed: string };
}) {
  const router = useRouter();
  const [agentKey, setAgentKey] = useState(agentOptions[0]?.key ?? '');
  const [toolName, setToolName] = useState('');
  const [cost, setCost] = useState('');
  const [currency, setCurrency] = useState('BDT');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const propose = async () => {
    const amount = Number(cost);
    if (busy || !toolName.trim() || !reason.trim() || !Number.isFinite(amount) || amount <= 0) return;
    setBusy(true);
    const ok = await post({ action: 'proposePaidTool', agentKey, toolName: toolName.trim(), costAmount: amount, costCurrency: currency.trim() || 'BDT', reason: reason.trim() }, x.failed);
    setBusy(false);
    if (!ok) return;
    setToolName('');
    setCost('');
    setReason('');
    showToast({ text: x.proposed, tone: 'ok' });
    router.refresh();
  };

  return (
    <div className="lrn-assign" data-testid="paid-tool-form">
      <div className="lrn-inline">
        <select className="a2-sel" aria-label={x.agent} value={agentKey} disabled={busy} onChange={(e) => setAgentKey(e.target.value)} data-testid="paid-tool-agent">
          {agentOptions.map((a) => (
            <option key={a.key} value={a.key}>
              {a.label}
            </option>
          ))}
        </select>
        <input className="a2-inp" placeholder={x.toolName} value={toolName} disabled={busy} onChange={(e) => setToolName(e.target.value)} data-testid="paid-tool-name" />
      </div>
      <div className="lrn-inline">
        <input className="a2-inp" type="number" min={0} placeholder={x.cost} value={cost} disabled={busy} onChange={(e) => setCost(e.target.value)} data-testid="paid-tool-cost" />
        <input className="a2-inp lrn-date" placeholder={x.currency} value={currency} disabled={busy} onChange={(e) => setCurrency(e.target.value)} data-testid="paid-tool-currency" />
      </div>
      <textarea className="a2-inp" rows={2} placeholder={x.reason} value={reason} disabled={busy} onChange={(e) => setReason(e.target.value)} data-testid="paid-tool-reason" />
      <button type="button" className="a2-btn sm pri" disabled={busy || !toolName.trim() || !reason.trim()} onClick={() => void propose()} data-testid="paid-tool-propose">
        {x.propose}
      </button>
    </div>
  );
}
