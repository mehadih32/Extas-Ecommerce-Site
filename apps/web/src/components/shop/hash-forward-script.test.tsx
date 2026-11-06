// PR 597 follow-up (696) — the hash forwarder's script: in the server's HTML it is a script the browser runs; a copy
// React makes in the browser is an inert data block, so React 19 never warns "Encountered a script tag while rendering
// React component". No shop component draws an executable script any other way (JSON-LD is a data block already).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import { HashForwardScript } from './HashForwardScript';

const G = globalThis as { window?: unknown };
const code = 'location.hash&&0';

describe('the hash forwarder drawn the React way (696)', () => {
  afterEach(() => {
    delete G.window;
  });

  it('runs from the server HTML: a plain script with the code', () => {
    expect(renderToStaticMarkup(<HashForwardScript code={code} />)).toBe(`<script data-hash-forward="">${code}</script>`);
  });

  it('a copy made in the browser is a data block, which never runs and is never warned about', () => {
    G.window = {};
    expect(renderToStaticMarkup(<HashForwardScript code={code} />)).toBe(`<script data-hash-forward="" type="application/json">${code}</script>`);
  });

  it('the shop draws no other executable script tag', () => {
    const root = fileURLToPath(new URL('../../', import.meta.url));
    const files: string[] = [];
    const walk = (d: string) => {
      for (const n of readdirSync(d)) {
        const p = join(d, n);
        if (statSync(p).isDirectory()) walk(p);
        else if (p.endsWith('.tsx') && !p.includes('.test.')) files.push(p);
      }
    };
    walk(join(root, 'app/(shop)'));
    walk(join(root, 'components/shop'));
    const raw = files.filter((p) => /<script\b/.test(readFileSync(p, 'utf8'))).map((p) => p.slice(root.length));
    expect(raw.sort()).toEqual(['components/shop/HashForwardScript.tsx', 'components/shop/JsonLd.tsx']);
    expect(readFileSync(join(root, 'components/shop/JsonLd.tsx'), 'utf8')).toMatch(/<script key=\{i\} type="application\/ld\+json"/);
  });
});
