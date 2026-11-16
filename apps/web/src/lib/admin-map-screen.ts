// PR 1066 — the Admin map's data in one place: the page (/admin/map) and the overlay on every admin page (GET
// /api/admin/map) draw the same props from here. Made on the server from the menu model (lib/admin-map.ts).
import { authLabel } from '@extas/auth';
import type { MapScreenProps } from '@/components/admin/map/AdminMapScreen';
import { shellViewer } from '@/components/admin/shell/ShellParts';
import { buildAdminMap } from '@/lib/admin-map';
import type { AdminView } from '@/lib/admin-page';
import type { Dict } from '@/lib/i18n';
import { t } from '@/lib/i18n';
import bn from '../../messages/admin-map.bn.json';
import en from '../../messages/admin-map.en.json';

export function mapMessages(lang: 'en' | 'bn') {
  return (lang === 'bn' ? bn : en).adminMap;
}

/** The view with the map's own words added to its dictionary. */
export function withMapDict(view: AdminView): AdminView {
  return { ...view, dict: { ...view.dict, adminMap: mapMessages(view.lang) as unknown as Dict } };
}

export async function buildMapScreen(view: AdminView): Promise<{ title: string; sub: string; props: MapScreenProps }> {
  const d = view.dict;
  const lines = (mapMessages(view.lang).lines ?? {}) as Record<string, string>;
  const viewer = await shellViewer();
  const map = buildAdminMap(viewer, lines);
  const s = (k: string, vars?: Record<string, string | number>) => t(d, `adminMap.${k}`, vars);
  const permName = (p: string) => {
    try {
      const l = authLabel(`permissions.${p}`);
      return view.lang === 'bn' ? l.bn : l.en;
    } catch {
      return p;
    }
  };
  const groups = map.groups.map((g) => ({
    id: g.id,
    name: s(`groups.${g.id}`),
    sections: g.sections.map((sec) => ({
      id: sec.id,
      name: t(d, `shell.sec.${sec.id}`),
      href: sec.href,
      pages: sec.pages.map((p) => ({
        key: p.key,
        href: p.href,
        name: t(d, `shell.tab.${p.section}.${p.tab}`),
        line: p.line || s('noLine'),
        who: `${s('owner')}, ${permName(p.perm)}`,
        section: sec.id,
      })),
    })),
  }));
  const tasks = map.tasks.map((x) => ({ id: x.id, name: s(`taskNames.${x.id}`), where: `${t(d, `shell.sec.${x.page.section}`)} › ${t(d, `shell.tab.${x.page.section}.${x.page.tab}`)}`, href: x.page.href }));
  const href = (key: string, fb: string) => map.pages.find((p) => p.key === key)?.href ?? fb;
  const journey = (
    [
      ['new', 'orders.batch'],
      ['processing', 'orders.processing'],
      ['confirmed', 'orders.ship'],
      ['booked', 'orders.ship'],
      ['packed', 'orders.ship'],
      ['handed', 'orders.courier'],
      ['delivered', 'orders.all'],
      ['paid', 'finance.cash'],
    ] as const
  ).map(([id, key]) => ({ id, name: s(`j.${id}`), href: href(key, '/admin/orders') }));
  return {
    title: s('title'),
    sub: `${s('sub')} ${s('count', { n: map.pages.length, s: groups.reduce((n, g) => n + g.sections.length, 0) })}`,
    props: {
      groups,
      tasks,
      journey,
      erpHref: href('settings.erp', '/admin/settings'),
      text: {
        search: s('search'), hint: s('searchHint'), noMatch: s('noMatch'), tasks: s('tasks'), pages: s('pages'), open: s('open'), who: s('whoShort'),
        iWant: s('iWant'), iWantSub: s('iWantSub', { n: tasks.length }), journey: s('journey'), journeySide: s('journeySide'), erpTitle: s('erpTitle'),
        erpBox: s('erpBox'), erpName: s('erpName'), erpShop: s('erpShop'), erpShopBox: s('erpShopBox'), erpToShop: s('erpToShop'), erpToErp: s('erpToErp'), erpLive: s('erpLive'),
        go: s('go'), guide: s('guide'), pdf: s('pdf'), close: s('close'),
      },
    },
  };
}
