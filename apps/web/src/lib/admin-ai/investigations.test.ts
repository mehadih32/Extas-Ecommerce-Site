// S15 · PR 583 — pure routing: a free-text question to the agent whose area it names (an employee code or name
// wins outright, then an area keyword, then the chief itself) — no database, mirrors `telegram-routing.test.ts`'s
// own shape for `resolveAgentForCommand`.
import { describe, expect, it } from 'vitest';
import { routeInvestigationQuestion } from './investigations';

describe('routeInvestigationQuestion (PR 583)', () => {
  it('routes by employee code first, even with other words around it', () => {
    expect(routeInvestigationQuestion('A360-07 budget report please')).toEqual({ agent: 'tirondaj', how: 'code' });
  });

  it('routes by an agent name named in the question', () => {
    expect(routeInvestigationQuestion('Why did Bhandari miss the courier entry today?')).toEqual({ agent: 'bhandari', how: 'name' });
  });

  it('routes by the Bengali name too', () => {
    expect(routeInvestigationQuestion('শিল্পী কেন এই পরিবর্তন করলো?')).toEqual({ agent: 'shilpi', how: 'name' });
  });

  it('a name match wins over a keyword also present in the same question', () => {
    // "Sawdagor" (checkout/cart owner) named directly, even though "stock" (bhandari's keyword) also appears.
    expect(routeInvestigationQuestion('Sawdagor says the cart total is wrong after a stock update')).toEqual({ agent: 'sawdagor', how: 'name' });
  });

  it('falls back to an area keyword when no code or name is named', () => {
    expect(routeInvestigationQuestion('Why is today’s courier entry wrong?')).toEqual({ agent: 'bhandari', how: 'keyword' });
    expect(routeInvestigationQuestion('The ad campaign budget looks off this week')).toEqual({ agent: 'tirondaj', how: 'keyword' });
    expect(routeInvestigationQuestion('There was a server error on the category page')).toEqual({ agent: 'prohori', how: 'keyword' });
  });

  it('routes to the chief itself when nothing names an area', () => {
    expect(routeInvestigationQuestion('Why are sales down this month?')).toEqual({ agent: 'gyani', how: 'chief' });
  });

  it('is case-insensitive for names and keywords', () => {
    expect(routeInvestigationQuestion('TIRONDAJ ad spend check')).toEqual({ agent: 'tirondaj', how: 'name' });
  });
});
