// How a value of the owner's is recognised in data that is about to ship (PR 509).
// - In CI the patterns come from the hardcode guard's own rules (tools/hardcode-guard.json: the shop's domain and
//   name, phone numbers, e-mail addresses, keys), so there is one list of patterns for code and for data.
// - On a running installation the export also knows the owner's actual values (read from the database) and matches
//   them exactly; the built-in patterns below cover phones, e-mails and credentials where the guard file is absent.
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export interface Detector {
  id: string;
  what: string;
  re: RegExp;
  allow?: RegExp;
}

/** The guard rules that describe owner data or secrets (the rest are about code, not data). */
export const OWNER_RULE_IDS = new Set(['owner-domain', 'owner-brand', 'phone-bd', 'email', 'connection-string']);
const isOwnerRule = (id: string) => OWNER_RULE_IDS.has(id) || id.startsWith('secret-');

interface GuardRule {
  id: string;
  what: string;
  pattern: string;
  flags?: string;
  allow?: string;
}

export const GUARD_CONFIG = fileURLToPath(new URL('../../../tools/hardcode-guard.json', import.meta.url));

/** The hardcode guard's owner-data and secret rules, or null when the repository's tools folder is not there. */
export function guardDetectors(path: string = GUARD_CONFIG): Detector[] | null {
  if (!existsSync(path)) return null;
  const config = JSON.parse(readFileSync(path, 'utf8')) as { rules: GuardRule[] };
  return config.rules
    .filter((r) => isOwnerRule(r.id))
    .map((r) => ({
      id: r.id,
      what: r.what,
      re: new RegExp(r.pattern, (r.flags ?? '').replace('g', '')),
      allow: r.allow ? new RegExp(r.allow, 'i') : undefined,
    }));
}

/** Patterns that need no repository: phone numbers, e-mail addresses (example.* allowed), credentials in a URL. */
export const builtInDetectors: Detector[] = [
  { id: 'phone-bd', what: 'a Bangladeshi phone number', re: /(?<![\d.])(\+?880|0)1[3-9]\d{8}(?!\d)/ },
  {
    id: 'email',
    what: 'an e-mail address',
    re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[A-Za-z]{2,}/,
    allow: /@example\.(com|test|org|net)\b|noreply@/i,
  },
  { id: 'connection-string', what: 'a connection string with credentials', re: /[a-z]+:\/\/[^\s:@/"']+:[^\s@/"']+@/i },
];

/** The guard's rules when available, otherwise the built-in ones. */
export function defaultDetectors(): Detector[] {
  return guardDetectors() ?? builtInDetectors;
}

/** The first detector that matches the text (allow-listed matches are skipped), or undefined. */
export function detect(text: string, detectors: Detector[]): Detector | undefined {
  for (const d of detectors) {
    const flags = d.re.flags.includes('g') ? d.re.flags : d.re.flags + 'g';
    for (const m of text.matchAll(new RegExp(d.re.source, flags))) {
      if (d.allow && d.allow.test(m[0])) continue;
      return d;
    }
  }
  return undefined;
}

/** Every string inside a JSON-like value, with its path (`a.b[2].c`). Object keys are checked as well. */
export function* strings(value: unknown, path = ''): Generator<{ path: string; text: string }> {
  if (typeof value === 'string') {
    yield { path: path || '(value)', text: value };
  } else if (Array.isArray(value)) {
    for (const [i, v] of value.entries()) yield* strings(v, `${path}[${i}]`);
  } else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      const p = path ? `${path}.${k}` : k;
      yield { path: `${p} (key)`, text: k };
      yield* strings(v, p);
    }
  }
}
