// S08 · PR 187, 190 — one photo for a returns screen (a piece that is not sellable, a "your mistake" claim) uploaded to the
// media library (`POST /api/admin/media`, folder "returns"; needs `media.upload`); the asset's id goes with the request.
export async function uploadReturnPhoto(file: File): Promise<string | null> {
  const form = new FormData();
  form.set('file', file);
  form.set('folder', 'returns');
  try {
    const res = await fetch('/api/admin/media', { method: 'POST', credentials: 'same-origin', body: form });
    const data = (await res.json().catch(() => null)) as { ok?: boolean; asset?: { id?: string } } | null;
    return data?.ok && data.asset?.id ? data.asset.id : null;
  } catch {
    return null;
  }
}
