// Manifestets ikoner: filerne findes, størrelserne passer, ingen gennemsigtighed, og det maskérbare ikon er et rigtigt maskable-ikon
// (fuld baggrund, motivet inden for det sikre område) og ikke bare en kopi af det almindelige.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { inflateSync } from 'node:zlib';
import { ROOT } from '../build/bundle.mjs';

const asset = rel => resolve(ROOT, 'assets', rel);
const manifest = JSON.parse(readFileSync(asset('manifest.webmanifest'), 'utf8'));
const BACKGROUND = [0x14, 0x20, 0x1E];

// Minimal PNG-afkoder (8 bit, RGB eller RGBA, ikke interlaced) → { width, height, channels, px(x, y) → [r, g, b, a] }
function decodePng(buf) {
  assert.deepEqual([...buf.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], 'PNG-signatur');
  let pos = 8, ihdr = null;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos), type = buf.toString('latin1', pos + 4, pos + 8), data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') ihdr = { width: data.readUInt32BE(0), height: data.readUInt32BE(4), depth: data[8], color: data[9], interlace: data[12] };
    if (type === 'IDAT') idat.push(data);
    pos += 12 + len;
  }
  assert.ok(ihdr && ihdr.depth === 8 && ihdr.interlace === 0 && (ihdr.color === 2 || ihdr.color === 6), `understøttet PNG: ${JSON.stringify(ihdr)}`);
  const ch = ihdr.color === 6 ? 4 : 3, stride = ihdr.width * ch;
  const raw = inflateSync(Buffer.concat(idat)), out = Buffer.alloc(stride * ihdr.height);
  for (let y = 0; y < ihdr.height; y++) {
    const f = raw[y * (stride + 1)];
    for (let i = 0; i < stride; i++) {
      const x = raw[y * (stride + 1) + 1 + i];
      const a = i >= ch ? out[y * stride + i - ch] : 0, b = y ? out[(y - 1) * stride + i] : 0, c = y && i >= ch ? out[(y - 1) * stride + i - ch] : 0;
      const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
      out[y * stride + i] = (x + [0, a, b, (a + b) >> 1, pa <= pb && pa <= pc ? a : pb <= pc ? b : c][f]) & 255;
    }
  }
  return { width: ihdr.width, height: ihdr.height, channels: ch, px: (x, y) => { const o = (y * ihdr.width + x) * ch; return [out[o], out[o + 1], out[o + 2], ch === 4 ? out[o + 3] : 255]; } };
}
const isBackground = p => p[0] === BACKGROUND[0] && p[1] === BACKGROUND[1] && p[2] === BACKGROUND[2];

test('manifestets ikoner findes, har den angivne størrelse og er uden gennemsigtighed', () => {
  for (const icon of manifest.icons) {
    assert.ok(existsSync(asset(icon.src)), icon.src);
    if (icon.type !== 'image/png') continue;
    const [w, h] = icon.sizes.split('x').map(Number);
    const png = decodePng(readFileSync(asset(icon.src)));
    assert.equal(png.width, w, icon.src); assert.equal(png.height, h, icon.src);
    for (let y = 0; y < h; y += 7) for (let x = 0; x < w; x += 7) assert.equal(png.px(x, y)[3], 255, `${icon.src} ${x},${y}`);
  }
  assert.ok(existsSync(asset('icons/apple-touch-icon.png')));
});

test('det maskérbare ikon: fuld baggrund til kanten, motiv inden for den sikre cirkel (80 % af bredden), og forskelligt fra det almindelige ikon', () => {
  const entry = manifest.icons.find(i => i.purpose === 'maskable');
  assert.ok(entry && entry.src === 'icons/icon-maskable-512.png');
  const file = readFileSync(asset(entry.src));
  assert.ok(!file.equals(readFileSync(asset('icons/icon-512.png'))), 'ikke en kopi af det almindelige ikon');
  const png = decodePng(file), n = png.width, c = (n - 1) / 2, safe = 0.4 * n;
  for (const [x, y] of [[0, 0], [n - 1, 0], [0, n - 1], [n - 1, n - 1], [n >> 1, 0], [0, n >> 1], [n - 1, n >> 1], [n >> 1, n - 1]]) assert.ok(isBackground(png.px(x, y)), `kant ${x},${y} er baggrund`);
  let art = 0, far = 0, minX = n, maxX = 0, minY = n, maxY = 0;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    if (isBackground(png.px(x, y))) continue;
    art++; far = Math.max(far, Math.hypot(x - c, y - c));
    minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  assert.ok(art > n * n * 0.05, 'motivet findes');
  assert.ok(far <= safe, `motivets yderste punkt ${far.toFixed(0)} px fra midten ligger inden for den sikre cirkel (${safe.toFixed(0)} px)`);
  assert.ok(far <= safe * 0.8, 'og med god luft (mindst 20 % af den sikre radius)');
  assert.ok(maxX - minX < n * 0.6 && maxY - minY < n * 0.6, 'motivet fylder højst 60 % af fladen');
});
