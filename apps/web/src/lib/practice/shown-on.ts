// PR 1180 (p101, the owner's decision 2 of 21 Nov 2026) — while practice mode is on, the off-by-default features the
// prototype v5 shows (Marketing › Calendar, Customer groups, Inbox › Quick replies and the customer Export) show as on, so
// the owner can try them on the practice shop. Only what a page READS changes: the stored setting is never written, and the
// moment practice mode is off every page reads the real setting again. The one list below is the only place this is
// decided; a page passes its deps through `practiceShownDeps` (or its resolver through `practiceShownResolver`) before it
// reads. Settings screens and every API that saves keep the plain resolver, so a switch always shows and saves the real
// value.
import type { AdminDeps } from '../admin-auth';
import type { AppResolver } from '../settings';

/** The settings that show as on while practice mode is on (each has an `enabled` flag). */
export const PRACTICE_SHOWN_ON = ['marketing.calendar', 'customers.segments', 'support.savedReplies', 'customers.export'] as const;
export type PracticeShownKey = (typeof PRACTICE_SHOWN_ON)[number];

const SHOWN = new Set<string>(PRACTICE_SHOWN_ON);

/** The value a page shows: the stored one, with `enabled: true` while practice mode is on. */
export function shownValue<T>(key: string, value: T, practiceOn: boolean): T {
  if (!practiceOn || !SHOWN.has(key) || !value || typeof value !== 'object' || !('enabled' in (value as object))) return value;
  return { ...(value as object), enabled: true } as T;
}

/** Is practice mode on for this store (false when the setting cannot be read)? */
export async function practiceOn(resolver: AppResolver, storeId: number | undefined): Promise<boolean> {
  try {
    const v = (await resolver.value('practice.enabled', storeId === undefined ? {} : { storeId })) as { on?: boolean } | null;
    return v?.on === true;
  } catch {
    return false;
  }
}

/**
 * PR 1208: is this feature shown as on ONLY because practice mode is on (its stored switch is off)? A page then says so
 * beside it, because every save through its API still follows the stored switch and refuses while it is off.
 */
export async function shownOnlyByPractice(resolver: AppResolver, key: PracticeShownKey, storeId: number | undefined): Promise<boolean> {
  try {
    const v = (await resolver.value(key, storeId === undefined ? {} : { storeId })) as { enabled?: boolean } | null;
    return v?.enabled !== true && (await practiceOn(resolver, storeId));
  } catch {
    return false;
  }
}

/** A read-only view of the resolver for one page: `value` and `get` of the listed keys follow practice mode; everything else is the resolver itself. */
export function practiceShownResolver(resolver: AppResolver): AppResolver {
  return new Proxy(resolver, {
    get(target, prop, receiver) {
      if (prop === 'value') {
        return async (key: string, opts: { storeId?: number } = {}) => {
          const v = await (target.value as (k: string, o: { storeId?: number }) => Promise<unknown>).call(target, key, opts);
          return SHOWN.has(key) ? shownValue(key, v, await practiceOn(target, opts.storeId)) : v;
        };
      }
      if (prop === 'get') {
        return async (key: string, opts: { storeId?: number } = {}) => {
          const r = (await (target.get as (k: string, o: { storeId?: number }) => Promise<{ value: unknown }>).call(target, key, opts)) as { value: unknown };
          return SHOWN.has(key) ? { ...r, value: shownValue(key, r.value, await practiceOn(target, opts.storeId)) } : r;
        };
      }
      const v = Reflect.get(target, prop, receiver);
      return typeof v === 'function' ? v.bind(target) : v;
    },
  });
}

/** The page's deps with the practice-aware resolver (reads only; never pass these to a save). */
export function practiceShownDeps<D extends Pick<AdminDeps, 'resolver'>>(deps: D): D {
  return { ...deps, resolver: practiceShownResolver(deps.resolver) };
}
