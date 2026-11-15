'use client';
// PR 746 + 747 — Products › Categories & tags: three cards (Categories, Collections, Tag badges). Every list is arranged by
// grabbing a row's handle (mouse, touch) or with the arrow keys and the Move up / Move down buttons; a box shows or hides a
// row (nothing is deleted). Each card is saved whole with its version to /api/admin/catalogue/structure (STALE: read again).
// The words come from the page (messages/admin-structure.<lang>.json), never from here.
import { useId, type ReactNode } from 'react';
import { Frame, List, PairInputs, Row, Show, nudgeIn, patch, place } from '../website/BrandMenusEditor';
import { useDragging } from '../website/Sortable';
import { useApiCard, type ApiScreen } from '../website/useApiCard';
import type { CategoryRow, CollectionRow, TagRow } from '@/lib/admin-structure/service';

const API = '/api/admin/catalogue/structure';

export interface StructureProps {
  categories: ApiScreen<{ rows: CategoryRow[] }>;
  collections: ApiScreen<{ rows: CollectionRow[] }>;
  tags: ApiScreen<{ rows: TagRow[] }>;
  texts: Record<string, string>;
  lang: 'en' | 'bn';
  canEdit: boolean;
}

type X = (k: string) => string;
const nameOf = (p: { en: string; bn: string }, lang: 'en' | 'bn') => (p[lang] || p.en || p.bn).trim();

/** The rows of one level put in a new order, the other levels' rows left where they are. */
function arrange(rows: CategoryRow[], parentId: string | null, fn: (level: (CategoryRow & { id: string })[]) => CategoryRow[]): CategoryRow[] {
  const next = fn(rows.filter((r) => r.parentId === parentId));
  let i = 0;
  return rows.map((r) => (r.parentId === parentId ? next[i++]! : r));
}

function CategoriesCard(props: StructureProps & { x: X }) {
  const { x, lang } = props;
  const id = useId();
  const card = useApiCard(API, props.categories, x, props.canEdit);
  const rows = card.draft.rows;
  const set = (next: CategoryRow[]) => card.edit({ rows: next });
  const levelOf = (list: string) => (list === 'top' ? null : list);
  const drag = useDragging({
    disabled: card.off,
    onDrop: (f, t) => set(arrange(rows, levelOf(f.list), (lv) => place(lv, f.id, t.before))),
    onNudge: (f, d) => set(arrange(rows, levelOf(f.list), (lv) => nudgeIn(lv, f.id, d))),
  });
  const level = (parentId: string | null): ReactNode => {
    const list = parentId ?? 'top';
    const here = rows.filter((r) => r.parentId === parentId);
    return (
      <List kind={`cat-${list}`} list={list} drag={drag} empty={x('categories.empty')} label={parentId ? x('categories.sub') : x('categories.h')} isEmpty={!here.length} testId={`st-cats-${list}`}>
        {here.map((r, i) => (
          <Row key={r.id} kind={`cat-${list}`} list={list} id={r.id} index={i} count={here.length} drag={drag} nudge={(d) => set(arrange(rows, parentId, (lv) => nudgeIn(lv, r.id, d)))} disabled={card.off} x={x} name={nameOf(r.name, lang)} testId={`st-cat-${r.id}`}>
            <span className="bm-name">{nameOf(r.name, lang)}</span>
            <span className="a2-xs a2-mute">{x('categories.products').replace('{n}', String(r.products))}</span>
            <Show on={r.on} label={x('show')} disabled={card.off} onChange={(on) => set(patch(rows, r.id, { on }))} testId={`st-cat-${r.id}-on`} />
            {rows.some((c) => c.parentId === r.id) ? level(r.id) : null}
          </Row>
        ))}
      </List>
    );
  };
  return (
    <Frame id={id} title={x('categories.h')} sub={x('categories.d')} testId="st-categories" canEdit={props.canEdit} readOnly={x('readOnly')} card={card} x={x}>
      <div className="bm-stack a2-mt12">{level(null)}</div>
    </Frame>
  );
}

function CollectionsCard(props: StructureProps & { x: X }) {
  const { x, lang } = props;
  const id = useId();
  const card = useApiCard(API, props.collections, x, props.canEdit);
  const rows = card.draft.rows;
  const set = (next: CollectionRow[]) => card.edit({ rows: next });
  const drag = useDragging({
    disabled: card.off,
    onDrop: (f, t) => set(place(rows, f.id, t.before)),
    onNudge: (f, d) => set(nudgeIn(rows, f.id, d)),
  });
  return (
    <Frame id={id} title={x('collections.h')} sub={x('collections.d')} testId="st-collections" canEdit={props.canEdit} readOnly={x('readOnly')} card={card} x={x}>
      <div className="bm-stack a2-mt12">
        <List kind="col" list="col" drag={drag} empty={x('collections.empty')} label={x('collections.h')} isEmpty={!rows.length} testId="st-cols">
          {rows.map((r, i) => (
            <Row key={r.id} kind="col" list="col" id={r.id} index={i} count={rows.length} drag={drag} nudge={(d) => set(nudgeIn(rows, r.id, d))} disabled={card.off} x={x} name={nameOf(r.name, lang)} testId={`st-col-${r.id}`}>
              <span className="bm-name">{nameOf(r.name, lang)}</span>
              <span className="a2-xs a2-mute">{x(`collections.kind.${r.kind}`)}</span>
            </Row>
          ))}
        </List>
      </div>
    </Frame>
  );
}

function TagsCard(props: StructureProps & { x: X }) {
  const { x } = props;
  const id = useId();
  const check = (v: { rows: TagRow[] }) => (v.rows.some((r) => r.label && (!r.label.en.trim() || !r.label.bn.trim())) ? x('tags.bothWords') : null);
  const card = useApiCard(API, props.tags, x, props.canEdit, check);
  const rows = card.draft.rows;
  const set = (next: TagRow[]) => card.edit({ rows: next });
  const drag = useDragging({
    disabled: card.off,
    onDrop: (f, t) => set(place(rows, f.id, t.before)),
    onNudge: (f, d) => set(nudgeIn(rows, f.id, d)),
  });
  return (
    <Frame id={id} title={x('tags.h')} sub={x('tags.d')} testId="st-tags" canEdit={props.canEdit} readOnly={x('readOnly')} card={card} x={x}>
      <div className="bm-stack a2-mt12">
        <List kind="tag" list="tag" drag={drag} empty={x('tags.empty')} label={x('tags.h')} isEmpty={!rows.length} testId="st-tag-list">
          {rows.map((r, i) => (
            <Row key={r.id} kind="tag" list="tag" id={r.id} index={i} count={rows.length} drag={drag} nudge={(d) => set(nudgeIn(rows, r.id, d))} disabled={card.off} x={x} name={r.name} testId={`st-tag-${r.id}`}>
              <span className="bm-name">{r.name}</span>
              <Show on={r.on} label={x('tags.show')} disabled={card.off} onChange={(on) => set(patch(rows, r.id, { on }))} testId={`st-tag-${r.id}-on`} />
              <PairInputs label={x('tags.words')} value={r.label} max={24} disabled={card.off || !r.on} onChange={(p) => set(patch(rows, r.id, { label: p && (p.en || p.bn) ? p : null }))} testId={`st-tag-${r.id}-words`} help={x('tags.wordsHelp')} x={x} />
            </Row>
          ))}
        </List>
        <span className="a2-xs a2-mute">{x('tags.order')}</span>
      </div>
    </Frame>
  );
}

export function StructureEditor(props: StructureProps) {
  const x: X = (k) => props.texts[k] ?? k;
  return (
    <>
      <CategoriesCard {...props} x={x} />
      <CollectionsCard {...props} x={x} />
      <TagsCard {...props} x={x} />
    </>
  );
}
