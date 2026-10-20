// The few words the catalogue itself puts into names, titles and facts ("+2" more colours, "60% cotton"). Everything
// else visible belongs to the screens' own message files (PR 21).
import bn from '../messages/catalogue.bn.json';
import en from '../messages/catalogue.en.json';
import type { Lang } from './dictionaries';

export const catalogueMessages = { en, bn } as const;

type Path = 'naming.coloursMore' | 'naming.listSeparator' | 'facts.fibreShare' | 'facts.gsm';

/** The text at `path` in `lang`, with `{name}` placeholders filled. */
export function msg(lang: Lang, path: Path, vars: Record<string, string | number> = {}): string {
  const [group, key] = path.split('.') as [keyof typeof en, string];
  const tree = catalogueMessages[lang][group] as Record<string, string>;
  const text = tree[key] ?? (catalogueMessages.en[group] as Record<string, string>)[key] ?? path;
  return text.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}
