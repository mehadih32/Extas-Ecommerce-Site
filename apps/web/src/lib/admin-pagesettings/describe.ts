// PR 740 — Website › Page settings: a setting's schema as a small tree the screen can draw, so every page setting is
// edited by one editor instead of one hand-made form each (a new key joins a screen with one line in screens.ts). The
// tree is made from the registry's own schema (`z.toJSONSchema`), so what the screen offers is exactly what the server
// accepts: the server still checks every save against the schema. Pure: no React, no database (the screen and the tests
// both read this).
import { z } from 'zod';

export type Node =
  | { t: 'bool' }
  | { t: 'int' | 'num'; min?: number; max?: number }
  | { t: 'str'; max?: number; fmt?: 'date-time' | 'date' | 'uuid' }
  | { t: 'enum'; values: string[] }
  | { t: 'obj'; props: { k: string; n: Node }[] }
  | { t: 'arr'; item: Node; max?: number; min?: number }
  | { t: 'rec'; item: Node }
  /** `null` is a valid value (the thing is "not set"). */
  | { t: 'nullable'; of: Node }
  /** `{ key }` (the shop's built-in words) or `{ en, bn }` (the owner's own). */
  | { t: 'words'; own: Node }
  /** Anything the screen cannot draw by shape: edited as text (JSON), still checked by the schema. */
  | { t: 'json' };

type J = Record<string, unknown>;

const isObj = (j: unknown): j is J => !!j && typeof j === 'object' && !Array.isArray(j);

function fromJson(j: J): Node {
  // zod writes a nullable plain value as `type: ['string', 'null']`
  if (Array.isArray(j.type)) {
    const rest = (j.type as string[]).filter((x) => x !== 'null');
    if (rest.length < j.type.length && rest.length === 1) return { t: 'nullable', of: fromJson({ ...j, type: rest[0] }) };
    return { t: 'json' };
  }
  const any = j.anyOf as J[] | undefined;
  if (any) {
    const rest = any.filter((x) => x.type !== 'null');
    if (rest.length < any.length) {
      if (rest.length === 1) return { t: 'nullable', of: fromJson(rest[0]!) };
      return { t: 'nullable', of: fromJson({ anyOf: rest }) };
    }
    const keyed = any.find((x) => isObj(x.properties) && Object.keys(x.properties as J).join() === 'key');
    const own = any.find((x) => x !== keyed);
    if (keyed && own && any.length === 2) return { t: 'words', own: fromJson(own) };
    return { t: 'json' };
  }
  if (Array.isArray(j.enum)) return { t: 'enum', values: (j.enum as unknown[]).map(String) };
  if (j.const !== undefined) return { t: 'enum', values: [String(j.const)] };
  switch (j.type) {
    case 'boolean':
      return { t: 'bool' };
    case 'integer':
      return { t: 'int', min: j.minimum as number | undefined, max: j.maximum as number | undefined };
    case 'number':
      return { t: 'num', min: j.minimum as number | undefined, max: j.maximum as number | undefined };
    case 'string': {
      const f = j.format;
      return { t: 'str', max: j.maxLength as number | undefined, fmt: f === 'date-time' || f === 'date' || f === 'uuid' ? f : undefined };
    }
    case 'array':
      return { t: 'arr', item: fromJson((j.items ?? {}) as J), max: j.maxItems as number | undefined, min: j.minItems as number | undefined };
    case 'object': {
      if (isObj(j.properties)) {
        const required = new Set((j.required as string[] | undefined) ?? []);
        const entries = Object.entries(j.properties);
        // an object with optional parts is edited as text: which parts apply depends on each other
        if (entries.some(([k]) => !required.has(k))) return { t: 'json' };
        return { t: 'obj', props: entries.map(([k, v]) => ({ k, n: fromJson(v as J) })) };
      }
      if (isObj(j.additionalProperties)) {
        const names = j.propertyNames;
        const pat = isObj(names) ? (names.pattern as string | undefined) : undefined;
        // a record whose names are a fixed list (an enum) is edited as text
        if (isObj(names) && Array.isArray(names.enum)) return { t: 'json' };
        void pat;
        return { t: 'rec', item: fromJson(j.additionalProperties) };
      }
      return { t: 'json' };
    }
    default:
      return { t: 'json' };
  }
}

/** The tree for a schema. */
export function describeSchema(schema: z.ZodType): Node {
  try {
    return fromJson(z.toJSONSchema(schema, { unrepresentable: 'any', io: 'input' }) as J);
  } catch {
    return { t: 'json' };
  }
}

/** A new, empty value of a shape (a row the owner adds): switches off, numbers at their least, no text. */
export function blank(n: Node): unknown {
  switch (n.t) {
    case 'bool':
      return false;
    case 'int':
    case 'num':
      return n.min ?? 0;
    case 'str':
      return '';
    case 'enum':
      return n.values[0] ?? '';
    case 'obj':
      return Object.fromEntries(n.props.map((p) => [p.k, blank(p.n)]));
    case 'arr':
      return [];
    case 'rec':
      return {};
    case 'nullable':
      return null;
    case 'words':
      return blank(n.own);
    case 'json':
      return null;
  }
}

/** Lower-case words from a code name: `perRow` → "Per row". */
export function humanise(name: string): string {
  const spaced = name.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[-_]+/g, ' ').trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
}

/** Two values are the same thing (the order of an object's names never matters). */
export function sameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
}

function canonical(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canonical);
  if (isObj(v)) return Object.fromEntries(Object.keys(v).sort().map((k) => [k, canonical(v[k])]));
  return v;
}
