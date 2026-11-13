// S15 · PR 584 (Blueprint C10.3) — the pure matching rule behind the inbound Telegram command: the employee code
// first, then an `@key` or either name, else the chief (Gyani) — "no name → Gyani routes it". No DB, no network;
// the real-table side (`routeTelegramCommand`, `handleTelegramWebhook`, the two gates) is covered by
// `telegram-routing.db.test.ts`.
import { describe, expect, it } from 'vitest';
import { AI_AGENTS } from './agents';
import { resolveAgentForCommand } from './telegram-routing';

describe('resolveAgentForCommand (PR 584)', () => {
  it('matches the employee code, case-insensitively, before anything else', () => {
    expect(resolveAgentForCommand('a360-07 pause the Facebook ads').key).toBe('tirondaj');
    expect(resolveAgentForCommand('A360-07 pause the Facebook ads').key).toBe('tirondaj');
  });

  it('matches an @key mention', () => {
    expect(resolveAgentForCommand('@bhandari the size chart is wrong').key).toBe('bhandari');
  });

  it('matches the English name', () => {
    expect(resolveAgentForCommand('Doot, write the Eid post').key).toBe('doot');
  });

  it('matches the Bengali name', () => {
    expect(resolveAgentForCommand('শিল্পী, ফোনে বাটনটা ছোট দেখাচ্ছে').key).toBe('shilpi');
  });

  it('a code mention wins over a different name mentioned in the same text', () => {
    // names Doot but the code is Prohori's — the code must win (checked first).
    expect(resolveAgentForCommand('A360-02: tell Doot the backup job failed').key).toBe('prohori');
  });

  it('a message naming no one goes to the chief, Gyani', () => {
    const chief = AI_AGENTS.find((a) => a.isChief)!;
    expect(resolveAgentForCommand('why did yesterday’s orders drop?').key).toBe(chief.key);
    expect(resolveAgentForCommand('').key).toBe(chief.key);
  });

  it('never throws, and always returns one of the seven agents', () => {
    for (const text of ['', '   ', '🙂', 'a'.repeat(5000), 'A360-99 unknown code']) {
      const a = resolveAgentForCommand(text);
      expect(AI_AGENTS.some((x) => x.key === a.key)).toBe(true);
    }
  });
});
