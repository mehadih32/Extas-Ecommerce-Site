import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { confirmPhrase, DEFAULT_CONF, main, parseArgs, switchConf } from './golive-switch.mjs';

const conf = `EXTAS_STAGING_HOST="staging.example.test"
EXTAS_EXTRA_HOSTS=""                # extra hosts
EXTAS_MAIN_OPEN="no"                # PR 403
EXTAS_STAGING_USER="extas"
`;

describe('golive-switch (PR 587)', () => {
  it('adds the main domain and www, opens the main domain only, keeps the comments', () => {
    const { text, changes } = switchConf(conf, 'shop.example.test');
    expect(text).toContain('EXTAS_EXTRA_HOSTS="shop.example.test www.shop.example.test"                # extra hosts');
    expect(text).toContain('EXTAS_MAIN_OPEN="yes"                # PR 403');
    expect(text).toContain('EXTAS_STAGING_HOST="staging.example.test"');
    expect(changes).toHaveLength(2);
  });
  it('keeps other extra hosts, no www on request, and is idempotent', () => {
    const one = switchConf(conf.replace('EXTRA_HOSTS=""', 'EXTRA_HOSTS="b.example.test"'), 'Shop.Example.Test.', { www: false });
    expect(one.text).toContain('EXTAS_EXTRA_HOSTS="shop.example.test b.example.test"');
    expect(switchConf(one.text, 'shop.example.test', { www: false }).changes).toEqual([]);
  });
  it('refuses the staging host, a bad name and a file without the lines', () => {
    expect(() => switchConf(conf, 'staging.example.test')).toThrow(/staging host/);
    expect(() => switchConf(conf, 'https://x.test')).toThrow(/plain host/);
    expect(() => switchConf(conf, 'x.test {')).toThrow(/plain host/);
    expect(() => switchConf('A="1"\n', 'x.test')).toThrow(/no EXTAS_STAGING_HOST/);
  });
  it('undo locks the main domain again and leaves the hosts', () => {
    const open = switchConf(conf, 'shop.example.test').text;
    const { text, changes } = switchConf(open, 'shop.example.test', { undo: true });
    expect(text).toContain('EXTAS_MAIN_OPEN="no"');
    expect(text).toContain('www.shop.example.test');
    expect(changes).toHaveLength(1);
  });
  it('writes nothing without the exact typed confirmation', () => {
    const dir = mkdtempSync(join(tmpdir(), 'golive-'));
    const f = join(dir, 'server.conf');
    writeFileSync(f, conf);
    const log = [];
    expect(main(['--domain', 'shop.example.test', '--conf', f], (l) => log.push(l))).toBe(0);
    expect(main(['--domain', 'shop.example.test', '--conf', f, '--confirm', 'go live'], () => {})).toBe(2);
    expect(readFileSync(f, 'utf8')).toBe(conf);
    expect(log.join('\n')).toContain(confirmPhrase('shop.example.test'));
    expect(main(['--domain', 'shop.example.test', '--conf', f, '--confirm', confirmPhrase('shop.example.test')], () => {})).toBe(0);
    expect(readFileSync(f, 'utf8')).toContain('EXTAS_MAIN_OPEN="yes"');
  });
  it('the shipped server.conf is this repo\'s own go-live state (PR 587, CN-039), and a dry run still changes nothing on disk', () => {
    const shipped = readFileSync(DEFAULT_CONF, 'utf8');
    expect(shipped).toMatch(/^EXTAS_MAIN_OPEN="yes"/m);
    expect(parseArgs(['--domain', 'shop.example.test']).confirm).toBeNull();
    expect(switchConf(shipped, 'shop.example.test').changes.length).toBeGreaterThan(0);
  });
});
