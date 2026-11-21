// PR 1162 (p101, owner decision 3: no code names on screen) — the Activity log's plain-English "What" for a raw event key.
// The audit log stores keys such as `staff.password.change` or `settings.checkout.cod.save`; the screen and the download
// show them as words ("Staff password changed"). Every word comes from the page's messages file (people.activity.words):
// `exact` holds whole sentences for a few keys, `verbs` the past form of a last part that is a doing word ("save" → "saved"),
// `abbr` the parts written in capitals (ERP, SMS, COD), and `sentence` puts the thing and the doing word together. A key
// with no doing word at its end reads "<thing> changed". The key itself is never shown.
import { t, type Dict } from './i18n';

/** The parts of a key as lower-case words: dots, colons, dashes, underscores and camelCase all split. */
export function keyParts(action: string): string[] {
  return action
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[\s.:_-]+/)
    .map((w) => w.toLowerCase())
    .filter(Boolean);
}

function lookup(dict: Dict, key: string): string | null {
  const v = t(dict, key);
  return v === key ? null : v;
}

/** A raw event key in plain words, from `<base>.exact`, `<base>.verbs`, `<base>.abbr` and `<base>.sentence`. */
export function actionWords(dict: Dict, action: string, base = 'people.activity.words'): string {
  const exact = lookup(dict, `${base}.exact.${action.replace(/[.:-]/g, '_')}`);
  if (exact) return exact;
  const parts = keyParts(action);
  if (!parts.length) return lookup(dict, `${base}.unknown`) ?? '';
  const abbr = new Set((lookup(dict, `${base}.abbr`) ?? '').split(/\s+/).filter(Boolean));
  const last = parts[parts.length - 1]!;
  const verb = parts.length > 1 ? lookup(dict, `${base}.verbs.${last}`) : null;
  const thingParts = verb ? parts.slice(0, -1) : parts;
  // the same word twice in a row ("settings settings") reads once
  const words = thingParts.filter((w, i) => w !== thingParts[i - 1]).map((w) => (abbr.has(w) ? w.toUpperCase() : w));
  const thing = words.join(' ');
  const what = thing.charAt(0).toUpperCase() + thing.slice(1);
  const done = verb ?? lookup(dict, `${base}.changed`) ?? '';
  return t(dict, `${base}.sentence`, { what, done });
}
