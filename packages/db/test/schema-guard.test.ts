// PR 13 / 603 structural guard. Fails the build when the schema breaks a standing rule:
// storeId on every store-scoped table (A4.1), no Float money, nothing deleted, no plaintext secrets, the settings
// framework and vault shape (PR 491–496, 509), and the PR 603 index pack.
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  APP_DB_ROLE,
  APPEND_ONLY_LOCKED,
  APPEND_ONLY_OPEN,
  loadSchema,
  MIGRATIONS_DIR,
  modelsPerStage,
  parseSchema,
  storeScopeViolations,
  type FieldInfo,
  type ModelInfo,
} from '../src/schema-meta';

const schema = loadSchema();
const byName = new Map(schema.models.map((m) => [m.name, m]));
const field = (m: ModelInfo, name: string): FieldInfo | undefined => m.fields.find((f) => f.name === name);
const model = (name: string): ModelInfo => {
  const m = byName.get(name);
  if (!m) throw new Error(`model ${name} is missing`);
  return m;
};

describe('schema basics', () => {
  it('parses a full schema', () => {
    // The whole plan in one pass: a sanity floor so a broken parser cannot pass every other test with zero models.
    expect(schema.models.length).toBeGreaterThan(300);
    expect(schema.enums.length).toBeGreaterThan(30);
  });

  it('gives every model a register stage S00–S27', () => {
    const bad = schema.models.filter((m) => !m.stage || Number(m.stage.slice(1)) > 27).map((m) => m.name);
    expect(bad).toEqual([]);
  });

  it('covers every active stage S00–S25 and the parked S26/S27 pack', () => {
    const stages = Object.keys(modelsPerStage(schema));
    for (let n = 0; n <= 26; n += 1) expect(stages).toContain(`S${String(n).padStart(2, '0')}`);
  });

  it('has no duplicate model names', () => {
    expect(new Set(schema.models.map((m) => m.name)).size).toBe(schema.models.length);
  });
});

describe('store scoping (A4.1)', () => {
  const installation = new Set(schema.installationLevel);
  const optional = new Set(schema.storeOptional);

  it('lists only real models in the header exception lists, with no overlap', () => {
    const unknown = [...installation, ...optional].filter((n) => !byName.has(n));
    expect(unknown).toEqual([]);
    expect([...installation].filter((n) => optional.has(n))).toEqual([]);
  });

  it('matches the header lists to each model’s @scope annotation', () => {
    const annotatedInstallation = schema.models.filter((m) => m.scope === 'installation').map((m) => m.name);
    const annotatedOptional = schema.models.filter((m) => m.scope === 'store-optional').map((m) => m.name);
    expect(annotatedInstallation.sort()).toEqual([...installation].sort());
    expect(annotatedOptional.sort()).toEqual([...optional].sort());
  });

  it('passes the store-scope rule as a whole', () => {
    expect(storeScopeViolations(schema)).toEqual([]);
  });

  it('catches a model without storeId that is not in the exception list (the guard really fails)', () => {
    const sample = parseSchema(
      [
        '// @installation-level-begin',
        '//   Store — the registry',
        '// @installation-level-end',
        '// @store-optional-begin',
        '// @store-optional-end',
        '/// @stage S00 · PR 13',
        '/// @scope installation — registry',
        'model Store {',
        '  id Int @id',
        '}',
        '/// @stage S01 · PR 20',
        'model Leaky {',
        '  id String @id',
        '}',
        '/// @stage S01 · PR 20',
        'model Scoped {',
        '  id      String @id',
        '  storeId Int',
        '  store   Store  @relation(fields: [storeId], references: [id])',
        '}',
      ].join('\n'),
    );
    const found = storeScopeViolations(sample);
    expect(found.some((v) => v.startsWith('Leaky: has no storeId'))).toBe(true);
    expect(found.some((v) => v.startsWith('Scoped'))).toBe(false);
    expect(found.some((v) => v.startsWith('Store'))).toBe(false);
  });

  it('gives every store-scoped model a required storeId Int with a relation to Store', () => {
    const bad: string[] = [];
    for (const m of schema.models.filter((x) => x.scope === 'store')) {
      const id = field(m, 'storeId');
      const rel = m.fields.find((f) => f.type === 'Store' && /fields:\s*\[storeId\]/.test(f.attrs));
      if (!id || id.type !== 'Int' || id.optional || id.list) bad.push(`${m.name}: storeId must be Int`);
      if (!rel || rel.optional) bad.push(`${m.name}: needs a required relation to Store on storeId`);
    }
    expect(bad).toEqual([]);
  });

  it('gives every store-optional model an optional storeId Int? with a relation to Store', () => {
    const bad: string[] = [];
    for (const m of schema.models.filter((x) => x.scope === 'store-optional')) {
      const id = field(m, 'storeId');
      const rel = m.fields.find((f) => f.type === 'Store' && /fields:\s*\[storeId\]/.test(f.attrs));
      if (!id || id.type !== 'Int' || !id.optional) bad.push(`${m.name}: storeId must be Int?`);
      if (!rel) bad.push(`${m.name}: needs a relation to Store on storeId`);
    }
    expect(bad).toEqual([]);
  });

  it('gives no installation-level model a storeId (except Store itself, which is the id)', () => {
    const bad = schema.models.filter((m) => m.scope === 'installation' && field(m, 'storeId')).map((m) => m.name);
    expect(bad).toEqual([]);
  });

  it('keeps one mother store: Store.id is an Int and isPrimary is a unique optional flag (A4.5)', () => {
    const store = model('Store');
    expect(field(store, 'id')?.type).toBe('Int');
    const primary = field(store, 'isPrimary');
    expect(primary?.type).toBe('Boolean');
    expect(primary?.optional).toBe(true);
    expect(primary?.attrs).toMatch(/@unique/);
  });

  it('keeps business keys unique per store, not across stores (two stores may reuse a slug or SKU)', () => {
    // A field-level @unique in a store table is unique across ALL stores. Only these may be: a one-to-one foreign key
    // (…Id), a random token hash (…Hash), and the hostnames, which really are global.
    const GLOBAL = new Set(['StoreDomain.hostname']);
    const bad = schema.models
      .filter((m) => m.scope === 'store')
      .flatMap((m) =>
        m.fields
          .filter((f) => /@unique\b/.test(f.attrs) && !/@id\b/.test(f.attrs))
          .filter((f) => !/(Id|Hash)$/.test(f.name) && !GLOBAL.has(`${m.name}.${f.name}`))
          .map((f) => `${m.name}.${f.name}`),
      );
    expect(bad).toEqual([]);
  });
});

describe('money (no floats)', () => {
  const MONEY = /(price|amount|cost|fee|charge|spend|revenue|balance|refund|payout|discount|budget|cash|wallet|commission|salary|margin|profit|subtotal|minor|micros)/i;
  const NOT_MONEY = /(Ms|Count|Percent|Pct|Bps|Rate|Score|Grams|Qty|Quantity|Seconds|Days|Hours|Minutes|Version|Tokens|Bytes|Points|Position|Rank|Index|Order|Level|Units)$/;

  it('has no Float field with a money name', () => {
    const bad = schema.models.flatMap((m) =>
      m.fields.filter((f) => f.type === 'Float' && MONEY.test(f.name) && !NOT_MONEY.test(f.name)).map((f) => `${m.name}.${f.name}`),
    );
    expect(bad).toEqual([]);
  });

  it('stores …Minor as Int/BigInt and …Micros as BigInt/Int', () => {
    const bad = schema.models.flatMap((m) =>
      m.fields
        .filter((f) => /(Minor|Micros)$/.test(f.name) && !['Int', 'BigInt'].includes(f.type))
        .map((f) => `${m.name}.${f.name}: ${f.type}`),
    );
    expect(bad).toEqual([]);
  });

  it('names every numeric money column …Minor or …Micros (unit visible in the name)', () => {
    const bad = schema.models.flatMap((m) =>
      m.fields
        .filter((f) => ['Int', 'BigInt', 'Decimal'].includes(f.type))
        .filter((f) => MONEY.test(f.name) && !/(Minor|Micros)$/.test(f.name) && !NOT_MONEY.test(f.name))
        .map((f) => `${m.name}.${f.name}`),
    );
    expect(bad).toEqual([]);
  });
});

describe('nothing is deleted (rule 3) and history', () => {
  it('never cascades a delete', () => {
    expect(schema.text).not.toMatch(/onDelete:\s*Cascade/);
  });

  it('gives every model a createdAt', () => {
    expect(schema.models.filter((m) => !field(m, 'createdAt')).map((m) => m.name)).toEqual([]);
  });

  it('marks every model without updatedAt as @append-only, and vice versa', () => {
    const bad = schema.models
      .filter((m) => Boolean(field(m, 'updatedAt')) === m.appendOnly)
      .map((m) => `${m.name} (updatedAt: ${Boolean(field(m, 'updatedAt'))}, append-only: ${m.appendOnly})`);
    expect(bad).toEqual([]);
  });

  it('stores every DateTime as timestamptz(3) or date', () => {
    const bad = schema.models.flatMap((m) =>
      m.fields
        .filter((f) => f.type === 'DateTime' && !/@db\.(Timestamptz\(3\)|Date\b)/.test(f.attrs))
        .map((f) => `${m.name}.${f.name}`),
    );
    expect(bad).toEqual([]);
  });

  it('uses a UUIDv7 primary key everywhere except Store and pure join tables', () => {
    const joinTables = schema.models.filter((m) => m.blockAttrs.some((a) => a.startsWith('@@id(')));
    expect(joinTables.map((m) => m.name)).toEqual(['RolePermission']);
    const bad = schema.models
      .filter((m) => m.name !== 'Store' && !joinTables.includes(m))
      .filter((m) => {
        const id = field(m, 'id');
        return !id || !/@id\b/.test(id.attrs) || !/@default\(uuid\(7\)\)/.test(id.attrs);
      })
      .map((m) => m.name);
    expect(bad).toEqual([]);
  });

  it.each([
    'Store', 'Product', 'ProductVariant', 'Category', 'StyleGroup', 'Brand', 'Collection', 'Tag', 'MediaAsset',
    'Customer', 'CustomerAddress', 'Order', 'Coupon', 'Combo', 'Review', 'Page', 'BlogPost', 'Theme', 'Menu',
    'Campaign', 'Segment', 'CourierAccount', 'DeliveryBand', 'StaffUser', 'Role', 'Integration', 'Warehouse',
  ])('lets %s be archived (hidden) instead of deleted', (name) => {
    // Child and link rows (order lines, listings) are kept with their parent; the parent carries archivedAt.
    const at = field(model(name), 'archivedAt');
    expect(at?.type).toBe('DateTime');
    expect(at?.optional).toBe(true);
  });
});

describe('secrets (PR 493)', () => {
  // `tokens` (design tokens on Theme) is not a credential, hence the lookahead.
  const SECRETISH = /(password|passcode|secret|token(?!s$)|apikey|privatekey|accesskey|otp|pincode|cvv|cardnumber)/i;
  // Hashes, vault references, names and encrypted parts (ciphertext + iv + auth tag, like the vault) are allowed.
  const SAFE_SUFFIX = /(Hash|Ref|Name|Names|Id|Ids|At|Count|Version|Prefix|Last4|Key|Hint|Type|Status|Ciphertext|Iv|AuthTag)$/;
  // Columns that look like a secret but are not a credential, each with its written reason (like the hardcode guard's
  // opt-outs). Payment.linkToken (PR 542): the random part of a pay link the shop sends by SMS / WhatsApp and must send
  // again ("Send again") and render later in the message engine, so it is kept readable — the same text already sits in
  // the message log. It opens only that one order's "pay this amount" page (order number and amount, no name, phone
  // or address) and can only pay money to the shop; it signs nobody in.
  const NOT_A_CREDENTIAL = new Set(['Payment.linkToken']);

  it('has no plaintext secret columns (String/Bytes/Json named like a secret, not a hash or reference)', () => {
    const bad = schema.models
      .filter((m) => !['InstallationSecret', 'StoreSecret'].includes(m.name))
      .flatMap((m) =>
        m.fields
          .filter((f) => ['String', 'Bytes', 'Json'].includes(f.type))
          .filter((f) => SECRETISH.test(f.name) && (!SAFE_SUFFIX.test(f.name) || /(apiKey|privateKey|accessKey)$/i.test(f.name)))
          .map((f) => `${m.name}.${f.name}`)
          .filter((name) => !NOT_A_CREDENTIAL.has(name)),
      );
    expect(bad).toEqual([]);
  });

  it.each(['InstallationSecret', 'StoreSecret'])('%s holds only ciphertext, iv, auth tag, key version and who/when', (name) => {
    const m = model(name);
    for (const f of ['ciphertext', 'iv', 'authTag']) expect(field(m, f)?.type).toBe('Bytes');
    expect(field(m, 'keyVersion')?.type).toBe('Int');
    for (const f of ['createdById', 'updatedById', 'createdAt', 'updatedAt', 'rotatedAt', 'revokedAt']) {
      expect(field(m, f), `${name}.${f}`).toBeDefined();
    }
    const plaintext = m.fields.filter((f) => /^(value|plaintext|secret|raw)/i.test(f.name));
    expect(plaintext).toEqual([]);
  });

  it('keeps the master key out of the database: VaultKey has only a wrapped data key and a reference', () => {
    const m = model('VaultKey');
    expect(field(m, 'wrappedDataKey')?.type).toBe('Bytes');
    expect(field(m, 'masterKeyRef')?.type).toBe('String');
    expect(m.fields.filter((f) => /^(masterKey|key)$/i.test(f.name) && f.type !== 'VaultKey')).toEqual([]);
  });
});

describe('settings framework from day one (PR 491, 492, 496, 509, 510)', () => {
  it('has a typed definition registry with default, scope, owner-data flag and version marker', () => {
    const def = model('SettingDefinition');
    expect(field(def, 'key')?.attrs).toMatch(/@unique/);
    for (const f of ['valueType', 'scope', 'defaultValue', 'isOwnerData', 'sinceVersion']) {
      expect(field(def, f), `SettingDefinition.${f}`).toBeDefined();
    }
    expect(field(def, 'isOwnerData')?.type).toBe('Boolean');
  });

  it('stores values at installation and store level, one row per key, with optimistic-lock versions', () => {
    const inst = model('InstallationSettingValue');
    const store = model('StoreSettingValue');
    expect(inst.scope).toBe('installation');
    expect(store.scope).toBe('store');
    for (const m of [inst, store]) {
      expect(field(m, 'version')?.type).toBe('Int');
      expect(field(m, 'value')?.type).toBe('Json');
    }
    expect(store.blockAttrs.some((a) => /@@unique\(\[storeId,/.test(a))).toBe(true);
  });

  it('keeps a settings history with reset-to-default, and a settings migration marker', () => {
    expect(schema.text).toMatch(/RESET_TO_DEFAULT/);
    expect(field(model('SettingsMigration'), 'version')).toBeDefined();
    expect(field(model('Installation'), 'settingsVersion')?.type).toBe('Int');
    expect(model('SettingChange').appendOnly).toBe(true);
  });

  it('can mark owner data that never ships to a new installation (PR 509)', () => {
    expect(byName.has('OwnerDataEntry')).toBe(true);
    expect(field(model('ExportJob'), 'excludesOwnerData')?.attrs).toMatch(/@default\(true\)/);
  });

  it('keeps business values out of schema defaults (only neutral technical defaults)', () => {
    // A @default with a non-trivial number is a business value (a charge, a limit, a window) and belongs in settings.
    const bad = schema.models.flatMap((m) =>
      m.fields
        .filter((f) => /@default\((-?\d+(\.\d+)?)\)/.test(f.attrs))
        .filter((f) => !/@default\((0|1)\)/.test(f.attrs))
        .map((f) => `${m.name}.${f.name}: ${f.attrs}`),
    );
    expect(bad).toEqual([]);
  });
});

describe('PR 603 index pack', () => {
  it('enables pg_trgm through the postgresqlExtensions preview feature', () => {
    expect(schema.text).toMatch(/previewFeatures\s*=\s*\[[^\]]*"postgresqlExtensions"/);
    expect(schema.text).toMatch(/extensions\s*=\s*\[[^\]]*pg_trgm/);
  });

  const indexes: Array<[string, string, RegExp]> = [
    ['category page: category + store + in-stock + sort', 'CategoryProduct', /\[categoryId, storeId, inStock, sortRank\(sort: Desc\)\].*idx_category_page"/],
    ['SKU, unique per store', 'ProductVariant', /@@unique\(\[storeId, sku\].*uq_variant_sku"/],
    ['variant by colour and size', 'ProductVariant', /\[productId, colourId, sizeId\].*idx_variant_colour_size"/],
    ['order by phone', 'Order', /\[storeId, phone, placedAt\(sort: Desc\)\].*idx_order_phone"/],
    ['customer order history', 'Order', /\[storeId, customerId, placedAt\(sort: Desc\)\].*idx_order_customer_history"/],
    ['order list by date', 'Order', /idx_order_list_date"/],
    ['order list by status', 'Order', /idx_order_list_status"/],
    ['order list by courier', 'Order', /courierAccountId.*idx_order_list_courier"/],
    ['Sales by delivered day (PR 155)', 'Order', /\[storeId, status, deliveredAt\].*idx_order_sales_delivered"/],
    ['fuzzy customer name on orders', 'Order', /gin_trgm_ops.*type: Gin.*idx_order_name_trgm"/],
    ['fuzzy address on orders', 'Order', /gin_trgm_ops.*type: Gin.*idx_order_address_trgm"/],
    ['fuzzy saved address', 'CustomerAddress', /gin_trgm_ops.*type: Gin.*idx_address_line_trgm"/],
    ['fuzzy identity (phone, email)', 'IdentityLink', /gin_trgm_ops.*type: Gin.*idx_identity_value_trgm"/],
    ['style hierarchy: ancestors', 'StyleGroup', /\[ancestorIds\].*type: Gin.*idx_style_group_ancestors"/],
    ['style hierarchy: parent', 'StyleGroup', /idx_style_group_parent"/],
    ['product by style', 'Product', /idx_product_style"/],
  ];

  it.each(indexes)('has the %s index', (_label, modelName, pattern) => {
    expect(model(modelName).blockAttrs.some((a) => pattern.test(a))).toBe(true);
  });

  it('has a fuzzy customer-name index', () => {
    const hit = schema.models.some((m) => m.blockAttrs.some((a) => /gin_trgm_ops.*idx_customer_name_trgm"/.test(a)));
    expect(hit).toBe(true);
  });

  it('starts every order-list filter index with storeId', () => {
    const lists = model('Order').blockAttrs.filter((a) => /idx_order_list_/.test(a));
    expect(lists).toHaveLength(3);
    for (const a of lists) expect(a).toMatch(/@@index\(\[storeId,/);
  });
});

// PR 139 (CN-022): every `@append-only` model is either locked at the database (no UPDATE/DELETE/TRUNCATE for the app's
// role, and a trigger that refuses them for everybody) or listed as open with its reason — never forgotten.
describe('append-only at the database (PR 139)', () => {
  const migrations = readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => readFileSync(`${MIGRATIONS_DIR}${d.name}/migration.sql`, 'utf8'))
    .join('\n');
  const appendOnly = schema.models.filter((m) => m.appendOnly).map((m) => m.name);

  it('lists every @append-only model exactly once: locked, or open with a reason', () => {
    const locked = new Set<string>(APPEND_ONLY_LOCKED);
    const open = new Set(Object.keys(APPEND_ONLY_OPEN));
    expect(appendOnly.filter((n) => !locked.has(n) && !open.has(n)), 'new @append-only model: lock it or list it open with a reason').toEqual([]);
    expect([...locked].filter((n) => open.has(n))).toEqual([]);
    expect([...locked, ...open].filter((n) => !appendOnly.includes(n)), 'listed but not an @append-only model').toEqual([]);
    for (const [n, why] of Object.entries(APPEND_ONLY_OPEN)) expect(why.length, n).toBeGreaterThan(20);
  });

  it('locks the audit log', () => {
    expect(APPEND_ONLY_LOCKED).toContain('AuditLog');
    expect(APPEND_ONLY_LOCKED).toContain('OrderEvent');
  });

  it.each([...APPEND_ONLY_LOCKED])('%s has both guards in a migration: the revoke and the triggers', (name) => {
    expect(migrations).toContain(`REVOKE UPDATE, DELETE, TRUNCATE ON "${name}" FROM ${APP_DB_ROLE};`);
    expect(migrations).toContain(`CREATE TRIGGER "${name}_append_only" BEFORE UPDATE OR DELETE ON "${name}" FOR EACH ROW EXECUTE FUNCTION extas_append_only();`);
    expect(migrations).toContain(`CREATE TRIGGER "${name}_no_truncate" BEFORE TRUNCATE ON "${name}" FOR EACH STATEMENT EXECUTE FUNCTION extas_append_only();`);
  });

  it('gives the app role its grants for every later table too (default privileges)', () => {
    expect(migrations).toContain(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${APP_DB_ROLE};`);
    expect(migrations).toMatch(new RegExp(`CREATE ROLE ${APP_DB_ROLE} NOLOGIN`));
  });
});
