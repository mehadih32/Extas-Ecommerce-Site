// @extas/settings — the settings framework (PR 491), the two-tier resolver (PR 492), the settings migration (PR 496)
// and reset to default (PR 510). Nothing a human might change lives in code: it is declared here and read through the
// resolver.
export * from './define';
export * from './errors';
export * from './resolve';
export * from './backend';
export * from './resolver';
export * from './prisma-backend';
export * from './sync';
export * from './admin';
export * from './owner-data';
export * from './schemas';
export * from './registry-media';
export * from './registry-publish';
export * from './registry-merch';
export * from './registry-inventory';
export * from './registry-catalogue-tools';
export { messages, lookup, pair, type MessageTree, type SettingsMessages, type LabelPair } from './messages';
export { registry, localeSchema, timeZoneSchema, currencySchema, hostSchema, type Registry, type Key, type Value } from './registry';
