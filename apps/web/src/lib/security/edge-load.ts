// S18 · PR 378 — reads the page protection and request-limit settings and leaves them for the proxy (edge-gate.ts):
// once when the server starts (instrumentation.ts) and again whenever a setting changes. Without a database the proxy
// keeps refusing cross-site changes and counts nothing (the safe answer).
import { registry, type Key, type Value } from '@extas/settings';
import { buildCsp } from './csp';
import { setEdgePolicy, type EdgePolicy } from './edge-gate';
import { addSettingsListener, settingsResolver, type AppResolver } from '../settings';

/** The policy from the settings (the declared defaults when a value cannot be read). */
export async function readEdgePolicy(resolver: Pick<AppResolver, 'value'> | null, dev = process.env.NODE_ENV !== 'production'): Promise<EdgePolicy> {
  const read = async <K extends Key>(key: K): Promise<Value<K>> => {
    if (!resolver) return registry[key].default as Value<K>;
    try {
      return (await resolver.value(key)) as Value<K>;
    } catch {
      return registry[key].default as Value<K>;
    }
  };
  const [mode, extra, rateMode, perMinute, maxTracked, media] = await Promise.all([
    read('security.csp.mode'),
    read('security.csp.extraSources'),
    read('security.rateLimit.mode'),
    read('security.rateLimit.perMinute'),
    read('security.rateLimit.maxTracked'),
    read('media.publicBaseUrl'),
  ]);
  return {
    csp: { mode, header: mode === 'off' ? null : buildCsp({ extra, mediaBaseUrl: media, dev, reportOnly: mode === 'report' }) },
    rate: { mode: rateMode, perMinute, maxTracked },
  };
}

const KEYS = new Set(['security.csp.mode', 'security.csp.extraSources', 'security.rateLimit.mode', 'security.rateLimit.perMinute', 'security.rateLimit.maxTracked', 'media.publicBaseUrl']);

/** Reads the policy now and after every change of one of its settings. */
export function startEdgeSecurity(): void {
  const resolver = settingsResolver();
  if (!resolver) return;
  const refresh = () =>
    void readEdgePolicy(resolver)
      .then(setEdgePolicy)
      .catch((e: unknown) => console.warn(`edge security: settings not read (${e instanceof Error ? e.message : String(e)})`));
  addSettingsListener((c) => {
    if (!c.keys || c.keys.some((k) => KEYS.has(k))) refresh();
  });
  refresh();
}
