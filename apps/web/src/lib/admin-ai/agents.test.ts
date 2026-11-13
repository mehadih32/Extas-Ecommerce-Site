import { describe, expect, it } from 'vitest';
import { AI_AGENTS, AI_AGENT_KEYS, aiAgentDef, isAiAgentKey } from './agents';

describe('the seven fixed agents (PR 304, 577, 581)', () => {
  it('are exactly seven, each with a unique key and employee code', () => {
    expect(AI_AGENTS).toHaveLength(7);
    expect(new Set(AI_AGENTS.map((a) => a.key)).size).toBe(7);
    expect(new Set(AI_AGENTS.map((a) => a.code)).size).toBe(7);
    for (const a of AI_AGENTS) {
      expect(a.nameEn.trim()).not.toBe('');
      expect(a.nameBn.trim()).not.toBe('');
      expect(a.role.trim()).not.toBe('');
    }
  });

  it('each has a short Telegram identity tag, never the whole role sentence (PR 584)', () => {
    for (const a of AI_AGENTS) {
      expect(a.tag.trim()).not.toBe('');
      expect(a.tag.length).toBeLessThanOrEqual(20);
    }
  });

  it('Gyani alone is the chief', () => {
    const chiefs = AI_AGENTS.filter((a) => a.isChief);
    expect(chiefs.map((a) => a.key)).toEqual(['gyani']);
  });

  it('Tirondaj is the seventh, ads-only agent (PR 581)', () => {
    expect(AI_AGENT_KEYS).toContain('tirondaj');
    expect(aiAgentDef('tirondaj').role.toLowerCase()).toContain('ads');
  });

  it('isAiAgentKey accepts only a known key', () => {
    for (const k of AI_AGENT_KEYS) expect(isAiAgentKey(k)).toBe(true);
    expect(isAiAgentKey('unknown-agent')).toBe(false);
    expect(isAiAgentKey('')).toBe(false);
  });

  it('aiAgentDef throws on an unknown key (never a silent guess)', () => {
    // @ts-expect-error — deliberately an unknown key, to check the runtime guard
    expect(() => aiAgentDef('nope')).toThrow();
  });
});
