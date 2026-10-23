// PR 131 — Profile (demo 60-account.js acc_tabProfile, acc_addrFields): his name, the number he signs in with (read
// only: it is the account), his delivery addresses (up to `account.addresses.max`, the first is the default the checkout
// fills in, PR 137), and the marketing messages he agreed to, SMS and WhatsApp apart (B5.7). A removed address is
// archived, never deleted (hard rule 3); every consent change is a new ConsentRecord row with where it came from.
import { z } from 'zod';
import type { RequestContext } from '@extas/auth';
import { phoneNormalizeBD } from '@extas/delivery/phone';
import { AccountError, checkStoreId, nowOf, parse, setting, TX, type AccountsDeps } from './context';

export interface AddressView {
  id: string;
  line: string;
  isDefault: boolean;
}

export interface ProfileView {
  name: string | null;
  phone: string | null;
  addresses: AddressView[];
  /** The latest answer per channel (null: never asked). */
  consent: { sms: boolean | null; whatsapp: boolean | null };
  hasPassword: boolean;
}

/** Where a consent change came from (ConsentRecord.source). */
export const ACCOUNT_CONSENT_SOURCE = 'account';

export async function profileView(deps: AccountsDeps, input: { storeId: number; customerId: string }): Promise<ProfileView | null> {
  checkStoreId(input.storeId);
  const c = await deps.db.customer.findFirst({
    where: { id: input.customerId, storeId: input.storeId, archivedAt: null, erasedAt: null },
    select: {
      name: true,
      phone: true,
      smsMarketingConsent: true,
      whatsappMarketingConsent: true,
      credential: { select: { id: true } },
      addresses: { where: { archivedAt: null }, orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }], select: { id: true, addressLine: true, isDefault: true } },
    },
  });
  if (!c) return null;
  const p = phoneNormalizeBD(c.phone ?? '');
  return {
    name: c.name,
    phone: p.ok ? p.nice : c.phone,
    addresses: c.addresses.map((a, i) => ({ id: a.id, line: a.addressLine, isDefault: i === 0 })),
    consent: { sms: c.smsMarketingConsent, whatsapp: c.whatsappMarketingConsent },
    hasPassword: !!c.credential,
  };
}

const profileInput = z.object({
  name: z.string().trim().max(120),
  addresses: z.array(z.object({ id: z.uuid().nullish(), line: z.string().trim().max(500) })).max(20),
});

/**
 * Saves his name and addresses. Empty address boxes are left out; a box too short for a courier is refused (the
 * checkout's own `checkout.form.addressMin`), so is a name shorter than `checkout.form.nameMin`. More addresses than
 * `account.addresses.max` is FULL. The first address is the default.
 */
export async function saveProfile(deps: AccountsDeps, input: { storeId: number; customerId: string; profile: unknown }, ctx: RequestContext = {}): Promise<ProfileView> {
  checkStoreId(input.storeId);
  const { storeId, customerId } = input;
  const p = parse(profileInput, input.profile, 'profile');
  const [nameMin, addressMin, max] = await Promise.all([setting(deps, storeId, 'checkout.form.nameMin'), setting(deps, storeId, 'checkout.form.addressMin'), setting(deps, storeId, 'account.addresses.max')]);
  if ([...p.name].length < nameMin) throw new AccountError('INVALID_INPUT', 'the name is too short', ['name'], { min: nameMin });
  const lines = p.addresses.filter((a) => a.line);
  const short = lines.findIndex((a) => [...a.line].length < addressMin);
  if (short >= 0) throw new AccountError('INVALID_INPUT', 'an address is too short for a courier', [`addresses.${short}`], { min: addressMin });
  if (lines.length > max) throw new AccountError('FULL', 'too many addresses', ['addresses'], { max });
  const now = nowOf(deps);
  await deps.db.$transaction(async (tx) => {
    const c = await tx.customer.findFirst({ where: { id: customerId, storeId, archivedAt: null, erasedAt: null }, select: { id: true, phone: true } });
    if (!c) throw new AccountError('NOT_FOUND', 'no such customer');
    await tx.customer.update({ where: { id: c.id }, data: { name: p.name } });
    const have = await tx.customerAddress.findMany({ where: { storeId, customerId, archivedAt: null }, select: { id: true } });
    const mine = new Set(have.map((h) => h.id));
    const keep = new Set<string>();
    for (const [i, a] of lines.entries()) {
      const data = { addressLine: a.line, isDefault: i === 0, name: p.name, phone: c.phone ?? '' };
      if (a.id && mine.has(a.id)) {
        await tx.customerAddress.update({ where: { id: a.id }, data });
        keep.add(a.id);
      } else {
        const made = await tx.customerAddress.create({ data: { storeId, customerId, ...data, createdAt: new Date(now.getTime() + i) }, select: { id: true } });
        keep.add(made.id);
      }
    }
    const gone = have.filter((h) => !keep.has(h.id)).map((h) => h.id);
    if (gone.length) await tx.customerAddress.updateMany({ where: { id: { in: gone } }, data: { archivedAt: now, isDefault: false } });
    await tx.auditLog.create({
      data: { storeId, actorType: 'CUSTOMER', actorId: customerId, action: 'customer.profile.saved', entityType: 'Customer', entityId: customerId, after: { addresses: lines.length }, ip: ctx.ip?.slice(0, 64) ?? null, userAgent: ctx.userAgent?.slice(0, 512) ?? null, source: 'shop-account' },
    });
  }, TX);
  return (await profileView(deps, { storeId, customerId }))!;
}

const consentInput = z.object({ sms: z.boolean().optional(), whatsapp: z.boolean().optional() });

/** Records his answer to marketing messages, per channel (only the channels he changed). */
export async function saveConsent(deps: AccountsDeps, input: { storeId: number; customerId: string; consent: unknown }, ctx: RequestContext = {}): Promise<ProfileView['consent']> {
  checkStoreId(input.storeId);
  const { storeId, customerId } = input;
  const c = parse(consentInput, input.consent, 'consent');
  const now = nowOf(deps);
  return deps.db.$transaction(async (tx) => {
    const me = await tx.customer.findFirst({ where: { id: customerId, storeId, archivedAt: null, erasedAt: null }, select: { phone: true, smsMarketingConsent: true, whatsappMarketingConsent: true } });
    if (!me) throw new AccountError('NOT_FOUND', 'no such customer');
    const rows = (
      [
        ['SMS', c.sms, me.smsMarketingConsent],
        ['WHATSAPP', c.whatsapp, me.whatsappMarketingConsent],
      ] as const
    ).flatMap(([channel, granted, was]) => (granted === undefined || granted === was ? [] : [{ storeId, customerId, phone: me.phone, channel, granted, source: ACCOUNT_CONSENT_SOURCE, ip: ctx.ip?.slice(0, 64) ?? null, createdAt: now }]));
    if (rows.length) await tx.consentRecord.createMany({ data: rows });
    const next = { sms: c.sms ?? me.smsMarketingConsent, whatsapp: c.whatsapp ?? me.whatsappMarketingConsent };
    await tx.customer.update({ where: { id: customerId }, data: { smsMarketingConsent: next.sms, whatsappMarketingConsent: next.whatsapp } });
    return next;
  }, TX);
}
