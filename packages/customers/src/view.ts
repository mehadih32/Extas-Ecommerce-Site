// PR 284 — the single view of one person by phone (Blueprint B5.5; BACKEND-ARCHITECTURE §5.5 CUS-02): the profile he
// stays under, the profiles merged into it, every number he uses, what his orders came to (delivered, refused — a
// refusal the shop caused is shown apart and never counted, SIM-F-044 —, cancelled, open, returned after delivery, calls
// not answered; the same counting as the risk score's phone history, S06 PR 157) and his lifetime value: Sales
// (delivered only) beside Ordered value, from @extas/metrics (CN-022). Opening it is logged ("Who looked at this
// customer", Note 24.1). A merged profile's view is its survivor's (`redirectedFrom`).
//
// `customerByPhone` finds the person a number belongs to, in any way it is written (one helper: phoneNormalizeBD).
// Reading needs `customers.read`; the full number only goes out with `customers.phone` (PR 284 masking).
import { customerKpis, type CustomerKpi } from '@extas/metrics';
import { historyOptions, pastOrdersOf, phoneForms, summarizeHistory, type PhoneSummary } from '@extas/orders';
import { logAccess } from './access';
import { allow, setting, UUID, type CustomersDeps, type Viewer, type Who } from './context';
import { familyOf, familyOrderWhere, familyRef, type Family, type ProfileRow } from './family';
import { phoneShown, type PhoneMask, type PhoneShown } from './pure';

/** One profile as a screen shows it (the number as this viewer may see it). */
export interface ProfileCard {
  id: string;
  name: string | null;
  phone: PhoneShown | null;
  email: string | null;
  whatsapp: PhoneShown | null;
  /** Gender only where it is known; an inferred one says so (B5.2). */
  gender: { value: string; inferred: boolean } | null;
  firstSource: string | null;
  createdAt: Date;
  /** He has signed in to the shop at least once (an account with a credential). */
  hasLogin: boolean;
  consent: { sms: boolean | null; whatsapp: boolean | null };
  verifiedAt: Date | null;
  codPolicy: string | null;
}

export interface MemberCard extends ProfileCard {
  mergedAt: Date | null;
}

export interface SingleView {
  /** The person's profile id (the survivor's). */
  id: string;
  /** The id asked for, when it was a profile merged into this one. */
  redirectedFrom: string | null;
  customer: ProfileCard;
  members: MemberCard[];
  /** Every number of the person (his own first), as this viewer may see them. */
  numbers: PhoneShown[];
  kpi: CustomerKpi;
  history: PhoneSummary;
  viewer: Viewer;
}

/** A safety bound on one person's orders read for the counts (not a business number). */
export const HISTORY_MAX = 2_000; // hardcode-ok: a read bound, not a business figure

export const maskOf = (deps: CustomersDeps, storeId: number): Promise<PhoneMask> => setting(deps, storeId, 'customers.phoneMask');

/** One profile as this viewer may see it. */
export function cardOf(p: ProfileRow, v: Pick<Viewer, 'fullPhone'>, mask: PhoneMask): ProfileCard {
  return {
    id: p.id,
    name: p.name,
    phone: phoneShown(p.phone, v.fullPhone, mask),
    email: p.email,
    whatsapp: p.whatsappNumber && p.whatsappNumber !== p.phone ? phoneShown(p.whatsappNumber, v.fullPhone, mask) : null,
    gender: p.gender ? { value: p.gender, inferred: p.genderInferred } : null,
    firstSource: p.firstSource,
    createdAt: p.createdAt,
    hasLogin: !!p.credential,
    consent: { sms: p.smsMarketingConsent, whatsapp: p.whatsappMarketingConsent },
    verifiedAt: p.verifiedAt,
    codPolicy: p.codPolicy,
  };
}

/** What the person's orders came to (the phone-history counting of S06 PR 157, over every profile and number). */
export async function familyHistory(deps: CustomersDeps, storeId: number, f: Family): Promise<PhoneSummary> {
  const rows = await deps.db.order.findMany({
    where: familyOrderWhere(storeId, f),
    orderBy: [{ placedAt: 'desc' }, { id: 'desc' }],
    take: HISTORY_MAX,
    select: { id: true, number: true, placedAt: true, status: true, totalMinor: true, cancelReasonCode: true, areaId: true },
  });
  const [past, opts] = await Promise.all([pastOrdersOf(deps, storeId, rows), historyOptions(deps, storeId)]);
  return summarizeHistory(past, { ourFault: opts.ourFault, noAnswerOutcomes: opts.noAnswerOutcomes });
}

/** Every number of the person, his own first, each once. */
export function numbersOf(f: Family, v: Pick<Viewer, 'fullPhone'>, mask: PhoneMask): PhoneShown[] {
  const raw = [f.root.phone, f.root.whatsappNumber, ...f.members.flatMap((m) => [m.phone, m.whatsappNumber])];
  const seen = new Set<string>();
  const out: PhoneShown[] = [];
  for (const r of raw) {
    const key = phoneForms(r)[0];
    if (!r || !key || seen.has(key)) continue;
    seen.add(key);
    const s = phoneShown(r, v.fullPhone, mask);
    if (s) out.push(s);
  }
  return out;
}

/** The single view of the person a profile belongs to (null: no such customer in this store). Logs the open. */
export async function customerView(deps: CustomersDeps, who: Who, id: string, opts: { log?: boolean } = {}): Promise<SingleView | null> {
  const viewer = await allow(deps, who, 'customers.read');
  if (!UUID.test(id)) return null;
  const found = await familyOf(deps.db, who.storeId, id);
  if (!found || found.family.root.erasedAt) return null;
  const f = found.family;
  const [mask, kpis, history] = await Promise.all([maskOf(deps, who.storeId), customerKpis(deps.db, who.storeId, [familyRef(f)]), familyHistory(deps, who.storeId, f)]);
  if (opts.log !== false) await logAccess(deps.db, who.storeId, f.root.id, who.actor.staffUserId, 'profile.open');
  return {
    id: f.root.id,
    redirectedFrom: found.redirected ? id : null,
    customer: cardOf(f.root, viewer, mask),
    members: f.members.map((m) => ({ ...cardOf(m, viewer, mask), mergedAt: m.mergedAt })),
    numbers: numbersOf(f, viewer, mask),
    kpi: kpis.get(f.root.id)!,
    history,
    viewer,
  };
}

/** The person a number belongs to (his survivor's id), in any way the number is written; null when nobody has it. */
export async function customerByPhone(deps: CustomersDeps, who: Who, phone: string): Promise<{ id: string; matchedId: string } | null> {
  await allow(deps, who, 'customers.read');
  const forms = phoneForms(phone);
  if (!forms.length) return null;
  const c = await deps.db.customer.findFirst({
    where: { storeId: who.storeId, erasedAt: null, OR: [{ phone: { in: forms } }, { whatsappNumber: { in: forms } }] },
    orderBy: [{ mergedIntoId: { sort: 'asc', nulls: 'first' } }, { createdAt: 'asc' }],
    select: { id: true },
  });
  if (!c) return null;
  const found = await familyOf(deps.db, who.storeId, c.id);
  return found ? { id: found.family.root.id, matchedId: c.id } : null;
}
