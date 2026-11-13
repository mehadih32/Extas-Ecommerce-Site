// S28 (admin prototype v5) — the owner's PIN for the Wave 5 actions that touch money, limits or data (staff limits,
// Telegram approvals, Start fresh). One path, the same one the Books and Backups use (`verifyOwnerPin`, the lock after
// wrong tries, never the PIN in a log): a thin wrapper that reads the PIN's numbers from the settings.
import { verifyOwnerPin, type Actor, type RequestContext } from '@extas/auth';
import type { AdminDeps } from './admin-auth';

/** The longest PIN typed (a PIN is short; a longer text is a mistake). */
const PIN_MAX_DIGITS = 12; // hardcode-ok: an input-length guard, not a business number

/** Checks a typed PIN for `action`; throws the PIN errors of `@extas/auth` (PIN_REQUIRED, PIN_NOT_SET, PIN_LOCKED, WRONG_PIN). */
export async function requireOwnerPin(deps: Pick<AdminDeps, 'db' | 'resolver' | 'now'>, actor: Actor, ctx: RequestContext, pin: unknown, action: string, storeId: number | null = null): Promise<{ ownerId: string }> {
  const [minLength, maxAttempts, lockMinutes] = await Promise.all([deps.resolver.value('books.pin.minLength'), deps.resolver.value('books.pin.maxAttempts'), deps.resolver.value('books.pin.lockMinutes')]);
  return verifyOwnerPin(deps.db, actor, typeof pin === 'string' ? pin : null, { minLength, maxLength: Math.max(minLength, PIN_MAX_DIGITS), maxAttempts, lockMinutes }, { action, storeId, now: deps.now ? deps.now() : new Date(), ctx: { source: 'admin-api', ...ctx } });
}
