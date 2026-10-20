'use client';
// S10 · PR 209, 215 — the rule editor of the Smart Rules screen (demo #/admin/rules, rl_editor): the status, the AI
// helper note, the short version with its live "Customers see:" line and its counter, the full rule with its
// {placeholder} lines, the values (Settings), when it runs, what it does, Applies to / Except, Shown on, what still
// stops it going live, and the buttons. Everything typed here is a candidate in the browser until "Save draft" or
// "Publish"; the live preview uses the same code as the storefront (@extas/rules/pure), so what it shows is exact.
import type { RuleView } from '@extas/rules';
import { actionParamNeeds, KIND_SPECS, needsOwnerOk, type Param, type RuleContent, type TextSlot } from '@extas/rules/pure';
import { Icon } from '../Icon';
import { t, type Dict } from '@/lib/i18n';
import {
  isoToLocalInput,
  issuesOf,
  issueText,
  liveText,
  localInputToIso,
  moneyFromInput,
  moneyToInput,
  nameIn,
  numberFromInput,
  offStatus,
  targetKey,
  targetName,
  tokenLines,
  when,
  withParam,
  withText,
  type Lang,
  type PlaceOption,
  type RulesEnv,
  type ScopeOption,
} from './model';

export interface Perms {
  write: boolean;
  publish: boolean;
  approve: boolean;
}

export interface EditorProps {
  d: Dict;
  lang: Lang;
  env: RulesEnv;
  locale: string;
  timeZone: string;
  view: RuleView;
  cand: RuleContent;
  dirty: boolean;
  /** `d` desktop column, `m` inline under the card on the phone (ids stay unique). */
  sfx: 'd' | 'm';
  places: readonly PlaceOption[];
  scopes: readonly ScopeOption[];
  products: Record<string, { nameEn: string; nameBn: string | null }>;
  perms: Perms;
  aiEnabled: boolean;
  busy: boolean;
  textLang: Lang;
  /** The version just published from here (the "Published vN" line). */
  done: number | null;
  setTextLang(l: Lang): void;
  onChange(next: RuleContent): void;
  onAddScope(list: 'include' | 'exclude'): void;
  onPreview(): void;
  onSave(): void;
  onPublish(): void;
  onDiscard(): void;
  onThrowDraft(): void;
  onHistory(): void;
  onSimulate(): void;
  onCoupons(): void;
  onArchive(archived: boolean): void;
}

const EXTRA_SLOTS: readonly TextSlot[] = ['progress', 'unlocked', 'after', 'badge'];
const NUMBER_TYPES = new Set<Param['type']>(['int', 'percent', 'hours']);

/** The param keys the actions use (they move money or set the window), for the order of the Settings list. */
const usedByActions = (r: RuleContent) => new Set(r.actions.flatMap((a) => actionParamNeeds(a).map((n) => n.param)));

export function RuleEditor(p: EditorProps) {
  const { d, lang, env, view, cand, sfx, textLang } = p;
  const tt = (k: string, vars?: Record<string, string | number>) => t(d, `rules.${k}`, vars);
  const idp = `rl-${sfx}-${view.id}`;
  const archived = view.archived;
  const broken = view.live === null && view.draft === null;
  const canEdit = p.perms.write && !archived && !broken;
  const short = liveText(cand, 'short', textLang, env);
  const full = liveText(cand, 'full', textLang, env);
  const shortLen = short?.length ?? 0;
  const max = env.limits.shortMaxChars;
  const tokens = tokenLines(cand, textLang, env);
  const issues = issuesOf(cand, env);
  const blocking = issues.filter((i) => i.blocking);
  const warnings = issues.filter((i) => !i.blocking);
  const money = needsOwnerOk(cand) || (view.live ? needsOwnerOk(view.live) : false);
  const slots = KIND_SPECS[cand.kind].slots.filter((s) => EXTRA_SLOTS.includes(s));
  const used = usedByActions(cand);
  const params = [...cand.params].sort((a, b) => Number(used.has(b.key)) - Number(used.has(a.key)));
  const coupons = cand.actions.some((a) => a.type === 'discount' && a.requiresCoupon);
  const hasDiscount = cand.actions.some((a) => a.type === 'discount' || a.type === 'setTier');
  const textOf = (slot: TextSlot) => (textLang === 'en' ? (cand.text[slot]?.en ?? '') : (cand.text[slot]?.bn ?? ''));
  const set = (next: RuleContent) => {
    if (canEdit) p.onChange(next);
  };
  const placeName = (x: PlaceOption) => (lang === 'bn' ? x.bn : x.en);
  const nothingToPublish = !p.dirty && view.draft === null;

  const paramInput = (q: Param) => {
    const id = `${idp}-p-${q.key}`;
    const label = lang === 'bn' && q.labelBn ? q.labelBn : q.labelEn;
    const unset = q.value === null || q.value === undefined;
    const hint = unset ? tt('editor.notSet') : '';
    const inShort = (cand.text.short?.en ?? '').includes(`{${q.key}}`) || (cand.text.short?.bn ?? '').includes(`{${q.key}}`);
    let input;
    if (q.type === 'money') {
      input = (
        <input id={id} className="ad-input rl-num" type="number" inputMode="decimal" min={0} step="any" value={moneyToInput(q.value, env.ctx.currency)} placeholder={hint} onChange={(e) => { const v = moneyFromInput(e.target.value, env.ctx.currency); if (!Number.isNaN(v)) set(withParam(cand, q.key, v)); }} />
      );
    } else if (NUMBER_TYPES.has(q.type)) {
      input = (
        <input id={id} className="ad-input rl-num" type="number" inputMode="numeric" min={q.type === 'int' ? undefined : 0} max={q.type === 'percent' ? 100 : undefined} value={typeof q.value === 'number' ? String(q.value) : ''} placeholder={hint} onChange={(e) => { const v = numberFromInput(e.target.value); if (!Number.isNaN(v)) set(withParam(cand, q.key, v)); }} />
      );
    } else if (q.type === 'bool') {
      input = (
        <label className="rl-check">
          <input id={id} type="checkbox" checked={q.value === true} onChange={(e) => set(withParam(cand, q.key, e.target.checked))} /> {tt('editor.yes')}
          {unset ? <span className="ad-mini"> · {tt('editor.notSet')}</span> : null}
        </label>
      );
    } else if (q.type === 'datetime') {
      input = <input id={id} className="ad-input rl-num" type="datetime-local" value={isoToLocalInput(typeof q.value === 'string' ? q.value : null, env.ctx.timeZone)} onChange={(e) => set(withParam(cand, q.key, localInputToIso(e.target.value, env.ctx.timeZone)))} />;
    } else {
      const v = (q.value ?? null) as { en?: string; bn?: string } | null;
      input = (
        <div className="rl-two">
          <input id={id} className="ad-input" value={v?.en ?? ''} placeholder={tt('editor.langEn')} aria-label={`${label} · ${tt('editor.langEn')}`} onChange={(e) => set(withParam(cand, q.key, e.target.value || v?.bn ? { en: e.target.value, ...(v?.bn ? { bn: v.bn } : {}) } : null))} />
          <input className="ad-input" value={v?.bn ?? ''} placeholder={tt('editor.langBn')} aria-label={`${label} · ${tt('editor.langBn')}`} onChange={(e) => set(withParam(cand, q.key, { en: v?.en ?? '', ...(e.target.value ? { bn: e.target.value } : {}) }))} />
        </div>
      );
    }
    const unit = q.type === 'money' ? tt('editor.inCurrency', { currency: env.ctx.currency }) : q.type === 'hours' ? tt('editor.inHours') : q.type === 'percent' ? tt('editor.inPercent') : '';
    return (
      <div key={q.key} className={inShort ? 'rl-wide' : undefined}>
        <label className="ad-label" htmlFor={id}>
          {label}
          {unit ? <span className="opt"> · {unit}</span> : null}
        </label>
        {input}
        {inShort && short ? (
          <div className="rl-hint">
            <Icon name="info" size={15} />
            <span>{tt('editor.paramHint', { text: short.text })}</span>
          </div>
        ) : null}
      </div>
    );
  };

  const chipList = (list: 'include' | 'exclude') => {
    const items = cand.scope[list];
    return (
      <div className="rl-chips">
        {items.map((x, i) => {
          const name = targetName(x, p.scopes, p.products, d, lang);
          return (
            <span key={targetKey(x)} className={`rl-chip${list === 'exclude' ? ' x' : ''}`}>
              {name}
              {canEdit ? (
                <button
                  type="button"
                  aria-label={tt('editor.remove', { name })}
                  onClick={() => {
                    const rest = items.filter((_, j) => j !== i);
                    set({ ...cand, scope: { ...cand.scope, [list]: list === 'include' && rest.length === 0 ? [{ type: 'all' }] : rest } });
                  }}
                >
                  <Icon name="close" size={12} />
                </button>
              ) : null}
            </span>
          );
        })}
        {canEdit ? (
          <button type="button" className="rl-add" onClick={() => p.onAddScope(list)}>
            {tt('editor.add')}
          </button>
        ) : null}
      </div>
    );
  };

  const tokenLine = (x: ReturnType<typeof tokenLines>[number]) => {
    const code = <span className={`rl-code${x.kind === 'unknown' || x.value === null ? ' warn' : ''}`}>{x.token}</span>;
    const key =
      x.kind === 'param' ? (x.value === null ? 'paramUnset' : 'param') : x.kind === 'window' ? (x.value === null ? 'windowUnset' : 'window') : x.kind === 'other' ? 'other' : x.kind === 'runtime' ? 'runtime' : 'unknown';
    const parts = tt(`editor.tokens.${key}`, { label: x.label ?? '', value: x.value ?? '' }).split('{token}');
    return (
      <div key={x.token} className="rl-tok">
        {parts.map((s, i) => (
          <span key={i}>
            {i > 0 ? code : null}
            {s}
          </span>
        ))}
      </div>
    );
  };

  const statusOn = cand.status === 'ACTIVE';

  return (
    <div className={`rl-ed rl-ed-${sfx}`} data-rule={view.id}>
      <div className="rl-ed-hd">
        <div className="rl-ed-title">
          <div className="rl-tags">
            <span className="rl-tag plain">{tt(`kinds.${cand.kind}`)}</span>
            <span className="ad-mini">{tt('card.edited', { version: view.version, date: when(view.updatedAt, p.locale, p.timeZone) })}</span>
          </div>
          <h2 className="rl-h2">{nameIn(cand, lang)}</h2>
        </div>
        <div className="rl-seg" role="group" aria-label={tt('segment.label')}>
          <button type="button" aria-pressed={statusOn} disabled={!canEdit} onClick={() => set({ ...cand, status: 'ACTIVE' })}>
            {tt('segment.on')}
          </button>
          <button type="button" aria-pressed={!statusOn} disabled={!canEdit} onClick={() => set({ ...cand, status: statusOn ? offStatus(view.live) : cand.status })}>
            {tt('segment.off')}
          </button>
        </div>
      </div>

      {p.done !== null ? (
        <div className="rl-done" role="status">
          <Icon name="check" size={16} />
          <span>{tt('editor.published', { version: p.done })}</span>
        </div>
      ) : null}
      {archived ? <div className="ad-note warn">{tt('editor.archivedNote')}</div> : null}
      {broken ? <div className="ad-note warn">{tt('editor.brokenNote')}</div> : null}
      {!p.perms.write && !archived ? <div className="ad-note">{tt('editor.readOnly')}</div> : null}
      {money ? (
        <div className="ad-note warn rl-money">
          <Icon name="shield" size={16} />
          <div>{tt('editor.ownerOkNote')}</div>
        </div>
      ) : null}

      <div className="rl-ai">
        <button type="button" className="rl-switch" aria-label={tt('editor.aiTitle')} aria-pressed={false} disabled />
        <div className="rl-grow">
          <div className="rl-tags">
            <b>{tt('editor.aiTitle')}</b>
            <span className="rl-tag gold">
              <Icon name="spark" size={11} />
              {tt('editor.aiTag')}
            </span>
          </div>
          <div className="rl-ai-t">{p.aiEnabled ? tt('editor.aiMock') : tt('editor.aiOff')}</div>
          <div className="ad-mini">{tt('editor.aiHint')}</div>
        </div>
      </div>

      <fieldset className="rl-fs" disabled={!canEdit}>
        <div className="rl-sec rl-langrow">
          <span className="ad-label">{tt('editor.textLang')}</span>
          <div className="rl-seg rl-seg-sm" role="group" aria-label={tt('editor.textLang')}>
            {(['bn', 'en'] as const).map((l) => (
              <button key={l} type="button" aria-pressed={textLang === l} onClick={() => p.setTextLang(l)}>
                {tt(l === 'en' ? 'editor.langEn' : 'editor.langBn')}
              </button>
            ))}
          </div>
        </div>

        <div className="rl-sec">
          <label className="ad-label" htmlFor={`${idp}-name`}>
            {textLang === 'en' ? tt('editor.name') : tt('editor.nameBn')}
          </label>
          <input
            id={`${idp}-name`}
            className="ad-input"
            maxLength={120}
            value={textLang === 'en' ? cand.nameEn : (cand.nameBn ?? '')}
            onChange={(e) => {
              if (textLang === 'en') set({ ...cand, nameEn: e.target.value });
              else {
                const { nameBn: _drop, ...rest } = cand;
                set(e.target.value ? { ...rest, nameBn: e.target.value } : rest);
              }
            }}
          />
        </div>

        <div className="rl-sec">
          <label className="ad-label rl-lbl" htmlFor={`${idp}-short`}>
            <span>
              {tt('editor.short')} <span className="opt">{tt('editor.shortHint')}</span>
            </span>
            <span className={`rl-count${shortLen > max ? ' over' : ''}`} title={tt('editor.countTitle')}>
              {tt('editor.count', { n: shortLen, max })}
            </span>
          </label>
          <input id={`${idp}-short`} className="ad-input" value={textOf('short')} onChange={(e) => set(withText(cand, 'short', textLang, e.target.value))} />
          <div className="rl-prev">
            <span className="ad-mini">{tt('editor.customersSee')}</span> {short ? <span>{short.text}</span> : <span className="ad-mini">{tt('editor.notWritten')}</span>}
          </div>
        </div>

        <div className="rl-sec">
          <label className="ad-label" htmlFor={`${idp}-full`}>
            {tt('editor.full')} <span className="opt">{tt('editor.fullHint')}</span>
          </label>
          <textarea id={`${idp}-full`} className="ad-input rl-area" rows={7} value={textOf('full')} onChange={(e) => set(withText(cand, 'full', textLang, e.target.value))} />
          {full && full.text !== textOf('full') ? (
            <div className="rl-prev">
              <span className="ad-mini">{tt('editor.customersSee')}</span> <span className="rl-pre">{full.text}</span>
            </div>
          ) : null}
          <div className="rl-toks">{tokens.length ? tokens.map(tokenLine) : <div className="ad-mini">{tt('editor.tokens.none')}</div>}</div>
        </div>

        {slots.length ? (
          <div className="rl-sec">
            <div className="ad-label">{tt('editor.moreTexts')}</div>
            <div className="rl-sets">
              {slots.map((s) => {
                const r = liveText(cand, s, textLang, env);
                return (
                  <div key={s} className="rl-wide">
                    <label className="ad-label" htmlFor={`${idp}-${s}`}>
                      {tt(`editor.slots.${s}`)}
                    </label>
                    <input id={`${idp}-${s}`} className="ad-input" value={textOf(s)} onChange={(e) => set(withText(cand, s, textLang, e.target.value))} />
                    {r ? (
                      <div className="rl-prev">
                        <span className="ad-mini">{tt('editor.customersSee')}</span> {r.text}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}

        <div className="rl-sec">
          <div className="ad-label">
            {tt('editor.settings')} <span className="opt">{tt('editor.settingsHint')}</span>
          </div>
          {params.length ? <div className="rl-sets">{params.map(paramInput)}</div> : <div className="ad-mini">{tt('editor.noSettings')}</div>}
        </div>

        <div className="rl-sec">
          <div className="ad-label">{tt('editor.when')}</div>
          <div className="rl-sets">
            <div>
              <label className="ad-label" htmlFor={`${idp}-from`}>
                {tt('editor.startsAt')}
              </label>
              <input id={`${idp}-from`} className="ad-input" type="datetime-local" value={isoToLocalInput(cand.startsAt, env.ctx.timeZone)} onChange={(e) => set({ ...cand, startsAt: localInputToIso(e.target.value, env.ctx.timeZone) })} />
            </div>
            <div>
              <label className="ad-label" htmlFor={`${idp}-to`}>
                {tt('editor.endsAt')}
              </label>
              <input id={`${idp}-to`} className="ad-input" type="datetime-local" value={isoToLocalInput(cand.endsAt, env.ctx.timeZone)} onChange={(e) => set({ ...cand, endsAt: localInputToIso(e.target.value, env.ctx.timeZone) })} />
            </div>
            <div className="rl-wide ad-mini">{tt('editor.openEnd', { zone: env.ctx.timeZone })}</div>
            <div>
              <label className="ad-label" htmlFor={`${idp}-prio`}>
                {tt('editor.priority')}
              </label>
              <input
                id={`${idp}-prio`}
                className="ad-input rl-num"
                type="number"
                inputMode="numeric"
                value={String(cand.priority)}
                onChange={(e) => {
                  const v = numberFromInput(e.target.value);
                  if (v !== null && Number.isInteger(v)) set({ ...cand, priority: v });
                }}
              />
              <div className="ad-mini rl-mt4">{tt('editor.priorityHint')}</div>
            </div>
            {hasDiscount ? (
              <label className="rl-check rl-self-end">
                <input type="checkbox" checked={cand.stackable} onChange={(e) => set({ ...cand, stackable: e.target.checked })} /> {tt('editor.stackable')}
              </label>
            ) : null}
          </div>
        </div>

        <div className="rl-sec">
          <div className="ad-label">{tt('editor.does')}</div>
          {cand.actions.length ? (
            <ul className="rl-does">
              {cand.actions.map((a, i) => (
                <li key={`${a.type}-${i}`}>
                  <Icon name="bolt" size={14} />
                  {tt(`editor.actions.${a.type}`)}
                </li>
              ))}
            </ul>
          ) : (
            <div className="ad-mini">{tt('editor.noActions')}</div>
          )}
        </div>

        <div className="rl-sec">
          <div className="ad-label">{tt('editor.appliesTo')}</div>
          {chipList('include')}
        </div>
        <div className="rl-sec">
          <div className="ad-label">{tt('editor.except')}</div>
          {chipList('exclude')}
        </div>
        <div className="rl-sec">
          <div className="ad-label">{tt('editor.shownOn')}</div>
          <div className="rl-checks">
            {p.places.map((pl) => (
              <label key={pl.key} className="rl-check">
                <input
                  type="checkbox"
                  checked={cand.placements.includes(pl.key)}
                  onChange={(e) => set({ ...cand, placements: e.target.checked ? [...cand.placements, pl.key] : cand.placements.filter((k) => k !== pl.key) })}
                />{' '}
                {placeName(pl)}
              </label>
            ))}
          </div>
        </div>
      </fieldset>

      {blocking.length ? (
        <div className="ad-note warn">
          <Icon name="info" size={16} />
          <div>
            <b>{tt('editor.issuesTitle')}</b>
            <ul className="rl-issues">
              {blocking.map((i) => (
                <li key={`${i.code}@${i.at}:${i.subject ?? ''}`}>{issueText(d, i)}</li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
      {warnings.length ? (
        <div className="ad-note">
          <Icon name="info" size={16} />
          <div>
            <b>{tt('editor.warningsTitle')}</b>
            <ul className="rl-issues">
              {warnings.map((i) => (
                <li key={`${i.code}@${i.at}:${i.subject ?? ''}`}>{issueText(d, i)}</li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}

      <div className="rl-actions">
        <button type="button" className="ad-btn ad-btn-ghost ad-btn-sm" onClick={p.onPreview} disabled={broken || archived}>
          <Icon name="eye" size={15} />
          {tt('editor.preview')}
        </button>
        {p.perms.write ? (
          <button type="button" className="ad-btn ad-btn-ghost ad-btn-sm" onClick={p.onSave} disabled={!p.dirty || p.busy || !canEdit}>
            {tt('editor.save')}
          </button>
        ) : null}
        {p.perms.publish ? (
          <button type="button" className="ad-btn ad-btn-primary ad-btn-sm" data-testid="rl-publish" onClick={p.onPublish} disabled={nothingToPublish || p.busy || !canEdit}>
            <Icon name="check" size={15} />
            {p.busy ? tt('editor.working') : tt('editor.publish')}
          </button>
        ) : null}
        <span className="rl-dirty">
          {p.dirty ? (
            <>
              <span className="rl-tag gold">{tt('tags.unsaved')}</span>
              <button type="button" className="rl-link" onClick={p.onDiscard}>
                {tt('editor.discard')}
              </button>
            </>
          ) : (
            <span className="ad-mini">{tt('editor.noUnsaved')}</span>
          )}
        </span>
      </div>
      <div className="rl-actions rl-actions-2">
        <button type="button" className="rl-link" onClick={p.onHistory}>
          <Icon name="clock" size={14} />
          {tt('editor.history')}
        </button>
        {!broken && !archived ? (
          <button type="button" className="rl-link" onClick={p.onSimulate}>
            <Icon name="sync" size={14} />
            {tt('editor.simulate')}
          </button>
        ) : null}
        {coupons ? (
          <button type="button" className="rl-link" onClick={p.onCoupons}>
            <Icon name="doc" size={14} />
            {tt('editor.coupons')}
          </button>
        ) : null}
        {view.draft && p.perms.write && !archived ? (
          <button type="button" className="rl-link" onClick={p.onThrowDraft} disabled={p.busy}>
            {tt('editor.throwDraft')}
          </button>
        ) : null}
        {p.perms.publish && !broken ? (
          <button type="button" className="rl-link" onClick={() => p.onArchive(!archived)} disabled={p.busy || (!archived && view.live?.status === 'ACTIVE')}>
            {archived ? tt('editor.restore') : tt('editor.archive')}
          </button>
        ) : null}
      </div>
    </div>
  );
}
