'use client';
// PR 12 — the few words a client-side screen of the shell needs without a server render of its own: the error page
// (app/admin/error.tsx) runs in the browser, so the layout hands it the system states' texts in the admin's language,
// and whether the shell is drawn around it (no session: the state draws its own frame).
import { createContext, useContext, type ReactNode } from 'react';
import type { Dict } from '@/lib/i18n';

export interface ShellText {
  lang: string;
  /** `{ shell: { state: … } }`, the same keys as the server's dictionary. */
  dict: Dict;
  inShell: boolean;
}

const Ctx = createContext<ShellText>({ lang: 'bn', dict: {}, inShell: false });

export function ShellTextProvider({ value, children }: { value: ShellText; children: ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useShellText = () => useContext(Ctx);
