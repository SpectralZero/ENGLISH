/* Generates the PWA PNG icons with zero dependencies.
   Run:  node scripts/make-icons.mjs                                   */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets');
mkdirSync(OUT, { recursive: true });

/* ---------- minimal PNG writer ---------- */
const CRC = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
const crc32 = buf => {
  let c = -1;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
};
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function png(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ---------- the artwork: gradient + three rising steps ---------- */
const lerp = (a, b, t) => a + (b - a) * t;
function draw(size, { padded = false } = {}) {
  const px = Buffer.alloc(size * size * 4);
  const set = (x, y, r, g, b, a = 255) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const i = (y * size + x) * 4;
    const ia = a / 255, na = 1 - ia;
    px[i]     = px[i] * na + r * ia;
    px[i + 1] = px[i + 1] * na + g * ia;
    px[i + 2] = px[i + 2] * na + b * ia;
    px[i + 3] = Math.max(px[i + 3], a);
  };

  // diagonal brand gradient  #6c5cff → #8b5cf6 → #22d3ee
  const stops = [[0, [108, 92, 255]], [0.55, [139, 92, 246]], [1, [34, 211, 238]]];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const t = Math.min(1, (x / size) * 0.55 + (y / size) * 0.65);
      let c = stops[0][1];
      for (let s = 1; s < stops.length; s++) {
        if (t <= stops[s][0]) {
          const [t0, c0] = stops[s - 1], [t1, c1] = stops[s];
          const k = (t - t0) / (t1 - t0);
          c = [0, 1, 2].map(i => Math.round(lerp(c0[i], c1[i], k)));
          break;
        }
        c = stops[s][1];
      }
      set(x, y, c[0], c[1], c[2], 255);
    }
  }

  // soft highlight
  const cx = size * 0.78, cy = size * 0.16, rad = size * 0.42;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const d = Math.hypot(x - cx, y - cy);
    if (d < rad) set(x, y, 255, 255, 255, Math.round(38 * (1 - d / rad)));
  }

  // three white steps (خُطوة = a step)
  const m = padded ? size * 0.26 : size * 0.2;       // maskable icons need a safe zone
  const w = size - m * 2;
  const bar = w * 0.26, gap = w * 0.11;
  const heights = [0.30, 0.52, 0.78];
  heights.forEach((h, i) => {
    const bx = Math.round(m + i * (bar + gap));
    const bh = Math.round(w * h);
    const by = Math.round(size - m - bh);
    const r = Math.round(bar * 0.28);
    for (let y = by; y < by + bh; y++) {
      for (let x = bx; x < bx + bar; x++) {
        // rounded top corners
        const dx = x < bx + r ? bx + r - x : x > bx + bar - r - 1 ? x - (bx + bar - r - 1) : 0;
        const dy = y < by + r ? by + r - y : 0;
        if (dx && dy && Math.hypot(dx, dy) > r) continue;
        set(x, y, 255, 255, 255, 255);
      }
    }
  });
  return px;
}

for (const [name, size, opts] of [
  ['icon-180.png', 180, {}],
  ['icon-192.png', 192, {}],
  ['icon-512.png', 512, {}],
  ['icon-maskable-512.png', 512, { padded: true }],
]) {
  writeFileSync(join(OUT, name), png(size, size, draw(size, opts)));
  console.log('✓', name);
}
