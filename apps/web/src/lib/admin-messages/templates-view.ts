// S14 · PR 505 — how Messages › Templates lists the templates: first the ones the order journey sends (in the journey's
// own order), then the other messages (self-confirm answers, the advance request, stop and start answers, the
// auto-reply), then the ones nothing sends now; and which one is open (`?key=`, else the first). No React, no database.
import type { TemplateGroup } from '@extas/messages';

export interface GroupedTemplates {
  journey: TemplateGroup[];
  other: TemplateGroup[];
  unused: TemplateGroup[];
}

export function groupTemplates(groups: readonly TemplateGroup[], steps: readonly string[]): GroupedTemplates {
  const first = (g: TemplateGroup) => Math.min(...g.uses.map((u) => steps.indexOf(u.use)).filter((i) => i >= 0));
  const journey = groups.filter((g) => g.uses.some((u) => steps.includes(u.use))).sort((a, b) => first(a) - first(b) || a.key.localeCompare(b.key));
  const other = groups.filter((g) => g.uses.length > 0 && !journey.includes(g));
  const unused = groups.filter((g) => g.uses.length === 0);
  return { journey, other, unused };
}

/** The open template: the one asked for, else the first on the list. */
export function openGroup(g: GroupedTemplates, key: string | null | undefined): TemplateGroup | null {
  const all = [...g.journey, ...g.other, ...g.unused];
  return all.find((x) => x.key === key) ?? all[0] ?? null;
}
