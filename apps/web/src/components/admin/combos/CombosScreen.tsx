'use client';
// S03 · PR 90 (with 571, 99, 104) — the combos page (demo #/admin/combos, 85-admin-combos.js): the head in Bengali, the
// inner tabs (auto colour-pair combos first, then "+ Make a combo", the Archive, the fixed combos and the report), and the tab's
// body. Changes go to the server at once (a switch, a price box) or through the editor sheet and the wizard; the list
// is the server's answer, so what the page shows is what the shop and the bag use.
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import type { AutoRuleView, CategoryOption, ComboView, ProductOption, ShopTemplates } from '@extas/combos';
import { isArchivedState } from '@extas/combos/pure';
import { t, type Dict } from '@/lib/i18n';
import { ComboEditor } from './ComboEditor';
import { FixedTab } from './FixedTab';
import { COMBOS_TABS, currencySymbol, money, nameIn, type CombosTab, type Lang } from './model';
import { RulesTab } from './RulesTab';
import { RuleWizard } from './RuleWizard';
import { useToast } from '../products/useToast';

export interface CombosScreenProps {
  dict: Dict;
  lang: Lang;
  locale: string;
  currency: string;
  tab: CombosTab;
  combos: ComboView[];
  products: ProductOption[];
  photos: Record<string, string>;
  perms: { write: boolean; publish: boolean; prices: boolean };
  /** PR 571 — the auto colour-pair rules, the shop's default templates, and what the wizard picks from. */
  rules: AutoRuleView[];
  templates: ShopTemplates;
  categories: CategoryOption[];
  seasons: { key: string; en: string; bn?: string | null }[];
  roundingStepMinor: number;
  /** The rule the wizard changes (tab=new&rule=…), and its "add 1 more" rule. */
  editRule: AutoRuleView | null;
  upsellRule: AutoRuleView | null;
  /** The page's own address (the tabs are links on it). */
  here: string;
  /** PR 99 — "What customers can combine" (drawn by the server from Smart Rules). */
  tiers?: ReactNode;
  /** PR 104 — the combo report (drawn by the server). */
  report?: ReactNode;
  /** The Combos pages' tabs (desktop), drawn under the head. */
  tabs?: ReactNode;
}

export function CombosScreen(props: CombosScreenProps) {
  const { dict: d, lang, locale, currency, tab } = props;
  const tt = (k: string, vars?: Record<string, string | number>) => t(d, `combos.${k}`, vars);
  const router = useRouter();
  const [combos, setCombos] = useState(props.combos);
  const [rules, setRules] = useState(props.rules);
  const [templates, setTemplates] = useState(props.templates);
  const [fromServer, setFromServer] = useState(props.combos);
  const [rulesFromServer, setRulesFromServer] = useState(props.rules);
  if (fromServer !== props.combos) {
    setFromServer(props.combos);
    setCombos(props.combos);
  }
  if (rulesFromServer !== props.rules) {
    setRulesFromServer(props.rules);
    setRules(props.rules);
  }
  const [editing, setEditing] = useState<{ combo: ComboView | null } | null>(null);
  const [toast, say] = useToast();
  const fmt = (minor: number | null) => money(minor, locale, currency);
  const symbol = currencySymbol(locale, currency);
  const hexes = Object.fromEntries(props.products.flatMap((p) => p.colours.map((c) => [c.id, c.hex])));
  const upsert = (c: ComboView) => setCombos((list) => (list.some((x) => x.id === c.id) ? list.map((x) => (x.id === c.id ? c : x)) : [c, ...list]));
  const upsertRule = (r: AutoRuleView) => setRules((list) => (list.some((x) => x.id === r.id) ? list.map((x) => (x.id === r.id ? r : x)) : [r, ...list]));
  const hrefOf = (to: string, rule?: string) => {
    const q = new URLSearchParams();
    if (to !== 'auto') q.set('tab', to);
    if (rule) q.set('rule', rule);
    const s = q.toString();
    return s ? `${props.here}?${s}` : props.here;
  };
  const live = rules.filter((r) => !r.upsellOf && !isArchivedState(r.state)).length;
  const archived = rules.filter((r) => isArchivedState(r.state)).length;
  const count = (n: number) => <span className="cb-chip-n">{n.toLocaleString(locale)}</span>;

  let body: ReactNode;
  if (tab === 'new')
    body = (
      <RuleWizard
        key={props.editRule?.id ?? 'new'}
        dict={d}
        lang={lang}
        locale={locale}
        fmt={fmt}
        symbol={symbol}
        rule={props.editRule}
        upsellRule={props.upsellRule}
        categories={props.categories}
        products={props.products}
        seasons={props.seasons}
        perms={props.perms}
        roundingStepMinor={props.roundingStepMinor}
        hrefOf={hrefOf}
        onSaved={(r) => {
          upsertRule(r);
          if (!props.editRule) return;
          say(tt('toastRule.saved', { name: nameIn(lang, r.nameEn, r.nameBn) }));
          router.push(hrefOf('auto'));
          router.refresh();
        }}
      />
    );
  else if (tab === 'report') body = props.report ?? null;
  else if (tab === 'fixed')
    body = <FixedTab dict={d} lang={lang} fmt={fmt} symbol={symbol} combos={combos} hexes={hexes} photos={props.photos} perms={props.perms} onChange={upsert} onEdit={(c) => setEditing({ combo: c })} say={say} tiers={props.tiers} />;
  else
    body = (
      <RulesTab
        dict={d}
        lang={lang}
        fmt={fmt}
        num={(n) => n.toLocaleString(locale)}
        rules={rules.filter((r) => !r.upsellOf)}
        archive={tab === 'archive'}
        templates={templates}
        seasons={props.seasons}
        perms={props.perms}
        onChange={upsertRule}
        onTemplates={setTemplates}
        say={say}
        hrefOf={hrefOf}
      />
    );

  return (
    <div className="cb-page">
      <div className="cb-hd">
        <div className="cb-hd-text">
          <div className="ad-eyebrow">{tt('eyebrow')}</div>
          <h1 className="ad-h1">{tt('title')}</h1>
          <p className="cb-bn-sub">{tt('subtitle')}</p>
          <p className="ad-intro">{tt('intro')}</p>
        </div>
      </div>
      {props.tabs}
      <nav className="ad-tabs cb-itabs" aria-label={tt('tabs.label')}>
        {COMBOS_TABS.map((k) => (
          <Link key={k} className="ad-chip" href={hrefOf(k)} aria-current={k === tab ? 'page' : undefined} data-testid={`cb-tab-${k}`}>
            {k === 'new' && props.editRule ? tt('tabs.edit') : tt(`tabs.${k}`)}
            {k === 'auto' ? count(live) : k === 'archive' ? count(archived) : null}
          </Link>
        ))}
      </nav>
      {body}
      {editing ? (
        <ComboEditor
          dict={d}
          lang={lang}
          fmt={fmt}
          symbol={symbol}
          products={props.products}
          canPrice={props.perms.prices}
          combo={editing.combo}
          onClose={() => setEditing(null)}
          onSaved={(c) => {
            upsert(c);
            setEditing(null);
            say(tt(editing.combo ? 'toast.saved' : 'toast.created', { name: c.nameEn }));
          }}
        />
      ) : null}
      <div className="ad-toast-slot" aria-live="polite" role="status">
        {toast ? <div className="ad-toast">{toast}</div> : null}
      </div>
    </div>
  );
}
