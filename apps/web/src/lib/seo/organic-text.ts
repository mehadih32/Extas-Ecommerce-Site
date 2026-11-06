// S11 · PR 238 — the organic report's list of sites as the admin card edits it: one site per line, "Name: word, word"
// (a host such as perplexity.ai, or one word of a host such as google), one box per kind. Pure; the setting itself
// checks every word again (`seo.organic`, registry v209).

export type OrganicKindName = 'search' | 'video' | 'ai';
export interface OrganicSourceText {
  name: string;
  kind: OrganicKindName;
  match: string[];
}

/** One kind's sites as lines. */
export function sourcesText(sources: readonly OrganicSourceText[], kind: OrganicKindName): string {
  return sources
    .filter((s) => s.kind === kind)
    .map((s) => `${s.name}: ${s.match.join(', ')}`)
    .join('\n');
}

/** Lines back into sites of one kind; a line without a name or a word is reported by its number (from 1). */
export function parseSourcesText(text: string, kind: OrganicKindName): { sources: OrganicSourceText[]; bad: number[] } {
  const sources: OrganicSourceText[] = [];
  const bad: number[] = [];
  text.split('\n').forEach((line, i) => {
    if (!line.trim()) return;
    const at = line.indexOf(':');
    const name = at > 0 ? line.slice(0, at).trim() : '';
    const match = at > 0 ? line.slice(at + 1).split(',').map((w) => w.trim().toLowerCase()).filter(Boolean) : [];
    if (!name || !match.length) bad.push(i + 1);
    else sources.push({ name, kind, match });
  });
  return { sources, bad };
}
