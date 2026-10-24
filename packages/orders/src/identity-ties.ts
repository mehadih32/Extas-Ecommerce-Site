// S06 · PR 519 — how one order of a customer's identity is tied to another (client-safe: no database, no settings): the
// same phone, the same device, an alike name and address, or only through his other orders (the graph is transitive).
// The graph itself is identity-graph.ts.

/** How an order of the identity is tied to this one. */
export type IdentityVia = 'phone' | 'device' | 'nameAddress' | 'linked';
export const IDENTITY_VIAS: readonly IdentityVia[] = ['phone', 'device', 'nameAddress', 'linked'];
