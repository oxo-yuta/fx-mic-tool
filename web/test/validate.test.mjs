import { validate } from '../validate.js';
import { readFileSync } from 'node:fs';

const packs = [
  'vendor/te-packs/ep-2350_preset_pack-broken_radio/config.json',
  'vendor/te-packs/ep-2350_preset_pack-dub/config.json',
  'vendor/te-packs/ep-2350_preset_pack-mysterious/config.json',
  'vendor/te-packs/ep-2350_sample_pack_new_shouts/config.json',
  'packs/radio-fx/config.json',
  'packs/_template/config.json',
];
let fail = 0;
for (const p of packs) {
  const files = p.includes('new_shouts')
    ? new Map(['toy.wav','funfair.wav','ork.wav','villhem.wav'].map(f => [f, {size:200000}]))
    : null;
  const r = validate(readFileSync(p, 'utf8'), { files });
  console.log(`${r.ok ? '✓' : '✗'} ${p}  (err ${r.errors.length} / warn ${r.warnings.length})`);
  if (!r.ok) { fail++; r.errors.forEach(e => console.log(`    ${e.where ?? ''} ${e.msg}`)); }
}

console.log('\n--- 不正な config でエラーを検出できるか ---');
const bad = JSON.stringify({
  name: 'BAD',
  samples: [{ file: 'missing.wav', playmode: 'loop' }, { pos: 0, file: 'x.wav', playmode: 'oneshot', duck: 1.0 }],
  presets: [{
    pos: 5,
    list: [
      { effect: 'reverb', time: 0.5 }, { effect: 'REVERB', time: 2.0 },
      { effect: 'WOBBLE', amount: 1.0 }, { effect: 'DIST', amount: 99.0, cutoff: 0.5, BUS: 3 },
    ],
    handle: { row: 9, param: 'cutoff', depth: 0.5 },
    lfo: { row: 1, param: 'nope', shape: 'triangle', mpy: 1.0 },
    trigger: { row: 0 },
  }],
});
const r = validate(bad, { files: new Map() });
console.log(`エラー ${r.errors.length} 件 / 警告 ${r.warnings.length} 件`);
r.errors.forEach(e => console.log(`  ✗ ${e.where ?? ''} ${e.msg}`));

console.log('\n--- 末尾カンマ ---');
const r2 = validate('{\n "name": "X",\n "presets": [\n  { "pos": 0, },\n ]\n}');
r2.errors.forEach(e => console.log(`  ✗ ${e.msg}`));
if (fail) process.exitCode = 1;

// ── テンプレートと辞書の健全性 ───────────────────────────
{
  const { TEMPLATES } = await import('../templates.js');
  const { EFFECTS } = await import('../spec.js');
  console.log('\n--- スターターテンプレート ---');
  let bad = 0;
  for (const tpl of TEMPLATES) {
    const r = validate(JSON.stringify(tpl.config));
    const ok = r.errors.length === 0;
    if (!ok) bad++;
    console.log(`${ok ? '✓' : '✗'} ${tpl.name} (presets ${(tpl.config.presets ?? []).length} / err ${r.errors.length} / warn ${r.warnings.length})`);
    r.errors.forEach(e => console.log(`    ${e.where ?? ''} ${e.msg}`));
  }

  console.log('\n--- ホバー説明の網羅 ---');
  const { effectDesc, paramDesc } = await import('../descriptions.js');
  const missing = [];
  for (const [e, s] of Object.entries(EFFECTS)) {
    for (const lang of ['en', 'ja']) {
      if (!effectDesc(e, lang)) missing.push(`${lang}:${e}`);
      for (const p of Object.keys(s.params)) if (!paramDesc(e, p, lang)) missing.push(`${lang}:${e}.${p}`);
    }
  }
  console.log(missing.length ? `✗ 説明なし: ${missing.join(', ')}` : '✓ en / ja とも全エフェクト・全パラメータに説明あり');
  if (missing.length) bad++;

  if (bad) process.exitCode = 1;
}
