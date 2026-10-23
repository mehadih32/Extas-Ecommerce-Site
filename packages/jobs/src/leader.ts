// PR 6 — one scheduler leader. Every worker can run jobs, but only the one holding the leader lock plans them (puts
// the due jobs on the queue). The lock is one Redis key with an expiry (`jobs.leader.lockSeconds`): taken with
// SET NX PX, renewed by its owner well before it runs out, and given up on a clean stop. Renew and release only touch
// the key when it still holds this worker's own value (compare in a Lua script), so a worker that lost the lock can
// never extend or delete the new leader's lock. A leader that stops without letting go is replaced once its lock runs
// out. Even if two workers believed they lead for a moment, the queue's job ids (one per job, store and time slot) and
// the run-level idempotency (runs.ts) keep every job to one run.

/** The Redis calls the lock needs (ioredis answers them; tests may pass a stand-in). */
export interface LockStore {
  set(key: string, value: string, px: 'PX', ms: number, nx: 'NX'): Promise<'OK' | null>;
  eval(script: string, numKeys: number, ...args: (string | number)[]): Promise<unknown>;
  get(key: string): Promise<string | null>;
}

const RENEW = `if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('pexpire', KEYS[1], ARGV[2]) else return 0 end`;
const RELEASE = `if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end`;

/** The Redis key of the scheduler lock (a structural name, like a table name). */
export const LEADER_KEY = 'extas:jobs:leader';

export class LeaderLock {
  private held = false;

  constructor(
    private readonly redis: LockStore,
    private readonly owner: string,
    private ttlMs: number,
    private readonly key: string = LEADER_KEY,
  ) {}

  get isLeader(): boolean {
    return this.held;
  }

  /** A new lock length (the setting changed); applies from the next take or renewal. */
  setTtl(ms: number): void {
    this.ttlMs = ms;
  }

  /** Takes the lock when nobody holds it, or renews it when this worker does. True = this worker leads now. */
  async acquireOrRenew(): Promise<boolean> {
    try {
      if (this.held) {
        const ok = Number(await this.redis.eval(RENEW, 1, this.key, this.owner, this.ttlMs)) === 1;
        if (ok) return true;
        this.held = false;
      }
      this.held = (await this.redis.set(this.key, this.owner, 'PX', this.ttlMs, 'NX')) === 'OK';
    } catch {
      // Redis unreachable: lead nobody rather than risk two leaders.
      this.held = false;
    }
    return this.held;
  }

  /** Lets go of the lock (only if it is still this worker's). */
  async release(): Promise<void> {
    const was = this.held;
    this.held = false;
    if (!was) return;
    try {
      await this.redis.eval(RELEASE, 1, this.key, this.owner);
    } catch {
      // it runs out by itself
    }
  }

  /** Who holds the lock now (a worker key), or null. */
  async holder(): Promise<string | null> {
    return this.redis.get(this.key);
  }
}
