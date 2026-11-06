'use client';
// S02 · PR 595 — Website › Page layouts' one list (demo 96c-layout-builder.js "পেজ সাজান"), in the Lumen look; it
// takes over from PR 76's LayoutEditor (kept for history). One row per section in the page's order: the page's own
// sections (Show; "Always shown" ones never hide) and, on the home and category pages, the owner's own sections with
// their type, days and state (hidden, waiting, showing, ended), Edit and Duplicate. Every row: its screens, ▲ ▼, and
// drag on a computer. "Add a section" picks one of ten types; a new section starts hidden and above the reviews on the
// home page (the demo's "New offer" example), at the end elsewhere. A section is hidden, never deleted. One category may
// keep its own order (its switch); off, its own sections still show and the order is every category's.
// Save sends the whole page with the version it was read at (PUT /api/admin/website/layouts, `website.layout.write`;
// the API checks everything again); Discard and "Back to the default order" only change the draft.
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import type { BlockType, LayoutBlock, LayoutDevice } from '@extas/settings';
import { showToast } from '@/components/admin/lumen/Toast';
import { blockState, flatten, unflatten, type FlatItem } from '@/lib/shop/layout-flat';
import { moveRow, type LayoutRow } from '@/lib/shop/layout-rows';
import { BlockForm, type BlockChoices } from './BlockForm';

const API = '/api/admin/website/layouts';
const DEVICES: readonly LayoutDevice[] = ['both', 'phone', 'desktop'];
export const BLOCK_TYPE_LIST: readonly BlockType[] = ['banner', 'offerStrip', 'productRow', 'productGrid', 'comboRow', 'categoryTiles', 'reviews', 'journal', 'richText', 'spacer'];

type Item = FlatItem<LayoutBlock>;
type Dict = { [k: string]: string | Dict };

interface Props {
  page: string;
  cat: string | null;
  rows: LayoutRow[];
  blocks: LayoutBlock[];
  defaults: LayoutRow[];
  locked: string[];
  version: string;
  own: boolean | null;
  /** One category: its own order kept while off (null = none yet). */
  ownRows: LayoutRow[] | null;
  shared: number;
  canEdit: boolean;
  today: string;
  /** Each type's starting words and numbers (blockDefaults, read on the server). */
  starts: Record<BlockType, LayoutBlock['data']>;
  choices: BlockChoices;
  lang: 'en' | 'bn';
  w: Dict;
}

const keyOf = (it: Item) => (it.kind === 'sec' ? `s:${it.row.id}` : `b:${it.block.id}`);
const sig = (items: readonly Item[], own: boolean | null) => JSON.stringify([own, items.map((it) => (it.kind === 'sec' ? [it.row.id, it.row.on, it.row.dev ?? 'both'] : it.block))]);
/** A fresh id for a new section (the API refuses one already used). */
const newId = () => Array.from(crypto.getRandomValues(new Uint8Array(10)), (n) => 'abcdefghijklmnopqrstuvwxyz0123456789'[n % 36]).join('');

export function LayoutBuilder(p: Props) {
  const router = useRouter();
  const g = (k: string): string => {
    const v = k.split('.').reduce<string | Dict | undefined>((o, part) => (o && typeof o === 'object' ? o[part] : undefined), p.w);
    return typeof v === 'string' ? v : k;
  };
  const saved = useMemo(() => flatten(p.rows, p.blocks), [p.rows, p.blocks]);
  const [items, setItems] = useState<Item[]>(saved);
  const [own, setOwn] = useState<boolean | null>(p.own);
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState<number | null>(null);
  const takesBlocks = p.page === 'home' || p.page === 'category';
  /** One category without its own order: the page's own sections follow every category page's. */
  const followsAll = p.cat !== null && !own;
  const dirty = sig(items, own) !== sig(saved, p.own);
  const secName = (id: string) => g(`sec.${id}`);
  const anchors = items.flatMap((it): [string, string][] => (it.kind === 'sec' ? [[it.row.id, secName(it.row.id)]] : []));
  const shown = items.filter((it) => (it.kind === 'sec' ? it.row.on : it.block.on)).length;

  const edit = (next: Item[]) => setItems(next);
  const patchAt = (i: number, f: (it: Item) => Item) => edit(items.map((it, j) => (j === i ? f(it) : it)));
  const move = (from: number, to: number) => {
    // following every category page, the page's own sections keep that order; the owner's sections still move
    if (followsAll && items[from]?.kind === 'sec') return;
    edit(moveRow(items, from, to));
  };
  const placeOf = (i: number) => {
    const next = items.slice(i + 1).find((x) => x.kind === 'sec');
    return next && next.kind === 'sec' ? next.row.id : '';
  };
  /** Moves a section to sit right above an own section ('' = the end). */
  const place = (i: number, before: string) => {
    const it = items[i]!;
    const rest = items.filter((_, j) => j !== i);
    const at = before ? rest.findIndex((x) => x.kind === 'sec' && x.row.id === before) : rest.length;
    edit([...rest.slice(0, at), it, ...rest.slice(at)]);
  };

  const add = (type: BlockType) => {
    const block = {
      id: newId(),
      page: p.page === 'home' ? 'home' : 'category',
      cat: p.page === 'category' ? p.cat : null,
      name: '',
      on: false,
      dev: 'both',
      from: null,
      to: null,
      before: null,
      type,
      data: structuredClone(p.starts[type]),
    } as LayoutBlock;
    const at = p.page === 'home' ? items.findIndex((x) => x.kind === 'sec' && x.row.id === 'reviews') : -1;
    const next: Item = { kind: 'block', block };
    edit(at >= 0 ? [...items.slice(0, at), next, ...items.slice(at)] : [...items, next]);
    setAdding(false);
    setOpen(block.id);
  };
  const duplicate = (i: number) => {
    const it = items[i]!;
    if (it.kind !== 'block') return;
    const copy = { ...structuredClone(it.block), id: newId(), on: false, name: g('copyName').replace('{name}', it.block.name || g(`type.${it.block.type}`)).slice(0, 80) } as LayoutBlock;
    edit([...items.slice(0, i + 1), { kind: 'block', block: copy }, ...items.slice(i + 1)]);
    showToast({ text: g('duplicated'), tone: 'info' });
  };
  /** The page's own sections in another order; each owner's section keeps its place above the same own section. */
  const withRows = (rows: readonly LayoutRow[]) => edit(flatten(rows, unflatten(items).blocks));
  const reset = () => withRows(p.defaults);
  const flipOwn = () => {
    // on: the category's kept order, else every category's to start from; off: every category's again (its own is kept)
    withRows(!own ? (p.ownRows ?? p.defaults) : p.defaults);
    setOwn(!own);
  };

  const save = async () => {
    setBusy(true);
    try {
      const back = unflatten(items);
      const body = { page: p.page, cat: p.cat, own: own ?? undefined, sections: back.rows.map((r) => ({ id: r.id, on: r.on, dev: r.dev ?? 'both' })), blocks: takesBlocks ? back.blocks : undefined, version: p.version };
      const res = await fetch(API, { method: 'PUT', credentials: 'same-origin', cache: 'no-store', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const data = (await res.json().catch(() => ({ ok: false }))) as { ok?: boolean; error?: string; details?: string[] };
      if (data.ok) {
        showToast({ text: g('saved'), tone: 'ok' });
        setOpen(null);
        router.refresh();
      } else {
        const code = data.error ?? (res.status === 403 ? 'forbidden' : res.status === 401 ? 'unauthorized' : 'other');
        const text = (g(`err.${code}`) === `err.${code}` ? g('err.other') : g(`err.${code}`)).replace('{fields}', (data.details ?? []).map((f) => g(`field.${f}`)).join(', '));
        showToast({ text, tone: 'bad' });
      }
    } catch {
      showToast({ text: g('err.network'), tone: 'bad' });
    }
    setBusy(false);
  };

  const stateLine = (b: LayoutBlock) => {
    const st = blockState(b, p.today);
    const days = b.from || b.to ? g('days').replace('{from}', b.from ?? '…').replace('{to}', b.to ?? '…') : '';
    return { st, text: [g(`state.${st}`), days].filter(Boolean).join(' · ') };
  };

  return (
    <div className="lyb" data-testid="ly-editor" data-page={p.page}>
      {p.cat !== null ? (
        <div className="lm-setc lyb-own" data-testid="ly-own">
          <div className="lm-setr">
            <div>
              <h3 id="ly-own-t">{g('own.title')}</h3>
              <p>{own ? g('own.on') : g('own.off')}</p>
              {p.shared ? <p>{g('own.shared').replace('{n}', String(p.shared))}</p> : null}
            </div>
            <button type="button" role="switch" aria-checked={!!own} aria-labelledby="ly-own-t" className={`lm-sw${own ? ' on' : ''}`} disabled={!p.canEdit} onClick={flipOwn} data-testid="ly-own-sw">
              <span aria-hidden="true" />
            </button>
          </div>
        </div>
      ) : null}
      <p className="lm-sub" data-testid="ly-count">
        {g('count').replace('{on}', String(shown)).replace('{all}', String(items.length))}
      </p>
      {p.canEdit ? <p className="lm-hint">{g('drag')}</p> : null}
      <ol className="lyb-list">
        {items.map((it, i) => {
          const key = keyOf(it);
          const isSec = it.kind === 'sec';
          const id = isSec ? it.row.id : it.block.id;
          const name = isSec ? secName(id) : it.block.name || g(`type.${it.block.type}`);
          const isLocked = isSec && p.locked.includes(id);
          const on = isSec ? it.row.on : it.block.on;
          const dev = (isSec ? it.row.dev : it.block.dev) ?? 'both';
          const fixed = !p.canEdit || (isSec && followsAll);
          const st = isSec ? null : stateLine(it.block);
          return (
            <li key={key} className={`lyb-li${open === id ? ' open' : ''}`}>
              <div
                className={`lyb-row${on ? '' : ' off'}${drag === i ? ' drag' : ''}${isSec ? '' : ' own'}`}
                data-testid="ly-row"
                data-id={id}
                data-kind={it.kind}
                draggable={p.canEdit && !fixed}
                onDragStart={(e) => {
                  setDrag(i);
                  e.dataTransfer.effectAllowed = 'move';
                }}
                onDragOver={(e) => {
                  if (drag !== null) e.preventDefault();
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (drag !== null) move(drag, i);
                  setDrag(null);
                }}
                onDragEnd={() => setDrag(null)}
              >
                <span className="lyb-num" aria-hidden="true">
                  {i + 1}
                </span>
                <div className="lyb-name">
                  <b>{name}</b>
                  {isSec ? (
                    <span className="lm-hint">{isLocked ? `${g(`hint.${id}`)} · ${g('always')}` : g(`hint.${id}`)}</span>
                  ) : (
                    <span className="lm-hint">
                      <span className={`lyb-tag st-${st!.st}`}>{g(`type.${it.block.type}`)}</span> {st!.text}
                    </span>
                  )}
                </div>
                <div className="lyb-acts">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={on}
                    aria-label={`${g('show')}: ${name}`}
                    className={`lm-sw${on ? ' on' : ''}`}
                    disabled={fixed || isLocked}
                    onClick={() => patchAt(i, (x) => (x.kind === 'sec' ? { kind: 'sec', row: { ...x.row, on: !on } } : { kind: 'block', block: { ...x.block, on: !on } }))}
                    data-testid={`ly-on-${id}`}
                  >
                    <span aria-hidden="true" />
                  </button>
                  <label className="lyb-sr" htmlFor={`ly-dev-${p.page}-${id}`}>
                    {`${g('screens')}: ${name}`}
                  </label>
                  <select
                    id={`ly-dev-${p.page}-${id}`}
                    className="lm-inp lyb-dev"
                    value={dev}
                    disabled={fixed}
                    onChange={(e) => patchAt(i, (x) => (x.kind === 'sec' ? { kind: 'sec', row: { ...x.row, dev: e.target.value as LayoutDevice } } : { kind: 'block', block: { ...x.block, dev: e.target.value as LayoutDevice } }))}
                    data-testid={`ly-dev-${id}`}
                  >
                    {DEVICES.map((d) => (
                      <option key={d} value={d}>
                        {g(`dev.${d}`)}
                      </option>
                    ))}
                  </select>
                  {p.canEdit && !fixed ? (
                    <>
                      <button type="button" className="lm-btn sm lyb-mv" disabled={i === 0} aria-label={`${g('up')}: ${name}`} onClick={() => move(i, i - 1)} data-testid={`ly-up-${id}`}>
                        ▲
                      </button>
                      <button type="button" className="lm-btn sm lyb-mv" disabled={i === items.length - 1} aria-label={`${g('down')}: ${name}`} onClick={() => move(i, i + 1)} data-testid={`ly-down-${id}`}>
                        ▼
                      </button>
                    </>
                  ) : null}
                  {!isSec && p.canEdit ? (
                    <>
                      <button type="button" className="lm-btn sm" aria-expanded={open === id} onClick={() => setOpen(open === id ? null : id)} data-testid={`ly-edit-${id}`}>
                        {g('edit')}
                      </button>
                      <button type="button" className="lm-btn sm gh" onClick={() => duplicate(i)} data-testid={`ly-dup-${id}`}>
                        {g('duplicate')}
                      </button>
                    </>
                  ) : null}
                </div>
              </div>
              {!isSec && open === id ? (
                <BlockForm
                  block={it.block}
                  anchors={anchors}
                  place={placeOf(i)}
                  onPlace={(before) => place(i, before)}
                  onChange={(b) => patchAt(i, () => ({ kind: 'block', block: b }))}
                  onDone={() => setOpen(null)}
                  choices={p.choices}
                  g={g}
                  lang={p.lang}
                />
              ) : null}
            </li>
          );
        })}
      </ol>
      {p.canEdit && takesBlocks ? (
        <div className="lyb-add">
          <button type="button" className="lm-btn" aria-expanded={adding} onClick={() => setAdding(!adding)} data-testid="ly-add">
            {g('add')}
          </button>
          {adding ? (
            <div className="lyb-types lm-in" role="group" aria-label={g('whatKind')} data-testid="ly-types">
              {BLOCK_TYPE_LIST.map((t) => (
                <button key={t} type="button" className="lyb-type" onClick={() => add(t)} data-testid={`ly-type-${t}`}>
                  <b>{g(`type.${t}`)}</b>
                  <span className="lm-hint">{g(`typeHint.${t}`)}</span>
                </button>
              ))}
            </div>
          ) : null}
          <p className="lm-hint">{g('hideNote')}</p>
        </div>
      ) : null}
      {p.canEdit ? (
        <div className="lyb-save" data-dirty={dirty ? '' : undefined}>
          {dirty ? (
            <p className="lm-hint" role="status" data-testid="ly-unsaved">
              {g('unsaved')}
            </p>
          ) : null}
          <div className="lyb-bar">
            <button type="button" className="lm-btn pri" disabled={busy || !dirty} onClick={() => void save()} data-testid="ly-save">
              {busy ? g('saving') : g('save')}
            </button>
            {dirty ? (
              <button type="button" className="lm-btn" disabled={busy} onClick={() => (setItems(saved), setOwn(p.own), setOpen(null))} data-testid="ly-discard">
                {g('discard')}
              </button>
            ) : null}
            {!followsAll ? (
              <button type="button" className="lm-btn gh" disabled={busy} onClick={reset} data-testid="ly-reset">
                {g('reset')}
              </button>
            ) : null}
          </div>
          <p className="lm-hint">{g('resetHelp')}</p>
        </div>
      ) : null}
    </div>
  );
}
