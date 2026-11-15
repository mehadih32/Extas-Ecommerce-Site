// PR 846 — Settings › Data & privacy › "Everything (one ZIP)": a small ZIP writer (no compression, "stored" entries) so the three
// export files the page already makes (orders, customers, products and stock) come in one download. Pure and dependency-free; the
// page builds the ZIP in the browser from files the owner was already allowed to export, so no new server door opens.

const CRC_TABLE = (() => {
  const t = new Uint32Array(256); // hardcode-ok: the CRC-32 table size
  for (let n = 0; n < 256; n++) { // hardcode-ok: the CRC-32 table size
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; // hardcode-ok: the CRC-32 polynomial
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(data: Uint8Array): number {
  let c = 0xffffffff; // hardcode-ok: the CRC-32 start value
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]!) & 0xff]! ^ (c >>> 8); // hardcode-ok: CRC-32 step
  return (c ^ 0xffffffff) >>> 0; // hardcode-ok: the CRC-32 end value
}

export interface ZipFile {
  name: string;
  data: Uint8Array | string;
}

/** MS-DOS date and time words for a ZIP entry (the format keeps two-second steps from 1980). */
function dosStamp(d: Date): { time: number; date: number } {
  const y = Math.max(1980, d.getUTCFullYear()); // hardcode-ok: the DOS date starts in 1980
  return { time: (d.getUTCHours() << 11) | (d.getUTCMinutes() << 5) | (d.getUTCSeconds() >> 1), date: ((y - 1980) << 9) | ((d.getUTCMonth() + 1) << 5) | d.getUTCDate() }; // hardcode-ok: DOS bit layout
}

/** A ZIP file holding `files` as they are (UTF-8 names, no compression). Two files may not share a name. */
export function buildZip(files: readonly ZipFile[], now: Date = new Date()): Uint8Array {
  const enc = new TextEncoder();
  const seen = new Set<string>();
  const { time, date } = dosStamp(now);
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const f of files) {
    if (seen.has(f.name)) throw new Error(`duplicate file name ${f.name}`);
    seen.add(f.name);
    const name = enc.encode(f.name);
    const data = typeof f.data === 'string' ? enc.encode(f.data) : f.data;
    const crc = crc32(data);
    const local = new Uint8Array(30 + name.length + data.length); // hardcode-ok: the fixed size of a local file header
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true); // hardcode-ok: ZIP local header signature
    lv.setUint16(4, 20, true); // hardcode-ok: version needed
    lv.setUint16(6, 0x0800, true); // hardcode-ok: UTF-8 names
    lv.setUint16(8, 0, true); // hardcode-ok: stored, no compression
    lv.setUint16(10, time, true);
    lv.setUint16(12, date, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, data.length, true);
    lv.setUint32(22, data.length, true);
    lv.setUint16(26, name.length, true);
    lv.setUint16(28, 0, true);
    local.set(name, 30); // hardcode-ok: after the fixed header
    local.set(data, 30 + name.length); // hardcode-ok: after the name
    const central = new Uint8Array(46 + name.length); // hardcode-ok: the fixed size of a central directory entry
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true); // hardcode-ok: ZIP central header signature
    cv.setUint16(4, 20, true); // hardcode-ok: version made by
    cv.setUint16(6, 20, true); // hardcode-ok: version needed
    cv.setUint16(8, 0x0800, true); // hardcode-ok: UTF-8 names
    cv.setUint16(10, 0, true); // hardcode-ok: stored
    cv.setUint16(12, time, true);
    cv.setUint16(14, date, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, data.length, true);
    cv.setUint16(28, name.length, true);
    cv.setUint32(42, offset, true); // hardcode-ok: offset of the local header
    central.set(name, 46); // hardcode-ok: after the fixed header
    locals.push(local);
    centrals.push(central);
    offset += local.length;
  }
  const dirSize = centrals.reduce((n, c) => n + c.length, 0);
  const end = new Uint8Array(22); // hardcode-ok: the fixed size of the end record
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true); // hardcode-ok: ZIP end signature
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, dirSize, true);
  ev.setUint32(16, offset, true);
  const out = new Uint8Array(offset + dirSize + end.length);
  let at = 0;
  for (const part of [...locals, ...centrals, end]) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}
