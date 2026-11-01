// S13 · PR 263 / 264 (Blueprint C6.2 points 3–5) — the ad platforms' audience lists, written: a hashed customer list
// (Meta custom audience + users, Google Customer Match through an offline user data job, TikTok custom audience file),
// a lookalike made from it, and an exclusion list. One platform-neutral writer (`AudienceWriter`) beside the read-only
// `AdsReader`.
//
// - Members arrive here already hashed (sha256 of the phone: digits only for Meta, the +country form for Google and
//   TikTok). Nothing here ever sees a name, an address or a raw phone number, and nothing keeps the list on disk.
// - A value-based list (PR 263) carries each person's delivered sales in the currency's major unit beside the hash
//   (Meta's LOOKUP_VALUE): the platform's lookalike then leans towards people who spend, never towards order count.
// - Mock only for now (A1.3, CN-031 lane B): the practice writer keeps what it would have sent in this process and sends
//   nothing anywhere; the live writer (a token with ads_management / Customer Match / DMP rights in Keys &
//   connections) comes with its own test later. No budget, no bid and no campaign is touched here (rule 6).
import type { AdsPlatform, AdsRead } from './meta-ads';

/** One person of a list: sha256 hashes of his number, and his delivered sales (major unit) for a value-based list. */
export interface AudienceMember {
  /** sha256 of the phone's digits with the country code, no plus (Meta). */
  ph: string;
  /** sha256 of the phone in +country form (Google, TikTok). */
  phPlus: string;
  value: number | null;
}

/** How close a lookalike stays to its seed: Google and TikTok take a word, Meta a share of the country (1–10 %). */
export const LOOKALIKE_SIZES = ['narrow', 'balanced', 'broad'] as const;
export type LookalikeSize = (typeof LOOKALIKE_SIZES)[number];
export interface LookalikeSpec {
  /** Meta: the share of the country's people, 1–10. */
  percent: number | null;
  /** Google and TikTok. */
  size: LookalikeSize | null;
  /** ISO 3166 two-letter codes the lookalike is drawn from. */
  countries: string[];
}

export interface AudienceUpload {
  /** The platform's id of this list when it was sent before (its members are replaced), else null (a new list). */
  externalId: string | null;
  name: string;
  members: readonly AudienceMember[];
  valueBased: boolean;
}

export interface AudienceWriter {
  provider: string;
  platform: AdsPlatform;
  /** A practice copy: nothing leaves the server, and the shop saves no platform id from it. */
  practice: boolean;
  /** Creates the list (or replaces its members) and says how many were sent. */
  upload(o: AudienceUpload): Promise<AdsRead<{ externalId: string; sent: number }>>;
  /** A lookalike drawn from an uploaded list. */
  lookalike(o: { seedExternalId: string; name: string; spec: LookalikeSpec }): Promise<AdsRead<{ externalId: string }>>;
}

// --- what each platform is sent ----------------------------------------------------------------------------------

/** Meta: the custom audience to create (customer file), then the members as `usersreplace` takes them. */
export function metaAudiencePayload(o: AudienceUpload) {
  const schema = o.valueBased ? ['PHONE_SHA256', 'LOOKUP_VALUE'] : ['PHONE_SHA256'];
  return {
    create: o.externalId ? null : { name: o.name, subtype: 'CUSTOM', customer_file_source: 'USER_PROVIDED_ONLY', is_value_based: o.valueBased },
    users: { payload: { schema, data: o.members.map((m) => (o.valueBased ? [m.ph, m.value ?? 0] : [m.ph])) } },
  };
}

/** Meta: a lookalike of a seed list. */
export function metaLookalikePayload(o: { seedExternalId: string; name: string; spec: LookalikeSpec }) {
  return { name: o.name, subtype: 'LOOKALIKE', origin_audience_id: o.seedExternalId, lookalike_spec: JSON.stringify({ type: 'custom_ratio', ratio: (o.spec.percent ?? 0) / 100, location_spec: { geo_locations: { countries: o.spec.countries } } }) };
}

/** Google: the Customer Match list to create, then the offline user data job's operations (all members replace the old). */
export function googleAudiencePayload(o: AudienceUpload) {
  return {
    create: o.externalId ? null : { name: o.name, crmBasedUserList: { uploadKeyType: 'CONTACT_INFO', dataSourceType: 'FIRST_PARTY' } },
    job: { type: 'CUSTOMER_MATCH_USER_LIST', removeAll: !!o.externalId, operations: o.members.map((m) => ({ create: { userIdentifiers: [{ hashedPhoneNumber: m.phPlus }] } })) },
  };
}

/** Google: a lookalike segment (Demand Gen) from a seed list. */
export function googleLookalikePayload(o: { seedExternalId: string; name: string; spec: LookalikeSpec }) {
  return { name: o.name, lookalikeUserList: { seedUserListIds: [o.seedExternalId], expansionLevel: (o.spec.size ?? 'balanced').toUpperCase(), countryCodes: o.spec.countries } };
}

/** TikTok: the custom audience file (one hash a line) and how it is applied. */
export function tiktokAudiencePayload(o: AudienceUpload) {
  return { calculate_type: 'PHONE_SHA256', action: o.externalId ? 'REPLACE' : 'CREATE', custom_audience_name: o.name, file: o.members.map((m) => m.phPlus).join('\n') };
}

/** TikTok: a lookalike audience from a seed. */
export function tiktokLookalikePayload(o: { seedExternalId: string; name: string; spec: LookalikeSpec }) {
  return { custom_audience_name: o.name, lookalike_spec: { source_audience_id: o.seedExternalId, location_codes: o.spec.countries, audience_size: (o.spec.size ?? 'balanced').toUpperCase() } };
}

const BUILD = {
  meta: { list: metaAudiencePayload, lookalike: metaLookalikePayload },
  google: { list: googleAudiencePayload, lookalike: googleLookalikePayload },
  tiktok: { list: tiktokAudiencePayload, lookalike: tiktokLookalikePayload },
} as const;

/** The lookalike spec a platform can use, or the reason it cannot (the owner has not set it yet). */
export function lookalikeReady(platform: AdsPlatform, spec: LookalikeSpec): 'ok' | 'size' | 'country' {
  if (!spec.countries.length) return 'country';
  if (platform === 'meta' ? !(spec.percent && spec.percent >= 1 && spec.percent <= 10) : !spec.size) return 'size';
  return 'ok';
}

// --- the practice writer -------------------------------------------------------------------------------------------

export interface MockAudienceSend {
  at: Date;
  platform: AdsPlatform;
  what: 'list' | 'lookalike';
  /** The members sent (list) — hashes only. */
  members: number;
  /** What the live writer would have sent (no token). */
  payload: unknown;
}

const G = globalThis as unknown as { __extasMockAudiences?: MockAudienceSend[]; __extasMockAudienceSeq?: number };
const outbox = (): MockAudienceSend[] => (G.__extasMockAudiences ??= []);
/** The practice writer keeps this many sends (the newest). */
const MOCK_KEEP = 50; // hardcode-ok: an in-memory practice list, not a business number

/** What the practice writers were asked to send in this process (tests). */
export const mockAudienceOutbox = {
  all: (): readonly MockAudienceSend[] => [...outbox()],
  clear: (): void => {
    outbox().length = 0;
  },
};

export const AUDIENCE_WRITER_PROVIDER: Record<AdsPlatform, string> = { meta: 'metaAudiences', google: 'googleAudiences', tiktok: 'tiktokAudiences' };
/** The platforms an audience can be sent to, in the fixed order of Marketing › Ad platforms. */
export const AUDIENCE_WRITER_PLATFORMS: readonly AdsPlatform[] = ['meta', 'tiktok', 'google'];

/** The practice writer of a platform: answers like the platform would and sends nothing. */
export function practiceAudienceWriter(platform: AdsPlatform): AudienceWriter {
  const keep = (s: Omit<MockAudienceSend, 'at'>) => {
    const all = outbox();
    all.push({ at: new Date(), ...s });
    if (all.length > MOCK_KEEP) all.splice(0, all.length - MOCK_KEEP);
  };
  const nextId = () => `practice-${platform}-${(G.__extasMockAudienceSeq = (G.__extasMockAudienceSeq ?? 0) + 1)}`;
  return {
    provider: AUDIENCE_WRITER_PROVIDER[platform],
    platform,
    practice: true,
    async upload(o) {
      keep({ platform, what: 'list', members: o.members.length, payload: BUILD[platform].list(o) });
      return { ok: true, value: { externalId: o.externalId ?? nextId(), sent: o.members.length } };
    },
    async lookalike(o) {
      const why = lookalikeReady(platform, o.spec);
      if (why !== 'ok') return { ok: false, error: why === 'country' ? 'no country for the lookalike' : 'no lookalike size' };
      keep({ platform, what: 'lookalike', members: 0, payload: BUILD[platform].lookalike(o) });
      return { ok: true, value: { externalId: nextId() } };
    },
  };
}
