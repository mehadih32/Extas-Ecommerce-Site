// S10 · PR 216 — the notice editor's form, pure (no React): a stored notice as the fields typed in, and the fields back
// as the API's notice input. Empty optional fields are left out; times are typed in the store's time zone; only a
// pop-up has an opening time and a limit on how often it shows. Tested in model.test.ts.
import type { NoticeInput } from '@extas/rules/pure';
import { isoToLocalInput, localInputToIso } from './model';

export const NOTICE_POSITIONS = ['', 'top', 'bottom', 'inline'] as const;
export type NoticePosition = (typeof NOTICE_POSITIONS)[number];

export interface NoticeForm {
  key: string;
  kind: 'bar' | 'banner' | 'inline' | 'popup';
  nameEn: string;
  nameBn: string;
  titleEn: string;
  titleBn: string;
  contentEn: string;
  contentBn: string;
  ctaLabelEn: string;
  ctaLabelBn: string;
  ctaHref: string;
  pages: string[];
  position: NoticePosition;
  trigger: '' | 'time' | 'scroll' | 'exit' | 'click';
  delay: string;
  scroll: string;
  clickKey: string;
  capPer: '' | 'visit' | 'day' | 'week' | 'ever';
  capTimes: string;
  ruleId: string;
  priority: string;
  startsAt: string;
  endsAt: string;
}

/** What a stored notice holds (NoticeView's fields). */
export interface NoticeLike {
  key: string | null;
  kind: string;
  nameEn: string | null;
  nameBn: string | null;
  titleEn: string | null;
  titleBn: string | null;
  contentEn: string;
  contentBn: string | null;
  cta: unknown;
  placement: unknown;
  timing: unknown;
  frequencyCap: unknown;
  ruleId: string | null;
  priority: number;
  startsAt: string | null;
  endsAt: string | null;
}

const str = (v: unknown) => (typeof v === 'string' ? v : '');
const num = (v: unknown) => (typeof v === 'number' ? String(v) : '');
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {});

export function blankNotice(): NoticeForm {
  return { key: '', kind: 'bar', nameEn: '', nameBn: '', titleEn: '', titleBn: '', contentEn: '', contentBn: '', ctaLabelEn: '', ctaLabelBn: '', ctaHref: '', pages: ['all'], position: '', trigger: '', delay: '', scroll: '', clickKey: '', capPer: '', capTimes: '1', ruleId: '', priority: '0', startsAt: '', endsAt: '' };
}

export function formOf(n: NoticeLike, timeZone: string): NoticeForm {
  const cta = obj(n.cta);
  const place = obj(n.placement);
  const timing = obj(n.timing);
  const cap = obj(n.frequencyCap);
  const kinds = ['bar', 'banner', 'inline', 'popup'] as const;
  return {
    key: n.key ?? '',
    kind: (kinds as readonly string[]).includes(n.kind) ? (n.kind as NoticeForm['kind']) : 'bar',
    nameEn: n.nameEn ?? '',
    nameBn: n.nameBn ?? '',
    titleEn: n.titleEn ?? '',
    titleBn: n.titleBn ?? '',
    contentEn: n.contentEn,
    contentBn: n.contentBn ?? '',
    ctaLabelEn: str(cta.labelEn),
    ctaLabelBn: str(cta.labelBn),
    ctaHref: str(cta.href),
    pages: Array.isArray(place.pages) ? place.pages.filter((p): p is string => typeof p === 'string') : ['all'],
    position: (NOTICE_POSITIONS as readonly string[]).includes(str(place.position)) ? (str(place.position) as NoticePosition) : '',
    trigger: (['time', 'scroll', 'exit', 'click'] as const).find((x) => x === timing.trigger) ?? '',
    delay: num(timing.delaySeconds),
    scroll: num(timing.scrollPercent),
    clickKey: str(timing.clickKey),
    capPer: (['visit', 'day', 'week', 'ever'] as const).find((x) => x === cap.per) ?? '',
    capTimes: num(cap.times) || '1',
    ruleId: n.ruleId ?? '',
    priority: String(n.priority),
    startsAt: isoToLocalInput(n.startsAt, timeZone),
    endsAt: isoToLocalInput(n.endsAt, timeZone),
  };
}

const int = (s: string): number | undefined => {
  const v = s.trim();
  if (!v) return undefined;
  const n = Number(v);
  return Number.isInteger(n) ? n : undefined;
};

/** The fields as the API's notice input. */
export function inputOf(f: NoticeForm, timeZone: string): NoticeInput {
  const t = (s: string) => s.trim();
  const popup = f.kind === 'popup';
  const timing =
    popup && f.trigger
      ? {
          trigger: f.trigger,
          ...(f.trigger === 'time' && int(f.delay) !== undefined ? { delaySeconds: int(f.delay) } : {}),
          ...(f.trigger === 'scroll' && int(f.scroll) !== undefined ? { scrollPercent: int(f.scroll) } : {}),
          ...(f.trigger === 'click' && t(f.clickKey) ? { clickKey: t(f.clickKey) } : {}),
        }
      : null;
  const times = int(f.capTimes);
  return {
    key: t(f.key),
    kind: f.kind,
    nameEn: t(f.nameEn),
    ...(t(f.nameBn) ? { nameBn: t(f.nameBn) } : {}),
    ...(t(f.titleEn) ? { titleEn: t(f.titleEn) } : {}),
    ...(t(f.titleBn) ? { titleBn: t(f.titleBn) } : {}),
    contentEn: t(f.contentEn),
    ...(t(f.contentBn) ? { contentBn: t(f.contentBn) } : {}),
    cta: t(f.ctaLabelEn) && t(f.ctaHref) ? { labelEn: t(f.ctaLabelEn), ...(t(f.ctaLabelBn) ? { labelBn: t(f.ctaLabelBn) } : {}), href: t(f.ctaHref) } : null,
    placement: { pages: f.pages.length ? f.pages : ['all'], ...(f.position ? { position: f.position } : {}) },
    timing,
    frequencyCap: popup && f.capPer && times !== undefined ? { per: f.capPer, times } : null,
    ruleId: f.ruleId || null,
    priority: int(f.priority) ?? 0,
    startsAt: localInputToIso(f.startsAt, timeZone),
    endsAt: localInputToIso(f.endsAt, timeZone),
  };
}
