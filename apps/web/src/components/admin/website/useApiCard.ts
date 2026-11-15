'use client';
// PR 746–749 — one settings card's draft, its version and its save, for the pages that save whole cards to their own API
// (Categories & tags, Checkout). The same rules as every card: STALE reads the card again; the words of an error come from
// the page's own file first, then the shared save errors.
import { useState } from 'react';
import { call } from '../api';
import { showToast } from '../lumen/Toast';
import { useShellText } from '../shell/ShellText';
import { commonSaveError } from '@/lib/admin-shell/save-errors';

export interface ApiScreen<V> {
  key: string;
  value: V;
  version: string;
}
export type Say = { text: string; bad: boolean } | null;
export const sameJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export function useApiCard<V>(api: string, screen: ApiScreen<V>, x: (k: string) => string, canEdit: boolean, check?: (v: V) => string | null) {
  const shell = useShellText();
  const [base, setBase] = useState(screen);
  const [draft, setDraft] = useState<V>(screen.value);
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<Say>(null);
  const dirty = !sameJson(draft, base.value);
  const edit = (next: V) => {
    setDraft(next);
    setSaid(null);
  };
  const fresh = (cards: Record<string, ApiScreen<V>> | undefined) => {
    const c = cards?.[base.key];
    if (!c) return;
    setBase(c);
    setDraft(c.value);
  };
  async function save() {
    const problem = check?.(draft) ?? null;
    if (problem) return setSaid({ text: problem, bad: true });
    setBusy(true);
    const a = await call('PUT', api, { key: base.key, value: draft, version: base.version });
    setBusy(false);
    if (a.status === 200) {
      fresh(a.data.cards as Record<string, ApiScreen<V>>);
      setSaid(null);
      return showToast({ text: x('saved'), tone: 'ok' });
    }
    const code = a.status === 0 ? 'network' : (a.data.error ?? 'other');
    if (code === 'STALE') {
      const g = await call('GET', api);
      if (g.status === 200) fresh(g.data.cards as Record<string, ApiScreen<V>>);
    }
    const text = x(`err.${code}`);
    setSaid({ text: text !== `err.${code}` ? text : (commonSaveError(shell.dict, code) ?? x('err.other')), bad: true });
  }
  return { base, draft, edit, busy, said, dirty, off: !canEdit || busy, save, discard: () => edit(base.value) };
}
