// S19 · PR 397 — the Cloudflare Origin certificate: the certificate the server shows Cloudflare, so Cloudflare's
// SSL/TLS mode can be "Full (strict)" (Cloudflare checks the certificate on every request to the server, and nobody in
// between can pose as the shop). The owner makes it once in Cloudflare (SSL/TLS → Origin Server → Create certificate,
// for the main domain and `*.` of it; Cloudflare offers 15 years) and pastes the certificate and its private key into
// Keys & connections. Both stay in the vault.
//
// - The Test never goes on the network: it reads the pair itself (a certificate and its own key, valid now, the names
//   it covers, the days left). A pair that fails is never used, and until a pair passes the server keeps its own
//   automatic certificate (Let's Encrypt, Caddy's own as the fallback) — the "mock" here is the server as it was.
// - A browser's one-line box drops the line breaks of a pasted PEM; `normalizePem` puts them back.
// - The server installs a passing pair through the vault sync (packages/jobs/src/server-sync.ts → origin-cert.pem and
//   origin-key.pem; infra/server/bin/extas-origin-cert checks the pair again, gives it to Caddy and reports
//   state/origin-cert.json for the go-live checklist).
import { createPrivateKey, X509Certificate } from 'node:crypto';
import { z } from 'zod';
import { defineAdapter, requireSecret } from '../define';

export const ORIGIN_CERT_PROVIDER = 'cloudflareOrigin';

const DAY_MS = 86_400_000;

/** One PEM block, its lines put back: the BEGIN line, the base64 cut at 64, the END line. Null when there is none. */
export function normalizePem(text: string, label: RegExp): string | null {
  const m = /-----BEGIN ([A-Z0-9 ]+)-----([\s\S]*?)-----END \1-----/.exec(text);
  if (!m || !label.test(m[1]!)) return null;
  const body = m[2]!.replace(/\s+/g, '');
  if (!body || !/^[A-Za-z0-9+/=]+$/.test(body)) return null;
  const lines = body.match(/.{1,64}/g) ?? [];
  return `-----BEGIN ${m[1]}-----\n${lines.join('\n')}\n-----END ${m[1]}-----\n`;
}

export const CERT_LABEL = /^CERTIFICATE$/;
export const KEY_LABEL = /^(RSA |EC )?PRIVATE KEY$/;

export interface OriginCertFacts {
  ok: boolean;
  /** Short, never a key: what is wrong, or what the certificate covers. */
  message: string;
  names: string[];
  notAfter: string | null;
  issuer: string;
  daysLeft: number | null;
}

/** The names a certificate covers (its DNS names). */
function dnsNames(cert: X509Certificate): string[] {
  return (cert.subjectAltName ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.startsWith('DNS:'))
    .map((s) => s.slice(4).toLowerCase());
}

/** Whether `host` is one of `names` (a `*.` name covers one more label, never the bare domain). */
export function certCovers(names: readonly string[], host: string): boolean {
  const h = host.trim().toLowerCase().replace(/\.$/, '');
  return names.some((n) => n === h || (n.startsWith('*.') && h.endsWith(n.slice(1)) && !h.slice(0, -n.length + 1).includes('.')));
}

/** Reads the pair: both PEMs, the key belongs to the certificate, valid now. */
export function inspectOriginCert(certText: string, keyText: string, now = new Date()): OriginCertFacts {
  const bad = (message: string): OriginCertFacts => ({ ok: false, message, names: [], notAfter: null, issuer: '', daysLeft: null });
  const certPem = normalizePem(certText, CERT_LABEL);
  if (!certPem) return bad('the certificate is not a PEM certificate (-----BEGIN CERTIFICATE-----)');
  const keyPem = normalizePem(keyText, KEY_LABEL);
  if (!keyPem) return bad('the private key is not a PEM private key: paste the whole text Cloudflare showed, with its BEGIN and END lines');
  let cert: X509Certificate;
  try {
    cert = new X509Certificate(certPem);
  } catch {
    return bad('the certificate cannot be read');
  }
  let matches = false;
  try {
    matches = cert.checkPrivateKey(createPrivateKey(keyPem));
  } catch {
    return bad('the private key cannot be read');
  }
  const names = dnsNames(cert);
  const notAfter = new Date(cert.validTo);
  const notBefore = new Date(cert.validFrom);
  const daysLeft = Math.floor((notAfter.getTime() - now.getTime()) / DAY_MS);
  const facts = { names, notAfter: notAfter.toISOString(), issuer: cert.issuer.replace(/\n/g, ', '), daysLeft };
  if (!matches) return { ok: false, message: 'the private key does not belong to this certificate', ...facts };
  if (now < notBefore) return { ok: false, message: 'the certificate is not valid yet', ...facts };
  if (daysLeft < 0) return { ok: false, message: 'the certificate has expired', ...facts };
  if (!names.length) return { ok: false, message: 'the certificate names no host', ...facts };
  return { ok: true, message: `covers ${names.join(', ')}; ${daysLeft} days left`, ...facts };
}

export interface OriginCertApi {
  provider: string;
  /** The pair's facts; absent on the mock (the server keeps its own certificate). */
  inspect?(): OriginCertFacts;
}

export const originCertConfig = z.object({});
export type OriginCertConfig = z.output<typeof originCertConfig>;

export const originCertAdapter = defineAdapter<OriginCertApi, OriginCertConfig>({
  kind: 'CERTIFICATE',
  provider: ORIGIN_CERT_PROVIDER,
  modes: ['LIVE'],
  secrets: ['certificate', 'privateKey'],
  configSchema: originCertConfig,
  async create(ctx) {
    const cert = await requireSecret(ctx, 'certificate');
    const key = await requireSecret(ctx, 'privateKey');
    return { provider: ORIGIN_CERT_PROVIDER, inspect: () => inspectOriginCert(cert, key) };
  },
  async mock() {
    return { provider: ORIGIN_CERT_PROVIDER };
  },
  async test(api) {
    if (!api.inspect) return { ok: true, message: 'no certificate: the server keeps its own automatic one' };
    const f = api.inspect();
    return { ok: f.ok, message: f.message };
  },
});

export const certificateAdapters = [originCertAdapter] as const;
