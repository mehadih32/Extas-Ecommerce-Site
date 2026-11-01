// S14 · PR 290 — one POST to Messages › E-mail's API from its forms, with the refusal in the customers' words.
import { cusError } from '@/lib/admin-customers/words';
import type { Dict } from '@/lib/i18n';

export type EmailAnswer = { ok: true; data: Record<string, unknown> } | { ok: false; text: string };

export async function emailPost(d: Dict, url: string, body: unknown): Promise<EmailAnswer> {
  try {
    const res = await fetch(url, { method: 'POST', credentials: 'same-origin', cache: 'no-store', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const data = (await res.json().catch(() => ({ ok: false }))) as { ok?: boolean; error?: string; details?: string[] } & Record<string, unknown>;
    return data.ok ? { ok: true, data } : { ok: false, text: cusError(d, data.error, (data.details ?? []).join(', ')) };
  } catch {
    return { ok: false, text: cusError(d, 'network') };
  }
}
