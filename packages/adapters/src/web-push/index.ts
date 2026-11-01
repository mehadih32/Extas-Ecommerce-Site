// S22 · PR 435 (Blueprint B4.11) — web push for the support app's notifications: the standard Web Push protocol
// (RFC 8030) with the message encrypted for the device (RFC 8291, `aes128gcm`, RFC 8188) and the shop proving who it is
// with its VAPID key pair (RFC 8292). Every browser's push service (Google for Chrome and Android, Apple for iPhone and
// Safari, Mozilla for Firefox) takes the same request, so there is no account to open anywhere.
//
// The key pair is the shop's own: the public key (non-secret, on the connection) and the private key (in the vault),
// typed in through Keys & connections with a contact address (`mailto:` or `https:`) the push services may write to.
// Until both are in and the Test passes, the mock answers: it keeps the newest pushes in this process and sends nothing
// anywhere (A1.3). The Test is local (no push is sent): the public key must belong to the private key, and a VAPID
// token is signed with it.
//
// A device that is gone (the push service answers 404 or 410) is reported as `gone`, so its subscription is switched
// off. No error carries a key or the device's address.
import { createCipheriv, createECDH, createHmac, createPrivateKey, randomBytes, sign } from 'node:crypto';
import { z } from 'zod';
import { AdapterError, defineAdapter, requireSecret } from '../define';

export const WEB_PUSH_PROVIDER = 'webPush';

/** One device's push subscription as the browser gives it (`PushSubscription.toJSON()`). */
export interface PushTarget {
  endpoint: string;
  /** The device's P-256 public key, base64url (65 bytes uncompressed). */
  p256dh: string;
  /** The device's 16-byte auth secret, base64url. */
  auth: string;
}

export interface PushOptions {
  /** Seconds the push service keeps trying a device that is off. */
  ttlSeconds: number;
  /** The push service's urgency (`high` wakes a sleeping phone). */
  urgency?: 'very-low' | 'low' | 'normal' | 'high';
  /** A later push with the same topic replaces one not yet delivered (letters and digits, at most 32). */
  topic?: string;
}

export type PushResult = { ok: true } | { ok: false; gone: boolean; error: string };

export interface PushSender {
  provider: string;
  /** The public key a device subscribes with (`applicationServerKey`), or null on the mock (no key yet). */
  publicKey: string | null;
  /** The mock: nothing leaves the server. */
  practice: boolean;
  send(target: PushTarget, payload: string, opts: PushOptions): Promise<PushResult>;
}

/** The largest payload a push service must take (4096 bytes of record, less the header and the padding byte). */
export const PUSH_MAX_PAYLOAD = 3993;
/** How long the server waits for a push service. */
const TIMEOUT_MS = 10_000;
/** How long a VAPID token is good for (the push services take at most 24 h). */
const VAPID_SECONDS = 12 * 60 * 60;
const RECORD_SIZE = 4096;

const b64u = (b: Uint8Array): string => Buffer.from(b).toString('base64url');
const fromB64u = (s: string): Buffer => Buffer.from(s, 'base64url');
const hmac = (key: Uint8Array, data: Uint8Array): Buffer => createHmac('sha256', key).update(data).digest();

export const PUSH_PUBLIC_KEY = /^[A-Za-z0-9_-]{86,88}$/;
export const PUSH_PRIVATE_KEY = /^[A-Za-z0-9_-]{42,44}$/;

/** The public key of a private VAPID key (both base64url), or null when it is not one. */
export function vapidPublicKeyOf(privateKey: string): string | null {
  const d = fromB64u(privateKey.trim());
  if (d.length !== 32) return null;
  try {
    const ecdh = createECDH('prime256v1');
    ecdh.setPrivateKey(d);
    return b64u(ecdh.getPublicKey());
  } catch {
    return null;
  }
}

/** A new VAPID key pair (tests, and the guide's way to make one on the server). */
export function newVapidKeys(): { publicKey: string; privateKey: string } {
  const ecdh = createECDH('prime256v1');
  ecdh.generateKeys();
  return { publicKey: b64u(ecdh.getPublicKey()), privateKey: b64u(ecdh.getPrivateKey()) };
}

/**
 * The message encrypted for one device (RFC 8291 with RFC 8188 `aes128gcm`, one record): salt, record size, the
 * server's one-time public key, then the ciphertext. `fixed` is for the RFC's test vector only.
 */
export function encryptPush(payload: Uint8Array, target: Pick<PushTarget, 'p256dh' | 'auth'>, fixed?: { salt: Uint8Array; serverPrivateKey: Uint8Array }): Buffer {
  if (payload.length > PUSH_MAX_PAYLOAD) throw new AdapterError('the notification is too long for a push');
  const uaPublic = fromB64u(target.p256dh);
  const authSecret = fromB64u(target.auth);
  if (uaPublic.length !== 65 || uaPublic[0] !== 4 || authSecret.length !== 16) throw new AdapterError('the device gave a push subscription that is not one');
  const ecdh = createECDH('prime256v1');
  if (fixed) ecdh.setPrivateKey(fixed.serverPrivateKey);
  else ecdh.generateKeys();
  const asPublic = ecdh.getPublicKey();
  let shared: Buffer;
  try {
    shared = ecdh.computeSecret(uaPublic);
  } catch {
    throw new AdapterError('the device gave a push subscription that is not one');
  }
  const salt = fixed ? Buffer.from(fixed.salt) : randomBytes(16);
  const keyInfo = Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, asPublic, Buffer.from([1])]);
  const ikm = hmac(hmac(authSecret, shared), keyInfo);
  const prk = hmac(salt, ikm);
  const cek = hmac(prk, Buffer.from('Content-Encoding: aes128gcm\0\x01', 'latin1')).subarray(0, 16);
  const nonce = hmac(prk, Buffer.from('Content-Encoding: nonce\0\x01', 'latin1')).subarray(0, 12);
  const cipher = createCipheriv('aes-128-gcm', cek, nonce);
  const body = Buffer.concat([cipher.update(Buffer.concat([Buffer.from(payload), Buffer.from([2])])), cipher.final(), cipher.getAuthTag()]);
  const header = Buffer.alloc(21);
  salt.copy(header, 0);
  header.writeUInt32BE(RECORD_SIZE, 16);
  header.writeUInt8(asPublic.length, 20);
  return Buffer.concat([header, asPublic, body]);
}

/** The `Authorization` header for one push service (RFC 8292): a signed VAPID token and the public key. */
export function vapidAuthorization(endpoint: string, keys: { publicKey: string; privateKey: string; subject: string }, nowSeconds: number): string {
  const pub = fromB64u(keys.publicKey);
  const key = createPrivateKey({ key: { kty: 'EC', crv: 'P-256', d: keys.privateKey, x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33, 65)) }, format: 'jwk' });
  const head = b64u(Buffer.from(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = b64u(Buffer.from(JSON.stringify({ aud: new URL(endpoint).origin, exp: nowSeconds + VAPID_SECONDS, sub: keys.subject })));
  const signature = sign('sha256', Buffer.from(`${head}.${claims}`), { key, dsaEncoding: 'ieee-p1363' });
  return `vapid t=${head}.${claims}.${b64u(signature)}, k=${keys.publicKey}`;
}

// ------------------------------------------------------------------------------------------------------------ mock

export interface MockPush {
  at: Date;
  endpoint: string;
  payload: string;
  ttlSeconds: number;
}

const G = globalThis as unknown as { __extasMockPush?: MockPush[] };
const outbox = (): MockPush[] => (G.__extasMockPush ??= []);
const MOCK_KEEP = 200;

/** What the mock was asked to push in this process (tests, the app page's "practice" line). */
export const mockPushOutbox = {
  all: (): readonly MockPush[] => [...outbox()],
  clear: (): void => {
    outbox().length = 0;
  },
};

export function mockPushSender(): PushSender {
  return {
    provider: WEB_PUSH_PROVIDER,
    publicKey: null,
    practice: true,
    async send(target, payload, opts) {
      const all = outbox();
      all.push({ at: new Date(), endpoint: target.endpoint, payload, ttlSeconds: opts.ttlSeconds });
      if (all.length > MOCK_KEEP) all.splice(0, all.length - MOCK_KEEP);
      return { ok: true };
    },
  };
}

// ------------------------------------------------------------------------------------------------------------ live

export const webPushConfig = z.object({
  /** The VAPID public key (base64url, 65 bytes): devices subscribe with it. Not a secret. */
  publicKey: z.string().trim().regex(PUSH_PUBLIC_KEY, 'a VAPID public key is 87 letters (base64url)'),
  /** A way for the push services to reach the shop: `mailto:someone@…` or an `https://` page. */
  subject: z
    .string()
    .trim()
    .max(200)
    .regex(/^(mailto:[^\s@]+@[^\s@]+|https:\/\/\S+)$/, 'a mailto: address or an https:// page'),
});
export type WebPushConfig = z.output<typeof webPushConfig>;

type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

/** A push endpoint must be an https address (the browsers' push services all are). */
function endpointOk(endpoint: string): boolean {
  try {
    return new URL(endpoint).protocol === 'https:';
  } catch {
    return false;
  }
}

export function createWebPushSender(o: { publicKey: string; privateKey: string; subject: string; fetch?: Fetch; now?: () => number }): PushSender {
  if (vapidPublicKeyOf(o.privateKey) !== o.publicKey) throw new AdapterError('the push public key does not belong to the private key');
  const doFetch: Fetch = o.fetch ?? fetch;
  const now = o.now ?? Date.now;
  return {
    provider: WEB_PUSH_PROVIDER,
    publicKey: o.publicKey,
    practice: false,
    async send(target, payload, opts) {
      if (!endpointOk(target.endpoint)) return { ok: false, gone: true, error: 'the device gave a push address that is not https' };
      let body: Buffer;
      try {
        body = encryptPush(Buffer.from(payload, 'utf8'), target);
      } catch (e) {
        return { ok: false, gone: true, error: e instanceof AdapterError ? e.message : 'the device gave a push subscription that is not one' };
      }
      const headers: Record<string, string> = {
        Authorization: vapidAuthorization(target.endpoint, o, Math.floor(now() / 1000)),
        'Content-Encoding': 'aes128gcm',
        'Content-Type': 'application/octet-stream',
        TTL: String(Math.max(0, Math.round(opts.ttlSeconds))),
        Urgency: opts.urgency ?? 'normal',
      };
      if (opts.topic && /^[A-Za-z0-9_-]{1,32}$/.test(opts.topic)) headers.Topic = opts.topic;
      let res: Response;
      try {
        res = await doFetch(target.endpoint, { method: 'POST', headers, body: new Uint8Array(body), signal: AbortSignal.timeout(TIMEOUT_MS) });
      } catch {
        return { ok: false, gone: false, error: 'the push service did not answer' };
      }
      if (res.status === 404 || res.status === 410) return { ok: false, gone: true, error: 'the device is no longer subscribed' };
      if (!res.ok) return { ok: false, gone: false, error: `the push service refused (${res.status})` };
      return { ok: true };
    },
  };
}

export const webPush = defineAdapter<PushSender, WebPushConfig>({
  kind: 'PUSH',
  provider: WEB_PUSH_PROVIDER,
  modes: ['LIVE'],
  secrets: ['privateKey'],
  configSchema: webPushConfig,
  async create(ctx) {
    const privateKey = (await requireSecret(ctx, 'privateKey')).trim();
    if (!PUSH_PRIVATE_KEY.test(privateKey)) throw new AdapterError('the push private key is 43 letters (base64url)');
    return createWebPushSender({ publicKey: ctx.config.publicKey, privateKey, subject: ctx.config.subject });
  },
  async mock() {
    return mockPushSender();
  },
  async test(api, ctx) {
    // local: the key pair belongs together (create() checked it) and a token can be signed; no device is woken
    const privateKey = (await requireSecret(ctx, 'privateKey')).trim();
    vapidAuthorization('https://push.example.invalid/test', { publicKey: ctx.config.publicKey, privateKey, subject: ctx.config.subject }, Math.floor(Date.now() / 1000));
    return { ok: !api.practice, message: api.practice ? 'the push connection is on its practice mode' : 'the push key pair belongs together and signs' };
  },
});

export const webPushAdapters = [webPush] as const;
