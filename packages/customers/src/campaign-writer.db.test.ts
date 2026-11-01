// PR 293 on a real PostgreSQL (a throwaway database with the real migrations; skipped without TEST_DATABASE_ADMIN_URL):
// the AI campaign writer — off twice over as shipped; the channel's write key; the owner's voice reaches the writer;
// whatever the writer gives is checked (only the channel's {words}, within the lengths, nothing empty); a writer that
// fails is said so; nothing is saved but the audit line. Every value is a made-up test value.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRole, SYSTEM } from '@extas/auth';
import { draftCampaignCopy, type CampaignWriterInput, type CampaignWriterLink } from './campaign-writer';
import { setUpCustomers, type CustomersFixture } from './testing';

// hardcode-ok: made-up test words
const VOICE = { enabled: true, versions: 3, smsMaxChars: 120, greeting: { bn: 'প্রিয়', en: 'Dear' }, signOff: { bn: 'দোকানের দল', en: 'The team' }, style: { bn: '', en: 'warm, short' } };

describe.skipIf(!process.env.TEST_DATABASE_ADMIN_URL)('AI campaign writer on PostgreSQL (PR 293)', () => {
  let f: CustomersFixture;
  let mailer: { actor: { staffUserId: string }; storeId: number };
  let smsWriter: { actor: { staffUserId: string }; storeId: number };
  const seen: CampaignWriterInput[] = [];
  const fake =
    (versions: { subject?: string; body: string }[], fail = false) =>
    async (): Promise<CampaignWriterLink> => ({
      provider: 'fakeWriter',
      mode: 'MOCK',
      api: {
        async draftCampaign(input) {
          if (fail) throw new Error('down');
          seen.push(input);
          return { versions, practice: true };
        },
      },
    });
  const ask = { channel: 'email', locale: 'en', brief: 'Winter polos are in.' };

  beforeAll(async () => {
    f = await setUpCustomers('customers-aiwriter');
    const mk = async (key: string, permissions: string[]) => {
      const role = await createRole(f.t.prisma, SYSTEM, { key, nameEn: key, nameBn: key, permissions });
      const u = await f.t.prisma.staffUser.create({ data: { email: `${key}@example.com`, displayName: key, passwordHash: 'not-a-login' } });
      await f.t.prisma.staffRoleAssignment.create({ data: { staffUserId: u.id, roleId: role.id, storeId: f.S } });
      return { actor: { staffUserId: u.id }, storeId: f.S };
    };
    mailer = await mk('a293-mail', ['messages.journey.read', 'messages.email.write']);
    smsWriter = await mk('a293-sms', ['messages.templates.read', 'messages.templates.write']);
  });
  afterAll(async () => f?.t.drop());

  it('off as shipped, and off while AI for the shop is off', async () => {
    const good = fake([{ subject: 'Hi', body: 'Hello' }]);
    await expect(draftCampaignCopy(f.customersDeps(), mailer, ask, good)).rejects.toMatchObject({ code: 'SWITCHED_OFF' });
    f.overrides.set('customers.aiWriter', VOICE);
    await expect(draftCampaignCopy(f.customersDeps(), mailer, ask, good)).rejects.toMatchObject({ code: 'SWITCHED_OFF' });
    expect(seen).toHaveLength(0);
  });

  it('needs the channel\'s write key and a brief', async () => {
    f.overrides.set('ai.enabled', true);
    const good = fake([{ subject: 'Hi', body: 'Hello' }]);
    await expect(draftCampaignCopy(f.customersDeps(), f.viewer, ask, good)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(draftCampaignCopy(f.customersDeps(), mailer, { ...ask, channel: 'sms' }, good)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(draftCampaignCopy(f.customersDeps(), smsWriter, ask, good)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(draftCampaignCopy(f.customersDeps(), mailer, { ...ask, brief: ' ' }, good)).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });

  it('hands the owner\'s voice to the writer and keeps only versions the channel can send; audited', async () => {
    seen.length = 0;
    const r = await draftCampaignCopy(
      f.customersDeps(),
      mailer,
      ask,
      fake([
        { subject: 'Winter, {customerName}', body: 'Dear {customerName}, winter polos. {link}' },
        { subject: 'Due {amountDue}', body: 'Pay {amountDue}' },
        { subject: '', body: 'No subject' },
        { subject: 'Fine', body: 'Also fine {storeName}' },
      ]),
    );
    expect(seen[0]).toMatchObject({ channel: 'email', locale: 'en', brief: 'Winter polos are in.', voice: { greeting: 'Dear', signOff: 'The team', style: 'warm, short' }, versions: 3, words: ['customerName', 'storeName', 'link'], max: { subject: 150, body: 10_000 } });
    // the 4th is past the 3 versions asked for; the 2nd uses a word an offer e-mail cannot fill; the 3rd has no subject
    expect(r).toEqual({ versions: [{ subject: 'Winter, {customerName}', body: 'Dear {customerName}, winter polos. {link}' }], practice: true, provider: 'fakeWriter', mode: 'MOCK' });
    const line = await f.t.prisma.auditLog.findFirstOrThrow({ where: { action: 'customers.aiWriter.draft' }, orderBy: { createdAt: 'desc' } });
    expect(line.after).toMatchObject({ channel: 'email', versions: 1, provider: 'fakeWriter', practice: true });
  });

  it('an SMS: no subject, the owner\'s longest SMS, no {link}', async () => {
    seen.length = 0;
    const r = await draftCampaignCopy(f.customersDeps(), smsWriter, { channel: 'sms', locale: 'bn', brief: 'শীতের পোলো' }, fake([{ body: 'প্রিয় {customerName}, শীতের পোলো' }, { body: 'দেখুন {link}' }, { body: 'x'.repeat(121) }]));
    expect(seen[0]).toMatchObject({ voice: { greeting: 'প্রিয়', signOff: 'দোকানের দল', style: '' }, words: ['customerName', 'storeName'], max: { subject: 0, body: 120 } });
    expect(r.versions).toEqual([{ subject: null, body: 'প্রিয় {customerName}, শীতের পোলো' }]);
  });

  it('a writer that fails or gives nothing usable is said so', async () => {
    await expect(draftCampaignCopy(f.customersDeps(), mailer, ask, fake([], true))).rejects.toMatchObject({ code: 'AI_UNAVAILABLE' });
    await expect(draftCampaignCopy(f.customersDeps(), mailer, ask, fake([{ subject: 'x', body: '{oops' }]))).rejects.toMatchObject({ code: 'AI_UNAVAILABLE' });
  });
});
