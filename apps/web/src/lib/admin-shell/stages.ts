// PR 626 (CN-036, owner 6 Nov 2026) — whether the AI Center section and the round assistant button show. One source of
// truth: S19 PR 652's closed-stage switch (`stages.closedShown`, off = hidden as shipped; lib/stages/closed.ts). The
// shell session already holds the hidden parts of the closed stages (`hiddenPartsOf`); while S15 is closed its section
// `ai` and its widget `assistant` are among them. What S15 built stays, hidden. No React, no database.

/**
 * The AI Center section and the round assistant button show only while S15 is open (its parts are not hidden by the
 * closed-stage switch) and AI is switched on (`ai.enabled`, off as shipped). The assistant drafts and never sends;
 * Send acts only on a person's press.
 */
export function aiCenterShown(hidden: ReadonlySet<string>, aiEnabled: boolean): boolean {
  return !hidden.has('ai') && aiEnabled;
}
