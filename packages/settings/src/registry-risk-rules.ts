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
//
// S06 · PR 520 — the duplicate & re-order rules engine (registry version 48): the scenarios of the owner's 18 Oct
// answer (Blueprint B1.12, §59.1; demo V12.3 Orders → Risk rules "Duplicate & re-order rules") as separate rules, each
// with its own switch, window, confidence threshold and action:
//   A — the same customer, the same items again, while the first is not yet with the courier (proposes: cancel it);
//   B — the same customer, different items, in the window (proposes: one parcel);
//   C — a parcel of his is with the courier and a new order comes (an add-on or a duplicate?);
//   D — an alike address under a new phone (a new identity to check);
//   E — the same style in another size in his other open order (an exchange, not a second parcel);
//   H — a number, identity or address a person blocked (the block register, PR 162/523);
//   I — a bulk-looking order: at least N pieces (in this order, or with his open orders in the window).
// F (cancelled then re-ordered) is allowed with no flag and G (refused before) is the risk score's (PR 156), so neither
// is a rule here. "The same customer" is the same customer account, the same phone, or — while the identity graph
// (PR 519) is on — the same identity. The actions are cancel · hold · warn · allow; THERE IS NO BLOCK ACTION, and a
// rule only marks and proposes: "cancel" and "hold" open the duplicate review (PR 145) with that proposal, so the order
// is neither confirmed nor booked until a person decides; "warn" writes the note on the timeline only; "allow" records
// the match and nothing else. Off until the owner switches it on (CN-018): until then the duplicate check works as
// before (`orders.duplicates`).
import { z } from 'zod';
import { setting } from './define';

const V = 48;

const base = { scope: 'store', isOwnerData: false, isPublic: false, group: 'orders', version: V } as const;

const similarity = z.number().min(0.3).max(1);

/** PR 520: the scenarios that are rules here, in the order the owner reads them. */
export const DUPLICATE_SCENARIOS = ['A', 'B', 'C', 'D', 'E', 'H', 'I'] as const;
export type DuplicateScenario = (typeof DUPLICATE_SCENARIOS)[number];
/** PR 520: what a rule proposes. There is no block action (18 Oct). */
export const RULE_ACTIONS = ['cancel', 'hold', 'warn', 'allow'] as const;
export type RuleAction = (typeof RULE_ACTIONS)[number];

/**
 * One rule: its switch, its window in minutes (how far back the other order may be; 0: no limit), the confidence a
 * match needs (0–100) and what it proposes.
 */
const ruleShape = { enabled: z.boolean(), windowMinutes: z.int().min(0).max(60 * 24 * 3_650), minConfidence: z.int().min(0).max(100), action: z.enum(RULE_ACTIONS) };
const rule = z.object(ruleShape).strict();
export type DuplicateRule = z.output<typeof rule>;

/**
 * PR 520 — `enabled`: every new order is checked against the rules below instead of the one look-back of
 * `orders.duplicates` (whose own switch still turns the whole check off, and whose auto-hold still applies). `rules`:
 * each scenario's switch, window, confidence threshold and action; I adds `atLeast`, the pieces that look like bulk.
 */
export const duplicateRulesSchema = z
  .object({
    enabled: z.boolean(),
    rules: z.object({ A: rule, B: rule, C: rule, D: rule, E: rule, H: rule, I: z.object({ ...ruleShape, atLeast: z.int().min(2).max(1_000) }).strict() }).strict(),
  })
  .strict();
export type DuplicateRules = z.output<typeof duplicateRulesSchema>;

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
  // The demo's scenarios with the shop's look-back as today (5 days) for A and C: switched on, they flag what the
  // duplicate check flags today, with the owner's proposals. D, E, H and I start off.
  'risk.duplicateRules': setting({
    ...base,
    schema: duplicateRulesSchema,
    default: {
      enabled: false,
      rules: {
        A: { enabled: true, windowMinutes: 7_200, minConfidence: 60, action: 'cancel' },
        B: { enabled: true, windowMinutes: 1_440, minConfidence: 50, action: 'warn' },
        C: { enabled: true, windowMinutes: 7_200, minConfidence: 0, action: 'hold' },
        D: { enabled: false, windowMinutes: 525_600, minConfidence: 70, action: 'warn' },
        E: { enabled: false, windowMinutes: 7_200, minConfidence: 0, action: 'warn' },
        H: { enabled: false, windowMinutes: 0, minConfidence: 70, action: 'hold' },
        I: { enabled: false, windowMinutes: 0, minConfidence: 0, action: 'warn', atLeast: 10 },
      },
    },
    valueType: 'JSON',
    labelKey: 'risk.duplicateRules.label',
    helpKey: 'risk.duplicateRules.help',
    sortOrder: 343,
  }),
};
