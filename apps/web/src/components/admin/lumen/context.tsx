'use client';
// PR 627 (CN-036, LUMEN-SPEC §3) — what every Lumen pattern reads from the shell: its words (the shell's dictionary,
// `shell.lm.*`, in the admin's language) and the numbers of `admin.patterns` (Undo seconds, the "Show more" step).
// AdminShell provides it once; a pattern drawn without the shell (a test) falls back to the shipped numbers and the
// key's own name, so it never breaks.
import { createContext, useContext, type ReactNode } from 'react';
import { t, type Dict } from '@/lib/i18n';

export interface LumenSetup {
  dict: Dict;
  undoSeconds: number;
  pageStep: number;
}

/** The shipped numbers (admin.patterns as shipped: registry v236). */
export const LUMEN_DEFAULTS: LumenSetup = { dict: {}, undoSeconds: 5, pageStep: 12 };

const Ctx = createContext<LumenSetup>(LUMEN_DEFAULTS);

export function LumenProvider({ value, children }: { value: LumenSetup; children: ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** The patterns' setup and a word reader (`lt('undo')` = shell.lm.undo). */
export function useLumen(): LumenSetup & { lt: (key: string, vars?: Record<string, string | number>) => string } {
  const v = useContext(Ctx);
  return { ...v, lt: (key, vars) => t(v.dict, `shell.lm.${key}`, vars) };
}
