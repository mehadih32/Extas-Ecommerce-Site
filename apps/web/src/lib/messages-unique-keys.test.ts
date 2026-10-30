// CN-028 · PR 617 (qa-gate prevention) — no key twice in one object of a words file. JSON.parse keeps only the last of
// two equal keys, so a second `"money": {…}` block in admin-shell.*.json silently hid the first one's tab names (two
// lanes merged into one file). This reads every words file with its own small parser and names any repeated key.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/** The paths of keys that appear twice in the same object (`a.b.c`). Throws on text that is not JSON. */
function repeatedKeys(text: string): string[] {
  let i = 0;
  const out: string[] = [];
  const ws = () => {
    while (i < text.length && /\s/.test(text[i]!)) i++;
  };
  const str = (): string => {
    const start = i;
    i++;
    while (text[i] !== '"') i += text[i] === '\\' ? 2 : 1;
    i++;
    return JSON.parse(text.slice(start, i)) as string;
  };
  const value = (path: string): void => {
    ws();
    const c = text[i];
    if (c === '{') {
      i++;
      const seen = new Set<string>();
      ws();
      if (text[i] === '}') {
        i++;
        return;
      }
      for (;;) {
        ws();
        const k = str();
        const p = path ? `${path}.${k}` : k;
        if (seen.has(k)) out.push(p);
        seen.add(k);
        ws();
        i++; // ':'
        value(p);
        ws();
        if (text[i++] === '}') return;
      }
    } else if (c === '[') {
      i++;
      ws();
      if (text[i] === ']') {
        i++;
        return;
      }
      for (let n = 0; ; n++) {
        value(`${path}[${n}]`);
        ws();
        if (text[i++] === ']') return;
      }
    } else if (c === '"') str();
    else while (i < text.length && !/[,}\]\s]/.test(text[i]!)) i++;
  };
  JSON.parse(text);
  value('');
  return out;
}

describe('words files', () => {
  it('the parser finds a repeated key and nothing else', () => {
    expect(repeatedKeys('{"a":{"x":1},"b":[{"y":"}"}],"a":{"z":2}}')).toEqual(['a']);
    expect(repeatedKeys('{"s":{"t":{"m":1,"m":2}}}')).toEqual(['s.t.m']);
    expect(repeatedKeys('{"a":"\\"","b":[1,2,{}],"c":{}}')).toEqual([]);
  });

  it('no words file has a key twice in one object', () => {
    const dir = join(__dirname, '../../messages');
    const found = readdirSync(dir)
      .filter((f) => f.endsWith('.json'))
      .flatMap((f) => repeatedKeys(readFileSync(join(dir, f), 'utf8')).map((k) => `${f}: ${k}`));
    expect(found).toEqual([]);
  });
});
