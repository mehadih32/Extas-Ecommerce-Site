'use client';
// S10 · PR 209, 217 — the Smart Rules screen (demo #/admin/rules): the conflict banner with "Fix everywhere", the
// topic chips with counts, the rule cards (topic, status, "Unsaved changes", the filled-in short version, Applies to /
// Except / Shown on, "vN · edited") and the editor — beside the list on a desktop, opening under the tapped card on a
// phone, as in the demo. Changes stay in the browser until "Save draft" or "Publish"; publishing saves the draft first.
// A change that moves money is refused by the server without the owner's OK (rules.approve) and then stays a draft.
import { useRouter } from 'next/navigation';
import { useMemo, useState, type ReactNode } from 'react';
import type { ConflictView, PublishResult, RulePreview, RuleView } from '@extas/rules';
import { RULE_KINDS, type RuleContent, type Target } from '@extas/rules/pure';
import { call, type Answer } from '../api';
import { Icon } from '../Icon';
import { useToast } from '../products/useToast';
import { t, type Dict } from '@/lib/i18n';
import { RuleEditor, type Perms } from './RuleEditor';
import { CouponsSheet, HistorySheet, NewRuleSheet, PreviewSheet, RULES_API, ScopeSheet, SimulateSheet, type TemplateItem } from './RuleSheets';
import { clashCounts, conflictText, liveText, nameIn, rulesRefusal, sameContent, targetName, when, type Lang, type PlaceOption, type RulesEnv, type ScopeOption } from './model';

export interface RulesScreenProps {
  dict: Dict;
  lang: Lang;
  locale: string;
  timeZone: string;
  env: RulesEnv;
  /** Every rule of the store (archived ones too), in the list's order. */
  views: RuleView[];
  conflicts: ConflictView[];
  templates: TemplateItem[];
  places: PlaceOption[];
  scopes: ScopeOption[];
  products: Record<string, { nameEn: string; nameBn: string | null }>;
  notices: Record<string, string>;
  perms: Perms;
  aiEnabled: boolean;
  simDays: number;
  /** The Rules pages' tabs (desktop), drawn under the head. */
  tabs?: ReactNode;
}

type SheetState =
  | { type: 'new' }
  | { type: 'scope'; id: string; list: 'include' | 'exclude' }
  | { type: 'preview'; id: string; data: RulePreview | null; error: string }
  | { type: 'history'; id: string }
  | { type: 'simulate'; id: string }
  | { type: 'coupons'; id: string }
  | null;

const shownOf = (v: RuleView): RuleContent | null => v.draft ?? v.live;

export function RulesScreen(props: RulesScreenProps) {
  const { dict: d, lang, env, locale, timeZone, perms } = props;
  const tt = (k: string, vars?: Record<string, string | number>) => t(d, `rules.${k}`, vars);
  const router = useRouter();
  const [views, setViews] = useState(props.views);
  const [conflicts, setConflicts] = useState(props.conflicts);
  // A refresh of the page (router.refresh) brings new props: take them, keeping what is typed in (`edits`).
  const [fromServer, setFromServer] = useState({ views: props.views, conflicts: props.conflicts });
  if (fromServer.views !== props.views || fromServer.conflicts !== props.conflicts) {
    setFromServer({ views: props.views, conflicts: props.conflicts });
    setViews(props.views);
    setConflicts(props.conflicts);
  }
  const [edits, setEdits] = useState<Record<string, RuleContent>>({});
  const [topic, setTopic] = useState<string>('all');
  const [archivedOn, setArchivedOn] = useState(false);
  const [sel, setSel] = useState<string | null>(props.views.find((v) => !v.archived)?.id ?? null);
  const [selM, setSelM] = useState<string | null>(null);
  const [textLang, setTextLang] = useState<Lang>(lang);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ id: string; version: number } | null>(null);
  const [sheet, setSheet] = useState<SheetState>(null);
  const [toast, say] = useToast();

  const byId = useMemo(() => new Map(views.map((v) => [v.id, v])), [views]);
  const visible = views.filter((v) => v.archived === archivedOn);
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const v of visible) m.set(v.kind, (m.get(v.kind) ?? 0) + 1);
    return m;
  }, [visible]);
  const shown = visible.filter((v) => topic === 'all' || v.kind === topic);
  const clashes = useMemo(() => clashCounts(conflicts), [conflicts]);
  const keys = useMemo(() => new Set(views.map((v) => v.key)), [views]);

  const cand = (id: string): RuleContent | null => edits[id] ?? (byId.get(id) ? shownOf(byId.get(id)!) : null);
  const dirty = (id: string) => {
    const e = edits[id];
    const v = byId.get(id);
    return !!e && !!v && !sameContent(e, shownOf(v));
  };
  const nameOf = (id: string) => {
    const c = cand(id);
    return c ? nameIn(c, lang) : '';
  };
  const putView = (v: RuleView) => setViews((list) => (list.some((x) => x.id === v.id) ? list.map((x) => (x.id === v.id ? v : x)) : [v, ...list]));
  const dropEdit = (id: string) =>
    setEdits((e) => {
      const { [id]: _gone, ...rest } = e;
      return rest;
    });
  const fail = (a: Answer) => say(rulesRefusal(d, a.data.error, a.data.details ?? []));
  const reloadConflicts = async () => {
    const a = await call('GET', `${RULES_API}/conflicts`);
    if (a.status === 200 && Array.isArray(a.data.conflicts)) setConflicts(a.data.conflicts as ConflictView[]);
  };

  // ---------------------------------------------------------------- actions
  const change = (id: string, next: RuleContent) => {
    setEdits((e) => ({ ...e, [id]: next }));
    if (done?.id === id) setDone(null);
  };

  const saveDraft = async (id: string, quiet = false): Promise<RuleView | null> => {
    const v = byId.get(id);
    const c = edits[id];
    if (!v || !c) return v ?? null;
    const a = await call('PUT', `${RULES_API}/${id}/draft`, { content: c, version: v.version });
    if (a.status !== 200 || !a.data.rule) {
      fail(a);
      return null;
    }
    const nv = a.data.rule as RuleView;
    putView(nv);
    dropEdit(id);
    if (!quiet) say(tt('editor.saved'));
    return nv;
  };

  const publish = async (id: string) => {
    const v0 = byId.get(id);
    if (!v0) return;
    setBusy(true);
    let v: RuleView | null = v0;
    if (dirty(id)) v = await saveDraft(id, true);
    if (!v) return setBusy(false);
    const a = await call('POST', `${RULES_API}/${id}/publish`, { version: v.version });
    setBusy(false);
    if (sheet?.type === 'preview') setSheet(null);
    if (a.status !== 200 || !a.data.rule) {
      if (a.data.error === 'OWNER_OK_REQUIRED') return say(tt('editor.ownerOkWait'));
      return fail(a);
    }
    const r = a.data as unknown as PublishResult;
    putView(r.rule);
    setDone({ id, version: r.rule.version });
    say(tt('editor.published', { version: r.rule.version }));
    if (r.conflicts > 0 || conflicts.length) void reloadConflicts();
  };

  const preview = async (id: string) => {
    const c = cand(id);
    setSheet({ type: 'preview', id, data: null, error: '' });
    const a = await call('POST', `${RULES_API}/${id}/preview`, dirty(id) && c ? { content: c } : {});
    if (a.status === 200 && a.data.preview) setSheet({ type: 'preview', id, data: a.data.preview as RulePreview, error: '' });
    else setSheet({ type: 'preview', id, data: null, error: rulesRefusal(d, a.data.error, a.data.details ?? []) });
  };

  const throwDraft = async (id: string) => {
    setBusy(true);
    const a = await call('POST', `${RULES_API}/${id}/discard`);
    setBusy(false);
    if (a.status !== 200 || !a.data.rule) return fail(a);
    putView(a.data.rule as RuleView);
    dropEdit(id);
    say(tt('editor.draftThrown'));
  };

  const archive = async (id: string, archived: boolean) => {
    setBusy(true);
    const a = await call('POST', `${RULES_API}/${id}/archive`, { archived });
    setBusy(false);
    if (a.status !== 200 || !a.data.rule) return fail(a);
    putView((a.data as unknown as PublishResult).rule);
    dropEdit(id);
    say(tt(archived ? 'editor.archived' : 'editor.restored'));
    if (archived === !archivedOn) setSel(null);
  };

  const addStarters = async () => {
    setBusy(true);
    const a = await call('POST', `${RULES_API}/starters`);
    setBusy(false);
    if (a.status !== 200) return fail(a);
    say(tt('empty.startersDone', { n: Array.isArray(a.data.created) ? a.data.created.length : 0 }));
    router.refresh();
  };

  const fixAll = async () => {
    setBusy(true);
    const a = await call('POST', `${RULES_API}/conflicts`, { action: 'fixAll' });
    setBusy(false);
    if (a.status !== 200) return fail(a);
    const fixed = (a.data.result as { fixed?: number } | undefined)?.fixed ?? 0;
    if (Array.isArray(a.data.conflicts)) setConflicts(a.data.conflicts as ConflictView[]);
    say(tt('conflicts.fixed', { n: fixed }));
    router.refresh();
  };

  const resolve = async (c: ConflictView, resolution: 'keep-order' | 'acknowledged') => {
    setBusy(true);
    const a = await call('POST', `${RULES_API}/conflicts/${c.id}`, { action: 'resolve', resolution });
    setBusy(false);
    if (a.status !== 200) return fail(a);
    setConflicts((list) => list.filter((x) => x.id !== c.id));
    say(tt('conflicts.resolved'));
  };

  const pickScope = (id: string, list: 'include' | 'exclude', target: Target) => {
    const c = cand(id);
    if (!c) return;
    const cur = c.scope[list];
    const next = list === 'include' && target.type !== 'all' ? [...cur.filter((x) => x.type !== 'all'), target] : target.type === 'all' ? [target] : [...cur, target];
    change(id, { ...c, scope: { ...c.scope, [list]: next } });
    setSheet(null);
  };

  const select = (id: string) => {
    setSel(id);
    setSelM((m) => (m === id ? null : id));
    if (done?.id !== id) setDone(null);
    if (typeof window !== 'undefined' && window.innerWidth < 1024) {
      requestAnimationFrame(() => document.getElementById(`rl-card-${id}`)?.scrollIntoView({ block: 'start', behavior: 'smooth' }));
    }
  };

  // ---------------------------------------------------------------- pieces
  const editorFor = (id: string, sfx: 'd' | 'm') => {
    const v = byId.get(id);
    const c = cand(id);
    if (!v) return null;
    if (!c) {
      return (
        <div className={`rl-ed rl-ed-${sfx}`}>
          <div className="ad-note warn">{tt('editor.brokenNote')}</div>
          <div className="rl-actions">
            <button type="button" className="rl-link" onClick={() => setSheet({ type: 'history', id })}>
              <Icon name="clock" size={14} />
              {tt('editor.history')}
            </button>
          </div>
        </div>
      );
    }
    return (
      <RuleEditor
        d={d}
        lang={lang}
        env={env}
        locale={locale}
        timeZone={timeZone}
        view={v}
        cand={c}
        dirty={dirty(id)}
        sfx={sfx}
        places={props.places}
        scopes={props.scopes}
        products={props.products}
        perms={perms}
        aiEnabled={props.aiEnabled}
        busy={busy}
        textLang={textLang}
        done={done?.id === id ? done.version : null}
        setTextLang={setTextLang}
        onChange={(next) => change(id, next)}
        onAddScope={(list) => setSheet({ type: 'scope', id, list })}
        onPreview={() => void preview(id)}
        onSave={() => void saveDraft(id)}
        onPublish={() => void publish(id)}
        onDiscard={() => {
          dropEdit(id);
          say(tt('editor.discarded'));
        }}
        onThrowDraft={() => void throwDraft(id)}
        onHistory={() => setSheet({ type: 'history', id })}
        onSimulate={() => setSheet({ type: 'simulate', id })}
        onCoupons={() => setSheet({ type: 'coupons', id })}
        onArchive={(a) => void archive(id, a)}
      />
    );
  };

  const placeLabel = (k: string) => {
    const p = props.places.find((x) => x.key === k);
    return p ? (lang === 'bn' ? p.bn : p.en) : k;
  };

  const card = (v: RuleView) => {
    const c = cand(v.id);
    const on = sel === v.id;
    const isDirty = dirty(v.id);
    const short = c ? liveText(c, 'short', lang, env) : null;
    const status = v.live?.status ?? 'DRAFT';
    const pills = (label: string, items: string[], cls = '') =>
      items.length ? (
        <span className="rl-mini">
          <span className="k">{label}</span>
          {items.map((x, i) => (
            <span key={`${x}-${i}`} className={`rl-pill${cls}`}>
              {x}
            </span>
          ))}
        </span>
      ) : null;
    const scopeNames = (list: 'include' | 'exclude') => (c ? c.scope[list].map((x) => targetName(x, props.scopes, props.products, d, lang)) : []);
    const n = clashes.get(v.id) ?? 0;
    return (
      <div key={v.id} className={`rl-card${on ? ' on' : ''}`} id={`rl-card-${v.id}`}>
        <button type="button" className="rl-cardbtn" aria-expanded={selM === v.id} onClick={() => select(v.id)}>
          <span className="rl-tags">
            <span className="rl-tag plain">{tt(`kinds.${v.kind}`)}</span>
            {v.archived ? <span className="rl-tag plain">{tt('status.archived')}</span> : <span className={`rl-tag${status === 'ACTIVE' ? '' : ' warn'}`}>{tt(`status.${status}`)}</span>}
            {status === 'ACTIVE' && !v.liveNow && !v.archived ? <span className="rl-tag warn">{tt('tags.outsideWindow')}</span> : null}
            {isDirty ? <span className="rl-tag gold">{tt('tags.unsaved')}</span> : v.draft ? <span className="rl-tag gold">{tt('tags.draftSaved')}</span> : null}
            {v.needsOwnerOk && !v.approvedAt ? <span className="rl-tag gold">{tt('tags.ownerOk')}</span> : null}
            {n ? <span className="rl-tag warn">{`${tt('tags.clashes')} · ${n}`}</span> : null}
            {!c ? <span className="rl-tag warn">{tt('tags.broken')}</span> : null}
          </span>
          <span className="rl-h3">{c ? nameIn(c, lang) : v.key}</span>
          <span className="rl-short">{short?.text ?? tt('card.noShort')}</span>
          {pills(tt('card.appliesTo'), scopeNames('include'))}
          {pills(tt('card.except'), scopeNames('exclude'), ' x')}
          {pills(tt('card.shownOn'), (c?.placements ?? []).map(placeLabel))}
          <span className="rl-meta">{tt('card.edited', { version: v.version, date: when(v.updatedAt, locale, timeZone) })}</span>
        </button>
        {selM === v.id ? <div className="rl-phone">{editorFor(v.id, 'm')}</div> : null}
      </div>
    );
  };

  // ---------------------------------------------------------------- the page
  const first = conflicts[0];
  const fixable = conflicts.some((c) => c.fixable);
  const selInView = sel && shown.some((v) => v.id === sel) ? sel : (shown[0]?.id ?? null);
  const sheetView = sheet && sheet.type !== 'new' ? byId.get(sheet.id) : undefined;
  const sheetCand = sheet && sheet.type !== 'new' ? cand(sheet.id) : null;

  return (
    <div className="rl">
      <div className="ad-hd rl-hd">
        <div className="rl-hd-text">
          <h1 className="ad-h1">{tt('title')}</h1>
          <p className="ad-intro">{tt('intro')}</p>
        </div>
        {perms.write ? (
          <button type="button" className="ad-btn ad-btn-primary ad-btn-sm" onClick={() => setSheet({ type: 'new' })}>
            <Icon name="plus" size={15} />
            {tt('newRule.title')}
          </button>
        ) : null}
      </div>

      {props.tabs}

      {first ? (
        <div className="rl-conflict" role="status">
          <div className="rl-conflict-t">
            <Icon name="info" size={18} />
            <div className="rl-small">
              <b>{tt('conflicts.title')}</b>
              <div className="rl-mt2">
                {conflictText(d, first, lang, env, props.notices)}
                {conflicts.length > 1 ? ` ${tt('conflicts.more', { n: conflicts.length - 1 })}` : ''}
              </div>
            </div>
          </div>
          {perms.publish ? (
            <div className="rl-conflict-acts">
              {fixable ? (
                <button type="button" className="ad-btn ad-btn-sm rl-btn-dark" onClick={() => void fixAll()} disabled={busy}>
                  {tt('conflicts.fix')}
                </button>
              ) : null}
              {first.kind === 'SAME_SLOT' || first.kind === 'STACKING' ? (
                <button type="button" className="ad-btn ad-btn-ghost ad-btn-sm" onClick={() => void resolve(first, 'keep-order')} disabled={busy}>
                  {tt('conflicts.keep')}
                </button>
              ) : !first.fixable ? (
                <button type="button" className="ad-btn ad-btn-ghost ad-btn-sm" onClick={() => void resolve(first, 'acknowledged')} disabled={busy}>
                  {tt('conflicts.seen')}
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="rl-topics" role="group" aria-label={tt('topics')}>
        <button type="button" className="ad-chip" aria-pressed={topic === 'all'} onClick={() => setTopic('all')}>
          {tt('all')} <span className="rl-n">{visible.length}</span>
        </button>
        {RULE_KINDS.filter((k) => counts.get(k)).map((k) => (
          <button key={k} type="button" className="ad-chip" aria-pressed={topic === k} onClick={() => setTopic(k)}>
            {tt(`kinds.${k}`)} <span className="rl-n">{counts.get(k)}</span>
          </button>
        ))}
        {views.some((v) => v.archived) ? (
          <button
            type="button"
            className="ad-chip rl-chip-quiet"
            aria-pressed={archivedOn}
            onClick={() => {
              setArchivedOn((x) => !x);
              setTopic('all');
              setSelM(null);
            }}
          >
            {archivedOn ? tt('hideArchived') : tt('showArchived')}
          </button>
        ) : null}
      </div>

      {views.length === 0 ? (
        <div className="ad-card rl-empty">
          <p>{tt('empty.none')}</p>
          {perms.write ? (
            <button type="button" className="ad-btn ad-btn-primary ad-btn-sm" onClick={() => void addStarters()} disabled={busy}>
              {tt('empty.starters')}
            </button>
          ) : null}
        </div>
      ) : (
        <div className="rl-grid">
          <div className="rl-list">{shown.length ? shown.map(card) : <div className="ad-card rl-empty">{tt('empty.topic')}</div>}</div>
          <div className="rl-desk">{selInView ? editorFor(selInView, 'd') : <div className="ad-card rl-empty">{tt('empty.pick')}</div>}</div>
        </div>
      )}

      {sheet?.type === 'new' ? (
        <NewRuleSheet
          d={d}
          lang={lang}
          env={env}
          templates={props.templates}
          keys={keys}
          onClose={() => setSheet(null)}
          onCreated={(v) => {
            putView(v);
            setSheet(null);
            setArchivedOn(false);
            setTopic('all');
            setSel(v.id);
            setSelM(v.id);
            say(tt('newRule.created'));
          }}
        />
      ) : null}
      {sheet?.type === 'scope' && sheetCand ? <ScopeSheet d={d} lang={lang} list={sheet.list} cand={sheetCand} scopes={props.scopes} onClose={() => setSheet(null)} onPick={(x) => pickScope(sheet.id, sheet.list, x)} /> : null}
      {sheet?.type === 'preview' ? <PreviewSheet d={d} lang={lang} env={env} name={nameOf(sheet.id)} params={sheetCand?.params ?? []} preview={sheet.data} error={sheet.error} perms={perms} busy={busy} onClose={() => setSheet(null)} onPublish={() => void publish(sheet.id)} /> : null}
      {sheet?.type === 'history' && sheetView ? (
        <HistorySheet
          d={d}
          lang={lang}
          env={env}
          locale={locale}
          timeZone={timeZone}
          view={sheetView}
          name={nameOf(sheet.id) || sheetView.key}
          perms={perms}
          onClose={() => setSheet(null)}
          onRestored={(v, version) => {
            putView(v);
            dropEdit(v.id);
            setSheet(null);
            say(tt('history.broughtBack', { version }));
          }}
        />
      ) : null}
      {sheet?.type === 'simulate' && sheetView && sheetCand ? <SimulateSheet d={d} lang={lang} env={env} view={sheetView} name={nameOf(sheet.id)} cand={sheetCand} dirty={dirty(sheet.id)} defaultDays={props.simDays} onClose={() => setSheet(null)} /> : null}
      {sheet?.type === 'coupons' && sheetView ? <CouponsSheet d={d} lang={lang} view={sheetView} name={nameOf(sheet.id)} perms={perms} onClose={() => setSheet(null)} /> : null}

      <div className="ad-toast-slot" aria-live="polite" role="status">
        {toast ? <div className="ad-toast">{toast}</div> : null}
      </div>
    </div>
  );
}
