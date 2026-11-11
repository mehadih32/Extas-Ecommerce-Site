// @extas/studio — the social & content studio core (S23, Blueprint C5; PR 437–443). Its own asset library, templates,
// rules, video assembly, publishing adapters, calendar, approval queue and comment/DM ingestion sit behind the
// owner's settings and the `studio.*` permissions; every platform runs on its mock until the owner enters a real key
// and its Test passes (A1.3), and nothing is published, scheduled or spent without his OK (CLAUDE.md rule 6).
export * from './context';
export * from './accounts';
