// S21 · PR 594 — the words of Help & Build › Build progress, Reported problems and Blueprint & files
// (messages/admin-build.<lang>.json, everything under `build.*`), joined to the admin's own words for its pages, and the
// client buttons' words as flat `a.b` keys.
import type { Words } from '@/components/admin/money/RefundActions';
import type { AdminView } from '@/lib/admin-page';
import type { PrState } from '@/lib/build-register';
import type { Dict } from '@/lib/i18n';
import bn from '../../messages/admin-build.bn.json';
import en from '../../messages/admin-build.en.json';
import { flatWords } from './money-words';

const words = (lang: 'bn' | 'en') => (lang === 'bn' ? bn : en).build;

/** The page's view with the `build.*` words added. */
export const withBuildWords = (view: AdminView): AdminView => ({ ...view, dict: { ...view.dict, build: words(view.lang) as unknown as Dict } });

/** The buttons' words (report, status, refusals). */
export const buildButtonWords = (lang: 'bn' | 'en'): Words => flatWords(words(lang).w);

/** The pill colour of each PR state. */
export const STATE_PILL: Record<PrState, string> = { live: 'ok', merged: 'info', todo: 'line', parked: 'warn' };

/** The pill colour of each reported problem's status. */
export const PROBLEM_PILL: Record<string, string> = { OPEN: 'warn', FIXING: 'info', FIXED: 'ok', CLOSED: 'line' };
