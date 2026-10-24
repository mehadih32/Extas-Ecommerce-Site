// PR 566 — the support explanation panel's words (an order's admin page): the reason codes of @extas/orders explainOf
// in the admin's language (`support.explain.why.*`), amounts as money and dates in the store's time zone, and the
// owner's "what to say" lines (`orders.explain.say`) filled in Bengali and in English for the customer — which never
// carry a team-only reason (a score, a level, a rule's name).
import type { ExplainLine, Explanation, SayLine } from '@extas/orders';
import type { OrderExplainSettings } from '@extas/settings';
import { formatMoney, moneyOf } from '@/components/admin/products/model';
import type { AdminView } from '../admin-page';
import { t } from '../i18n';

/** The values that are amounts (minor units) and the ones that are moments. */
const MONEY = new Set(['amount', 'paid', 'charge', 'now', 'limit', 'over']);
const WHEN = new Set(['at']);

export interface ExplainRow {
  code: string;
  text: string;
  teamOnly: boolean;
}

export interface ExplainView {
  title: string;
  sub: string;
  advance: { label: string; value: string; tone: 'ok' | 'warn' | 'info' };
  charge: { label: string; value: string };
  more: string;
  whyAdvance: { title: string; rows: ExplainRow[] };
  whyCharge: { title: string; rows: ExplainRow[] };
  say: {
    title: string;
    empty: string;
    lines: { lang: 'bn' | 'en'; label: string; text: string }[];
  };
  teamOnly: string;
  copy: string;
  copied: string;
}

const fill = (text: string, vars: Record<string, string>) => text.replace(/\{(\w+)\}/g, (m, k: string) => vars[k] ?? m);

function valuesOf(v: Record<string, string | number | Date | null> | undefined, view: AdminView, currency: string, locale: string): Record<string, string> {
  const money = moneyOf(currency, locale);
  const dt = new Intl.DateTimeFormat(view.locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: view.timeZone,
    numberingSystem: 'latn',
  });
  const none = t(view.dict, 'support.explain.none');
  const out: Record<string, string> = {};
  for (const [k, x] of Object.entries(v ?? {})) {
    if (x === null || x === undefined) out[k] = none;
    else if (x instanceof Date) out[k] = WHEN.has(k) ? dt.format(x) : x.toISOString();
    else if (typeof x === 'number' && MONEY.has(k)) out[k] = formatMoney(x, money);
    else out[k] = String(x);
  }
  return out;
}

function rowsOf(lines: ExplainLine[], view: AdminView, currency: string, showRisk: boolean): ExplainRow[] {
  return lines
    .filter((l) => showRisk || l.code !== 'risk')
    .map((l) => {
      const vars = valuesOf(l.values, view, currency, view.locale);
      if (l.code === 'asked') vars.by = l.values?.by ? String(l.values.by) : t(view.dict, l.values?.actor === 'CUSTOMER' ? 'support.explain.byCustomer' : 'support.explain.bySystem');
      return {
        code: l.code,
        text: t(view.dict, `support.explain.why.${l.code}`, vars),
        teamOnly: l.staffOnly === true,
      };
    });
}

/** The words for the customer in one language: the advance's line, then the charge's (each only when it has one). */
export function sayText(lines: readonly (SayLine | null)[], s: OrderExplainSettings, lang: 'bn' | 'en', currency: string): string {
  const locale = lang === 'bn' ? 'bn-BD' : 'en-BD';
  const money = moneyOf(currency, locale);
  return lines
    .filter((l): l is SayLine => l !== null)
    .map((l) => {
      const vars: Record<string, string> = {};
      for (const [k, v] of Object.entries(l.values)) if (v !== null) vars[k] = typeof v === 'number' && MONEY.has(k) ? formatMoney(v, money) : String(v);
      return fill(s.say[l.key][lang], vars);
    })
    .join(' ');
}

/**
 * The panel as the page draws it. `en` / `bn`: the same order explained with the band and place names of that language
 * (the words for the customer are written in both).
 */
export function explainView(view: AdminView, s: OrderExplainSettings, by: { en: Explanation; bn: Explanation }): ExplainView {
  const d = view.dict;
  const e = by[view.lang];
  const money = moneyOf(e.currency, view.locale);
  const amount = e.advance.amountMinor === null ? t(d, 'support.explain.none') : formatMoney(e.advance.amountMinor, money);
  const c = e.charge;
  const bandRow = c.why.find((w) => w.code === 'band');
  const chargeValue =
    c.state === 'charge'
      ? t(d, 'support.explain.state.charge', {
          charge: formatMoney(c.amountMinor, money),
          band: bandRow?.values?.band ? String(bandRow.values.band) : t(d, 'support.explain.none'),
        })
      : t(d, `support.explain.state.${c.state}`);
  const paid = e.advance.amountMinor !== null && e.advance.paidMinor >= e.advance.amountMinor;
  return {
    title: t(d, 'support.explain.title'),
    sub: t(d, 'support.explain.sub'),
    advance: {
      label: t(d, 'support.explain.advance'),
      value: t(d, `support.explain.kind.${e.advance.kind}`, { amount }),
      tone: e.advance.kind === 'none' ? 'info' : paid ? 'ok' : 'warn',
    },
    charge: { label: t(d, 'support.explain.charge'), value: chargeValue },
    more: t(d, 'support.explain.more'),
    whyAdvance: {
      title: t(d, 'support.explain.whyAdvance'),
      rows: rowsOf(e.advance.why, view, e.currency, s.showRisk),
    },
    whyCharge: {
      title: t(d, 'support.explain.whyCharge'),
      rows: rowsOf(c.why, view, e.currency, s.showRisk),
    },
    say: {
      title: t(d, 'support.explain.say'),
      empty: t(d, 'support.explain.sayNone'),
      lines: (['bn', 'en'] as const)
        .map((lang) => ({
          lang,
          label: t(d, lang === 'bn' ? 'support.explain.langBn' : 'support.explain.langEn'),
          text: sayText([by[lang].advance.say, by[lang].charge.say], s, lang, e.currency),
        }))
        .filter((l) => l.text),
    },
    teamOnly: t(d, 'support.explain.teamOnly'),
    copy: t(d, 'support.explain.copy'),
    copied: t(d, 'support.explain.copied'),
  };
}
