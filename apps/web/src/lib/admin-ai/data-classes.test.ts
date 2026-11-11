// S15 · PR 310 — the pure parts of the data-class routing policy (no Postgres needed, unlike
// control-room.db.test.ts's end-to-end coverage, which also checks the screen reads the real catalogue and that a
// real model pick is actually routed).
import { describe, expect, it } from 'vitest';
import { AI_AGENT_KEYS } from './agents';
import { agentDataClass, dataClassDef, DATA_CLASSES, FREE_CAPABLE_PROVIDER, isDataClassKey, routeProvider } from './data-classes';
import type { WriterOption } from './model-picks';

describe('DATA_CLASSES', () => {
  it('lists exactly the three Blueprint A5.2 classes, free allowed only for public/draft', () => {
    expect(DATA_CLASSES.map((d) => d.key)).toEqual(['personal', 'business', 'publicDraft']);
    expect(DATA_CLASSES.map((d) => d.freeAllowed)).toEqual([false, false, true]);
  });

  it('isDataClassKey only accepts the three known keys', () => {
    expect(isDataClassKey('personal')).toBe(true);
    expect(isDataClassKey('publicDraft')).toBe(true);
    expect(isDataClassKey('secret')).toBe(false);
  });

  it('dataClassDef throws on an unknown key', () => {
    expect(() => dataClassDef('secret' as never)).toThrow();
  });
});

describe('agentDataClass', () => {
  it('gives every one of the seven fixed agents its own class', () => {
    for (const key of AI_AGENT_KEYS) expect(isDataClassKey(agentDataClass(key))).toBe(true);
    expect(agentDataClass('sawdagor')).toBe('personal');
    expect(agentDataClass('doot')).toBe('publicDraft');
    expect(agentDataClass('shilpi')).toBe('publicDraft');
    expect(agentDataClass('tirondaj')).toBe('business');
  });
});

describe('routeProvider', () => {
  const options = (ready: Partial<Record<string, boolean>>): WriterOption[] => [
    { provider: null, modelId: null, ready: true },
    { provider: 'anthropic', modelId: null, ready: ready.anthropic ?? false },
    { provider: 'openAi', modelId: null, ready: ready.openAi ?? false },
    { provider: 'googleAi', modelId: null, ready: ready.googleAi ?? false },
    { provider: 'openRouter', modelId: null, ready: ready.openRouter ?? false },
  ];

  it('the practice writer is never downgraded, for any data class', () => {
    for (const dc of ['personal', 'business', 'publicDraft'] as const) {
      expect(routeProvider(dc, null, true, options({}))).toEqual({ effectiveProvider: null, downgraded: false });
    }
  });

  it('a paid connection (anthropic/openAi/googleAi) is never touched by the policy, for any data class', () => {
    for (const dc of ['personal', 'business', 'publicDraft'] as const) {
      expect(routeProvider(dc, 'anthropic', true, options({ anthropic: true }))).toEqual({ effectiveProvider: 'anthropic', downgraded: false });
    }
  });

  it('a paid pick that is not ready falls back to the practice writer, same as PR 307, never flagged as a policy downgrade', () => {
    expect(routeProvider('publicDraft', 'anthropic', false, options({}))).toEqual({ effectiveProvider: null, downgraded: false });
  });

  it('public/draft work may use the free-capable connection as picked, when it is ready', () => {
    expect(routeProvider('publicDraft', FREE_CAPABLE_PROVIDER, true, options({ openRouter: true }))).toEqual({ effectiveProvider: 'openRouter', downgraded: false });
  });

  it('public/draft work on a not-yet-ready free-capable pick falls back to the practice writer, not flagged as downgraded', () => {
    expect(routeProvider('publicDraft', FREE_CAPABLE_PROVIDER, false, options({}))).toEqual({ effectiveProvider: null, downgraded: false });
  });

  it('personal or business work on the free-capable connection is always routed to a ready paid one instead, even when the owner picked it and it is ready', () => {
    for (const dc of ['personal', 'business'] as const) {
      const routed = routeProvider(dc, FREE_CAPABLE_PROVIDER, true, options({ openRouter: true, googleAi: true }));
      expect(routed).toEqual({ effectiveProvider: 'googleAi', downgraded: true });
    }
  });

  it('personal or business work on the free-capable connection, with no paid connection ready yet, falls back to the practice writer — still flagged as downgraded (the owner should know why)', () => {
    const routed = routeProvider('personal', FREE_CAPABLE_PROVIDER, true, options({ openRouter: true }));
    expect(routed).toEqual({ effectiveProvider: null, downgraded: true });
  });

  it('never routes a free-capable pick to another free-capable one (there is only the one today, but the search excludes it explicitly)', () => {
    const routed = routeProvider('business', FREE_CAPABLE_PROVIDER, true, options({ openRouter: true, anthropic: true }));
    expect(routed.effectiveProvider).not.toBe(FREE_CAPABLE_PROVIDER);
    expect(routed).toEqual({ effectiveProvider: 'anthropic', downgraded: true });
  });
});
