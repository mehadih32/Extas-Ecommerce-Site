// @extas/db — the Prisma client for every app and worker, plus the schema-reading helpers (schema-meta.ts) for tools
// and tests. Bundled apps (Next.js) import `@extas/db/client` instead, which is the client alone (see client.ts).
export * from './client';
export * from './schema-meta';
