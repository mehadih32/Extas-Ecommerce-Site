'use client';
// S28 · PR 692 — Inbox › Quick replies: the add / edit form and the Archive / Restore buttons. A quick reply is never
// deleted. Each save is one request; a refusal is words from `w5a.err.*`.
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { call } from '../api';
import { errWords, Msg } from './Parts';
import { t, type Dict } from '@/lib/i18n';

export interface ReplyRow {
  id: string;
  shortcut: string;
  bodyEn: string;
  bodyBn: string;
  usedCount: number;
}

const API = '/api/admin/support/replies';

export function ReplyForm({ dict, edit, maxChars, onDone }: { dict: Dict; edit: ReplyRow | null; maxChars: number; onDone?: () => void }) {
  const router = useRouter();
  const c = (k: string, v?: Record<string, string | number>) => t(dict, `w5a.replies.${k}`, v);
  const [shortcut, setShortcut] = useState(edit?.shortcut ?? '');
  const [en, setEn] = useState(edit?.bodyEn ?? '');
  const [bn, setBn] = useState(edit?.bodyBn ?? '');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const go = async () => {
    setBusy(true);
    const a = await call('POST', API, { ...(edit ? { id: edit.id } : {}), shortcut, bodyEn: en, bodyBn: bn });
    setBusy(false);
    if (!a.data.ok) return setMsg({ ok: false, text: errWords(dict, a) });
    if (!edit) {
      setShortcut('');
      setEn('');
      setBn('');
    }
    setMsg({ ok: true, text: c('saved') });
    router.refresh();
    onDone?.();
  };
  return (
    <div className="a2-stack" style={{ gap: 10 }} data-testid="reply-form">
      <label className="a2-stack" style={{ gap: 4 }}>
        <span className="a2-sm">{c('fShort')}</span>
        <input className="a2-inp" value={shortcut} maxLength={24} placeholder="price" onChange={(e) => setShortcut(e.target.value)} style={{ maxWidth: 220 }} data-testid="reply-short" />
        <span className="a2-xs a2-mute">{c('fShortHint')}</span>
      </label>
      <label className="a2-stack" style={{ gap: 4 }}>
        <span className="a2-sm">{c('fEn')}</span>
        <textarea className="a2-inp a2-ta" rows={3} maxLength={maxChars} value={en} onChange={(e) => setEn(e.target.value)} data-testid="reply-en" />
        <span className="a2-xs a2-mute">{c('letters', { n: en.length, max: maxChars })}</span>
      </label>
      <label className="a2-stack" style={{ gap: 4 }}>
        <span className="a2-sm">{c('fBn')}</span>
        <textarea className="a2-inp a2-ta" rows={3} maxLength={maxChars} value={bn} onChange={(e) => setBn(e.target.value)} data-testid="reply-bn" />
        <span className="a2-xs a2-mute">{c('letters', { n: bn.length, max: maxChars })}</span>
      </label>
      <div className="a2-gap8" style={{ alignItems: 'center' }}>
        <button type="button" className="a2-btn pri sm" onClick={go} disabled={busy} data-testid="reply-save">
          {c('save')}
        </button>
        <Msg m={msg} />
      </div>
    </div>
  );
}

export function ReplyRowActions({ dict, row, archived, maxChars }: { dict: Dict; row: ReplyRow; archived: boolean; maxChars: number }) {
  const router = useRouter();
  const c = (k: string) => t(dict, `w5a.replies.${k}`);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const move = async () => {
    if (!archived && !window.confirm(c('confirmArchive'))) return;
    setBusy(true);
    const a = await call('POST', `${API}/${row.id}/archive`, { archive: !archived });
    setBusy(false);
    if (!a.data.ok) return setMsg({ ok: false, text: errWords(dict, a) });
    router.refresh();
  };
  return (
    <div className="a2-stack" style={{ gap: 6, alignItems: 'flex-end' }}>
      <span className="a2-gap8">
        {!archived ? (
          <button type="button" className="a2-btn sm" onClick={() => setOpen(!open)} aria-expanded={open} data-testid="reply-edit">
            {c('edit')}
          </button>
        ) : null}
        <button type="button" className="a2-btn sm" onClick={move} disabled={busy} data-testid={archived ? 'reply-restore' : 'reply-archive'}>
          {archived ? c('restore') : c('archive')}
        </button>
      </span>
      <Msg m={msg} />
      {open ? <ReplyForm dict={dict} edit={row} maxChars={maxChars} onDone={() => setOpen(false)} /> : null}
    </div>
  );
}
