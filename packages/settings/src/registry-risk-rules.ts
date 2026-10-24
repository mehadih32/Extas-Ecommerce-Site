// S06 · PR 519 — the Order Identity Graph (registry version 48). Labels: messages/risk.<lang>.json (the Orders group;
// the admin's place is Orders → Risk rules, ORD-06 of docs/BACKEND-ARCHITECTURE.md §5.3, built on the new admin shell).
//
// One identity built from the phone, the name, the address, the device and the connection (IP), so a customer who
// changes his number is still the same person (Blueprint B1.12, B6.4). Two orders join one identity by the same phone,
// by the same device (the shop's own random device id, `risk.capture`), or by a name and an address that are alike
// (Postgres pg_trgm on the stored text, PR 603's trigram indexes: spelling a little off still matches). The IP never
// joins two orders by itself — many people share one mobile connection — it is only counted (`risk.signals.ipPhones`).
// While the graph is on, the risk score's `identityMatch` and `deviceMatch` read it instead of their own look-ups.
//
// A read and a record only: nothing here blocks anyone, holds or cancels an order, or changes COD, a price or a charge
// (CLAUDE.md rule 6). Off until the owner switches it on (CN-018).
import { z } from 'zod';
import { setting } from './define';

const V = 48;

const base = { scope: 'store', isOwnerData: false, isPublic: false, group: 'orders', version: V } as const;

const similarity = z.number().min(0.3).max(1);

/**
 * PR 519 — `enabled`: every new order is linked into an identity the moment it lands (and again after the team's edit
 * of the phone, the name or the address). `windowDays`: how far back a name-and-address or a device match reaches (0:
 * ever). `nameSimilarity` / `addressSimilarity`: how alike the name and the address must both be (1: the same text,
 * letter case and spaces aside). `joinOnDevice`: the same device joins two numbers into one identity. `orders`: how
 * many earlier orders one link step reads at most.
 */
export const riskIdentitySchema = z
  .object({
    enabled: z.boolean(),
    windowDays: z.int().min(0).max(3_650),
    nameSimilarity: similarity,
    addressSimilarity: similarity,
    joinOnDevice: z.boolean(),
    orders: z.int().min(10).max(2_000),
  })
  .strict();
export type RiskIdentity = z.output<typeof riskIdentitySchema>;

export const riskRulesSettings = {
  'risk.identity': setting({
    ...base,
    schema: riskIdentitySchema,
    default: { enabled: false, windowDays: 365, nameSimilarity: 0.7, addressSimilarity: 0.6, joinOnDevice: true, orders: 200 },
    valueType: 'JSON',
    labelKey: 'risk.identity.label',
    helpKey: 'risk.identity.help',
    sortOrder: 342,
  }),
};
