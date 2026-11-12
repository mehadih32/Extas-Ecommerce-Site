// @extas/analytics — S15 · PR 338–339 (Blueprint D5, "Analytics — Locked"): the site-wide analytics event layer.
// "Deterministic event capture first" (D5.3): every tracked moment carries its own event, validated against the
// owner's own catalogue (events.ts) and stored in the shop's own database (record.ts, the AnalyticsEvent table) —
// nothing here depends on an outside service, and nothing here is an AI guess. A per-page funnel (funnel.ts) is a
// saved, ordered list of those same event names, and its own count is computed the same deterministic way. The AI
// layer that reads these numbers and writes the plain-language verdict is a separate job (PR 333 already explains;
// PR 340 is the report section itself); this package only captures and counts, never interprets.
export * from './events';
export * from './record';
export * from './funnel';
