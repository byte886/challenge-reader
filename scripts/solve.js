#!/usr/bin/env node
// solve.js — 视觉点选一步求解 CLI
// 用法: node solve.js <challenge.jpg> --scenario <scenario.json> [--text "外部给定提示文本"] [--json]
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const lib = require('./lib_pointselect');

const exec = (cmd, args) => new Promise((resolve, reject) =>
  execFile(cmd, args, { maxBuffer: 16 * 1024 * 1024 }, (e, so, se) =>
    e ? reject(new Error(`${cmd}: ${e.message} ${se}`)) : resolve(so)));

async function main() {
  const argv = process.argv.slice(2);
  const img = argv[0];
  const get = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : null; };
  const scenarioPath = get('--scenario');
  const externalText = get('--text');
  if (!img || !scenarioPath) {
    console.error('usage: solve.js <challenge.jpg> --scenario <scenario.json> [--text "..."]');
    process.exit(1);
  }
  const scenario = JSON.parse(fs.readFileSync(scenarioPath, 'utf8'));
  const baseDir = path.dirname(path.resolve(scenarioPath));
  const scriptDir = __dirname;
  const jpgBuf = fs.readFileSync(img);

  // 阶段 A：读提示
  let text = externalText || '';
  if (!text) {
    const colorName = scenario.instruction.colorName || 'yellow';
    const prefix = `/tmp/ps-${process.pid}`;
    await exec('python3', [path.join(scriptDir, 'prep_colored_text.py'),
      img, prefix, '--color', colorName]);
    for (const cand of ['a', 'b']) {
      try { text += '\n' + await exec(path.join(scriptDir, 'ocr_text'), [`${prefix}-${cand}.png`]); }
      catch (e) { /* OCR 候选失败可忽略，继续另一候选 */ }
    }
  }
  const targetKey = lib.mapTarget(text, scenario);

  // 阶段 B/C：定位与选择
  const candidates = lib.classifyIcons(jpgBuf, scenario, baseDir);
  let pick = targetKey ? lib.pickTarget(candidates, targetKey, scenario) : null;

  const result = {
    scenario: scenario.name,
    instructionText: text.trim(),
    target: targetKey,
    candidates,
    result: pick
      ? { status: 'ok', px: pick.px, py: pick.py, x: pick.x, y: pick.y, score: pick.scores[targetKey] }
      : { status: 'ambiguous', reason: targetKey ? 'no candidate met the rule' : 'target not mapped from instruction' }
  };
  console.log(JSON.stringify(result, null, 2));
  process.exit(pick ? 0 : 3);
}
main().catch((e) => { console.error(e); process.exit(2); });
