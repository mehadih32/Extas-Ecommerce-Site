'use client';
// S02 · PR 595 — Website › Page layouts: the form of one of the owner's own sections (demo 96c-layout-builder.js
// "Edit section"), in the Lumen look. Its name in the list, where it goes (above one of the page's own sections, or at
// the end), its whole days (the shop's time zone), its screens, then the words and choices of its type: every word in
// English and Bengali, links inside the shop or https, products from a category, a tag, the owner's pick or the newest.
// Nothing here is saved: the list's Save sends the whole page (LayoutBuilder).
import { useId, useState, type ReactNode } from 'react';
import type { BlockWords, LayoutBlock, LayoutDevice } from '@extas/settings';

export interface BlockChoices {
  cats: { slug: string; en: string; bn: string | null }[];
  products: { slug: string; en: string; bn: string | null }[];
  tags: { slug: string; name: string }[];
  rules: { id: string; en: string; bn: string | null }[];
}

type Words = (k: string) => string;
type Data = Record<string, unknown>;

const DEVICES: readonly LayoutDevice[] = ['both', 'phone', 'desktop'];
const TONES = ['brand', 'dark', 'light'] as const;
const SOURCES = ['newest', 'category', 'tag', 'manual'] as const;

function Field({ id, label, hint, children }: { id: string; label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="lm-fl">
      <label htmlFor={id}>{label}</label>
      {children}
      {hint ? <span className="lm-hint">{hint}</span> : null}
    </div>
  );
}

/** Two boxes, English and Bengali, for one of the owner's words. */
function WordsField({ id, label, value, onChange, g, long = false }: { id: string; label: string; value: BlockWords; onChange: (v: BlockWords) => void; g: Words; long?: boolean }) {
  const Box = long ? 'textarea' : 'input';
  return (
    <fieldset className="lyb-words">
      <legend>{label}</legend>
      <div className="lm-fl">
        <label htmlFor={`${id}-en`}>{g('f.en')}</label>
        <Box id={`${id}-en`} className="lm-inp" lang="en" value={value.en} maxLength={long ? 2000 : 160} onChange={(e) => onChange({ ...value, en: e.target.value })} />
      </div>
      <div className="lm-fl">
        <label htmlFor={`${id}-bn`}>{g('f.bn')}</label>
        <Box id={`${id}-bn`} className="lm-inp" lang="bn" value={value.bn} maxLength={long ? 2000 : 160} onChange={(e) => onChange({ ...value, bn: e.target.value })} />
      </div>
    </fieldset>
  );
}

export function BlockForm({ block, anchors, place, onPlace, onChange, onDone, choices, g, lang }: {
  block: LayoutBlock;
  /** The page's own sections it can sit above: [id, name]. */
  anchors: [string, string][];
  /** Where it sits now: an own section's id, or '' for the end. */
  place: string;
  onPlace: (before: string) => void;
  onChange: (b: LayoutBlock) => void;
  onDone: () => void;
  choices: BlockChoices;
  g: Words;
  lang: 'en' | 'bn';
}) {
  const uid = useId();
  const [find, setFind] = useState('');
  const d = block.data as Data;
  const set = (k: string, v: unknown) => onChange({ ...block, data: { ...d, [k]: v } } as LayoutBlock);
  const top = (p: Partial<LayoutBlock>) => onChange({ ...block, ...p } as LayoutBlock);
  const nameOf = (x: { en: string; bn: string | null }) => (lang === 'bn' && x.bn) || x.en;
  const words = (k: string, long = false) => <WordsField key={k} id={`${uid}-${k}`} label={g(`f.${k}`)} value={d[k] as BlockWords} onChange={(v) => set(k, v)} g={g} long={long} />;
  const link = (k: string) => (
    <Field key={k} id={`${uid}-${k}`} label={g(`f.${k}`)} hint={g('f.hrefHint')}>
      <input id={`${uid}-${k}`} className="lm-inp" inputMode="url" value={String(d[k] ?? '')} maxLength={300} onChange={(e) => set(k, e.target.value.trim())} />
    </Field>
  );
  const pick = (k: string, options: [string, string][], label = g(`f.${k}`)) => {
    const now = String(d[k] ?? '');
    // a saved choice that is gone from the shop (archived, renamed) stays visible, so a save never changes it unseen
    const all: [string, string][] = options.some(([v]) => v === now) ? options : [...options, [now, now]];
    return (
      <Field key={k} id={`${uid}-${k}`} label={label}>
        <select id={`${uid}-${k}`} className="lm-inp" value={now} onChange={(e) => set(k, e.target.value)}>
          {all.map(([v, t]) => (
            <option key={v} value={v}>
              {t}
            </option>
          ))}
        </select>
      </Field>
    );
  };
  const num = (k: string, min: number, max: number) => (
    <Field key={k} id={`${uid}-${k}`} label={g(`f.${k}`)}>
      <input id={`${uid}-${k}`} className="lm-inp" type="number" inputMode="numeric" min={min} max={max} value={Number(d[k] ?? min)} onChange={(e) => set(k, Math.min(max, Math.max(min, Math.round(Number(e.target.value) || 0))))} />
    </Field>
  );
  const tone = () => pick('tone', TONES.map((t) => [t, g(`tone.${t}`)]));
  const cats: [string, string][] = choices.cats.map((c) => [c.slug, nameOf(c)]);
  // the form's limits, the same as the setting's schema (registry-layout-blocks.ts)
  const LIMIT = 24; // hardcode-ok: the schema's list length
  const SPACE = 200; // hardcode-ok: the schema's gap limit

  let typed: ReactNode = null;
  switch (block.type) {
    case 'banner':
      typed = (
        <>
          {words('eyebrow')}
          {words('title')}
          {words('text')}
          {words('cta')}
          {link('href')}
          {tone()}
          {pick('product', [['', g('f.noPicture')], ...choices.products.map((p): [string, string] => [p.slug, nameOf(p)])], g('f.picture'))}
        </>
      );
      break;
    case 'offerStrip':
      typed = (
        <>
          {words('text')}
          {words('link')}
          {link('href')}
          {tone()}
          <p className="lm-hint">{g('f.stripNote')}</p>
        </>
      );
      break;
    case 'productRow':
    case 'productGrid': {
      const ids = (d.ids as string[]) ?? [];
      const q = find.trim().toLowerCase();
      const shown = choices.products.filter((p) => !q || p.en.toLowerCase().includes(q) || (p.bn ?? '').includes(q) || ids.includes(p.slug));
      typed = (
        <>
          {words('title')}
          {words('sub')}
          {pick('source', SOURCES.map((s) => [s, g(`src.${s}`)]))}
          {d.source === 'category' ? pick('cat', [['', g('f.choose')], ...cats]) : null}
          {d.source === 'tag' ? pick('tag', [['', g('f.choose')], ...choices.tags.map((t): [string, string] => [t.slug, t.name])]) : null}
          {d.source === 'manual' ? (
            <fieldset className="lyb-words lyb-pick">
              <legend>{g('f.ids')}</legend>
              <input className="lm-inp" type="search" value={find} placeholder={g('f.find')} aria-label={g('f.find')} onChange={(e) => setFind(e.target.value)} />
              <span className="lm-hint">{g('f.idsHint').replace('{n}', String(ids.length))}</span>
              <div className="lyb-plist">
                {shown.map((p) => (
                  <label key={p.slug} className="lyb-pitem">
                    <input type="checkbox" checked={ids.includes(p.slug)} disabled={!ids.includes(p.slug) && ids.length >= LIMIT} onChange={(e) => set('ids', e.target.checked ? [...ids, p.slug] : ids.filter((x) => x !== p.slug))} />
                    <span>{nameOf(p)}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          ) : null}
          {num('limit', 1, LIMIT)}
          {words('more')}
          {link('moreHref')}
        </>
      );
      break;
    }
    case 'comboRow':
      typed = (
        <>
          {words('title')}
          {words('sub')}
          {pick('rule', [['', g('f.allSets')], ...choices.rules.map((r): [string, string] => [r.id, nameOf(r)])])}
          {num('limit', 1, LIMIT)}
        </>
      );
      break;
    case 'categoryTiles': {
      const chosen = (d.cats as string[]) ?? [];
      typed = (
        <>
          {words('title')}
          <fieldset className="lyb-words lyb-pick">
            <legend>{g('f.cats')}</legend>
            <span className="lm-hint">{g('f.catsHint')}</span>
            <div className="lyb-plist">
              {choices.cats.map((c) => (
                <label key={c.slug} className="lyb-pitem">
                  <input type="checkbox" checked={chosen.includes(c.slug)} disabled={!chosen.includes(c.slug) && chosen.length >= LIMIT} onChange={(e) => set('cats', e.target.checked ? [...chosen, c.slug] : chosen.filter((x) => x !== c.slug))} />
                  <span>{nameOf(c)}</span>
                </label>
              ))}
            </div>
          </fieldset>
        </>
      );
      break;
    }
    case 'reviews':
    case 'journal':
      typed = (
        <>
          {words('title')}
          {num('limit', 1, LIMIT)}
        </>
      );
      break;
    case 'richText':
      typed = (
        <>
          {words('title')}
          {words('body', true)}
          <p className="lm-hint">{g('f.bodyHint')}</p>
        </>
      );
      break;
    case 'spacer':
      typed = (
        <>
          {num('phone', 0, SPACE)}
          {num('desktop', 0, SPACE)}
        </>
      );
      break;
  }

  return (
    <div className="lm-card lyb-form lm-in" data-testid="ly-form" role="group" aria-label={g('formTitle').replace('{type}', g(`type.${block.type}`))}>
      <h3 className="lm-h2">{g('formTitle').replace('{type}', g(`type.${block.type}`))}</h3>
      <div className="lyb-grid">
        <Field id={`${uid}-name`} label={g('f.name')} hint={g('f.nameHint')}>
          <input id={`${uid}-name`} className="lm-inp" value={block.name} maxLength={80} onChange={(e) => top({ name: e.target.value })} data-testid="ly-f-name" />
        </Field>
        <Field id={`${uid}-place`} label={g('f.place')}>
          <select id={`${uid}-place`} className="lm-inp" value={place} onChange={(e) => onPlace(e.target.value)} data-testid="ly-f-place">
            {anchors.map(([id, name]) => (
              <option key={id} value={id}>
                {g('f.above').replace('{name}', name)}
              </option>
            ))}
            <option value="">{g('f.atEnd')}</option>
          </select>
        </Field>
        <Field id={`${uid}-from`} label={g('f.from')} hint={g('f.daysHint')}>
          <input id={`${uid}-from`} className="lm-inp" type="date" value={block.from ?? ''} onChange={(e) => top({ from: e.target.value || null })} data-testid="ly-f-from" />
        </Field>
        <Field id={`${uid}-to`} label={g('f.to')}>
          <input id={`${uid}-to`} className="lm-inp" type="date" value={block.to ?? ''} min={block.from ?? undefined} onChange={(e) => top({ to: e.target.value || null })} data-testid="ly-f-to" />
        </Field>
        <Field id={`${uid}-dev`} label={g('screens')}>
          <select id={`${uid}-dev`} className="lm-inp" value={block.dev} onChange={(e) => top({ dev: e.target.value as LayoutDevice })}>
            {DEVICES.map((x) => (
              <option key={x} value={x}>
                {g(`dev.${x}`)}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="lyb-typed">{typed}</div>
      <div className="lyb-bar">
        <button type="button" className="lm-btn pri" onClick={onDone} data-testid="ly-f-done">
          {g('f.done')}
        </button>
      </div>
    </div>
  );
}
