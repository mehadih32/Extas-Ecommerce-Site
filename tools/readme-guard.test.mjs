// Tests for tools/readme-guard.mjs (run with the web tests: pnpm --filter @extas/web test).
import { expect, it } from 'vitest';
import { guard, prListNumbers, titleNumbers } from './readme-guard.mjs';

const register = (s09Done) => `# Register

## Build status

| PR | Stage | State | Date | Note |
|---|---|---|---|---|
${Array.from({ length: s09Done }, (_, i) => `| ${194 + i} | S09 | merged | 2026-10-20 | x |`).join('\n')}
| 40 | S02 | planned | | |

## The stage table

| # | Stage | PRs | Range | Status |
|---|---|---:|---|---|
| S02 | Storefront | 3 | 40–42 | locked |
| S09 | Inventory | 2 | 194–195 | locked |
| S26 | Parked | 1 | 513 | parked |
`;

const readme = ({ s02 = '0 / 3', s09 = '2 / 2', total = '2 / 5', log = '| #17 | PR 194–195 | 20 Oct | stock |', s02State = 'In progress' } = {}) => `# README

### All 28 stages

| Stage | Name | Wave | PR numbers | Done / total | State |
|---|---|:-:|---|:-:|---|
| S02 | Storefront | 2 | 40–42 | ${s02} | x |
| S09 | Inventory | 1 | 194–195 | ${s09} | x |
| S26 | Parked | — | 513 | — / 1 | Parked |
| | **Total** | | **6 PRs** | **${total} active** | |

## Features by area

### S02 · Storefront — ${s02State}

### S09 · Inventory — Done (2/2)

## PR log

| GitHub | Register PRs / title | Date | What it added |
|---|---|---|---|
${log}

## Change notes
`;

it('title numbers: lists, ranges, change notes ignored, Status has none', () => {
  expect(titleNumbers('PR 197–200, 202: stock')).toEqual([197, 198, 199, 200, 202]);
  expect(titleNumbers('PR 509, 17 + CN-010: owner')).toEqual([509, 17]);
  expect(titleNumbers('Status: README')).toEqual([]);
  expect(prListNumbers('PR 493 (+ PR 17 fix) in S0A V12.1')).toEqual([493, 17]);
});

it('an up-to-date README passes', () => {
  expect(guard({ readme: readme(), register: register(2), title: 'PR 194, 195: stock' })).toEqual([]);
});

it('stage names and PR numbers as links (pnpm docs:stages) read as their text', () => {
  const linked = readme({ log: '| #17 | PR [194–195](docs/stages/S09.md) | 20 Oct | stock |' })
    .replace('| S02 | Storefront |', '| [S02](docs/stages/S02.md) | [Storefront](docs/stages/S02.md) |')
    .replace('| S09 | Inventory |', '| [S09](docs/stages/S09.md) | [Inventory](docs/stages/S09.md) |');
  expect(guard({ readme: linked, register: register(2), title: 'PR 194, 195: stock' })).toEqual([]);
});

it('(a) a title PR without a PR log row fails', () => {
  const p = guard({ readme: readme(), register: register(2), title: 'PR 40: shell' });
  expect(p.some((x) => /PR log.*PR 40/.test(x)), p.join('\n')).toBe(true);
});

it('(b) counts that disagree with the register statuses fail', () => {
  const p = guard({ readme: readme({ s09: '1 / 2', total: '1 / 5' }), register: register(2), title: '' });
  expect(p.some((x) => /S09: README done 1/.test(x)), p.join('\n')).toBe(true);
  expect(guard({ readme: readme({ total: '3 / 5' }), register: register(2), title: '' }).some((x) => /^Total/.test(x))).toBe(true);
  expect(guard({ readme: readme({ s02: '0 / 4' }), register: register(2), title: '' }).some((x) => /S02: README total 4/.test(x))).toBe(true);
});

it('(c) a touched stage still "Not started" fails', () => {
  const log = '| #19 | PR 40 | 20 Oct | shell |';
  const p = guard({ readme: readme({ log, s02State: 'Not started' }), register: register(2), title: 'PR 40: shell' });
  expect(p.some((x) => /S02: this PR touches it/.test(x)), p.join('\n')).toBe(true);
  expect(guard({ readme: readme({ log }), register: register(2), title: 'PR 40: shell' })).toEqual([]);
});
