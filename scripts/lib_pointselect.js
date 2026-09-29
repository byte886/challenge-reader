// lib_pointselect.js — 视觉点选识别核心库（配置/场景驱动）
// 阶段B：颜色掩膜 → 连通域+碎片聚合 → 归一化 → 模板旋转扫描 IoU → 分类
const fs = require('fs');
const path = require('path');
const jpeg = require('jpeg-js');

// ---------- 颜色 ----------
function matchColor(r, g, b, rule) {
  if (rule.rMin != null && r < rule.rMin) return false;
  if (rule.rMax != null && r > rule.rMax) return false;
  if (rule.gMin != null && g < rule.gMin) return false;
  if (rule.gMax != null && g > rule.gMax) return false;
  if (rule.bMin != null && b < rule.bMin) return false;
  if (rule.bMax != null && b > rule.bMax) return false;
  if (rule.chromaExpr === 'R+G-2B' && (r + g - 2 * b) < rule.chromaMin) return false;
  return true;
}
function colorMask(w, h, data, rule) {
  const m = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
    if (matchColor(r, g, b, rule)) m[i] = 1;
  }
  return m;
}

// ---------- 连通域 ----------
function components(mask, w, h, minSize = 200) {
  const seen = new Uint8Array(w * h), out = [];
  const stack = new Int32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    if (!mask[i] || seen[i]) continue;
    let sp = 0; stack[sp++] = i; seen[i] = 1;
    let x0 = w, y0 = h, x1 = 0, y1 = 0, n = 0;
    while (sp) {
      const p = stack[--sp], x = p % w, y = (p / w) | 0;
      n++;
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const np2 = ny * w + nx;
          if (mask[np2] && !seen[np2]) { seen[np2] = 1; stack[sp++] = np2; }
        }
    }
    if (n >= minSize)
      out.push({ n, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, x0, y0, x1, y1 });
  }
  return out;
}

// ---------- 归一化 / 旋转 / IoU ----------
function resizeMask(mask, w, h, x0, y0, x1, y1, S = 64) {
  const out = new Uint8Array(S * S), bw = x1 - x0 + 1, bh = y1 - y0 + 1;
  for (let j = 0; j < S; j++)
    for (let i = 0; i < S; i++) {
      const sx = x0 + Math.floor(i * bw / S), sy = y0 + Math.floor(j * bh / S);
      if (mask[sy * w + sx]) out[j * S + i] = 1;
    }
  return out;
}
function rotateMask(m, ang, S = 64) {
  const out = new Uint8Array(S * S), c = (S - 1) / 2;
  const rad = ang * Math.PI / 180, co = Math.cos(rad), si = Math.sin(rad);
  for (let j = 0; j < S; j++)
    for (let i = 0; i < S; i++) {
      const dx = i - c, dy = j - c;
      const sx = Math.round(c + dx * co + dy * si);
      const sy = Math.round(c - dx * si + dy * co);
      if (sx >= 0 && sy >= 0 && sx < S && sy < S && m[sy * S + sx])
        out[j * S + i] = 1;
    }
  return out;
}
function iou(a, b) {
  let inter = 0, uni = 0;
  for (let i = 0; i < a.length; i++) {
    if (a[i] && b[i]) inter++;
    if (a[i] || b[i]) uni++;
  }
  return uni ? inter / uni : 0;
}
function tplFromPng(file, colorRule) {
  const { PNG } = require('pngjs');
  const p = PNG.sync.read(fs.readFileSync(file));
  const m = colorMask(p.width, p.height, p.data, colorRule);
  const cs = components(m, p.width, p.height);
  let X0 = p.width, Y0 = p.height, X1 = 0, Y1 = 0;
  for (const c of cs) {
    X0 = Math.min(X0, c.x0); Y0 = Math.min(Y0, c.y0);
    X1 = Math.max(X1, c.x1); Y1 = Math.max(Y1, c.y1);
  }
  if (cs.length === 0) throw new Error(`no colored component in template ${file}`);
  return resizeMask(m, p.width, p.height, X0, Y0, X1, Y1);
}

// 由场景配置构建模板库：{ key: [mask,...] }
function buildBank(scenario, baseDir) {
  const tdir = path.join(baseDir, scenario.templateDir || '.');
  const bank = {};
  for (const t of scenario.targets) {
    bank[t.key] = (t.templates || []).map((f) =>
      tplFromPng(path.join(tdir, f), scenario.icons.color));
  }
  return bank;
}

// 分类图中全部目标候选
function classifyIcons(jpgBuf, scenario, baseDir) {
  const bank = buildBank(scenario, baseDir);
  const { size, angleStep } = scenario.match;
  const dec = jpeg.decode(jpgBuf, { maxMemoryUsageMB: 4096 });
  const mask = colorMask(dec.width, dec.height, dec.data, scenario.icons.color);
  const raw = components(mask, dec.width, dec.height, scenario.icons.minComponent);
  const d = scenario.icons.mergeDistance;
  const merged = [];
  for (const c of raw) {
    const g = merged.find((m) => Math.hypot(m.cx - c.cx, m.cy - c.cy) < d);
    if (g) {
      g.x0 = Math.min(g.x0, c.x0); g.y0 = Math.min(g.y0, c.y0);
      g.x1 = Math.max(g.x1, c.x1); g.y1 = Math.max(g.y1, c.y1);
      g.cx = (g.x0 + g.x1) / 2; g.cy = (g.y0 + g.y1) / 2;
    } else merged.push({ x0: c.x0, y0: c.y0, x1: c.x1, y1: c.y1, cx: c.cx, cy: c.cy });
  }
  const angles = Array.from({ length: Math.floor(360 / angleStep) }, (_, i) => i * angleStep);
  return merged.map((m) => {
    const cm = resizeMask(mask, dec.width, dec.height, m.x0, m.y0, m.x1, m.y1, size);
    const scores = {};
    for (const [key, tpls] of Object.entries(bank)) {
      let best = 0;
      for (const tpl of tpls)
        for (const a of angles) best = Math.max(best, iou(cm, rotateMask(tpl, a, size)));
      scores[key] = +best.toFixed(3);
    }
    return {
      px: Math.round(m.cx / dec.width * 100),
      py: Math.round(m.cy / dec.height * 100),
      x: Math.round(m.cx), y: Math.round(m.cy),
      scores
    };
  });
}

// 按目标 key + 场景特殊规则选候选
function pickTarget(candidates, targetKey, scenario) {
  const threshold = scenario.match.threshold;
  const rule = scenario.specialRules && scenario.specialRules[targetKey];
  if (rule === 'nonTargetBelow') {
    return candidates.find((ic) => Object.entries(ic.scores)
      .filter(([k]) => k !== targetKey).every(([, v]) => v < threshold));
  }
  return candidates.find((ic) => ic.scores[targetKey] >= threshold);
}

// 由提示文本映射目标 key
function mapTarget(text, scenario) {
  for (const t of scenario.targets) {
    if (new RegExp(t.regex, 'i').test(text)) return t.key;
  }
  return null;
}

module.exports = { classifyIcons, pickTarget, mapTarget, colorMask, components, matchColor };
