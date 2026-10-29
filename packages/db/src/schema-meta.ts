// Reads prisma/schema.prisma as text: models, fields, the `///` annotations and the header's store-scope exception
// lists. The guard tests use it, and later tooling (the data layer's storeId check, the hardcode guard) can reuse it.
// No Prisma engine and no database connection are needed.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const SCHEMA_PATH = fileURLToPath(new URL('../prisma/schema.prisma', import.meta.url));
export const MIGRATIONS_DIR = fileURLToPath(new URL('../prisma/migrations/', import.meta.url));

export type ModelScope = 'store' | 'installation' | 'store-optional';

export interface FieldInfo {
  name: string;
  /** Base type without `[]` or `?`, e.g. `Int`, `String`, `Store`. */
  type: string;
  optional: boolean;
  list: boolean;
  /** Everything after the type: attributes such as `@default(…)`, `@relation(…)`, `@db.…`. */
  attrs: string;
  line: number;
}

export interface ModelInfo {
  name: string;
  /** The `///` lines directly above `model X {`, without the slashes. */
  doc: string[];
  fields: FieldInfo[];
  /** `@@index`, `@@unique`, `@@id` … lines, trimmed. */
  blockAttrs: string[];
  /** Register stage from `/// @stage Sxx`, e.g. `S00`. */
  stage: string | undefined;
  /** Declared scope; a model with no `@scope` annotation is store-scoped. */
  scope: ModelScope;
  appendOnly: boolean;
  line: number;
}

export interface ParsedSchema {
  text: string;
  models: ModelInfo[];
  enums: string[];
  /** Names listed between `@installation-level-begin` and `@installation-level-end` in the header. */
  installationLevel: string[];
  /** Names listed between `@store-optional-begin` and `@store-optional-end` in the header. */
  storeOptional: string[];
}

const FIELD_RE = /^\s*(\w+)\s+(\w+)(\[\])?(\?)?(?:\s+(.*))?$/;

/** Model names from a header block such as `// @installation-level-begin` … `// @installation-level-end`. */
export function headerList(text: string, marker: string): string[] {
  const begin = text.indexOf(`// @${marker}-begin`);
  const end = text.indexOf(`// @${marker}-end`);
  if (begin < 0 || end < begin) throw new Error(`schema header has no @${marker}-begin … @${marker}-end block`);
  const names: string[] = [];
  for (const raw of text.slice(begin, end).split('\n').slice(1)) {
    const body = raw.replace(/^\s*\/\/\s?/, '');
    const beforeReason = body.split('—')[0] ?? '';
    for (const part of beforeReason.split(',')) {
      const name = part.trim();
      if (/^[A-Z]\w*$/.test(name)) names.push(name);
    }
  }
  return names;
}

export function parseSchema(text: string): ParsedSchema {
  const lines = text.split('\n');
  const models: ModelInfo[] = [];
  const enums: string[] = [];
  let doc: string[] = [];
  let current: ModelInfo | undefined;
  let inEnum = false;

  lines.forEach((raw, index) => {
    const line = raw.trim();
    const lineNo = index + 1;
    if (current) {
      if (line === '}') {
        models.push(current);
        current = undefined;
        return;
      }
      if (line === '' || line.startsWith('//')) return;
      if (line.startsWith('@@')) {
        current.blockAttrs.push(line);
        return;
      }
      const m = FIELD_RE.exec(raw);
      if (m) {
        current.fields.push({
          name: m[1] as string,
          type: m[2] as string,
          list: m[3] === '[]',
          optional: m[4] === '?',
          attrs: (m[5] ?? '').trim(),
          line: lineNo,
        });
      }
      return;
    }
    if (inEnum) {
      if (line === '}') inEnum = false;
      return;
    }
    if (line.startsWith('///')) {
      doc.push(line.replace(/^\/\/\/\s?/, ''));
      return;
    }
    const model = /^model\s+(\w+)\s*\{$/.exec(line);
    if (model) {
      const stage = doc.map((d) => /^@stage\s+(S\d\d)\b/.exec(d)?.[1]).find(Boolean);
      const scopeLine = doc.map((d) => /^@scope\s+(installation|store-optional)\b/.exec(d)?.[1]).find(Boolean);
      current = {
        name: model[1] as string,
        doc,
        fields: [],
        blockAttrs: [],
        stage,
        scope: (scopeLine as ModelScope | undefined) ?? 'store',
        appendOnly: doc.some((d) => /^@append-only\b/.test(d)),
        line: lineNo,
      };
      doc = [];
      return;
    }
    const en = /^enum\s+(\w+)\s*\{$/.exec(line);
    if (en) {
      enums.push(en[1] as string);
      inEnum = true;
    }
    if (!line.startsWith('//')) doc = [];
  });

  return {
    text,
    models,
    enums,
    installationLevel: headerList(text, 'installation-level'),
    storeOptional: headerList(text, 'store-optional'),
  };
}

export function loadSchema(path: string = SCHEMA_PATH): ParsedSchema {
  return parseSchema(readFileSync(path, 'utf8'));
}

/**
 * The store-scope rule (A4.1): a store-scoped model has a required `storeId Int` with a relation to Store; a
 * store-optional model has `storeId Int?` with that relation; an installation-level model has no storeId; and the
 * header lists agree with the `@scope` annotations. Returns one message per violation (empty = the schema passes).
 */
export function storeScopeViolations(schema: ParsedSchema): string[] {
  const out: string[] = [];
  const names = new Set(schema.models.map((m) => m.name));
  const listed = new Map<string, ModelScope>([
    ...schema.installationLevel.map((n) => [n, 'installation'] as const),
    ...schema.storeOptional.map((n) => [n, 'store-optional'] as const),
  ]);
  for (const n of listed.keys()) if (!names.has(n)) out.push(`${n}: listed in the schema header but not a model`);
  for (const m of schema.models) {
    const expected = listed.get(m.name) ?? 'store';
    if (m.scope !== expected) out.push(`${m.name}: @scope says ${m.scope}, the header list says ${expected}`);
    const id = m.fields.find((f) => f.name === 'storeId');
    const rel = m.fields.find((f) => f.type === 'Store' && /fields:\s*\[storeId\]/.test(f.attrs));
    if (expected === 'store') {
      if (!id || id.type !== 'Int' || id.optional || id.list) {
        out.push(`${m.name}: has no storeId Int — add one, or list the model as installation-level with a reason`);
      }
      if (!rel || rel.optional) out.push(`${m.name}: needs a required relation to Store on storeId`);
    } else if (expected === 'store-optional') {
      if (!id || id.type !== 'Int' || !id.optional) out.push(`${m.name}: store-optional needs storeId Int?`);
      if (!rel) out.push(`${m.name}: needs a relation to Store on storeId`);
    } else if (id) {
      out.push(`${m.name}: installation-level but has a storeId`);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------
// PR 139 (CN-022) — which `@append-only` models are locked at the database. A locked model's rows can never be changed
// or removed: the app's role (extas_app) has no UPDATE, DELETE or TRUNCATE on it, and a trigger refuses them for every
// role (migration 0010_append_only and later ones). `@append-only` alone only means "no updatedAt"; the models in
// APPEND_ONLY_OPEN are not locked, each for the reason given. test/schema-guard.test.ts checks that every
// `@append-only` model is in exactly one of the two lists and that every locked model has both guards in a migration.
// ---------------------------------------------------------------------------------------------------------------------

/** The database role the app connects as (PgBouncer, DATABASE_URL). Migrations use the owner role. */
export const APP_DB_ROLE = 'extas_app';

/** Append-only at the database: audit trails and ledgers, where an edit is never legitimate. */
export const APPEND_ONLY_LOCKED = [
  'AuditLog',
  'SecurityEvent',
  'SettingChange',
  'SecretAccessLog',
  'OrderEvent',
  'StockMovement',
  'WalletEntry',
  'RewardEntry',
  'PriceHistory',
  'ProductRename',
  'SmartRuleVersion',
  'CheckoutFlagEvent',
  'FraudDecision',
  'ShipmentEvent',
  'NotificationAttempt',
  'PackingScan',
  // CN-028 · PR 615–618 (migration 0049_erp_v6): Retail's ERP account, the pipeline moves, the payments to the ERP, the
  // books closes, notes and adjustments, and every summary and fixed-cost version with each send to the ERP.
  // (ErpEvent, PR 608, is guarded differently: its body never changes and no row is removed, but its processing state
  // moves — trigger ErpEvent_body_fixed, function extas_erp_event_fixed, in the same migration.)
  'ErpAccountEntry',
  'ErpPaymentRecord',
  'ErpPipelineMove',
  'BooksDayClose',
  'BooksPeriodClose',
  'BooksDifferenceNote',
  'BooksAdjustment',
  'ErpDailySummary',
  'ErpFixedCostMonth',
  'ErpBooksSend',
] as const;

const RUN_ROW = 'a run or job row: its status, result or end time is written when the run finishes';
const PERSONAL = 'holds personal data (IP, phone, device, behaviour) with a deletion or retention rule still to be built';
const SAMPLES = 'measurements and samples that are thinned out over time (monitoring, not history)';
const NOT_BUILT = 'not built yet: decided with its own register PR (lock it there if nothing ever edits its rows)';

/** `@append-only` models that are not locked at the database, each with its reason. */
export const APPEND_ONLY_OPEN: Readonly<Record<string, string>> = {
  SettingsMigration: RUN_ROW,
  DefaultPackApplication: RUN_ROW,
  IntegrationTestRun: RUN_ROW,
  ErpSyncRun: RUN_ROW,
  SitemapBuild: RUN_ROW,
  AiSandboxRun: RUN_ROW,
  BackupRun: RUN_ROW,
  RestoreTest: RUN_ROW,
  DeployRecord: RUN_ROW,
  MigrationCrawlCheck: RUN_ROW,
  StudioPilotRun: RUN_ROW,
  PrRegisterUpdate: 'the reader marks an update as seen (seenAt)',
  StaffLoginEvent: PERSONAL,
  AbAssignment: PERSONAL,
  SizeRecommendation: PERSONAL,
  RiskAssessment: PERSONAL,
  CouponRedemption: PERSONAL,
  CustomerAccessLog: PERSONAL,
  ConsentRecord: PERSONAL,
  CustomerTouchpoint: PERSONAL,
  AnalyticsEvent: PERSONAL,
  TelegramMessage: PERSONAL,
  CachePurgeLog: SAMPLES,
  SpeedMeasurement: SAMPLES,
  AiCitation: SAMPLES,
  ServiceHealthSample: SAMPLES,
  CacheStatSample: SAMPLES,
  LayoutRestore: NOT_BUILT,
  ComboTemplateScore: NOT_BUILT,
  SetBuilderAdd: 'a visitor`s tapped set adds (cart and picks, PR 98), kept for the report until the bag retention rule clears them',
  DuplicateNoticeEvent: NOT_BUILT,
  ChargeMismatch: NOT_BUILT,
  LocalStockIntake: NOT_BUILT,
  SmartRuleSimulation: NOT_BUILT,
  BlogPostReview: NOT_BUILT,
  CompetitorReport: NOT_BUILT,
  GeoAdRecommendation: NOT_BUILT,
  AiUsageLedger: NOT_BUILT,
  AiCapEvent: NOT_BUILT,
  AiDiaryEntry: NOT_BUILT,
  AiSkillVersion: NOT_BUILT,
  AiWorkLog: NOT_BUILT,
  ReportDigest: NOT_BUILT,
  CostEntry: NOT_BUILT,
  PrepaidTopUp: NOT_BUILT,
  SamenessCheck: NOT_BUILT,
  SupportEscalation: NOT_BUILT,
  ImageEdit: NOT_BUILT,
  ColourVerification: NOT_BUILT,
};

/** Model count per register stage, sorted by stage. */
export function modelsPerStage(schema: ParsedSchema): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const m of schema.models) {
    const key = m.stage ?? 'none';
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
}
