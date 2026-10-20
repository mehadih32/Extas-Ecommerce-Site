'use client';
// S03 · PR 571 — the "Auto colour-pair combos" and "Archive" tabs (demo acw_rulesHTML, acw_archiveHTML, acw_ruleCard):
// the three steps of how it works, the shop's default templates, and one card per rule — its first pair's picture,
// name, state, pieces and pairing, what it is bound to, the price line, how many combos it made, its dates, the
// "no single pieces" and "add 1 more" switches, its own templates, its link to copy, and Edit. Nothing is deleted:
// a rule switched off or past its end sits in the Archive, and "Turn on again" brings it back on the same link.
import Link from 'next/link';
import { useState } from 'react';
import type { AutoRuleView, ShopTemplates } from '@extas/combos';
import { BAG_TEMPLATES, LIST_TEMPLATES, PAGE_TEMPLATES, isArchivedState } from '@extas/combos/pure';
import { call, errorText } from '../api';
import { Icon } from '../Icon';
import { t, type Dict } from '@/lib/i18n';
import { COMBOS_API } from './ComboEditor';
import { nameIn, type Lang } from './model';
import type { RulePost } from './rule-form';
import { Row, StatePill, Switch } from './parts';
import { SetArt } from './SetArt';

export interface RulesTabProps {
  dict: Dict;
  lang: Lang;
  fmt(minor: number | null): string;
  /** A count in the screen's language (Bengali digits in Bengali). */
  num(n: number): string;
  rules: AutoRuleView[];
  /** Which rules: the live list, or the Archive. */
  archive: boolean;
  templates: ShopTemplates;
  seasons: { key: string; en: string; bn?: string | null }[];
  perms: { write: boolean; publish: boolean; prices: boolean };
  onChange(r: AutoRuleView): void;
  onTemplates(t: ShopTemplates): void;
  say(text: string): void;
  /** The combos page link with a tab (and a rule) chosen. */
  hrefOf(tab: string, rule?: string): string;
}

export function RulesTab(p: RulesTabProps) {
  const { dict: d } = p;
  const tt = (k: string, vars?: Record<string, string | number>) => t(d, `combos.${k}`, vars);
  const shown = p.rules.filter((r) => isArchivedState(r.state) === p.archive);
  if (p.archive)
    return (
      <div className="cb-rules">
        <div className="cb-info">
          <Icon name="layers" size={18} />
          <div>{tt('archive.note')}</div>
        </div>
        {shown.length ? (
          <div className="cb-grid">
            {shown.map((r) => (
              <RuleCard key={r.id} {...p} rule={r} />
            ))}
          </div>
        ) : (
          <div className="cb-empty" data-testid="cb-archive-empty">
            {tt('archive.empty')}
          </div>
        )}
      </div>
    );
  const on = shown.filter((r) => r.state === 'live').length;
  return (
    <div className="cb-rules">
      <ol className="cb-how">
        {(['s1', 's2', 's3'] as const).map((s, i) => (
          <li key={s} className="cb-howi">
            <b aria-hidden="true">{p.num(i + 1)}</b>
            <div>
              <div className="cb-howt">{tt(`how.${s}t`)}</div>
              <div className="ad-mini">{tt(`how.${s}s`)}</div>
            </div>
          </li>
        ))}
      </ol>
      <Defaults {...p} />
      <div className="cb-sec-hd">
        <div>
          <h2 className="cb-h2">{tt('rules.title')}</h2>
          <p className="ad-intro">{tt('rules.count', { n: p.num(on), total: p.num(shown.length) })}</p>
        </div>
        {p.perms.write ? (
          <Link className="ad-btn ad-btn-primary" href={p.hrefOf('new')} data-testid="cb-make">
            <Icon name="plus" size={16} />
            {tt('rules.make')}
          </Link>
        ) : null}
      </div>
      {shown.length ? (
        <div className="cb-grid">
          {shown.map((r) => (
            <RuleCard key={r.id} {...p} rule={r} />
          ))}
        </div>
      ) : (
        <div className="cb-empty">{tt('rules.empty')}</div>
      )}
    </div>
  );
}

function Defaults(p: RulesTabProps) {
  const { dict: d } = p;
  const tt = (k: string, vars?: Record<string, string | number>) => t(d, `combos.${k}`, vars);
  const [err, setErr] = useState('');
  const save = async (k: keyof ShopTemplates, v: string, label: string) => {
    setErr('');
    const a = await call('POST', `${COMBOS_API}/templates`, { [k]: v });
    if (!a.data.ok) return setErr(errorText(d, a));
    p.onTemplates(a.data.templates as ShopTemplates);
    p.say(tt('defaults.saved', { name: label }));
  };
  const sel = (k: keyof ShopTemplates, id: string, group: string, values: readonly string[]) => (
    <div>
      <label className="ad-label" htmlFor={id}>
        {tt(`defaults.${k}`)}
      </label>
      <select id={id} className="ad-input" value={p.templates[k]} disabled={!p.perms.write} onChange={(e) => void save(k, e.target.value, tt(`${group}.${e.target.value}`))}>
        {values.map((v) => (
          <option key={v} value={v}>
            {tt(`${group}.${v}`)}
          </option>
        ))}
      </select>
    </div>
  );
  return (
    <section className="ad-card cb-defaults" data-testid="cb-defaults">
      <h2 className="cb-h2">{tt('defaults.title')}</h2>
      <div className="ad-mini">{tt('defaults.sub')}</div>
      <div className="cb-f3">
        {sel('list', 'cb-dl', 'listTpl', LIST_TEMPLATES)}
        {sel('page', 'cb-dp', 'pageTpl', PAGE_TEMPLATES)}
        {sel('bag', 'cb-db', 'bagTpl', BAG_TEMPLATES)}
      </div>
      {err ? (
        <div className="ad-mini bad" role="alert">
          {err}
        </div>
      ) : null}
    </section>
  );
}

function RuleCard(p: RulesTabProps & { rule: AutoRuleView }) {
  const { dict: d, lang, fmt, num, rule: r } = p;
  const tt = (k: string, vars?: Record<string, string | number>) => t(d, `combos.${k}`, vars);
  const [err, setErr] = useState('');
  const name = nameIn(lang, r.nameEn, r.nameBn);
  const post = async (what: string, b: Record<string, unknown>, done?: (v: AutoRuleView) => void) => {
    setErr('');
    const a = await call('POST', `${COMBOS_API}/rules/${r.id}/${what}`, b);
    if (!a.data.ok) return setErr(errorText(d, a));
    const v = a.data.rule as AutoRuleView;
    p.onChange(v);
    done?.(v);
  };
  const active = (on: boolean, back = false) =>
    void post('active', { on }, (v) => p.say(tt(on ? (back ? 'toastRule.back' : v.state === 'live' ? 'toastRule.on' : 'toastRule.onSoon') : 'toastRule.off', { name })));
  const seasonName = r.season ? p.seasons.find((s) => s.key === r.season) : undefined;
  const top = r.top;
  const art = top ? top.pieces.map((x) => ({ hex: x.hex, name: nameIn(lang, x.productNameEn, x.productNameBn) })) : [];
  const priceRule = r.priceMode === 'PERCENT' ? (r.percentOff === null ? null : tt('rule.priceRulePercent', { n: r.percentOff })) : r.priceMinor === null ? null : tt('rule.priceRuleFixed', { price: fmt(r.priceMinor) });
  const hidden = r.counts.made - r.counts.withStock;
  const archived = isArchivedState(r.state);
  const link = typeof window === 'undefined' ? r.path : `${window.location.origin}${r.path}`;
  const tpl = (k: 'listTemplateKey' | 'pageTemplateKey', label: string, group: string, values: readonly string[]) => (
    <label className="ad-mini cb-tpl">
      {label}
      <select className="ad-input" value={r[k] ?? ''} disabled={!p.perms.write} onChange={(e) => void post('options', { [k]: e.target.value || null }, () => p.say(tt('toastRule.tpl')))}>
        <option value="">{tt(`${group}.default`)}</option>
        {values.map((v) => (
          <option key={v} value={v}>
            {tt(`${group}.${v}`)}
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <article className={`ad-card cb-card${r.state === 'live' ? '' : ' off'}`} data-testid={`cb-rule-${r.key}`}>
      {top ? (
        <SetArt pieces={art} alt={tt('artAlt', { name })} />
      ) : (
        <div className="cb-art cb-art-card cb-art-none">
          <span className="ad-mini">{tt('rule.noPairs')}</span>
        </div>
      )}
      <div className="cb-card-bd">
        <div className="cb-card-hd">
          <div className="cb-card-hd-t">
            <h3 className="cb-h3">{name}</h3>
            <div className="cb-tags">
              <StatePill dict={d} state={r.state} />
              <span className="cb-tag">{tt('rule.pieces', { n: num(r.pieces) })}</span>
              <span className="cb-tag plain">{tt(`pairing.${r.pairing}.name`)}</span>
              {seasonName ? <span className="cb-tag plain">{lang === 'bn' && seasonName.bn ? seasonName.bn : seasonName.en}</span> : null}
            </div>
          </div>
          <Switch on={r.status === 'RUNNING'} label={tt('rule.onOff', { name })} disabled={!p.perms.publish} onChange={(on) => active(on)} />
        </div>
        {r.upsellOf ? <div className="ad-mini">{tt('rule.upsellOfLabel', { name: r.upsellOf.nameEn })}</div> : null}
        <div className="cb-items">
          {r.bound.map((b) => (
            <span key={b.id}>{nameIn(lang, b.nameEn, b.nameBn)}</span>
          ))}
        </div>
        <div className="cb-price-line">
          {top && top.pricing.regularMinor !== null && top.pricing.payMinor !== null ? (
            <span>
              {top.pricing.offer ? (
                <>
                  {tt('rule.piecesLead', { n: num(r.pieces) })} <s>{fmt(top.pricing.regularMinor)}</s> {tt('rule.arrow')} <b>{fmt(top.pricing.payMinor)}</b>
                </>
              ) : (
                <b>{fmt(top.pricing.payMinor)}</b>
              )}
            </span>
          ) : null}
          <span className="ad-mini">{priceRule ?? tt('rule.noPrice')}</span>
        </div>
        <div className="cb-cnt" data-testid={`cb-rule-count-${r.key}`}>
          {tt('rule.made', { made: num(r.counts.made), stock: num(r.counts.withStock) })}
          {hidden > 0 ? ` · ${tt('rule.hidden', { n: num(hidden) })}` : ''}
          {r.counts.truncated ? <div className="ad-mini">{tt('rule.truncated', { n: num(r.counts.made) })}</div> : null}
        </div>
        <Dates {...p} rule={r} name={name} post={post} />
        {archived && p.perms.publish ? (
          <button type="button" className="ad-btn ad-btn-primary ad-btn-sm" onClick={() => active(true, true)} data-testid={`cb-revive-${r.key}`}>
            <Icon name="check" size={15} />
            {tt('rule.revive')}
          </button>
        ) : null}
        <div className="cb-card-ft">
          <Row label={tt('rule.noSingle')} hint={tt('rule.noSingleHint')}>
            <Switch on={r.noSinglePiece} label={`${tt('rule.noSingle')} — ${name}`} disabled={!p.perms.write} onChange={(v) => void post('options', { noSinglePiece: v }, () => p.say(tt(v ? 'toastRule.noSingleOn' : 'toastRule.noSingleOff', { name })))} />
          </Row>
          {r.pieces === 2 ? (
            <Row
              label={tt('rule.upsell')}
              hint={
                r.upsell
                  ? r.upsell.priced
                    ? r.upsell.state === 'live'
                      ? tt('rule.upsellUses', { name: r.upsell.nameEn })
                      : tt('rule.upsellOff', { name: r.upsell.nameEn })
                    : tt('rule.upsellNoPrice', { name: r.upsell.nameEn })
                  : tt('rule.upsellNeeds')
              }
            >
              <Switch
                on={r.addOneMore}
                label={`${tt('rule.upsell')} — ${name}`}
                disabled={!p.perms.write}
                onChange={(v) => void post('upsell', { on: v, nameEn: tt('wizard.s6.upsellName', { name: r.nameEn }), nameBn: r.nameBn ? tt('wizard.s6.upsellName', { name: r.nameBn }) : null }, () => p.say(tt(v ? 'toastRule.upsellOn' : 'toastRule.upsellOff')))}
              />
            </Row>
          ) : null}
          <div className="cb-tpls">
            {tpl('listTemplateKey', tt('rule.pageTpl'), 'listTpl', LIST_TEMPLATES)}
            {tpl('pageTemplateKey', tt('rule.pairTpl'), 'pageTpl', PAGE_TEMPLATES)}
          </div>
          <div className="cb-link">
            <code>{r.path}</code>
            <button
              type="button"
              className="ad-btn ad-btn-ghost ad-btn-sm"
              onClick={() => {
                void navigator.clipboard?.writeText(link).then(
                  () => p.say(tt('rule.copied')),
                  () => undefined,
                );
              }}
            >
              <Icon name="link" size={15} />
              {tt('rule.copy')}
            </button>
          </div>
          <div className="cb-row cb-row-last">
            {p.perms.write ? (
              <Link className="ad-btn ad-btn-ghost ad-btn-sm" href={p.hrefOf('new', r.id)} data-testid={`cb-edit-${r.key}`}>
                <Icon name="edit" size={15} />
                {tt('rule.edit')}
              </Link>
            ) : (
              <span />
            )}
          </div>
          {err ? (
            <div className="ad-mini bad" role="alert">
              {err}
            </div>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function Dates({ dict: d, rule: r, perms, name, post, say }: RulesTabProps & { rule: AutoRuleView; name: string; post: RulePost }) {
  const tt = (k: string, vars?: Record<string, string | number>) => t(d, `combos.${k}`, vars);
  const set = (k: 'startsOn' | 'endsOn', v: string) => void post('dates', { startsOn: r.startsOn, endsOn: r.endsOn, [k]: v || null }, () => say(tt('toastRule.dates', { name })));
  return (
    <div className="cb-dates">
      <div className="cb-f2">
        <label className="ad-mini">
          {tt('dates.starts')}
          <input type="date" className="ad-input" value={r.startsOn ?? ''} disabled={!perms.publish} onChange={(e) => set('startsOn', e.target.value)} />
        </label>
        <label className="ad-mini">
          {tt('dates.ends')}
          <input type="date" className="ad-input" value={r.endsOn ?? ''} disabled={!perms.publish} onChange={(e) => set('endsOn', e.target.value)} />
        </label>
      </div>
      <div className="ad-mini">{r.startsOn || r.endsOn ? tt('dates.endsHelp') : tt('dates.alwaysHelp')}</div>
    </div>
  );
}
