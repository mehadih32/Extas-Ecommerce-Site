// PR 214 follow-up (CN-014 g) — Eid order-by dates on the database: the admin API (`/api/admin/rules/eid`; its screen
// comes under Marketing › Campaigns once the owner approves docs/ADMIN-ARCHITECTURE.md) reads and saves the
// `rules.eid.*` settings through the two-tier resolver (each write is in the settings change log with who and when,
// and in the audit log), and the storefront reads what to say (storefrontEid).
// Permissions: reading `rules.read`; dates, times and words `rules.write`; switching the feature on or off
// `rules.publish` (customer words, no money); pre-order and its advance `rules.approve` (the owner's OK: it takes
// money, CLAUDE.md rule 6). Nothing is on, and no date or amount is set, until someone with the right does it.
import { storeTarget, type Key, type Value } from '@extas/settings';
import { z } from 'zod';
import { allow, holds, logChange, nowOf, parse, textContext, type RulesDeps, type SettingsReader, type Who } from './context';
import {
  eidBanner,
  eidBannerLines,
  eidIssues,
  eidStatus,
  hasAdvance,
  lateLine,
  preorderLine,
  type BandNames,
  type EidConfig,
  type EidIssue,
  type EidPlace,
  type EidStatus,
} from './eid';
import { RulesError } from './errors';

/** The resolver's write side (the app passes its SettingsResolver). */
export interface SettingsWriter {
  set<K extends Key>(key: K, value: Value<K>, target: ReturnType<typeof storeTarget>, opts?: { actorId?: string | null; reason?: string | null; ownerApproved?: boolean }): Promise<unknown>;
}

export interface EidDeps extends RulesDeps {
  settings: SettingsReader & SettingsWriter;
}

const K = {
  enabled: 'rules.eid.enabled',
  eidDate: 'rules.eid.eidDate',
  bandDates: 'rules.eid.bandDates',
  districtDates: 'rules.eid.districtDates',
  cutoffTime: 'rules.eid.cutoffTime',
  showDaysBefore: 'rules.eid.showDaysBefore',
  bannerText: 'rules.eid.bannerText',
  lateText: 'rules.eid.lateText',
  preorderEnabled: 'rules.eid.preorder.enabled',
  preorderAdvanceMinor: 'rules.eid.preorder.advanceMinor',
  preorderAdvanceType: 'rules.eid.preorder.advanceType',
  preorderAdvancePercent: 'rules.eid.preorder.advancePercent',
  preorderText: 'rules.eid.preorder.text',
  preorderBannerText: 'rules.eid.preorder.bannerText',
} as const satisfies Record<keyof EidConfig, Key>;

/** The store's Eid settings as the engine reads them. */
export async function eidConfig(deps: Pick<RulesDeps, 'settings'>, storeId: number): Promise<EidConfig> {
  const entries = await Promise.all((Object.entries(K) as [keyof EidConfig, Key][]).map(async ([f, key]) => [f, await deps.settings.value(key, { storeId })] as const));
  return Object.fromEntries(entries) as unknown as EidConfig;
}

export interface EidBandOption {
  key: string;
  nameEn: string;
  nameBn: string | null;
}

export interface EidDistrictOption {
  code: string;
  nameEn: string;
  nameBn: string | null;
}

/** The store's delivery bands (Delivery › bands) and the gazetteer's districts, for the pickers and the checks. */
export async function eidOptions(deps: RulesDeps, storeId: number): Promise<{ bands: EidBandOption[]; districts: EidDistrictOption[] }> {
  const [bands, districts] = await Promise.all([
    deps.db.deliveryBand.findMany({ where: { storeId, archivedAt: null }, select: { key: true, nameEn: true, nameBn: true }, orderBy: [{ sortOrder: 'asc' }, { key: 'asc' }] }),
    deps.db.geoArea.findMany({ where: { level: 'DISTRICT', archivedAt: null, code: { not: null } }, select: { code: true, nameEn: true, nameBn: true }, orderBy: { nameEn: 'asc' } }),
  ]);
  return { bands, districts: districts.map((d) => ({ code: d.code!, nameEn: d.nameEn, nameBn: d.nameBn })) };
}

export interface EidScreen {
  config: EidConfig;
  issues: EidIssue[];
  bands: EidBandOption[];
  districts: EidDistrictOption[];
  perms: { write: boolean; publish: boolean; approve: boolean };
}

export async function getEidScreen(deps: RulesDeps, who: Who): Promise<EidScreen> {
  await allow(deps, who, 'rules.read');
  const [config, opts, write, publish, approve] = await Promise.all([
    eidConfig(deps, who.storeId),
    eidOptions(deps, who.storeId),
    holds(deps, who, 'rules.write'),
    holds(deps, who, 'rules.publish'),
    holds(deps, who, 'rules.approve'),
  ]);
  return { config, issues: eidIssues(config, { bands: opts.bands.map((b) => b.key), districts: opts.districts.map((d) => d.code) }), ...opts, perms: { write, publish, approve } };
}

const textSchema = z.object({ en: z.string(), bn: z.string() }).strict();
const datesInputSchema = z
  .object({
    eidDate: z.string().nullable(),
    bandDates: z.array(z.object({ band: z.string(), orderBy: z.string() }).strict()).nullable(),
    districtDates: z.array(z.object({ district: z.string(), orderBy: z.string() }).strict()).nullable(),
    cutoffTime: z.string(),
    showDaysBefore: z.number(),
    bannerText: textSchema,
    lateText: textSchema,
    preorderText: textSchema,
    preorderBannerText: textSchema,
  })
  .partial()
  .strict();

type Field = keyof EidConfig;

/** Writes the changed fields (each through the setting's own schema); returns which changed. */
async function writeFields(deps: EidDeps, who: Who, next: Partial<EidConfig>, before: EidConfig, opts: { ownerApproved?: boolean } = {}): Promise<Field[]> {
  const changed = (Object.keys(next) as Field[]).filter((f) => JSON.stringify(next[f] ?? null) !== JSON.stringify(before[f] ?? null));
  for (const f of changed) {
    // A list emptied in the admin is stored as "not set" (null), like a new installation.
    const raw = next[f];
    const value = Array.isArray(raw) && raw.length === 0 ? null : raw;
    try {
      await deps.settings.set(K[f], value as never, storeTarget(who.storeId), { actorId: who.actor.staffUserId ?? null, reason: 'Marketing › Campaigns › Eid order-by dates', ...opts });
    } catch (e) {
      const details = (e as { details?: string[] }).details ?? [];
      throw new RulesError('INVALID_INPUT', `the ${f} is not valid`, details.length ? details.map((d) => `${f}: ${d}`) : [f]);
    }
  }
  return changed;
}

/** Saves dates, times and words (`rules.write`). While the feature is on, a save that would break it is refused. */
export async function saveEidDates(deps: EidDeps, who: Who, input: unknown): Promise<EidScreen> {
  await allow(deps, who, 'rules.write');
  const next = parse(datesInputSchema, input, 'Eid dates') as Partial<EidConfig>;
  const before = await eidConfig(deps, who.storeId);
  const opts = await eidOptions(deps, who.storeId);
  const merged = { ...before, ...next };
  const known = { bands: opts.bands.map((b) => b.key), districts: opts.districts.map((d) => d.code) };
  const unknown = eidIssues(merged, known).filter((i) => i === 'UNKNOWN_BAND' || i === 'UNKNOWN_DISTRICT');
  if (unknown.length) throw new RulesError('INVALID_INPUT', 'a band or district is not known', unknown);
  if (before.enabled) {
    const issues = eidIssues(merged, known);
    if (issues.length) throw new RulesError('EID_INVALID', 'switch Eid dates off before this change', issues);
  }
  const changed = await writeFields(deps, who, next, before);
  if (changed.length) await logChange(deps.db, who, { action: 'rules.eid.save', entityType: 'EidOrderBy', entityId: String(who.storeId), before: pickFields(before, changed), after: pickFields(merged, changed) });
  return getEidScreen(deps, who);
}

/** Switches the feature on or off (`rules.publish`). On needs every check to pass. */
export async function setEidEnabled(deps: EidDeps, who: Who, input: unknown): Promise<EidScreen> {
  await allow(deps, who, 'rules.publish');
  const { enabled } = parse(z.object({ enabled: z.boolean() }).strict(), input, 'switch');
  const before = await eidConfig(deps, who.storeId);
  if (enabled) {
    const opts = await eidOptions(deps, who.storeId);
    const issues = eidIssues(before, { bands: opts.bands.map((b) => b.key), districts: opts.districts.map((d) => d.code) });
    if (issues.length) throw new RulesError('EID_INVALID', 'Eid dates cannot be switched on yet', issues);
  }
  const changed = await writeFields(deps, who, { enabled }, before);
  if (changed.length) await logChange(deps.db, who, { action: enabled ? 'rules.eid.on' : 'rules.eid.off', entityType: 'EidOrderBy', entityId: String(who.storeId), before: { enabled: before.enabled }, after: { enabled } });
  return getEidScreen(deps, who);
}

/**
 * Pre-order after the dates and its advance (a fixed amount or a percentage, CN-018 answer 6): money, so only with the
 * owner's OK (`rules.approve`). Switching it on needs the advance of the chosen kind; it may be cleared only while off.
 */
export async function setEidPreorder(deps: EidDeps, who: Who, input: unknown): Promise<EidScreen> {
  await allow(deps, who, 'rules.read');
  if (!(await holds(deps, who, 'rules.approve'))) throw new RulesError('OWNER_OK_REQUIRED', "pre-order takes money: it needs the owner's OK");
  const next = parse(
    z
      .object({ preorderEnabled: z.boolean().nullable(), preorderAdvanceMinor: z.int().min(1).nullable(), preorderAdvanceType: z.enum(['fixed', 'percent']), preorderAdvancePercent: z.int().min(1).max(100).nullable() })
      .partial()
      .strict(),
    input,
    'pre-order',
  );
  const before = await eidConfig(deps, who.storeId);
  const merged = { ...before, ...next };
  if (merged.preorderEnabled === true && !hasAdvance(merged)) throw new RulesError('EID_INVALID', 'pre-order needs its advance', ['PREORDER_NO_ADVANCE']);
  const changed = await writeFields(deps, who, next, before, { ownerApproved: true });
  if (changed.length) await logChange(deps.db, who, { action: 'rules.eid.preorder', entityType: 'EidOrderBy', entityId: String(who.storeId), before: pickFields(before, changed), after: pickFields(merged, changed) });
  return getEidScreen(deps, who);
}

function pickFields(c: EidConfig, fields: Field[]): Record<string, unknown> {
  return Object.fromEntries(fields.map((f) => [f, c[f]]));
}

export interface StorefrontEid {
  /** The shop-wide banner lines (home, bag), or null when there is nothing to say. */
  banner: string[] | null;
  /** This place's state (checkout, thank-you page), when a place was given. */
  status: EidStatus | null;
  /** The line for this place: "may arrive after Eid" past its date; null otherwise (the normal promise stands). */
  late: string | null;
  /** The pre-order line with the advance and the amount due, when pre-order is offered and a total was given. */
  preorder: string | null;
}

/**
 * What the storefront shows (S02 home and bag banner, S04 checkout and thank-you page): read-only, no permission (the
 * customer's own view), texts in the store's language or `locale`. `place` is the band and district the address
 * settled (never guessed from text), `totalMinor` the order total for the pre-order line.
 */
export async function storefrontEid(
  deps: Pick<RulesDeps, 'db' | 'settings' | 'now'>,
  storeId: number,
  opts: { place?: EidPlace; totalMinor?: number | null; locale?: string } = {},
): Promise<StorefrontEid> {
  const [config, ctx] = await Promise.all([eidConfig(deps, storeId), textContext(deps, storeId, opts.locale)]);
  const now = nowOf(deps);
  const b = eidBanner(config, now, ctx.timeZone);
  let names: BandNames = {};
  if (b?.kind === 'dates') {
    const rows = await deps.db.deliveryBand.findMany({ where: { storeId, key: { in: b.bands.map((x) => x.band) } }, select: { key: true, nameEn: true, nameBn: true } });
    names = Object.fromEntries(rows.map((r) => [r.key, { en: r.nameEn, bn: r.nameBn ?? r.nameEn }]));
  }
  const status = opts.place ? eidStatus(config, opts.place, now, ctx.timeZone, opts.totalMinor) : null;
  return {
    banner: b ? eidBannerLines(config, b, ctx, names) : null,
    status,
    late: status?.state === 'closed' ? lateLine(config, ctx) : null,
    preorder: status?.state === 'closed' && status.preorder ? preorderLine(config, status.preorder, ctx) : null,
  };
}
