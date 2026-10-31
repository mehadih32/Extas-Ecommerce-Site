// S18 · PR 390 — the manual's Markdown copy: found beside the guides' folder, offered only when the deploy made it, the
// download refused without a session. (The copy itself is made and tested by infra/deploy/manual-md.sh, infra tests.)
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { hasManualMd, manualMdHandler, manualMdName, manualMdPath } from './manual-md';

describe('Site manual Markdown copy (PR 390)', () => {
  it('sits beside the guides, in docs/', () => {
    expect(manualMdPath('/docs/current/docs/admin-guide')).toBe('/docs/current/docs/MANUAL.md');
    expect(manualMdPath(null)).toBeNull();
  });

  it('is offered only when the deploy made it', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'extas-manual-'));
    await mkdir(join(dir, 'admin-guide'));
    const path = manualMdPath(join(dir, 'admin-guide'));
    expect(await hasManualMd(path)).toBe(false);
    await writeFile(path!, '');
    expect(await hasManualMd(path)).toBe(false);
    await writeFile(path!, '# Site manual\n');
    expect(await hasManualMd(path)).toBe(true);
    expect(await hasManualMd(null)).toBe(false);
  });

  it('names the saved file by the day, nothing else', () => {
    expect(manualMdName('2026-10-31')).toBe('site-manual-2026-10-31.md');
    expect(manualMdName('2026-10-31"; x')).toBe('site-manual-2026-10-31.md');
  });

  it('refuses the download without a session', async () => {
    const res = await manualMdHandler(new Request('http://localhost/api/admin/help/manual-md'), null, '/nowhere');
    expect(res.status).toBe(503);
  });
});
