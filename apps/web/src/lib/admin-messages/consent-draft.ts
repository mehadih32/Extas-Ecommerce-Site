// S14 · PR 298 — the Consent page's form as it is typed: the stop and start words as one line each (commas between),
// and the changes a save sends (only what changed). No React; the API checks every value again.
import type { ConsentSettings } from '@extas/settings';

export interface ConsentDraft {
  stopWords: string;
  startWords: string;
  stopCovers: ConsentSettings['stopCovers'];
  stopChannels: ConsentSettings['stopChannels'];
  offerSteps: ConsentSettings['offerSteps'];
  confirmReply: boolean;
}

export const wordsText = (l: readonly string[]): string => l.join(', ');

/** Words as typed: split on commas or new lines, trimmed, each once (any case). */
export function wordsOf(text: string): string[] {
  const seen = new Set<string>();
  return text
    .split(/[,\n]/)
    .map((w) => w.trim().replace(/\s+/g, ' '))
    .filter((w) => w && !seen.has(w.toUpperCase()) && seen.add(w.toUpperCase()));
}

export const consentDraft = (c: ConsentSettings): ConsentDraft => ({ ...c, stopWords: wordsText(c.stopWords), startWords: wordsText(c.startWords), offerSteps: [...c.offerSteps] });

/** The setting as the draft says it. */
export const consentOfDraft = (d: ConsentDraft): ConsentSettings => ({ ...d, stopWords: wordsOf(d.stopWords), startWords: wordsOf(d.startWords) });

/** The save's body: the whole setting when anything in it changed, else nothing. */
export function consentChanges(d: ConsentDraft, c: ConsentSettings): { consent?: ConsentSettings } {
  const next = consentOfDraft(d);
  const same = JSON.stringify({ ...next, offerSteps: [...next.offerSteps].sort() }) === JSON.stringify({ ...c, offerSteps: [...c.offerSteps].sort() });
  return same ? {} : { consent: next };
}
