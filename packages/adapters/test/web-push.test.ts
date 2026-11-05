// S22 · PR 435 — web push: the message encrypted exactly as RFC 8291's own example, a VAPID token that verifies with
// the public key, the key pair checked, a gone device reported, and the mock keeping what it would have sent.
import { createDecipheriv, createECDH, createHmac, createPublicKey, verify } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createWebPushSender, encryptPush, mockPushOutbox, mockPushSender, newVapidKeys, vapidAuthorization, vapidPublicKeyOf, webPushConfig } from '../src/web-push';

const b = (s: string) => Buffer.from(s, 'base64url');

// RFC 8291 Appendix A
const RFC = {
  plaintext: 'When I grow up, I want to be a watermelon',
  asPrivate: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw',
  uaPrivate: 'q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94',
  uaPublic: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
  salt: 'DGv6ra1nlYgDCS1FRnbzlw',
  auth: 'BTBZMqHH6r4Tts7J_aSIgg',
  body: 'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN',
};

/** The device's side (RFC 8291 §3.4), to read back what was sent. */
function decrypt(body: Buffer, uaPrivate: string, auth: string): string {
  const salt = body.subarray(0, 16);
  const idlen = body[20]!;
  const asPublic = body.subarray(21, 21 + idlen);
  const ecdh = createECDH('prime256v1');
  ecdh.setPrivateKey(b(uaPrivate));
  const h = (k: Buffer, d: Buffer) => createHmac('sha256', k).update(d).digest();
  const ikm = h(h(b(auth), ecdh.computeSecret(asPublic)), Buffer.concat([Buffer.from('WebPush: info\0'), ecdh.getPublicKey(), asPublic, Buffer.from([1])]));
  const prk = h(salt, ikm);
  const cek = h(prk, Buffer.from('Content-Encoding: aes128gcm\0\x01', 'latin1')).subarray(0, 16);
  const nonce = h(prk, Buffer.from('Content-Encoding: nonce\0\x01', 'latin1')).subarray(0, 12);
  const ct = body.subarray(21 + idlen);
  const d = createDecipheriv('aes-128-gcm', cek, nonce);
  d.setAuthTag(ct.subarray(ct.length - 16));
  const plain = Buffer.concat([d.update(ct.subarray(0, ct.length - 16)), d.final()]);
  expect(plain[plain.length - 1]).toBe(2);
  return plain.subarray(0, plain.length - 1).toString('utf8');
}

describe('web push (RFC 8030 / 8291 / 8292)', () => {
  it('encrypts exactly as the RFC 8291 example, and a device reads it back', () => {
    const body = encryptPush(Buffer.from(RFC.plaintext), { p256dh: RFC.uaPublic, auth: RFC.auth }, { salt: b(RFC.salt), serverPrivateKey: b(RFC.asPrivate) });
    expect(body.toString('base64url')).toBe(RFC.body);
    const fresh = encryptPush(Buffer.from('নতুন মেসেজ'), { p256dh: RFC.uaPublic, auth: RFC.auth });
    expect(decrypt(fresh, RFC.uaPrivate, RFC.auth)).toBe('নতুন মেসেজ');
  });

  it('a private key whose first byte is zero (Node drops it, ~1 key in 256) still works, short or padded', () => {
    const short = Buffer.alloc(31, 1);
    const padded = Buffer.concat([Buffer.alloc(1), short]);
    const pub = vapidPublicKeyOf(short.toString('base64url'));
    expect(pub).not.toBeNull();
    expect(vapidPublicKeyOf(padded.toString('base64url'))).toBe(pub);
    const header = vapidAuthorization('https://push.example.com/x', { publicKey: pub!, privateKey: short.toString('base64url'), subject: 'mailto:support@example.com' }, 1_000_000);
    expect(header).toMatch(/^vapid t=.+, k=/);
  });

  it('signs a VAPID token the public key verifies, for the push service of the address only', () => {
    const keys = { ...newVapidKeys(), subject: 'mailto:support@example.com' };
    expect(vapidPublicKeyOf(keys.privateKey)).toBe(keys.publicKey);
    const header = vapidAuthorization('https://push.example.com/send/abc', keys, 1_000_000);
    const m = /^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/.exec(header)!;
    expect(m[4]).toBe(keys.publicKey);
    const claims = JSON.parse(b(m[2]!).toString('utf8'));
    expect(claims).toEqual({ aud: 'https://push.example.com', exp: 1_000_000 + 12 * 3600, sub: 'mailto:support@example.com' });
    const pub = b(keys.publicKey);
    const key = createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: pub.subarray(1, 33).toString('base64url'), y: pub.subarray(33).toString('base64url') }, format: 'jwk' });
    expect(verify('sha256', Buffer.from(`${m[1]}.${m[2]}`), { key, dsaEncoding: 'ieee-p1363' }, b(m[3]!))).toBe(true);
  });

  it('refuses a public key of another pair; posts the encrypted message; a gone device is reported; nothing carries a key', async () => {
    const keys = newVapidKeys();
    expect(() => createWebPushSender({ publicKey: newVapidKeys().publicKey, privateKey: keys.privateKey, subject: 'mailto:a@example.com' })).toThrow(/does not belong/);
    const calls: { url: string; init: RequestInit }[] = [];
    let status = 201;
    const sender = createWebPushSender({ ...keys, subject: 'mailto:a@example.com', fetch: async (url, init) => (calls.push({ url, init: init! }), new Response(null, { status })) });
    const target = { endpoint: 'https://push.example.com/send/abc', p256dh: RFC.uaPublic, auth: RFC.auth };
    expect(await sender.send(target, '{"t":"Sample"}', { ttlSeconds: 3600, urgency: 'high', topic: 'chat1' })).toEqual({ ok: true });
    const h = calls[0]!.init.headers as Record<string, string>;
    expect(h).toMatchObject({ 'Content-Encoding': 'aes128gcm', TTL: '3600', Urgency: 'high', Topic: 'chat1' });
    expect(decrypt(Buffer.from(calls[0]!.init.body as Uint8Array), RFC.uaPrivate, RFC.auth)).toBe('{"t":"Sample"}');
    status = 410;
    const gone = await sender.send(target, 'x', { ttlSeconds: 60 });
    expect(gone).toMatchObject({ ok: false, gone: true });
    status = 500;
    const bad = await sender.send(target, 'x', { ttlSeconds: 60 });
    expect(bad).toMatchObject({ ok: false, gone: false });
    expect(JSON.stringify([gone, bad])).not.toContain(keys.privateKey);
    expect(await sender.send({ ...target, endpoint: 'http://push.example.com/x' }, 'x', { ttlSeconds: 60 })).toMatchObject({ ok: false, gone: true });
    expect(await sender.send({ ...target, p256dh: 'AAAA' }, 'x', { ttlSeconds: 60 })).toMatchObject({ ok: false, gone: true });
  });

  it('the mock has no key, sends nothing anywhere and keeps what it was asked', async () => {
    mockPushOutbox.clear();
    const m = mockPushSender();
    expect([m.publicKey, m.practice]).toEqual([null, true]);
    expect(await m.send({ endpoint: 'https://push.example.com/1', p256dh: RFC.uaPublic, auth: RFC.auth }, 'hello', { ttlSeconds: 60 })).toEqual({ ok: true });
    expect(mockPushOutbox.all().map((p) => p.payload)).toEqual(['hello']);
  });

  it('takes a mailto: or https: contact and a base64url public key only', () => {
    const { publicKey } = newVapidKeys();
    expect(webPushConfig.safeParse({ publicKey, subject: 'mailto:a@example.com' }).success).toBe(true);
    expect(webPushConfig.safeParse({ publicKey, subject: 'https://example.com/contact' }).success).toBe(true);
    expect(webPushConfig.safeParse({ publicKey, subject: 'a@example.com' }).success).toBe(false);
    expect(webPushConfig.safeParse({ publicKey: 'short', subject: 'mailto:a@example.com' }).success).toBe(false);
  });
});
