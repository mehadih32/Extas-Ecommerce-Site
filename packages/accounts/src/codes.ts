// PR 130 — the one-time sign-in code by SMS (Blueprint D3.15 "a one-time SMS code on a new device"; SIM-F-039: the first
// sign-in of an account made with an order). One OtpChallenge row per code; only a salted hash of the code is kept.
//
// - Limits (`account.code.limits`): the code's length and minutes, wrong tries per code, the wait before a new code, and
//   the codes one number and one internet address may ask for in an hour. A new code ends the one before it.
// - No one learns whether a number has an account: an unknown number gets the same answer and the same row, but no SMS
//   is sent and no code can ever match it.
// - The code is never logged, stored in clear or shown on a page. The shop's record of the SMS (NotificationLog) holds the
//   number and why, never the words. On the mock sender (no gateway key yet) the SMS waits in the mock's in-memory outbox.
import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { phoneNormalizeBD } from '@extas/delivery/phone';
import { AccountError, checkStoreId, nowOf, setting, TX, type AccountsDeps } from './context';

export type CodePurpose = 'LOGIN' | 'NEW_DEVICE';

export interface CodeRequest {
  storeId: number;
  /** The number as typed (01712-345678, +8801…). */
  phone: string;
  purpose: CodePurpose;
  /** The SMS goes in the customer's language. */
  lang: 'en' | 'bn';
  /** The shop's name for {store}. */
  storeName: string;
  ip?: string | null;
}

export interface CodeSent {
  /** The number as said back (01712-345678). */
  phone: string;
  expiresAt: Date;
  /** Seconds before another code may be asked for. */
  resendSeconds: number;
  /** Digits in the code (the input's length). */
  length: number;
  /** The SMS sender is the mock: no SMS really leaves (the page says to message the shop if nothing arrives). */
  mock: boolean;
}

const HOUR = 3_600_000;

/** A Bangladeshi mobile number in +880 form and as said back; INVALID_INPUT otherwise. */
export function normalPhone(raw: unknown): { e164: string; nice: string } {
  const p = phoneNormalizeBD(raw);
  if (!p.ok) throw new AccountError('INVALID_INPUT', 'not a mobile number', ['phone'], { reason: p.reason });
  return { e164: p.e164, nice: p.nice };
}

const digest = (salt: string, code: string) => createHash('sha256').update(`${salt}:${code}`).digest();

function hashCode(code: string): string {
  const salt = randomBytes(16).toString('hex');
  return `${salt}$${digest(salt, code).toString('hex')}`;
}

function matches(stored: string, code: string): boolean {
  const [salt, hex] = stored.split('$');
  if (!salt || !hex) return false;
  const want = Buffer.from(hex, 'hex');
  const got = digest(salt, code);
  return want.length === got.length && timingSafeEqual(want, got);
}

const fill = (text: string, vars: Record<string, string>) => text.replace(/\{(\w+)\}/g, (m, k: string) => vars[k] ?? m);

const rateLimited = (seconds: number, why: string) =>
  new AccountError('RATE_LIMITED', `too many sign-in codes: ${why}`, [], { retryAfterSeconds: Math.max(1, Math.ceil(seconds)) });

/** Sends a new sign-in code to the number (or, for a number with no account, sends nothing and says the same). */
export async function requestCode(deps: AccountsDeps, req: CodeRequest): Promise<CodeSent> {
  checkStoreId(req.storeId);
  const { storeId } = req;
  const phone = normalPhone(req.phone);
  const limits = await setting(deps, storeId, 'account.code.limits');
  const now = nowOf(deps);
  const hourAgo = new Date(now.getTime() - HOUR);
  const ip = req.ip ? req.ip.slice(0, 64) : null;
  const [recent, byIp] = await Promise.all([
    deps.db.otpChallenge.findMany({
      where: { storeId, phone: phone.e164, createdAt: { gt: hourAgo } },
      orderBy: { createdAt: 'desc' },
      take: limits.perPhoneHour,
      select: { createdAt: true },
    }),
    ip ? deps.db.otpChallenge.count({ where: { storeId, ip, createdAt: { gt: hourAgo } } }) : Promise.resolve(0),
  ]);
  const last = recent[0];
  const since = last ? (now.getTime() - last.createdAt.getTime()) / 1000 : Infinity;
  if (since < limits.resendSeconds) throw rateLimited(limits.resendSeconds - since, 'wait before asking again');
  if (recent.length >= limits.perPhoneHour) throw rateLimited((recent[recent.length - 1]!.createdAt.getTime() + HOUR - now.getTime()) / 1000, 'this number');
  if (byIp >= limits.perIpHour) throw rateLimited(HOUR / 1000, 'this address');

  const customer = await deps.db.customer.findUnique({ where: { storeId_phone: { storeId, phone: phone.e164 } }, select: { id: true, archivedAt: true, erasedAt: true } });
  const known = customer && !customer.archivedAt && !customer.erasedAt ? customer : null;
  const code = String(randomInt(0, 10 ** limits.length)).padStart(limits.length, '0');
  const expiresAt = new Date(now.getTime() + limits.minutes * 60_000);
  const sms = deps.sms ? await deps.sms(storeId) : null;
  if (!sms) throw new AccountError('SMS_FAILED', 'no SMS sender is set up');

  const challenge = await deps.db.$transaction(async (tx) => {
    await tx.otpChallenge.updateMany({ where: { storeId, phone: phone.e164, consumedAt: null, expiresAt: { gt: now } }, data: { expiresAt: now } });
    // An unknown number gets a row too (the same limits and answer), whose hash no code can match.
    const codeHash = known ? hashCode(code) : hashCode(randomBytes(16).toString('hex'));
    return tx.otpChallenge.create({ data: { storeId, phone: phone.e164, purpose: req.purpose, codeHash, ip, expiresAt, createdAt: now }, select: { id: true } });
  }, TX);

  if (known) {
    const template = await setting(deps, storeId, 'account.code.text');
    const text = fill(template[req.lang] || template.en, { code, store: req.storeName, minutes: String(limits.minutes) });
    let r: Awaited<ReturnType<typeof sms.sender.send>>;
    try {
      r = await sms.sender.send({ to: phone.e164, text, purpose: 'account.code' });
    } catch (e) {
      r = { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
    await deps.db.notificationLog.create({
      data: {
        storeId,
        customerId: known.id,
        channel: 'SMS',
        recipient: phone.e164,
        status: r.ok ? 'SENT' : 'FAILED',
        dedupeKey: `account.code:${challenge.id}`,
        providerMessageId: r.ok ? r.messageId : null,
        attempts: 1,
        error: r.ok ? null : r.error.slice(0, 300),
        sentAt: r.ok ? now : null,
      },
    });
    if (!r.ok) {
      await deps.db.otpChallenge.update({ where: { id: challenge.id }, data: { expiresAt: now } });
      throw new AccountError('SMS_FAILED', 'the SMS could not be sent');
    }
  }
  return { phone: phone.nice, expiresAt, resendSeconds: limits.resendSeconds, length: limits.length, mock: sms.mode === 'MOCK' };
}

/**
 * Checks a code against the number's newest open code (of the given purposes) and uses it up. WRONG_CODE (with the
 * tries left) for a wrong, used, expired or worn-out code. Returns the customer it proves.
 */
export async function verifyCode(
  deps: AccountsDeps,
  input: { storeId: number; phone: string; code: string; purposes?: readonly CodePurpose[] },
): Promise<{ customerId: string; phone: string }> {
  checkStoreId(input.storeId);
  const { storeId } = input;
  const phone = normalPhone(input.phone);
  const code = String(input.code ?? '').replace(/\s+/g, '');
  const limits = await setting(deps, storeId, 'account.code.limits');
  const now = nowOf(deps);
  const wrong = (left: number, why: string) => new AccountError('WRONG_CODE', why, [], { left });
  if (!/^\d{4,8}$/.test(code)) throw new AccountError('INVALID_INPUT', 'the code is digits only', ['code']);
  const ch = await deps.db.otpChallenge.findFirst({
    where: { storeId, phone: phone.e164, purpose: { in: [...(input.purposes ?? ['LOGIN', 'NEW_DEVICE'])] }, consumedAt: null },
    orderBy: { createdAt: 'desc' },
  });
  if (!ch || ch.expiresAt <= now) throw wrong(0, 'no open code for this number (used or too old)');
  if (ch.attempts >= limits.maxTries) throw wrong(0, 'too many wrong tries on this code');
  // Review R2 (security m2): a try is taken before the code is compared, in one conditional UPDATE, so parallel guesses
  // can never be compared more than `maxTries` times between them (each one that is compared holds its own try).
  const took = await deps.db.$queryRaw<{ attempts: number }[]>`
    UPDATE "OtpChallenge" SET "attempts" = "attempts" + 1, "updatedAt" = ${now}
     WHERE "id" = ${ch.id}::uuid AND "consumedAt" IS NULL AND "expiresAt" > ${now} AND "attempts" < ${limits.maxTries}
    RETURNING "attempts"`;
  const tried = took[0]?.attempts;
  if (tried === undefined) throw wrong(0, 'too many wrong tries on this code (or it was used)');
  if (!matches(ch.codeHash, code)) throw wrong(Math.max(0, limits.maxTries - tried), 'the code is not right');
  const used = await deps.db.otpChallenge.updateMany({ where: { id: ch.id, consumedAt: null }, data: { consumedAt: now } });
  if (used.count !== 1) throw wrong(0, 'the code was used already');
  const customer = await deps.db.customer.findUnique({ where: { storeId_phone: { storeId, phone: phone.e164 } }, select: { id: true, archivedAt: true, erasedAt: true } });
  if (!customer || customer.archivedAt || customer.erasedAt) throw wrong(0, 'no account for this number');
  return { customerId: customer.id, phone: phone.e164 };
}
