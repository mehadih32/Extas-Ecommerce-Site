// PR 15 — session tokens. A token is 32 random bytes (base64url) handed to the browser in an httpOnly cookie; the
// database keeps only its SHA-256, so a copy of the database cannot be replayed as a login. A pending two-step login
// is a StaffSession row whose tokenHash carries the `mfa:` prefix: no cookie token ever hashes to it, so it cannot be
// used as a session until the code is right, when the row gets a fresh token (a new session id after the privilege
// change).
import { createHash, randomBytes } from 'node:crypto';

const TOKEN_BYTES = 32;
export const PENDING_PREFIX = 'mfa:';

export function newToken(): string {
  return randomBytes(TOKEN_BYTES).toString('base64url');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function pendingHash(token: string): string {
  return PENDING_PREFIX + hashToken(token);
}

/** A token as the browser may send it: base64url of the right length, nothing else. */
export function isWellFormedToken(token: string | null | undefined): token is string {
  return typeof token === 'string' && /^[A-Za-z0-9_-]{43}$/.test(token);
}
