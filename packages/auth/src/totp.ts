// PR 15 — two-step login with an authenticator app (TOTP, RFC 6238: HMAC-SHA1, 6 digits, 30-second steps — what
// every common authenticator app expects). The seed is kept encrypted by the vault (PR 493); this file is pure.
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const STEP_SECONDS = 30;
const DIGITS = 6;
const SEED_BYTES = 20;
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function newTotpSeed(): Buffer {
  return randomBytes(SEED_BYTES);
}

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(text: string): Buffer {
  const clean = text.replace(/[\s=-]/g, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = B32.indexOf(ch);
    if (idx < 0) throw new Error('not base32');
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** The code for one 30-second step. */
export function totpAt(seed: Buffer, counter: number): string {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const mac = createHmac('sha1', seed).update(msg).digest();
  const offset = mac[mac.length - 1]! & 0xf;
  const bin = (mac.readUInt32BE(offset) & 0x7fffffff) % 10 ** DIGITS;
  return bin.toString().padStart(DIGITS, '0');
}

export function counterAt(time: Date): number {
  return Math.floor(time.getTime() / 1000 / STEP_SECONDS);
}

/**
 * The step whose code matches, within ±`driftSteps` of now, or null. The caller keeps the matched step so the same
 * code is never accepted twice.
 */
export function verifyTotp(seed: Buffer, code: string, now: Date, driftSteps: number): number | null {
  const digits = code.replace(/\s/g, '');
  if (!/^\d{6}$/.test(digits)) return null;
  const base = counterAt(now);
  let match: number | null = null;
  for (let d = -driftSteps; d <= driftSteps; d++) {
    const expected = Buffer.from(totpAt(seed, base + d));
    // Every candidate is compared, so the time taken does not depend on which one matched.
    if (timingSafeEqual(expected, Buffer.from(digits)) && match === null) match = base + d;
  }
  return match;
}

/** The otpauth:// link an authenticator app reads (shown as a QR code by the admin screen). */
export function otpauthUri(seed: Buffer, opts: { issuer: string; account: string }): string {
  const label = `${encodeURIComponent(opts.issuer)}:${encodeURIComponent(opts.account)}`;
  const q = new URLSearchParams({ secret: base32Encode(seed), issuer: opts.issuer, algorithm: 'SHA1', digits: String(DIGITS), period: String(STEP_SECONDS) });
  return `otpauth://totp/${label}?${q.toString()}`;
}
