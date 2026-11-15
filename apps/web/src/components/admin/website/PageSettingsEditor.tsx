'use client';
// PR 740–744 — Website › Page settings: one editor for every page setting (lib/admin-pagesettings). It draws a setting
// from its own shape (describe.ts): a switch, a number, words in two languages, a list the owner re-orders, a list of
// rows he adds to, a product picker, a colour, a picture. Rare options wait under "More options". Everything is saved
// together (PUT /api/admin/website/page-settings, the screen's write key; the server checks every value again and
// refuses a save over someone else's change). Lumen look, every control 44 px.
// the colour picker's neutral start when no colour is set (a value the browser needs, not a style)
const BLANK_COLOUR = ['#', '00', '00', '00'].join('');
import { useRouter } from 'next/navigation';
import { useId, useMemo, useState, type ReactNode } from 'react';
import { showToast } from '@/components/admin/lumen/Toast';
import { blank, humanise, sameValue, type Node } from '@/lib/admin-pagesettings/describe';
import type { Widget } from '@/lib/admin-pagesettings/screens';
import type { FieldView, PageSettingsView } from '@/lib/admin-pagesettings/service';

const API = '/api/admin/website/page-settings';
const MEDIA_API = '/api/admin/media';

type Texts = Record<string, string>;
interface Ctx {
  texts: Texts;
  widgets: Readonly<Record<string, Widget>>;
  view: PageSettingsView;
  canEdit: boolean;
  uid: string;
}
type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);

const x = (c: Ctx, k: string): string => c.texts[`ui.${k}`] ?? k;
/** A part's label: its own words, else the shared words for its name, else its name spelled out. */
function label(c: Ctx, id: string, leaf: string): string {
  return c.texts[`f.${id}`] ?? c.texts[`leaf.${leaf}`] ?? humanise(leaf);
}
const help = (c: Ctx, id: string): string | null => c.texts[`h.${id}`] ?? null;
const optLabel = (c: Ctx, id: string, v: string): string => c.texts[`o.${id}=${v}`] ?? c.texts[`ov.${v}`] ?? humanise(v);

/** A new row; a row that carries an `id` of its own gets a unique one. */
function freshRow(n: Node): unknown {
  const v = blank(n);
  if (n.t === 'obj' && isObj(v) && n.props.some((q) => q.k === 'id' && q.n.t === 'str')) return { ...v, id: `n${Date.now().toString(36)}` };
  return v;
}

const isComposite = (n: Node): boolean => n.t === 'obj' || n.t === 'arr' || n.t === 'rec' || n.t === 'json' || n.t === 'words' || (n.t === 'nullable' && isComposite(n.of));

const swap = <T,>(l: T[], i: number, d: -1 | 1): T[] => {
  const j = i + d;
  if (j < 0 || j >= l.length) return l;
  const n = [...l];
  [n[i], n[j]] = [n[j]!, n[i]!];
  return n;
};

// ---- small controls ----

function Switch(p: { on: boolean; label: string; disabled: boolean; onChange: (on: boolean) => void; testId?: string }) {
  return (
    <div className="ps-sw">
      <span className="ps-sw-l">{p.label}</span>
      <button type="button" role="switch" aria-checked={p.on} aria-label={p.label} className={`lm-sw${p.on ? ' on' : ''}`} disabled={p.disabled} onClick={() => p.onChange(!p.on)} data-testid={p.testId}>
        <span aria-hidden="true" />
      </button>
    </div>
  );
}

function Num(p: { value: number | null; min?: number; max?: number; int: boolean; disabled: boolean; label: string; nullable?: boolean; onChange: (v: number | null) => void; id: string }) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? (p.value === null ? '' : String(p.value));
  return (
    <input
      id={p.id}
      className="lm-inp"
      type="number"
      inputMode={p.int ? 'numeric' : 'decimal'}
      step={p.int ? 1 : 'any'}
      min={p.min}
      max={p.max}
      aria-label={p.label}
      disabled={p.disabled}
      value={shown}
      onChange={(e) => {
        const raw = e.target.value;
        setDraft(raw);
        if (raw === '') {
          if (p.nullable) p.onChange(null);
          return;
        }
        const n = Number(raw);
        if (Number.isFinite(n)) p.onChange(p.int ? Math.round(n) : n);
      }}
      onBlur={() => setDraft(null)}
    />
  );
}

/** An ISO moment in a `datetime-local` box (the device's own clock) and back. */
const toLocal = (iso: unknown): string => {
  if (typeof iso !== 'string') return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
const fromLocal = (s: string): string | null => {
  const d = new Date(s);
  return s && !Number.isNaN(d.getTime()) ? d.toISOString() : null;
};

function JsonBox(p: { value: unknown; disabled: boolean; label: string; onChange: (v: unknown) => void; c: Ctx }) {
  const [text, setText] = useState(() => JSON.stringify(p.value ?? null, null, 2));
  const [bad, setBad] = useState(false);
  return (
    <div className="ps-json">
      <textarea
        className="lm-inp ps-mono"
        aria-label={p.label}
        spellCheck={false}
        disabled={p.disabled}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          try {
            p.onChange(JSON.parse(e.target.value));
            setBad(false);
          } catch {
            setBad(true);
          }
        }}
      />
      <span className={bad ? 'ps-bad' : 'lm-hint'}>{bad ? x(p.c, 'json.bad') : x(p.c, 'json.hint')}</span>
    </div>
  );
}

// ---- pictures and products ----

function MediaPick(p: { c: Ctx; value: string | null; disabled: boolean; label: string; onChange: (id: string | null) => void }) {
  const [local, setLocal] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const url = local ?? (p.value ? (p.c.view.media[p.value] ?? null) : null);
  async function upload(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setErr('');
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('folder', 'brand');
      const res = await fetch(MEDIA_API, { method: 'POST', body: form, credentials: 'same-origin' });
      const a = (await res.json().catch(() => ({ ok: false }))) as { ok?: boolean; asset?: { id: string } };
      if (a.ok && a.asset) {
        setLocal(URL.createObjectURL(file));
        p.onChange(a.asset.id);
      } else setErr(x(p.c, 'upload.fail'));
    } catch {
      setErr(x(p.c, 'upload.fail'));
    }
    setBusy(false);
  }
  return (
    <div className="ps-media">
      <div className="ps-media-box">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element -- an admin preview of the owner's own picture
          <img src={url} alt="" />
        ) : (
          <span className="lm-hint">{p.value ? x(p.c, 'media.processing') : x(p.c, 'media.none')}</span>
        )}
      </div>
      {!p.disabled ? (
        <div className="ps-row-actions">
          <label className={`lm-btn${busy ? ' is-busy' : ''}`}>
            <input type="file" accept="image/*" className="ps-file" disabled={busy} aria-label={p.label} onChange={(e) => void upload(e.target.files?.[0]).finally(() => (e.target.value = ''))} />
            {busy ? x(p.c, 'media.uploading') : p.value ? x(p.c, 'media.replace') : x(p.c, 'media.upload')}
          </label>
          {p.value ? (
            <button
              type="button"
              className="lm-btn gh"
              onClick={() => {
                setLocal(null);
                p.onChange(null);
              }}
            >
              {x(p.c, 'media.remove')}
            </button>
          ) : null}
        </div>
      ) : null}
      {err ? <span className="ps-bad">{err}</span> : null}
    </div>
  );
}

function ProductPick(p: { c: Ctx; value: string[]; disabled: boolean; max: number; onChange: (v: string[]) => void }) {
  const [q, setQ] = useState('');
  const name = (id: string) => {
    const f = p.c.view.choices.products.find((r) => r.id === id);
    return f ? f.en : id;
  };
  const found = useMemo(() => {
    const n = q.trim().toLowerCase();
    return p.c.view.choices.products.filter((r) => !p.value.includes(r.id) && (!n || r.en.toLowerCase().includes(n) || (r.bn ?? '').includes(n))).slice(0, 30);
  }, [q, p.value, p.c.view.choices.products]);
  return (
    <div className="ps-products">
      <span className="lm-hint">{x(p.c, 'products.count').replace('{n}', String(p.value.length))}</span>
      <ul className="ps-list">
        {p.value.map((id, i) => (
          <li key={id} className="ps-item">
            <span className="ps-name">{name(id)}</span>
            {!p.disabled ? (
              <span className="ps-row-actions">
                <button type="button" className="lm-btn sm" disabled={i === 0} onClick={() => p.onChange(swap(p.value, i, -1))} aria-label={x(p.c, 'up')}>
                  ↑
                </button>
                <button type="button" className="lm-btn sm" disabled={i === p.value.length - 1} onClick={() => p.onChange(swap(p.value, i, 1))} aria-label={x(p.c, 'down')}>
                  ↓
                </button>
                <button type="button" className="lm-btn sm gh" onClick={() => p.onChange(p.value.filter((v) => v !== id))}>
                  {x(p.c, 'remove')}
                </button>
              </span>
            ) : null}
          </li>
        ))}
      </ul>
      {!p.disabled && p.value.length < p.max ? (
        <>
          <input className="lm-inp" type="search" value={q} placeholder={x(p.c, 'products.search')} aria-label={x(p.c, 'products.search')} onChange={(e) => setQ(e.target.value)} />
          <ul className="ps-list ps-scroll">
            {found.map((r) => (
              <li key={r.id} className="ps-item">
                <span className="ps-name">{r.en}</span>
                <button type="button" className="lm-btn sm" onClick={() => p.onChange([...p.value, r.id])}>
                  {x(p.c, 'add')}
                </button>
              </li>
            ))}
            {!found.length ? <li className="lm-hint">{x(p.c, 'products.none')}</li> : null}
          </ul>
        </>
      ) : null}
    </div>
  );
}

// ---- the recursive field ----

interface FP {
  c: Ctx;
  /** Where this part is: `<key>/<name>/<name>` (no row numbers). */
  id: string;
  leaf: string;
  node: Node;
  value: unknown;
  onChange: (v: unknown) => void;
  /** Hide the part's own label (the parent already shows it). */
  bare?: boolean;
  /** The object this part sits in, for "only while" rules. */
  parent?: Obj;
}

const isPair = (n: Node): boolean => n.t === 'obj' && n.props.length === 2 && n.props[0]!.k === 'en' && n.props[1]!.k === 'bn' && n.props.every((q) => q.n.t === 'str');
const isToggleRow = (n: Node): boolean => n.t === 'obj' && n.props.length >= 2 && n.props[0]!.k === 'id' && n.props[0]!.n.t === 'enum' && n.props[1]!.k === 'on' && n.props[1]!.n.t === 'bool';

function Field(p: FP): ReactNode {
  const { c, id, node, value, onChange } = p;
  const disabled = !c.canEdit;
  const w = c.widgets[id];
  const lab = label(c, id, p.leaf);
  const hint = help(c, id);
  const dom = `${c.uid}-${id}`;
  const wrap = (body: ReactNode, wide = false) => (
    <div className={`lm-fl ps-f${wide ? ' ps-wide' : ''}`}>
      {p.bare ? null : <label htmlFor={dom}>{lab}</label>}
      {body}
      {hint ? <span className="lm-hint">{hint}</span> : null}
    </div>
  );

  // a part drawn by its own widget
  if (w) {
    const inner = node.t === 'nullable' ? node.of : node;
    switch (w.kind) {
      case 'media':
        return wrap(<MediaPick c={c} value={(value as string | null) ?? null} disabled={disabled} label={lab} onChange={(v) => onChange(v)} />, true);
      case 'products':
        return wrap(<ProductPick c={c} value={Array.isArray(value) ? (value as string[]) : []} disabled={disabled} max={inner.t === 'arr' ? (inner.max ?? 200) : 200} onChange={onChange} />, true);
      case 'collection':
        return wrap(
          <select id={dom} className="lm-inp" disabled={disabled} value={(value as string | null) ?? ''} onChange={(e) => onChange(e.target.value || null)}>
            <option value="">{x(c, 'none')}</option>
            {c.view.choices.collections.map((k) => (
              <option key={k.slug} value={k.slug}>
                {k.en}
              </option>
            ))}
          </select>,
        );
      case 'colour': {
        const hex = typeof value === 'string' ? value : '';
        return wrap(
          <div className="ps-colour">
            <input type="color" aria-label={lab} disabled={disabled} value={/^#[0-9a-f]{6}$/i.test(hex) ? hex : BLANK_COLOUR} onChange={(e) => onChange(e.target.value)} />
            <input id={dom} className="lm-inp" disabled={disabled} value={hex} maxLength={7} onChange={(e) => onChange(e.target.value)} />
            {node.t === 'nullable' && hex ? (
              <button type="button" className="lm-btn sm gh" disabled={disabled} onClick={() => onChange(null)}>
                {x(c, 'useShop')}
              </button>
            ) : null}
          </div>,
        );
      }
      case 'currency':
      case 'locale':
      case 'tz': {
        const list = w.kind === 'currency' ? c.view.lists.currencies : w.kind === 'locale' ? c.view.lists.locales : c.view.lists.timeZones;
        return wrap(
          <>
            <input id={dom} className="lm-inp" list={`${dom}-l`} disabled={disabled} value={String(value ?? '')} autoComplete="off" onChange={(e) => onChange(e.target.value.trim())} />
            <datalist id={`${dom}-l`}>
              {list.map((v) => (
                <option key={v} value={v} />
              ))}
            </datalist>
          </>,
        );
      }
      default:
        break;
    }
  }

  switch (node.t) {
    case 'bool':
      return (
        <div className="ps-f">
          <Switch on={value === true} label={lab} disabled={disabled} onChange={onChange} />
          {hint ? <span className="lm-hint">{hint}</span> : null}
        </div>
      );
    case 'int':
    case 'num':
      return wrap(<Num id={dom} value={typeof value === 'number' ? value : null} min={node.min} max={node.max} int={node.t === 'int'} disabled={disabled} label={lab} onChange={(v) => onChange(v ?? node.min ?? 0)} />);
    case 'enum':
      return wrap(
        <select id={dom} className="lm-inp" disabled={disabled} value={String(value ?? '')} onChange={(e) => onChange(e.target.value)}>
          {node.values.map((v) => (
            <option key={v} value={v}>
              {optLabel(c, id, v)}
            </option>
          ))}
        </select>,
      );
    case 'str': {
      if (node.fmt === 'date-time') return wrap(<input id={dom} className="lm-inp" type="datetime-local" disabled={disabled} value={toLocal(value)} onChange={(e) => onChange(fromLocal(e.target.value) ?? '')} />);
      if (node.fmt === 'date') return wrap(<input id={dom} className="lm-inp" type="date" disabled={disabled} value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} />);
      if ((node.max ?? 0) >= 150) return wrap(<textarea id={dom} className="lm-inp" rows={3} maxLength={node.max} disabled={disabled} value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} />, true);
      return wrap(<input id={dom} className="lm-inp" maxLength={node.max} disabled={disabled} value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} />);
    }
    case 'obj':
      return <ObjField {...p} node={node} />;
    case 'arr':
      return <ArrField {...p} node={node} />;
    case 'rec':
      return <RecField {...p} node={node} />;
    case 'words': {
      if (isObj(value) && 'key' in value)
        return wrap(
          <div className="ps-built">
            <span className="lm-hint">{x(c, 'words.builtIn')}</span>
            {!disabled ? (
              <button type="button" className="lm-btn sm" onClick={() => onChange(blank(node.own))}>
                {x(c, 'words.writeOwn')}
              </button>
            ) : null}
          </div>,
          true,
        );
      return <Field {...p} node={node.own} />;
    }
    case 'nullable': {
      const inner = node.of;
      if (inner.t === 'int' || inner.t === 'num') return wrap(<Num id={dom} value={typeof value === 'number' ? value : null} min={inner.min} max={inner.max} int={inner.t === 'int'} nullable disabled={disabled} label={lab} onChange={onChange} />);
      if (value === null || value === undefined) {
        if (inner.t === 'str') return <Field {...p} node={inner} value="" onChange={(v) => onChange(v === '' ? null : v)} />;
        return wrap(
          <div className="ps-built">
            <span className="lm-hint">{x(c, 'notSet')}</span>
            {!disabled ? (
              <button type="button" className="lm-btn sm" onClick={() => onChange(blank(inner))}>
                {x(c, 'setUp')}
              </button>
            ) : null}
          </div>,
          true,
        );
      }
      if (inner.t === 'str') return <Field {...p} node={inner} onChange={(v) => onChange(v === '' ? null : v)} />;
      return (
        <div className="ps-set">
          <Field {...p} node={inner} />
          {!disabled ? (
            <button type="button" className="lm-btn sm gh" onClick={() => onChange(null)}>
              {x(c, 'unset')}
            </button>
          ) : null}
        </div>
      );
    }
    case 'json':
      return wrap(<JsonBox c={c} value={value} disabled={disabled} label={lab} onChange={onChange} />, true);
  }
}

function ObjField(p: FP & { node: Extract<Node, { t: 'obj' }> }) {
  const { c, id, node, value, onChange } = p;
  const o = isObj(value) ? value : {};
  if (isPair(node)) {
    const lab = label(c, id, p.leaf);
    return (
      <div className="lm-fl ps-f ps-wide" role="group" aria-label={lab}>
        {p.bare || !id.includes('/') ? null : <span className="ps-cap">{lab}</span>}
        <div className="ps-pair">
          {(['en', 'bn'] as const).map((l) => (
            <div className="lm-fl" key={l}>
              <label htmlFor={`${c.uid}-${id}-${l}`}>{x(c, l === 'en' ? 'english' : 'bengali')}</label>
              <input id={`${c.uid}-${id}-${l}`} className="lm-inp" disabled={!c.canEdit} value={String(o[l] ?? '')} onChange={(e) => onChange({ ...o, [l]: e.target.value })} />
            </div>
          ))}
        </div>
        {help(c, id) ? <span className="lm-hint">{help(c, id)}</span> : null}
      </div>
    );
  }
  const shown = node.props.filter((q) => {
    const w = c.widgets[`${id}/${q.k}`];
    return !w?.showIf || String(o[w.showIf.sibling]) === w.showIf.eq;
  });
  const lab = label(c, id, p.leaf);
  return (
    <div className="ps-obj" role="group" aria-label={lab}>
      {p.bare || !p.id.includes('/') ? null : <span className="ps-cap">{lab}</span>}
      <div className="ps-grid">
        {shown.map((q) => (
          <Field key={q.k} c={c} id={`${id}/${q.k}`} leaf={q.k} node={q.n} value={o[q.k]} parent={o} onChange={(v) => onChange({ ...o, [q.k]: v })} />
        ))}
      </div>
    </div>
  );
}

function RowTools(p: { c: Ctx; i: number; n: number; onMove: (d: -1 | 1) => void; onRemove?: () => void }) {
  if (!p.c.canEdit) return null;
  return (
    <span className="ps-row-actions">
      <button type="button" className="lm-btn sm" disabled={p.i === 0} onClick={() => p.onMove(-1)} aria-label={x(p.c, 'up')}>
        ↑
      </button>
      <button type="button" className="lm-btn sm" disabled={p.i === p.n - 1} onClick={() => p.onMove(1)} aria-label={x(p.c, 'down')}>
        ↓
      </button>
      {p.onRemove ? (
        <button type="button" className="lm-btn sm gh" onClick={p.onRemove}>
          {x(p.c, 'remove')}
        </button>
      ) : null}
    </span>
  );
}

function ArrField(p: FP & { node: Extract<Node, { t: 'arr' }> }) {
  const { c, id, node, onChange } = p;
  const list = Array.isArray(p.value) ? (p.value as unknown[]) : [];
  const lab = label(c, id, p.leaf);
  const hint = help(c, id);
  const head = (
    <>
      {p.bare || !id.includes('/') ? null : <span className="ps-cap">{lab}</span>}
      {hint ? <span className="lm-hint">{hint}</span> : null}
    </>
  );
  // words, one per line
  if (node.item.t === 'str' && !node.item.fmt) {
    return (
      <div className="lm-fl ps-f ps-wide">
        {head}
        <LinesBox c={c} value={list as string[]} max={node.max} label={lab} onChange={onChange} />
      </div>
    );
  }
  // choices from a fixed list, in the owner's order
  if (node.item.t === 'enum') {
    const all = node.item.values;
    const chosen = list as string[];
    return (
      <div className="lm-fl ps-f ps-wide" role="group" aria-label={lab}>
        {head}
        <ul className="ps-list">
          {chosen.map((v, i) => (
            <li key={v} className="ps-item">
              <span className="ps-name">{optLabel(c, id, v)}</span>
              <span className="ps-row-actions">
                <RowTools c={c} i={i} n={chosen.length} onMove={(d) => onChange(swap(chosen, i, d))} onRemove={chosen.length > (node.min ?? 0) ? () => onChange(chosen.filter((q) => q !== v)) : undefined} />
              </span>
            </li>
          ))}
          {all
            .filter((v) => !chosen.includes(v))
            .map((v) => (
              <li key={v} className="ps-item ps-off">
                <span className="ps-name">{optLabel(c, id, v)}</span>
                {c.canEdit && (node.max === undefined || chosen.length < node.max) ? (
                  <button type="button" className="lm-btn sm" onClick={() => onChange([...chosen, v])}>
                    {x(c, 'add')}
                  </button>
                ) : null}
              </li>
            ))}
        </ul>
      </div>
    );
  }
  // a fixed list of parts with a switch each (id + on): re-ordered, switched, never added or taken out
  if (isToggleRow(node.item)) {
    const item = node.item as Extract<Node, { t: 'obj' }>;
    const rest = item.props.slice(2);
    return (
      <div className="lm-fl ps-f ps-wide" role="group" aria-label={lab}>
        {head}
        <ul className="ps-list">
          {list.map((r, i) => {
            const row = isObj(r) ? r : {};
            const name = optLabel(c, id, String(row.id));
            return (
              <li key={String(row.id)} className={`ps-item${row.on ? '' : ' ps-off'}`}>
                <Switch on={row.on === true} label={name} disabled={!c.canEdit} onChange={(on) => onChange(list.map((q, j) => (j === i ? { ...row, on } : q)))} />
                {rest.map((q) => (
                  <Field key={q.k} c={c} id={`${id}/${q.k}`} leaf={q.k} node={q.n} value={row[q.k]} onChange={(v) => onChange(list.map((z, j) => (j === i ? { ...row, [q.k]: v } : z)))} />
                ))}
                <RowTools c={c} i={i} n={list.length} onMove={(d) => onChange(swap(list, i, d))} />
              </li>
            );
          })}
        </ul>
      </div>
    );
  }
  // rows the owner adds, moves and takes out
  return (
    <div className="lm-fl ps-f ps-wide" role="group" aria-label={lab}>
      {head}
      <ul className="ps-list">
        {list.map((r, i) => (
          <li key={i} className="ps-item ps-rowbox">
            <div className="ps-rowbody">
              <Field c={c} id={id} leaf={p.leaf} node={node.item} value={r} bare onChange={(v) => onChange(list.map((q, j) => (j === i ? v : q)))} />
            </div>
            <RowTools c={c} i={i} n={list.length} onMove={(d) => onChange(swap(list, i, d))} onRemove={() => onChange(list.filter((_, j) => j !== i))} />
          </li>
        ))}
      </ul>
      {c.canEdit && (node.max === undefined || list.length < node.max) ? (
        <button type="button" className="lm-btn sm ps-add" onClick={() => onChange([...list, freshRow(node.item)])}>
          {x(c, 'addRow')}
        </button>
      ) : null}
    </div>
  );
}

/** One word or phrase per line (a line the owner leaves empty is dropped). */
function LinesBox(p: { c: Ctx; value: string[]; max?: number; label: string; onChange: (v: string[]) => void }) {
  const [text, setText] = useState(() => p.value.join('\n'));
  return (
    <>
      <textarea
        className="lm-inp"
        rows={Math.min(10, Math.max(3, p.value.length + 1))}
        aria-label={p.label}
        disabled={!p.c.canEdit}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          p.onChange(e.target.value.split('\n').map((s) => s.trim()).filter(Boolean));
        }}
      />
      <span className="lm-hint">{x(p.c, 'lines.hint')}</span>
    </>
  );
}

function RecField(p: FP & { node: Extract<Node, { t: 'rec' }> }) {
  const { c, id, node, onChange } = p;
  const o = isObj(p.value) ? p.value : {};
  const names = Object.keys(o);
  const [fresh, setFresh] = useState('');
  const lab = label(c, id, p.leaf);
  return (
    <div className="lm-fl ps-f ps-wide" role="group" aria-label={lab}>
      {p.bare || !id.includes('/') ? null : <span className="ps-cap">{lab}</span>}
      {help(c, id) ? <span className="lm-hint">{help(c, id)}</span> : null}
      <ul className="ps-list">
        {names.map((k) => (
          <li key={k} className="ps-item ps-rowbox">
            <span className="ps-name">{k}</span>
            <div className="ps-rowbody">
              <Field c={c} id={id} leaf={p.leaf} node={node.item} value={o[k]} bare onChange={(v) => onChange({ ...o, [k]: v })} />
            </div>
            {c.canEdit ? (
              <button
                type="button"
                className="lm-btn sm gh"
                onClick={() => {
                  const { [k]: _gone, ...rest } = o;
                  void _gone;
                  onChange(rest);
                }}
              >
                {x(c, 'remove')}
              </button>
            ) : null}
          </li>
        ))}
      </ul>
      {c.canEdit ? (
        <div className="ps-addrec">
          <input className="lm-inp" value={fresh} placeholder={x(c, 'rec.name')} aria-label={x(c, 'rec.name')} onChange={(e) => setFresh(e.target.value)} />
          <button
            type="button"
            className="lm-btn sm"
            disabled={!fresh.trim() || fresh.trim() in o}
            onClick={() => {
              onChange({ ...o, [fresh.trim()]: blank(node.item) });
              setFresh('');
            }}
          >
            {x(c, 'addRow')}
          </button>
        </div>
      ) : null}
    </div>
  );
}

// ---- the screen ----

export function PageSettingsEditor(p: {
  screen: string;
  view: PageSettingsView;
  widgets: Readonly<Record<string, Widget>>;
  texts: Texts;
  canEdit: boolean;
  openHref: string | null;
}) {
  const router = useRouter();
  const uid = useId();
  const c: Ctx = { texts: p.texts, widgets: p.widgets, view: p.view, canEdit: p.canEdit, uid };
  const fieldsOf = (): FieldView[] => p.view.sections.flatMap((s) => s.fields);
  const start = useMemo(() => Object.fromEntries(fieldsOf().map((f) => [f.key, f.value])), [p.view]); // eslint-disable-line react-hooks/exhaustive-deps
  const [values, setValues] = useState<Record<string, unknown>>(start);
  const [busy, setBusy] = useState(false);
  const [gen, setGen] = useState(0);
  const [issues, setIssues] = useState<string[]>([]);
  const dirty = !sameValue(values, start);

  const save = async () => {
    setBusy(true);
    setIssues([]);
    try {
      const res = await fetch(`${API}?screen=${encodeURIComponent(p.screen)}`, { method: 'PUT', credentials: 'same-origin', cache: 'no-store', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ values, version: p.view.version }) });
      const data = (await res.json().catch(() => ({ ok: false }))) as { ok?: boolean; error?: string; details?: string[] };
      if (data.ok) {
        showToast({ text: x(c, 'saved'), tone: 'ok' });
        router.refresh();
      } else {
        const code = data.error ?? (res.status === 403 ? 'forbidden' : 'other');
        if (data.details?.length) setIssues(data.details);
        const text = p.texts[`ui.err.${code}`] ?? x(c, 'err.other');
        showToast({ text, tone: 'bad' });
      }
    } catch {
      showToast({ text: x(c, 'err.network'), tone: 'bad' });
    }
    setBusy(false);
  };

  const section = (s: PageSettingsView['sections'][number]) => {
    const single = s.fields.length === 1 ? s.fields[0]! : null;
    return (
      <section key={s.id} className="lm-card ps-card" aria-labelledby={`${uid}-s-${s.id}`} data-testid={`ps-sec-${s.id}`}>
        <h2 id={`${uid}-s-${s.id}`}>{p.texts[`sec.${s.id}.title`] ?? humanise(s.id)}</h2>
        {p.texts[`sec.${s.id}.help`] ? <p className="lm-sub">{p.texts[`sec.${s.id}.help`]}</p> : null}
        <div className="ps-body">
          {s.fields.map((f) => (
            <div key={f.key} className="ps-key" data-testid={`ps-key-${f.key}`}>
              {!single && isComposite(f.node) ? <h3 className="ps-key-t">{label(c, f.key, f.key.split('.').pop() ?? f.key)}</h3> : null}
              <Field c={c} id={f.key} leaf={f.key.split('.').pop() ?? f.key} node={f.node} value={values[f.key]} bare={isComposite(f.node)} onChange={(v) => setValues((cur) => ({ ...cur, [f.key]: v }))} />
            </div>
          ))}
        </div>
        {p.canEdit ? (
          <button type="button" className="lm-btn gh sm ps-reset" onClick={() => setValues((cur) => ({ ...cur, ...Object.fromEntries(s.fields.map((f) => [f.key, f.def])) }))}>
            {x(c, 'resetSection')}
          </button>
        ) : null}
      </section>
    );
  };

  const main = p.view.sections.filter((s) => !s.more);
  const more = p.view.sections.filter((s) => s.more);
  return (
    <div className="ps" data-testid="ps-editor">
      {p.openHref ? (
        <p>
          <a className="lm-btn sm" href={p.openHref} target="_blank" rel="noopener">
            {x(c, 'open')}
          </a>
        </p>
      ) : null}
      {p.view.preview ? (
        <section className="lm-card ps-card" data-testid="ps-preview">
          <h2>{x(c, 'preview')}</h2>
          <iframe title={x(c, 'preview')} className="ps-frame" sandbox="" srcDoc={p.view.preview} />
          <p className="lm-hint">{x(c, 'previewHint')}</p>
        </section>
      ) : null}
      <div key={gen} className="ps-sections">
        {main.map(section)}
        {more.length ? (
          <details className="a2-more-opts ps-more" data-testid="ps-more">
            <summary>{x(c, 'more')}</summary>
            <div className="ps-more-in">{more.map(section)}</div>
          </details>
        ) : null}
      </div>
      {issues.length ? (
        <div className="lm-ask" role="alert" data-testid="ps-issues">
          <p>{x(c, 'issues')}</p>
          <ul>
            {issues.map((i) => (
              <li key={i}>{i}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {p.canEdit && (dirty || busy) ? (
        <div className="ps-save">
          <p className="lm-hint" role="status">
            {x(c, 'unsaved')}
          </p>
          <div className="ps-bar">
            <button type="button" className="lm-btn pri" disabled={busy || !dirty} onClick={() => void save()} data-testid="ps-save">
              {busy ? x(c, 'saving') : x(c, 'save')}
            </button>
            <button
              type="button"
              className="lm-btn"
              disabled={busy}
              onClick={() => {
                setValues(start);
                setIssues([]);
                setGen((g) => g + 1);
              }}
            >
              {x(c, 'discard')}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
