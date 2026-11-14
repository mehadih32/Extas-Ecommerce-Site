// PR 725 — the server clock of the practice shop. Started once per server process from instrumentation.ts: a few seconds
// after boot, then every minute (every few seconds while sample pictures are still being made), it runs `ensurePractice`
// for the mother store: fills the sample shop while practice mode is on, shows or hides it to match the switch (also when
// the switch was flipped on the plain Settings page), and makes the pictures in small steps. Every step is cheap when
// there is nothing to do and is protected by a lease (ensure.ts), so several processes can run it. It never throws and
// never blocks a request. Without a database (CI, `next build`) it does nothing.
import { MOTHER_STORE_ID } from '@extas/db/client';
import { adminDeps } from '../admin-auth';
import { backgroundMediaDeps } from '../media';
import { ensurePractice } from './ensure';

const FIRST_MS = 8_000; // hardcode-ok: a technical start delay
const IDLE_MS = 60_000; // hardcode-ok: a technical polling interval
const BUSY_MS = 8_000; // hardcode-ok: a technical polling interval while pictures are made

const G = globalThis as unknown as { __practiceKeeper?: boolean };

export async function practiceKeeperStep(): Promise<boolean> {
  const deps = adminDeps();
  if (!deps) return false;
  const r = await ensurePractice({ db: deps.db, resolver: deps.resolver, media: backgroundMediaDeps() }, MOTHER_STORE_ID);
  return r.pending;
}

export function startPracticeKeeper(): void {
  if (G.__practiceKeeper || !process.env.DATABASE_URL) return;
  G.__practiceKeeper = true;
  const run = async () => {
    let pending = false;
    try {
      pending = await practiceKeeperStep();
    } catch (e) {
      console.warn(`practice: ${(e instanceof Error ? e.message : String(e)).split('\n')[0]}`);
    }
    const t = setTimeout(() => void run(), pending ? BUSY_MS : IDLE_MS);
    t.unref?.();
  };
  const t = setTimeout(() => void run(), FIRST_MS);
  t.unref?.();
}
