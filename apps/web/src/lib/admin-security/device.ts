// S18 · PR 380 — a short device name from a browser's user agent ("Chrome · Android"), for the page's device list
// and the notifications drawer's new-device note. Plain code, safe in the browser and on the server.

/** "Chrome · Android" from a user agent; the first 40 letters when nothing is recognised; "—" when there is none. */
export function deviceName(ua: string | null | undefined): string {
  if (!ua) return '—';
  const os = /Android/i.test(ua) ? 'Android' : /iPhone|iPad/i.test(ua) ? 'iPhone' : /Windows/i.test(ua) ? 'Windows' : /Mac OS X/i.test(ua) ? 'Mac' : /Linux/i.test(ua) ? 'Linux' : '';
  const br = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : '';
  return [br, os].filter(Boolean).join(' · ') || ua.slice(0, 40);
}
