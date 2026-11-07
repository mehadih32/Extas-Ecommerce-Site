// PR 378 (security m2) — a request body read only up to its cap, so a huge body is never buffered whole in the app
// (the ERP, WhatsApp and Messenger webhooks; follow-up 607: the speed readings and every admin JSON body too). Moved
// here from lib/erp-webhook.ts, which still exports it. Imports nothing of the app.
/** The body as text, read at most `maxBytes` (+1 to know it is longer): null when it is longer (the rest is never read). */
export async function readCapped(request: Request, maxBytes: number): Promise<string | null> {
  if (!request.body) return '';
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}
