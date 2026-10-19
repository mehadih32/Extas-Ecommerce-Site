// PR 15 — password hashing and the password rules.
//
// Hash: scrypt from node:crypto (memory-hard, no native dependency). The cost is written into every stored hash
// (`scrypt$ln=15,r=8,p=1$salt$hash`), so it can be raised later: a login with an older cost re-hashes the password
// (`needsRehash`). The cost is a property of the algorithm, not a business value; 2^15 × 8 × 128 bytes = 32 MiB per
// hash, about 50–100 ms on the server.
//
// Rules (NIST SP 800-63B style): a minimum and a maximum length from settings, no composition rules, and for staff a
// refusal of well-known passwords and of the person's own e-mail. Customers start with their mobile number as the
// password (Blueprint D3.13, D3.15), so their rule is only the length.
import { randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from 'node:crypto';
import common from './common-passwords.json';
import { AuthError } from './errors';
import type { SecurityPolicy } from './policy';

const COST = { ln: 15, r: 8, p: 1 } as const;
const KEY_BYTES = 32;
const SALT_BYTES = 16;

function scrypt(password: string, salt: Buffer, ln: number, r: number, p: number): Promise<Buffer> {
  const N = 2 ** ln;
  const opts: ScryptOptions = { N, r, p, maxmem: 128 * N * r * 2 };
  return new Promise((resolve, reject) =>
    scryptCb(password.normalize('NFKC'), salt, KEY_BYTES, opts, (err, key) => (err ? reject(err) : resolve(key))),
  );
}

interface Parsed {
  ln: number;
  r: number;
  p: number;
  salt: Buffer;
  hash: Buffer;
}

function parse(stored: string): Parsed | null {
  const m = /^scrypt\$ln=(\d+),r=(\d+),p=(\d+)\$([A-Za-z0-9+/=]+)\$([A-Za-z0-9+/=]+)$/.exec(stored);
  if (!m) return null;
  const [ln, r, p] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (ln < 10 || ln > 22 || r < 1 || r > 32 || p < 1 || p > 16) return null;
  return { ln, r, p, salt: Buffer.from(m[4]!, 'base64'), hash: Buffer.from(m[5]!, 'base64') };
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const key = await scrypt(password, salt, COST.ln, COST.r, COST.p);
  return `scrypt$ln=${COST.ln},r=${COST.r},p=${COST.p}$${salt.toString('base64')}$${key.toString('base64')}`;
}

/** Constant-time check. A malformed stored hash never matches. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parsed = parse(stored);
  if (!parsed) return false;
  const key = await scrypt(password, parsed.salt, parsed.ln, parsed.r, parsed.p);
  return key.length === parsed.hash.length && timingSafeEqual(key, parsed.hash);
}

/** True when the stored hash was made with another cost than today's: re-hash it after a successful login. */
export function needsRehash(stored: string): boolean {
  const parsed = parse(stored);
  return !parsed || parsed.ln !== COST.ln || parsed.r !== COST.r || parsed.p !== COST.p;
}

let dummy: Promise<string> | undefined;
/** Spends the same time as a real check when there is no account, so the answer time does not reveal one. */
export async function burnPasswordCheck(password: string): Promise<void> {
  dummy ??= hashPassword(randomBytes(16).toString('hex'));
  await verifyPassword(password, await dummy);
}

const COMMON = new Set((common as string[]).map((p) => p.toLowerCase()));

export type PasswordIssue = 'too-short' | 'too-long' | 'common' | 'contains-email';

/** What is wrong with a staff password (empty = fine). */
export function staffPasswordIssues(password: string, policy: SecurityPolicy, who: { email?: string | null } = {}): PasswordIssue[] {
  const issues: PasswordIssue[] = [];
  const length = [...password].length;
  if (length < policy.staffPasswordMinLength) issues.push('too-short');
  if (length > policy.passwordMaxLength) issues.push('too-long');
  if (policy.blockCommonPasswords) {
    const lower = password.toLowerCase();
    if (COMMON.has(lower)) issues.push('common');
    const email = who.email?.trim().toLowerCase();
    const local = email?.split('@')[0];
    if (email && (lower.includes(email) || (local && local.length >= 4 && lower.includes(local)))) issues.push('contains-email');
  }
  return issues;
}

/** What is wrong with a customer password (empty = fine). */
export function customerPasswordIssues(password: string, policy: SecurityPolicy): PasswordIssue[] {
  const issues: PasswordIssue[] = [];
  const length = [...password].length;
  if (length < policy.customerPasswordMinLength) issues.push('too-short');
  if (length > policy.passwordMaxLength) issues.push('too-long');
  return issues;
}

export function assertStaffPassword(password: string, policy: SecurityPolicy, who: { email?: string | null } = {}): void {
  const issues = staffPasswordIssues(password, policy, who);
  if (issues.length) throw new AuthError('WEAK_PASSWORD', 'the password does not meet the rules', issues);
}

export function assertCustomerPassword(password: string, policy: SecurityPolicy): void {
  const issues = customerPasswordIssues(password, policy);
  if (issues.length) throw new AuthError('WEAK_PASSWORD', 'the password does not meet the rules', issues);
}
