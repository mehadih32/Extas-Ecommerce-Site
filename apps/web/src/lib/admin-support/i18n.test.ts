// S22 · PR 425 — the support pages' words: the same keys in Bengali and English, a label for every view, status,
// channel, delivery state, reason, log line and refusal the support core can answer with (so a page never shows a raw
// code), and the support pages hand no function to a client part (a server page that does breaks with a 500).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CHANNEL_KINDS, CONVERSATION_STATUSES, DELIVERY_STATES, EVENT_KINDS, INBOX_VIEWS, NOT_SENT_REASONS, SUPPORT_ERROR_CODES } from '@extas/support';
import bn from '../../../messages/admin-inbox.bn.json';
import en from '../../../messages/admin-inbox.en.json';
import { t, type Dict } from '../i18n';
import { ago, kindName, logLine, senderLabel } from './i18n';

const keys = (d: Dict, at = ''): string[] => Object.entries(d).flatMap(([k, v]) => (typeof v === 'string' ? [`${at}${k}`] : keys(v, `${at}${k}.`)));
const NOW = new Date('2026-10-23T06:00:00.000Z');

describe('the support words (PR 425)', () => {
  it('Bengali and English have the same keys', () => {
    expect(keys(bn as Dict).sort()).toEqual(keys(en as Dict).sort());
  });

  it('every view, status, channel, delivery state, reason, log line and refusal is labelled', () => {
    for (const d of [bn, en] as Dict[]) {
      const has = (k: string) => expect(t(d, k), k).not.toBe(k);
      for (const x of INBOX_VIEWS) has(`sup.views.${x}`);
      for (const x of CONVERSATION_STATUSES) has(`sup.status.${x}`);
      for (const x of CHANNEL_KINDS) has(`sup.kind.${x}`);
      for (const x of DELIVERY_STATES) has(`sup.msg.${x}`);
      for (const x of NOT_SENT_REASONS) has(`sup.msg.reason.${x}`);
      for (const x of EVENT_KINDS) has(`sup.log.${x}`);
      for (const x of SUPPORT_ERROR_CODES) has(`sup.err.${x}`);
    }
  });

  it('how long ago, in Western digits in both languages', () => {
    const d = bn as Dict;
    expect(ago(d, 'bn-BD', null, NOW)).toBe('');
    expect(ago(d, 'bn-BD', '2026-10-23T05:59:40.000Z', NOW)).toBe(t(d, 'sup.ago.now'));
    expect(ago(d, 'bn-BD', '2026-10-23T05:35:00.000Z', NOW)).toContain('25');
    expect(ago(d, 'bn-BD', '2026-10-20T06:00:00.000Z', NOW)).toContain('3');
    expect(ago(d, 'bn-BD', '2026-10-23T05:35:00.000Z', NOW)).not.toMatch(/[০-৯]/);
  });

  it('a sender is the name kept with the message, else its kind; a log line names who did it', () => {
    const d = en as Dict;
    expect(senderLabel(d, 'STAFF', 'Sample team member')).toBe('Sample team member');
    expect(senderLabel(d, 'CUSTOMER', null)).toBe(t(d, 'sup.msg.customer'));
    expect(kindName(d, 'livechat')).toBe(t(d, 'sup.kind.livechat'));
    expect(kindName(d, 'carrier-pigeon')).toBe('carrier-pigeon');
    expect(logLine(d, { kind: 'REPLIED', actor: { type: 'STAFF', name: 'Sample owner' }, data: null })).toContain('Sample owner');
    const auto = logLine(d, { kind: 'STATUS', actor: { type: 'STAFF', name: 'Sample owner' }, data: { from: 'OPEN', to: 'WAITING', auto: true } });
    expect(auto).toContain(t(d, 'sup.status.WAITING'));
    expect(auto).toContain(t(d, 'sup.log.auto'));
    expect(logLine(d, { kind: 'ASSIGNED', actor: { type: 'STAFF', name: 'Sample owner' }, data: { to: 'x', toName: 'Sample owner' } })).toBe(t(d, 'sup.log.TOOK', { name: 'Sample owner' }));
    expect(logLine(d, { kind: 'SOMETHING_NEW', actor: { type: 'SYSTEM', name: null }, data: null })).toBe('SOMETHING_NEW');
  });
});

const APP = join(__dirname, '../../app/admin/support');
function pages(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return pages(p);
    return n === 'page.tsx' ? [p] : [];
  });
}
/** A JSX attribute whose value is an arrow function: `name={(a) => …}` or `name={a => …}`. */
const FUNCTION_PROP = /\s[a-zA-Z]+=\{\s*(?:\([^()]*\)|[a-zA-Z_$][\w$]*)\s*=>/g;

describe('the support pages hand no function to a client part', () => {
  const files = pages(APP);
  it('finds the inbox, a conversation, the settings and the rider issues (PR 192)', () => {
    expect(files.length).toBe(4);
  });
  it.each(files.map((f) => [f.slice(APP.length + 1), f]))('%s', (_name, file) => {
    expect(readFileSync(file, 'utf8').match(FUNCTION_PROP) ?? []).toEqual([]);
  });
});
