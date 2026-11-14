'use client';
// S15 · PR 582 — the owner writes a memory by hand (a fact, a decision, an instruction, a lesson, ...), through
// `POST /api/admin/agents/:key/memory {action: 'add', kind, content, tags?}` (`ai.control`). The page reruns
// server-side on success (Next's own router refresh), so the new memory shows without a second fetch here.
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { runCall, type LmCall } from '@/lib/admin-lumen/safety';
import { showToast } from '@/components/admin/lumen/Toast';

export function AgentMemoryNoteForm({
  agentKey,
  kinds,
  labels,
}: {
  agentKey: string;
  kinds: { id: string; label: string }[];
  labels: { kind: string; content: string; tags: string; add: string; added: string; failed: string };
}) {
  const router = useRouter();
  const [kind, setKind] = useState(kinds[0]?.id ?? 'fact');
  const [content, setContent] = useState('');
  const [tags, setTags] = useState('');
  const [busy, setBusy] = useState(false);

  const add = async () => {
    if (busy || !content.trim()) return;
    const call: LmCall = {
      method: 'POST',
      url: `/api/admin/agents/${agentKey}/memory`,
      body: { action: 'add', kind, content: content.trim(), tags: tags.split(',').map((t) => t.trim()).filter(Boolean) },
    };
    setBusy(true);
    const ok = await runCall(call);
    setBusy(false);
    if (!ok) {
      showToast({ text: labels.failed, tone: 'bad' });
      return;
    }
    showToast({ text: labels.added, tone: 'ok' });
    setContent('');
    setTags('');
    router.refresh();
  };

  return (
    <div className="ag-inline" data-testid={`agent-memory-add-${agentKey}`}>
      <select className="a2-inp" value={kind} disabled={busy} onChange={(e) => setKind(e.target.value)} aria-label={labels.kind} data-testid={`agent-memory-kind-${agentKey}`}>
        {kinds.map((k) => (
          <option key={k.id} value={k.id}>
            {k.label}
          </option>
        ))}
      </select>
      <input className="a2-inp" placeholder={labels.content} value={content} disabled={busy} onChange={(e) => setContent(e.target.value)} data-testid={`agent-memory-content-${agentKey}`} />
      <input className="a2-inp" placeholder={labels.tags} value={tags} disabled={busy} onChange={(e) => setTags(e.target.value)} data-testid={`agent-memory-tags-${agentKey}`} />
      <button type="button" className="a2-btn sm ghost" disabled={busy || !content.trim()} onClick={() => void add()} data-testid={`agent-memory-add-btn-${agentKey}`}>
        {labels.add}
      </button>
    </div>
  );
}
