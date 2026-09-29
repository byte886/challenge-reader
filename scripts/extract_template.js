#!/usr/bin/env node
// extract_template.js — 从挑战图提取指定位置的彩色目标为模板 PNG
// 用法: node extract_template.js <challenge.jpg> <out.png> <px> <py> [--color yellow|green]
const jpeg = require('jpeg-js');
const { PNG } = require('pngjs');
const fs = require('fs');
const { matchColor } = require('./lib_pointselect');

const argv = process.argv.slice(2);
const [src, out, pxS, pyS] = argv;
const ci = argv.indexOf('--color');
const color = ci >= 0 ? argv[ci + 1] : 'green';
const px = +pxS, py = +pyS;
const RULES = {
  green: { gMin: 170, rMax: 140, bMax: 140 },
  yellow: { rMin: 170, gMin: 170, bMax: 130, chromaExpr: 'R+G-2B', chromaMin: 60 }
};
const rule = RULES[color];
const im = jpeg.decode(fs.readFileSync(src));
const { width: W, height: H, data } = im;
const m = new Uint8Array(W * H);
for (let i = 0; i < W * H; i++) {
  if (matchColor(data[i * 4], data[i * 4 + 1], data[i * 4 + 2], rule)) m[i] = 1;
}
const seen = new Uint8Array(W * H);
const cs = [];
for (let i = 0; i < W * H; i++) {
  if (!m[i] || seen[i]) continue;
  const st = [i]; seen[i] = 1;
  let x0 = W, y0 = H, x1 = 0, y1 = 0, n = 0;
  while (st.length) {
    const p = st.pop(), x = p % W, y = (p / W) | 0;
    n++;
    if (x < x0) x0 = x; if (x > x1) x1 = x;
    if (y < y0) y0 = y; if (y > y1) y1 = y;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const q = ny * W + nx;
        if (m[q] && !seen[q]) { seen[q] = 1; st.push(q); }
      }
  }
  if (n > 800) cs.push({ x0, y0, x1, y1 });
}
const c = cs.find((cc) =>
  Math.abs(((cc.x0 + cc.x1) / 2) / W - px / 100) < 0.06 &&
  Math.abs(((cc.y0 + cc.y1) / 2) / H - py / 100) < 0.06);
if (!c) { console.error('component not found'); process.exit(1); }
const pad = 12;
c.x0 = Math.max(0, c.x0 - pad); c.y0 = Math.max(0, c.y0 - pad);
c.x1 = Math.min(W - 1, c.x1 + pad); c.y1 = Math.min(H - 1, c.y1 + pad);
const w = c.x1 - c.x0 + 1, h = c.y1 - c.y0 + 1;
const png = new PNG({ width: w, height: h });
for (let j = 0; j < h; j++)
  for (let i = 0; i < w; i++) {
    const si = (c.y0 + j) * W + (c.x0 + i), di = (j * w + i) * 4;
    png.data[di] = data[si * 4]; png.data[di + 1] = data[si * 4 + 1];
    png.data[di + 2] = data[si * 4 + 2]; png.data[di + 3] = 255;
  }
fs.writeFileSync(out, PNG.sync.write(png));
console.log('wrote', out, w + 'x' + h);
