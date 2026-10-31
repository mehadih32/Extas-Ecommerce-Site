// S18 · PR 380 (Blueprint B6.1, B6.5; SET-04d) — the admin's optional address list: when the owner turns it on, the
// admin opens only from the addresses on it (one address, or a range written as address/size: 203.0.113.0/24,
// 2001:db8::/48). Pure: no database. Off by default (B6.7 q12 — a list locks the owner out if his connection changes;
// the page refuses a list that does not hold the address it is saved from, and the server's break-glass switch
// `EXTAS_ADMIN_ALLOWLIST_OFF=1` opens it again).

/** An address as 16 bytes (IPv4 mapped into IPv6), or null when it is not an address. */
export function ipBytes(raw: string): Uint8Array | null {
  const s = raw.trim().toLowerCase().replace(/^\[|\]$/g, '').replace(/%.*$/, '');
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(s)) {
    const p = s.split('.').map(Number);
    if (p.some((n) => n > 255)) return null;
    const b = new Uint8Array(16);
    b[10] = 0xff;
    b[11] = 0xff;
    b.set(p, 12);
    return b;
  }
  if (!/^[0-9a-f:.]+$/.test(s) || !s.includes(':')) return null;
  let head = s;
  let tail4: number[] = [];
  const v4 = s.match(/(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (v4) {
    tail4 = v4[1]!.split('.').map(Number);
    if (tail4.some((n) => n > 255)) return null;
    head = s.slice(0, -v4[1]!.length);
    if (head.endsWith(':') && !head.endsWith('::')) head = head.slice(0, -1);
  }
  const parts = head.split('::');
  if (parts.length > 2) return null;
  const words = (x: string) => (x ? x.split(':') : []);
  const left = words(parts[0]!);
  const right = parts.length === 2 ? words(parts[1]!) : [];
  const wanted = 8 - (tail4.length ? 2 : 0);
  if (parts.length === 1 && left.length !== wanted) return null;
  if (left.length + right.length > wanted || (parts.length === 2 && left.length + right.length === wanted)) return null;
  const all = [...left, ...Array(wanted - left.length - right.length).fill('0'), ...right];
  if (all.some((w) => !/^[0-9a-f]{1,4}$/.test(w))) return null;
  const b = new Uint8Array(16);
  all.forEach((w, i) => {
    const n = parseInt(w, 16);
    b[i * 2] = n >> 8;
    b[i * 2 + 1] = n & 0xff;
  });
  if (tail4.length) b.set(tail4, 12);
  return b;
}

/** One list entry: an address and how many leading bits must match. Null when it is not a valid entry. */
export function parseAllowEntry(raw: string): { bytes: Uint8Array; bits: number } | null {
  const [addr, size, extra] = raw.trim().split('/');
  if (extra !== undefined || !addr) return null;
  const bytes = ipBytes(addr);
  if (!bytes) return null;
  const isV4 = !addr.includes(':');
  const max = isV4 ? 32 : 128;
  if (size === undefined) return { bytes, bits: 128 };
  if (!/^\d{1,3}$/.test(size) || Number(size) > max) return null;
  return { bytes, bits: Number(size) + (isV4 ? 96 : 0) };
}

/** True when the address is on the list (an empty list allows nobody; the caller decides what "off" means). */
export function addressOnList(ip: string | null | undefined, entries: readonly string[]): boolean {
  if (!ip) return false;
  const b = ipBytes(ip);
  if (!b) return false;
  return entries.some((e) => {
    const r = parseAllowEntry(e);
    if (!r) return false;
    for (let i = 0; i < r.bits; i++) {
      const byte = i >> 3;
      const mask = 0x80 >> (i & 7);
      if ((b[byte]! & mask) !== (r.bytes[byte]! & mask)) return false;
    }
    return true;
  });
}
