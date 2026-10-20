// The admin screens' calls to their API: JSON in and out, the session cookie sent by the browser, and every refusal
// turned into a code the screen shows as text from its messages file (never the server's own wording).
import { t, type Dict } from '@/lib/i18n';

export interface Answer {
  status: number;
  data: Record<string, unknown> & { ok?: boolean; error?: string; details?: string[] };
}

export async function call(method: 'GET' | 'POST' | 'PATCH' | 'PUT', url: string, body?: unknown): Promise<Answer> {
  try {
    const res = await fetch(url, {
      method,
      credentials: 'same-origin',
      cache: 'no-store',
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({ ok: false, error: 'server-error' }))) as Answer['data'];
    return { status: res.status, data };
  } catch {
    return { status: 0, data: { ok: false, error: 'network' } };
  }
}

/** The refusal as text: `errors.<code>` from the messages file, or the general server error. */
export function errorText(dict: Dict, a: Answer, vars: Record<string, string> = {}): string {
  const code = a.data.error ?? 'server-error';
  const fields = (a.data.details ?? []).join(', ');
  const key = `errors.${code}`;
  const text = t(dict, key, { fields, ...vars });
  return text === key ? t(dict, 'errors.server-error') : text;
}
