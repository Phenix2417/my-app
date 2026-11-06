// Read a SWORD "zLD" lexicon/dictionary module (CrossWire): key -> raw entry text.
// .idx: [u32 offset, u32 size] into .dat; .dat: "KEY\n" + [u32 block, u32 entry];
// .zdx: [u32 offset, u32 size] into .zdt; a .zdt block is zlib data: u32 count, count × [u32 offset, u32 size], then text.
import fs from 'node:fs';
import zlib from 'node:zlib';

export function readZld(base) {
  const idx = fs.readFileSync(`${base}.idx`), dat = fs.readFileSync(`${base}.dat`);
  const zdx = fs.readFileSync(`${base}.zdx`), zdt = fs.readFileSync(`${base}.zdt`);
  const blocks = new Map();
  const block = (n) => {
    if (!blocks.has(n)) {
      const off = zdx.readUInt32LE(n * 8), size = zdx.readUInt32LE(n * 8 + 4);
      blocks.set(n, zlib.inflateSync(zdt.subarray(off, off + size)));
    }
    return blocks.get(n);
  };
  const out = [];
  for (let i = 0; i + 8 <= idx.length; i += 8) {
    const off = idx.readUInt32LE(i), size = idx.readUInt32LE(i + 4);
    const rec = dat.subarray(off, off + size);
    const nl = rec.indexOf(10);
    if (nl < 0) continue;
    const key = rec.subarray(0, nl).toString('utf8').replace(/\r$/, '').trim();
    if (rec.length < nl + 9) continue;
    const bn = rec.readUInt32LE(nl + 1), en = rec.readUInt32LE(nl + 5);
    const b = block(bn);
    const count = b.readUInt32LE(0);
    if (en >= count) continue;
    const eo = b.readUInt32LE(4 + en * 8), es = b.readUInt32LE(8 + en * 8);
    out.push([key, b.subarray(eo, eo + es).toString('utf8').replace(/\0+$/, '')]);
  }
  return out;
}
