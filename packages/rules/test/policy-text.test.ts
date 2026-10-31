// PR 384 · the owner's policy texts quote the rules' numbers as `{rule-key.param}`; a line that cannot be filled is
// left out (sample rules and values only).
import { describe, expect, it } from 'vitest';
import { fillPolicyLine, fillPolicyText, policyTokenState, tokensIn, withoutPolicyTokens, type TextContext, type WindowedParams } from '../src/text';

const ctx: TextContext = { locale: 'en-BD', currency: 'BDT', timeZone: 'Asia/Dhaka' };
const exchange: WindowedParams = { params: [{ key: 'windowHours', type: 'hours', value: 72, labelEn: 'Window' }] };
const delivery: WindowedParams = { params: [{ key: 'charge', type: 'money', value: null, labelEn: 'Charge' }] };
const others = new Map<string, WindowedParams>([['exchange', exchange]]);

describe('PR 384 · policy texts filled from the rules', () => {
  it('fills a rule token and keeps a line without one', () => {
    expect(fillPolicyLine('Exchange within {exchange.windowHours} hours.', others, ctx)).toBe('Exchange within 72 hours.');
    expect(fillPolicyLine('Plain words.', others, ctx)).toBe('Plain words.');
  });

  it('leaves out a line whose token names nothing, a rule that is not live, or a bare word', () => {
    const text = ['## Exchange', 'Within {exchange.windowHours} hours.', 'Charge {delivery.charge}.', 'Ask {name}.', 'Keep the tag on.'].join('\n');
    expect(fillPolicyText(text, others, ctx)).toBe(['## Exchange', 'Within 72 hours.', 'Keep the tag on.'].join('\n'));
    expect(withoutPolicyTokens(text)).toBe(['## Exchange', 'Keep the tag on.'].join('\n'));
  });

  it('says where each token stands for the admin', () => {
    const all = new Map<string, WindowedParams>([['exchange', exchange], ['delivery', delivery]]);
    const state = (s: string, live: string[]) => policyTokenState(tokensIn(s)[0]!, all, new Set(live));
    expect(state('{exchange.windowHours}', ['exchange'])).toBe('ok');
    expect(state('{exchange.windowHours}', [])).toBe('notLive');
    expect(state('{delivery.charge}', ['delivery'])).toBe('notSet');
    expect(state('{exchange.nope}', ['exchange'])).toBe('unknown');
    expect(state('{gone.windowHours}', ['exchange'])).toBe('unknown');
    expect(state('{windowHours}', ['exchange'])).toBe('unknown');
    expect(state('{exchange.endsAt}', ['exchange'])).toBe('notSet');
  });
});
