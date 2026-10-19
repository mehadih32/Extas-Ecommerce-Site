// Value schemas shared by the general default pack (PR 508) and the "My own data" register (PR 509) settings.
// Validation only: no value of the owner's lives here.
import { z } from 'zod';

/** A phone number in E.164 form, e.g. `+8801…`. */
export const phoneSchema = z.string().regex(/^\+[1-9]\d{7,14}$/, { message: 'not a phone number in +country form' });

/** A web address on https. */
export const httpsUrlSchema = z.url({ protocol: /^https$/, message: 'not an https address' }).max(500);

/** A MediaAsset id (PR 22): the file itself lives in the media store, never in the setting. */
export const mediaRefSchema = z.uuid();

/** A text in both admin languages (Blueprint A7 / D11). */
export const localizedTextSchema = (max: number) =>
  z.object({ en: z.string().trim().min(1).max(max), bn: z.string().trim().min(1).max(max) });

/** The `{token}` names a text uses. */
export function tokensOf(text: string): string[] {
  return [...text.matchAll(/\{([A-Za-z][A-Za-z0-9]*)\}/g)].map((m) => m[1]!);
}

/**
 * A customer-facing template in both languages that may only use the listed `{tokens}` — the numbers in it are always
 * read from their own settings at the moment the text is shown, never typed into the text.
 */
export const templateTextSchema = (tokens: readonly string[], max = 500) =>
  localizedTextSchema(max).refine(
    (v) => [...tokensOf(v.en), ...tokensOf(v.bn)].every((t) => tokens.includes(t)),
    { message: `only these {tokens} may be used: ${tokens.join(', ')}` },
  );

/** A whole number of hours, e.g. an exchange window. */
export const hoursSchema = z.int().min(1).max(24 * 365);

/** An amount in minor units (poisha for BDT). Money is always the owner's decision (CLAUDE.md rule 6). */
export const moneyMinorSchema = z.int().min(0);

/** Bank accounts the shop shows to customers who pay by transfer (owner data, PR 509). */
export const bankAccountsSchema = z
  .array(
    z.object({
      bankName: z.string().trim().min(1).max(120),
      accountName: z.string().trim().min(1).max(120),
      accountNumber: z.string().trim().min(1).max(40),
      branch: z.string().trim().max(120).optional(),
      routingNumber: z.string().trim().max(20).optional(),
    }),
  )
  .max(10);

/** Mobile wallet numbers the shop shows to customers (owner data, PR 509). The provider is the adapter key (PR 18). */
export const walletNumbersSchema = z
  .array(
    z.object({
      provider: z.string().trim().min(1).max(40),
      number: phoneSchema,
      kind: z.enum(['merchant', 'personal', 'agent']),
    }),
  )
  .max(10);
