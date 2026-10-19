// PR 509 — the owner-data check, run in CI (`pnpm --filter @extas/seed owner-data:check`) and by the unit tests. It
// fails the build when
// 1. a setting of the owner's ships with a default, a key under an owner prefix is not declared as owner data, or a
//    money setting / owner decision is not empty and protected (CLAUDE.md rules 4 and 6);
// 2. the register names a table or column the schema does not have, or lists something twice;
// 3. the installation export could read a register table or column;
// 4. a setting default, the general default pack or the sample data carries a value of the owner's — his shop name or
//    domain, a phone number, an e-mail address, a key — or a sample row in an owner table is not plainly sample data.
// It needs no database.
import type { ParsedSchema } from '@extas/db';
import {
  ownerDataRegister,
  underOwnerPrefix,
  type OwnerDataRegister,
  type RegistryShape,
} from '@extas/settings';
import { detect, strings, type Detector } from './detectors';
import { EXPORT_READS } from './export-tables';
import type { PackData } from './pack';
import { SAMPLE_PACK_KEY, type SampleData } from './sample';

export interface Finding {
  rule: string;
  where: string;
  message: string;
}

export interface CheckInput {
  registry: RegistryShape;
  register?: OwnerDataRegister;
  schema: ParsedSchema;
  pack: PackData;
  sample: SampleData;
  detectors: Detector[];
  exportReads?: Readonly<Record<string, '*' | readonly string[]>>;
}

/** A phone number in the unallocated +88010 range: what sample data uses instead of anyone's real number. */
export const SAMPLE_PHONE = /^\+88010\d{8}$/;
/** The reserved example domains (RFC 2606). */
export const SAMPLE_EMAIL = /@example\.(com|org|net|test)$/i;

export function checkOwnerData(input: CheckInput): Finding[] {
  const register = input.register ?? ownerDataRegister;
  const findings: Finding[] = [];
  const add = (rule: string, where: string, message: string) => findings.push({ rule, where, message });

  // 1. The registry.
  for (const [key, spec] of Object.entries(input.registry)) {
    const where = `setting ${key}`;
    if (spec.isOwnerData && spec.default !== null) {
      add('owner-default', where, "the owner's own data must ship without a default");
    }
    if (underOwnerPrefix(key, register) && !spec.isOwnerData) {
      add('owner-prefix', where, 'a key under an owner-data prefix must be declared isOwnerData');
    }
    if (spec.valueType === 'MONEY_MINOR' && !spec.requiresOwnerOk) {
      add('money-unprotected', where, "a money setting must need the owner's written OK");
    }
    if (spec.requiresOwnerOk && (!spec.isOwnerData || spec.default !== null)) {
      add('decision-default', where, "an owner decision is owner data and ships empty (no default)");
    }
    for (const s of strings(spec.default)) {
      const hit = detect(s.text, input.detectors);
      if (hit) add(`default-${hit.id}`, `${where} default ${s.path}`, `the default carries ${hit.what}`);
    }
  }

  // 2. The register against the schema.
  const models = new Map(input.schema.models.map((m) => [m.name, m]));
  const seen = new Set<string>();
  const all = [
    ...register.settingPrefixes.map((i) => ['prefix', i.target] as const),
    ...register.tables.map((i) => ['table', i.target] as const),
    ...register.columns.map((i) => ['column', i.target] as const),
    ...register.media.map((i) => ['media', i.target] as const),
  ];
  for (const [kind, target] of all) {
    const name = `${kind}:${target}`;
    if (seen.has(name)) add('register-duplicate', `register ${name}`, 'listed twice');
    seen.add(name);
  }
  for (const p of register.settingPrefixes) {
    if (!/^[a-z][a-zA-Z0-9]*(\.[a-z][a-zA-Z0-9]*)*\.$/.test(p.target)) {
      add('register-prefix', `register prefix ${p.target}`, 'a prefix is a dotted key ending with a dot');
    }
  }
  for (const t of register.tables) {
    if (!models.has(t.target)) add('register-unknown-table', `register table ${t.target}`, 'no such model in the schema');
  }
  for (const c of register.columns) {
    const [model, field, extra] = c.target.split('.');
    const m = model ? models.get(model) : undefined;
    if (!m || !field || extra !== undefined || !m.fields.some((f) => f.name === field)) {
      add('register-unknown-column', `register column ${c.target}`, 'no such Model.column in the schema');
    }
  }
  for (const m of register.media) {
    if (!m.target.startsWith('/')) add('register-media', `register media ${m.target}`, 'a media folder starts with /');
  }

  // 3. The export reads none of it.
  const reads = input.exportReads ?? EXPORT_READS;
  for (const t of register.tables) {
    if (t.target in reads) add('export-reads-owner-table', `export ${t.target}`, 'the export must never read a register table');
  }
  for (const c of register.columns) {
    const [model, field] = c.target.split('.') as [string, string];
    const cols = reads[model];
    if (cols === '*' || cols?.includes(field)) {
      add('export-reads-owner-column', `export ${c.target}`, 'the export must never read a register column');
    }
  }

  // 4a. The general default pack ships to every installation: no value of the owner's, ever.
  for (const s of strings(input.pack)) {
    const hit = detect(s.text, input.detectors);
    if (hit) add(`pack-${hit.id}`, `default pack ${s.path}`, `carries ${hit.what}`);
  }

  // 4b. The sample data: no value of anyone's, and every row in an owner table is plainly sample data.
  for (const s of strings(input.sample)) {
    if (s.path === '$comment') continue; // the file's own explanation
    const hit = detect(s.text, input.detectors);
    if (hit) add(`sample-${hit.id}`, `sample ${s.path}`, `carries ${hit.what}`);
  }
  const marker = input.sample.marker.toLowerCase();
  const marked = (where: string, value: string) => {
    if (!value.toLowerCase().includes(marker)) add('sample-unmarked', `sample ${where}`, `must contain "${input.sample.marker}"`);
  };
  marked('store.name (Store.name)', input.sample.store.name);
  marked('store.slug', input.sample.store.slug);
  marked('brand.name', input.sample.brand.name);
  marked('customer.name (Customer)', input.sample.customer.name);
  marked('order.number (Order)', input.sample.order.number);
  marked('order.address (Order)', input.sample.order.address);
  if (!SAMPLE_PHONE.test(input.sample.customer.phone)) {
    add('sample-phone', 'sample customer.phone (Customer)', 'a sample phone must be in the unallocated +88010 range');
  }
  if (!SAMPLE_EMAIL.test(input.sample.customer.email)) {
    add('sample-email', 'sample customer.email (Customer)', 'a sample e-mail must be on example.com');
  }
  if (input.pack.key === SAMPLE_PACK_KEY) add('pack-key', 'default pack key', `"${SAMPLE_PACK_KEY}" is reserved for the sample seed`);

  return findings;
}

/** One line per finding, for the CI log. Never prints a matched value, only where it is and what it looks like. */
export function describeFindings(findings: Finding[]): string[] {
  return findings.map((f) => `${f.where}  [${f.rule}] ${f.message}`);
}
