// S15 · PR 584 (Blueprint C10.3) on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): both gates (the
// `ai.telegram.commands` switch and the Telegram connection's own `webhookSecret`) against real rows, a real
// `AiAgentAssignment` written with `source: 'telegram'`, and a real `AiApprovalRequest` decided by a Telegram
// button press — the same `decideApproval` the dashboard itself calls (PR 317). Every id, token and secret here is
// made up.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { secretName, TELEGRAM_SECRET_HEADER } from '@extas/adapters';
import { SYSTEM } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, type TestDatabase } from '@extas/auth/testing';
import { messages, prismaBackend, registry, SettingsResolver, syncSettings } from '@extas/settings';
import { createVault, type Vault } from '@extas/vault';
import { requestApproval } from './approvals';
import { ensureAgentRows } from './control-room';
import {
  decideTelegramApproval,
  handleTelegramWebhook,
  isTelegramCommandsEnabled,
  routeTelegramCommand,
  setTelegramCommandsEnabled,
  telegramWebhookMaxBytes,
  telegramWebhookSecret,
  type TelegramRoutingDeps,
} from './telegram-routing';

const WEBHOOK_SECRET = 'sample-webhook-secret-584';
const BOT_TOKEN = '7654321:AAHsample584tokenNeverReal00000000000';
const SYSTEM_WHO = { actor: SYSTEM };

describe.skipIf(!HAS_TEST_DB)('Telegram identity and command routing on PostgreSQL (PR 584)', () => {
  let t: TestDatabase;
  let vault: Vault;
  let deps: TelegramRoutingDeps;

  beforeAll(async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    t = await createTestDatabase('telegram_routing');
    await syncSettings(t.prisma, { registry, messages });
    await ensureAgentRows(t.prisma);
    vault = createVault(t.prisma, 'test-master-key-'.padEnd(64, 'k'));
    deps = { db: t.prisma, resolver: new SettingsResolver(prismaBackend(t.prisma), registry), vault };
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    await t?.drop();
  });

  it('ships off: the switch is off and the webhook secret is unset on a fresh installation', async () => {
    expect(await isTelegramCommandsEnabled(deps)).toBe(false);
    expect(await telegramWebhookSecret(deps)).toBeNull();
    expect(await telegramWebhookMaxBytes(deps)).toBeGreaterThan(0);
  });

  it('setTelegramCommandsEnabled flips the switch, and a repeat with the same value writes nothing new', async () => {
    await setTelegramCommandsEnabled(deps, SYSTEM_WHO, true);
    expect(await isTelegramCommandsEnabled(deps)).toBe(true);
    const before = await t.prisma.settingChange.count();
    await setTelegramCommandsEnabled(deps, SYSTEM_WHO, true); // double tap: already true
    expect(await t.prisma.settingChange.count()).toBe(before);
    await setTelegramCommandsEnabled(deps, SYSTEM_WHO, false);
    expect(await isTelegramCommandsEnabled(deps)).toBe(false);
  });

  it('telegramWebhookSecret is null with no Telegram connection, and reads the vault once one is switched on', async () => {
    expect(await telegramWebhookSecret(deps)).toBeNull();
    await t.prisma.integration.create({
      data: { storeId: null, kind: 'TELEGRAM', provider: 'telegram', name: 'telegram', mode: 'LIVE', enabled: true, config: { chatId: '42' }, secretNames: [secretName('telegram', 'botToken'), secretName('telegram', 'webhookSecret')] },
    });
    await vault.put(secretName('telegram', 'botToken'), BOT_TOKEN, { storeId: null }, { service: 'test', actorId: null });
    await vault.put(secretName('telegram', 'webhookSecret'), WEBHOOK_SECRET, { storeId: null }, { service: 'test', actorId: null });
    expect(await telegramWebhookSecret(deps)).toBe(WEBHOOK_SECRET);
  });

  it('routeTelegramCommand resolves the agent and writes a real AiAgentAssignment with source "telegram"', async () => {
    const { agentKey, assignmentId } = await routeTelegramCommand(deps, '@bhandari the size chart on the denim jacket is wrong');
    expect(agentKey).toBe('bhandari');
    const row = await t.prisma.aiAgentAssignment.findUniqueOrThrow({ where: { id: assignmentId } });
    expect(row.source).toBe('telegram');
    expect(row.status).toBe('todo');
    expect(row.title).toContain('bhandari');
  });

  it('a message naming no one is assigned to Gyani, the chief', async () => {
    const { agentKey } = await routeTelegramCommand(deps, 'why did yesterday’s orders drop?');
    expect(agentKey).toBe('gyani');
  });

  it('decideTelegramApproval approves, rejects and answers "why" against a real AiApprovalRequest, and is null for an unknown id', async () => {
    const approve = await requestApproval({ db: t.prisma }, { kind: 'adBudget', title: 'Raise the Eid campaign budget', summary: 'From ৫,০০০ to ৮,০০০ taka/day', payload: { from: 5000, to: 8000 } });
    const why = await decideTelegramApproval(deps, approve.id, 'why');
    expect(why?.replyText).toContain('Raise the Eid campaign budget');
    const approved = await decideTelegramApproval(deps, approve.id, 'approve');
    expect(approved?.row.status).toBe('APPROVED');
    const reject = await requestApproval({ db: t.prisma }, { kind: 'adBudget', title: 'A second ask', payload: {} });
    const rejected = await decideTelegramApproval(deps, reject.id, 'reject');
    expect(rejected?.row.status).toBe('REJECTED');
    expect(await decideTelegramApproval(deps, randomUUID(), 'approve')).toBeNull();
  });

  describe('handleTelegramWebhook — both gates, then the real routing', () => {
    const update = (text: string) => ({ update_id: 1, message: { message_id: 1, chat: { id: 1 }, text } });

    it('answers 200 OK but does nothing while the switch is off, even with a correct secret', async () => {
      expect(await isTelegramCommandsEnabled(deps)).toBe(false);
      const before = await t.prisma.aiAgentAssignment.count();
      const r = await handleTelegramWebhook(deps, update('@doot write the Eid post'), WEBHOOK_SECRET);
      expect(r).toEqual({ status: 200, code: 'NOT_CONNECTED' });
      expect(await t.prisma.aiAgentAssignment.count()).toBe(before);
    });

    it('answers 200 OK but does nothing once the switch is on if the header does not match the secret', async () => {
      await setTelegramCommandsEnabled(deps, SYSTEM_WHO, true);
      const before = await t.prisma.aiAgentAssignment.count();
      expect(await handleTelegramWebhook(deps, update('@doot write the Eid post'), 'wrong-secret')).toEqual({ status: 200, code: 'IGNORED' });
      expect(await handleTelegramWebhook(deps, update('@doot write the Eid post'), null)).toEqual({ status: 200, code: 'IGNORED' });
      expect(await t.prisma.aiAgentAssignment.count()).toBe(before);
    });

    it('with both gates open, a real message creates a real assignment and answers OK', async () => {
      const before = await t.prisma.aiAgentAssignment.count();
      expect(await handleTelegramWebhook(deps, update('@doot write the Eid post'), WEBHOOK_SECRET)).toEqual({ status: 200, code: 'OK' });
      expect(await t.prisma.aiAgentAssignment.count()).toBe(before + 1);
      const last = await t.prisma.aiAgentAssignment.findFirst({ orderBy: { createdAt: 'desc' } });
      expect(last?.source).toBe('telegram');
    });

    it('a body that is not update-shaped, or a header that uses `TELEGRAM_SECRET_HEADER`\'s own name, is ignored safely', async () => {
      expect((await handleTelegramWebhook(deps, { nothing: 'here' }, WEBHOOK_SECRET)).code).toBe('IGNORED');
      expect(TELEGRAM_SECRET_HEADER).toBe('x-telegram-bot-api-secret-token');
    });
  });
});
