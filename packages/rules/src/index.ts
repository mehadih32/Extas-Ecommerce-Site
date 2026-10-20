// @extas/rules — S10 · Smart Rules (Gyani), register PR 208–219:
// - PR 208 the rules engine (model.ts, match.ts, engine.ts): conditions, actions, priority and the active window;
// - PR 209 the rule admin with a live preview (rules-service.ts, templates.ts, core.ts);
// - PR 210 delivery rules (charges per band, free-delivery threshold, campaigns) · PR 211 exchange rules (window, who
//   pays, what qualifies) · PR 212 set / combo tiers (any 2 for X, any 3 for Y) · PR 213 discounts and coupons with the
//   "was" price honesty guard (was-price.ts, coupons-service.ts) · PR 214 festive rules with cut-off dates;
// - PR 215 rule text everywhere from the rule (text.ts, public.ts);
// - PR 216 notices and the pop-up builder (notices-model.ts, notices-service.ts);
// - PR 217 conflict detection and the resolution order (conflicts.ts, conflicts-service.ts);
// - PR 218 rule history (history.ts); PR 219 rule simulation (simulate-service.ts);
// - background jobs (jobs.ts); the sample rules for the sample store are `@extas/rules/sample` (sample.ts), kept out of
//   the app's bundle.
// Every service takes the database and a settings reader, checks the permission itself and writes the audit log in
// the same transaction. A rule that moves money needs the owner's OK (`rules.approve`) to go live and for every change
// of its money while live (CLAUDE.md rule 6). The admin API is apps/web/src/app/api/admin/rules.
export * from './pure';
export * from './errors';
export * from './context';
export * from './rows';
export * from './templates';
export * from './facts';
export * from './cache';
export * from './core';
export * from './rules-service';
export * from './conflicts-service';
export * from './simulate-service';
export * from './notices-service';
export * from './coupons-service';
export * from './public';
export * from './jobs';
