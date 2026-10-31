// S19 · PR 397 — the Cloudflare Origin certificate: the pair is read without the network (a certificate and its own key,
// valid now, the names it covers); a PEM pasted into a one-line box gets its lines back; wildcard names cover one label.
import { generateKeyPairSync } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { certCovers, CERT_LABEL, inspectOriginCert, normalizePem, originCertAdapter } from '../src/certificate';

const dir = mkdtempSync(join(tmpdir(), 'origin-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
function pair(name: string, days: number, san: string) {
  execFileSync('openssl', ['req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:P-256', '-nodes', '-days', String(days), '-subj', `/CN=${name}`,
    '-addext', `subjectAltName=${san}`, '-keyout', join(dir, `${name}.key`), '-out', join(dir, `${name}.pem`)], { stdio: 'ignore' });
  return { cert: readFileSync(join(dir, `${name}.pem`), 'utf8'), key: readFileSync(join(dir, `${name}.key`), 'utf8') };
}
const good = pair('good', 5475, 'DNS:example.test,DNS:*.example.test');
const otherKey = generateKeyPairSync('ec', { namedCurve: 'P-256' }).privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
const oneLine = (pem: string) => pem.replace(/\n/g, '');

describe('Cloudflare origin certificate (PR 397)', () => {
  it('a good pair: ok, the names it covers and the days left', () => {
    const f = inspectOriginCert(good.cert, good.key);
    expect(f).toMatchObject({ ok: true, names: ['example.test', '*.example.test'] });
    expect(f.daysLeft).toBeGreaterThan(5000);
    expect(f.message).toContain('covers example.test, *.example.test');
  });

  it('pasted into a one-line box (no line breaks): read the same', () => {
    expect(normalizePem(oneLine(good.cert), CERT_LABEL)).toBe(good.cert);
    expect(inspectOriginCert(oneLine(good.cert), oneLine(good.key)).ok).toBe(true);
  });

  it('refused: another key, not PEM, the two swapped, an expired one; the message never holds the key', () => {
    expect(inspectOriginCert(good.cert, otherKey)).toMatchObject({ ok: false, message: 'the private key does not belong to this certificate' });
    expect(inspectOriginCert('hello', good.key).message).toContain('not a PEM certificate');
    expect(inspectOriginCert(good.key, good.cert).ok).toBe(false);
    const later = new Date(Date.now() + 5480 * 86_400_000);
    expect(inspectOriginCert(good.cert, good.key, later)).toMatchObject({ ok: false, message: 'the certificate has expired' });
    for (const f of [inspectOriginCert(good.cert, otherKey), inspectOriginCert(good.cert, good.key)]) expect(f.message).not.toContain('PRIVATE');
  });

  it('a wildcard covers one more label, never the bare domain or two labels', () => {
    const names = ['*.example.test'];
    expect(certCovers(names, 'new.example.test')).toBe(true);
    expect(certCovers(names, 'NEW.example.test.')).toBe(true);
    expect(certCovers(names, 'example.test')).toBe(false);
    expect(certCovers(names, 'a.b.example.test')).toBe(false);
    expect(certCovers(['example.test'], 'example.test')).toBe(true);
    expect(certCovers(names, 'badexample.test')).toBe(false);
  });

  it('the adapter: the mock keeps the server as it is; the Test is the pair', async () => {
    const ctx = (secrets: Record<string, string>) => ({ mode: 'LIVE' as const, config: {}, storeId: null, secret: async (f: string) => secrets[f] ?? null });
    const mock = await originCertAdapter.mock(ctx({}));
    expect((await originCertAdapter.test(mock, ctx({}))).ok).toBe(true);
    const live = await originCertAdapter.create(ctx({ certificate: good.cert, privateKey: good.key }));
    expect(await originCertAdapter.test(live, ctx({}))).toMatchObject({ ok: true });
    const bad = await originCertAdapter.create(ctx({ certificate: good.cert, privateKey: otherKey }));
    expect(await originCertAdapter.test(bad, ctx({}))).toMatchObject({ ok: false });
  });
});
