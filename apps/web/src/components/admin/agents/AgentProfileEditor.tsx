'use client';
// S15 · PR 577 (C10.4) — the owner's own identity edit on one agent's 360° profile: bio, photo URL, joining date
// and the verified star. Never the agent's name/role/code (those stay structural, agents.ts). One form, one Save
// button through the admin's own API (`PATCH /api/admin/agents/:key`, `ai.control`, audited server-side); a patch
// that changes nothing is still a normal save (the server itself makes it a no-op). Drawn only for someone who
// holds `ai.control`; a read-only viewer sees the plain text instead (built by the page, not this file).
import { useState } from 'react';
import { runCall, type LmCall } from '@/lib/admin-lumen/safety';
import { showToast } from '@/components/admin/lumen/Toast';

export function AgentProfileEditor({
  agentKey,
  bio,
  photoUrl,
  joinedOn,
  verified,
  labels,
}: {
  agentKey: string;
  bio: string | null;
  photoUrl: string | null;
  joinedOn: string | null;
  verified: boolean;
  labels: { bio: string; photo: string; joined: string; verified: string; save: string; saved: string; failed: string; invalid: string };
}) {
  const [bioText, setBioText] = useState(bio ?? '');
  const [photoText, setPhotoText] = useState(photoUrl ?? '');
  const [joinedText, setJoinedText] = useState(joinedOn ?? '');
  const [isVerified, setIsVerified] = useState(verified);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (busy) return;
    if (photoText && !/^https?:\/\//.test(photoText)) {
      showToast({ text: labels.invalid, tone: 'bad' });
      return;
    }
    if (joinedText && !/^\d{4}-\d{2}-\d{2}$/.test(joinedText)) {
      showToast({ text: labels.invalid, tone: 'bad' });
      return;
    }
    const call: LmCall = { method: 'PATCH', url: `/api/admin/agents/${agentKey}`, body: { bio: bioText || null, photoUrl: photoText || null, joinedOn: joinedText || null, verified: isVerified } };
    setBusy(true);
    const ok = await runCall(call);
    setBusy(false);
    showToast({ text: ok ? labels.saved : labels.failed, tone: ok ? 'ok' : 'bad' });
  };

  return (
    <div className="ag-editor" data-testid={`agent-edit-${agentKey}`}>
      <label className="a2-lbl" htmlFor={`ag-bio-${agentKey}`}>
        {labels.bio}
      </label>
      <textarea id={`ag-bio-${agentKey}`} className="a2-ta" rows={3} maxLength={600} value={bioText} disabled={busy} onChange={(e) => setBioText(e.target.value)} data-testid={`agent-edit-bio-${agentKey}`} />
      <label className="a2-lbl ag-mt" htmlFor={`ag-photo-${agentKey}`}>
        {labels.photo}
      </label>
      <input id={`ag-photo-${agentKey}`} type="url" className="a2-inp" placeholder="https://…" value={photoText} disabled={busy} onChange={(e) => setPhotoText(e.target.value)} data-testid={`agent-edit-photo-${agentKey}`} />
      <label className="a2-lbl ag-mt" htmlFor={`ag-joined-${agentKey}`}>
        {labels.joined}
      </label>
      <input id={`ag-joined-${agentKey}`} type="date" className="a2-inp" value={joinedText} disabled={busy} onChange={(e) => setJoinedText(e.target.value)} data-testid={`agent-edit-joined-${agentKey}`} />
      <label className="a2-chkl ag-mt">
        <input type="checkbox" checked={isVerified} disabled={busy} onChange={(e) => setIsVerified(e.target.checked)} data-testid={`agent-edit-verified-${agentKey}`} />
        <span>{labels.verified}</span>
      </label>
      <button type="button" className="a2-btn sm pri ag-mt" disabled={busy} onClick={() => void save()} data-testid={`agent-edit-save-${agentKey}`}>
        {labels.save}
      </button>
    </div>
  );
}
