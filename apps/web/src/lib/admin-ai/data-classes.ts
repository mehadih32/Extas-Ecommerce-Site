// S15 · PR 310 (A5.2, A5.6, C1.5; AIC-01 Control room, Blueprint "A5. Model and cost policy" — Locked) — every AI
// agent's work carries a data class, and the data class alone decides whether a free-capable connection may ever
// run it: **personal** and **business** data never reach a free route, even when the owner picks one in the
// per-agent model picker (PR 307) — the system quietly routes to the cheapest ready PAID connection instead and
// says why (A5.6, "the interface explains why and offers the cheapest permitted model instead"). Only
// **public/draft** work — content a person reviews before it goes out (blog, SEO, social copy; A5.3's own list,
// which is Doot's and Shilpi's jobs) — may use a free-capable connection.
//
// Which connection counts as "free-capable": OpenRouter is the one PR 306 connection that can carry a free-tier
// model (Blueprint A5.1, "Free / OpenRouter-style models" — the two are named together); Anthropic, OpenAI and
// Google Gemini are always paid, per-token connections, never free. Whether one particular OpenRouter model id is
// itself actually free is recorded by the AI Cost Book's job rows (PR 312) — openrouter.ts says so plainly ("is
// this model free is recorded in PR 312, not here") — so until that lands, this routes every OpenRouter pick for
// personal/business work away rather than risk sending real data down a model that might be free; once PR 312
// records a model as genuinely paid, routing it only ever gets less restrictive, never more.
//
// This is agent-level for now — the same honest interim PR 307/308 used for the model pick and the schedule before
// a job runner existed. The true per-JOB data class (one job can outrank its agent's own default — e.g. a reply
// Doot drafts for a named customer is personal even though most of Doot's work is public content) arrives with the
// AI Cost Book's 60-90 job rows (PR 312, Blueprint C2.2); an agent-level class can only ever be as careful as, or
// more careful than, that finer one, so nothing here is loosened later, only sharpened. The policy table itself
// (which data class allows a free route, and which agent carries which class) is Locked by the owner (Blueprint
// A5.2), so — like the agent catalogue (`agents.ts`) and the permission catalogue — it ships as code, never a
// setting (CLAUDE.md rule 1 is about the owner's own numbers; this is the same structural, non-owner-data exception
// the agent catalogue already uses).
import { type AiAgentKey } from './agents';
import type { WriterOption, WriterProvider } from './model-picks';

export const DATA_CLASS_KEYS = ['personal', 'business', 'publicDraft'] as const;
export type DataClassKey = (typeof DATA_CLASS_KEYS)[number];

export function isDataClassKey(value: string): value is DataClassKey {
  return (DATA_CLASS_KEYS as readonly string[]).includes(value);
}

export interface DataClassDef {
  key: DataClassKey;
  nameEn: string;
  nameBn: string;
  /** May this data class ever reach a free-capable connection (Blueprint A5.2)? */
  freeAllowed: boolean;
}

/** The three data classes (Blueprint A5.2 table), in the order the policy card shows them: most sensitive first. */
export const DATA_CLASSES: readonly DataClassDef[] = [
  { key: 'personal', nameEn: 'Personal', nameBn: 'ব্যক্তিগত তথ্য', freeAllowed: false },
  { key: 'business', nameEn: 'Business', nameBn: 'ব্যবসার নিজের হিসাব', freeAllowed: false },
  { key: 'publicDraft', nameEn: 'Public / draft', nameBn: 'প্রকাশ্য / খসড়া লেখা', freeAllowed: true },
];

export function dataClassDef(key: DataClassKey): DataClassDef {
  const found = DATA_CLASSES.find((d) => d.key === key);
  if (!found) throw new Error(`unknown data class: ${key}`);
  return found;
}

/**
 * Every fixed agent's own data class. Gyani, Bhandari and Sawdagor each touch a customer's own order, address,
 * chat or courier record (A5.4's own examples: address parsing, customer-facing replies, orders that move money).
 * Prohori and Tirondaj work the shop's own numbers — security/audit and ad spend — never a named customer's data.
 * Shilpi and Doot draft content a person reviews before it goes out (A5.3's exact list: UI copy, blog, SEO,
 * social), so their default is the one class a free route may ever serve.
 */
export const AGENT_DATA_CLASS: Record<AiAgentKey, DataClassKey> = {
  gyani: 'personal',
  prohori: 'business',
  bhandari: 'personal',
  sawdagor: 'personal',
  shilpi: 'publicDraft',
  doot: 'publicDraft',
  tirondaj: 'business',
};

export function agentDataClass(key: AiAgentKey): DataClassKey {
  return AGENT_DATA_CLASS[key];
}

/** The one PR 306 connection that can ever carry a free-tier model (Blueprint A5.1). */
export const FREE_CAPABLE_PROVIDER: WriterProvider = 'openRouter';

export interface ProviderRouting {
  /** What actually runs once this policy is applied — may differ from the owner's own pick (`requested`). */
  effectiveProvider: WriterProvider | null;
  /** True once the owner's pick was moved away from a free-capable connection by this policy (A5.6), never for a
   * plain "not Tested yet" fallback (PR 307 already explains that one on its own). */
  downgraded: boolean;
}

/**
 * Applies the data-class rule on top of PR 307's own "not ready → the practice writer" fallback. `requested` and
 * `requestedReady` are the agent's already-resolved pick (`selectedProvider`/`selectedReady` in control-room.ts);
 * `options` is today's writer-option list (PR 307's `listWriterOptions`), searched for the cheapest ready PAID
 * fallback with `FREE_CAPABLE_PROVIDER` itself excluded — routing a free-capable pick away to another free-capable
 * one would defeat the point of the policy.
 */
export function routeProvider(dataClass: DataClassKey, requested: WriterProvider | null, requestedReady: boolean, options: readonly WriterOption[]): ProviderRouting {
  if (requested !== FREE_CAPABLE_PROVIDER || dataClassDef(dataClass).freeAllowed) {
    return { effectiveProvider: requestedReady ? requested : null, downgraded: false };
  }
  const paidReady = options.find((o) => o.provider !== null && o.provider !== FREE_CAPABLE_PROVIDER && o.ready);
  return { effectiveProvider: paidReady ? (paidReady.provider as WriterProvider) : null, downgraded: true };
}
