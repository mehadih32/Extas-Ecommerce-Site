'use client';
// S21 · PR 420 (B7.3) — Approve / Reject on Reports › Site health › Fixes to approve: each opens the confirm step (what
// will happen, an optional reason for the audit log), then POSTs {action, id, reason} and the page reloads its data.
// The words come from the page; the API checks `health.fixes.approve` again and never lets anyone decide their own.
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { call } from '../api';
import { ConfirmDialog, type ConfirmTexts } from './ConfirmDialog';

export interface ProposalDecideTexts {
  approve: string;
  reject: string;
  approveDialog: ConfirmTexts;
  rejectDialog: ConfirmTexts;
  err: Record<string, string>;
}

export function ProposalDecide({ url, id, texts: x }: { url: string; id: string; texts: ProposalDecideTexts }) {
  const router = useRouter();
  const [open, setOpen] = useState<'approve' | 'reject' | null>(null);

  async function decide(action: 'approve' | 'reject', reason: string): Promise<string | null> {
    const a = await call('POST', url, { action, id, reason });
    if (a.status === 200) {
      setOpen(null);
      router.refresh();
      return null;
    }
    const code = a.status === 0 ? 'network' : (a.data.error ?? 'other');
    // decided elsewhere meanwhile: show the fresh list behind the message
    if (code === 'DECIDED' || code === 'NOT_FOUND') router.refresh();
    return x.err[code] ?? x.err.other ?? code;
  }

  return (
    <div className="a2-gap8 a2-mt12">
      <button type="button" className="a2-btn pri" onClick={() => setOpen('approve')} data-testid="fix-approve">
        {x.approve}
      </button>
      <button type="button" className="a2-btn" onClick={() => setOpen('reject')} data-testid="fix-reject">
        {x.reject}
      </button>
      {open ? (
        <ConfirmDialog
          testId={`dlg-fix-${open}`}
          tone={open === 'approve' ? 'pri' : 'badf'}
          texts={open === 'approve' ? x.approveDialog : x.rejectDialog}
          onClose={() => setOpen(null)}
          onConfirm={(reason) => decide(open, reason)}
        />
      ) : null}
    </div>
  );
}
