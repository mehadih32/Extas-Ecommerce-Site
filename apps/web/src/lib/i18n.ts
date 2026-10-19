// Minimal dictionary lookup until the language framework (PR 503) lands. Every visible string comes from a
// dictionary file in messages/, never from code (CLAUDE.md rule 1).
export type Dict = { [key: string]: string | Dict };

export function t(dict: Dict, key: string, vars: Record<string, string | number> = {}): string {
  let node: string | Dict | undefined = dict;
  for (const part of key.split('.')) {
    node = typeof node === 'object' ? node[part] : undefined;
  }
  if (typeof node !== 'string') return key;
  return node.replace(/\{(\w+)\}/g, (_, v: string) => String(vars[v] ?? `{${v}}`));
}
