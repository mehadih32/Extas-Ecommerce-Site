'use client';
// S15 · PR 582 — one memory row: the owner can correct its own words (`{action: 'correct', memoryId, content}`)
// or archive/restore it (`{action: 'archive'|'restore', memoryId}`) — never delete it (CLAUDE.md rule 3). Both are
// `ai.control`; a reader only sees the row. The page reruns server-side on success, the same pattern every other
// agent-profile control in this folder uses.
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { runCall, type LmCall } from '@/lib/admin-lumen/safety';
import { showToast } from '@/components/admin/lumen/Toast';

export interface AgentMemoryItemLabels {
  corrected: string;
  archived: string;
  edit: string;
  save: string;
  cancel: string;
  archive: string;
  restore: string;
  savedText: string;
  saveFailed: string;
  archiveFailed: string;
}

export function AgentMemoryItem({
  agentKey,
  memoryId,
  content,
  tags,
  corrected,
  archived,
  canControl,
  labels,
}: {
  agentKey: string;
  memoryId: string;
  content: string;
  tags: string[];
  corrected: boolean;
  archived: boolean;
  canControl: boolean;
  labels: AgentMemoryItemLabels;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(content);
  const [busy, setBusy] = useState(false);
  const url = `/api/admin/agents/${agentKey}/memory`;

  const save = async () => {
    if (busy || !draft.trim() || draft === content) {
      setEditing(false);
      return;
    }
    const call: LmCall = { method: 'POST', url, body: { action: 'correct', memoryId, content: draft.trim() } };
    setBusy(true);
    const ok = await runCall(call);
    setBusy(false);
    if (!ok) {
      showToast({ text: labels.saveFailed, tone: 'bad' });
      return;
    }
    showToast({ text: labels.savedText, tone: 'ok' });
    setEditing(false);
    router.refresh();
  };

  const toggleArchived = async () => {
    if (busy) return;
    const call: LmCall = { method: 'POST', url, body: { action: archived ? 'restore' : 'archive', memoryId } };
    setBusy(true);
    const ok = await runCall(call);
    setBusy(false);
    if (!ok) {
      showToast({ text: labels.archiveFailed, tone: 'bad' });
      return;
    }
    router.refresh();
  };

  return (
    <div className="ag-li" data-testid={`agent-memory-${memoryId}`}>
      <div style={{ minWidth: 0 }}>
        {editing ? (
          <>
            <input className="a2-inp" value={draft} disabled={busy} onChange={(e) => setDraft(e.target.value)} data-testid={`agent-memory-edit-${memoryId}`} />
            <div className="ag-inline">
              <button type="button" className="a2-btn sm ghost" disabled={busy} onClick={() => void save()} data-testid={`agent-memory-save-${memoryId}`}>
                {labels.save}
              </button>
              <button
                type="button"
                className="a2-btn sm ghost"
                disabled={busy}
                onClick={() => {
                  setDraft(content);
                  setEditing(false);
                }}
              >
                {labels.cancel}
              </button>
            </div>
          </>
        ) : (
          <div className="a2-sm">{content}</div>
        )}
        <div className="a2-xs a2-mute">
          {tags.join(', ')}
          {corrected ? ` · ${labels.corrected}` : ''}
          {archived ? ` · ${labels.archived}` : ''}
        </div>
      </div>
      {canControl && !editing ? (
        <div className="ag-inline">
          <button type="button" className="a2-btn sm ghost" disabled={busy} onClick={() => setEditing(true)} data-testid={`agent-memory-edit-btn-${memoryId}`}>
            {labels.edit}
          </button>
          <button type="button" className="a2-btn sm ghost" disabled={busy} onClick={() => void toggleArchived()} data-testid={`agent-memory-archive-${memoryId}`}>
            {archived ? labels.restore : labels.archive}
          </button>
        </div>
      ) : null}
    </div>
  );
}
