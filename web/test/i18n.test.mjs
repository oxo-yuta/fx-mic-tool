// 全言語で同じキーが揃っているか、置換プレースホルダが欠けていないかを確認する。
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../i18n.js', import.meta.url), 'utf8');
const langs = [...src.matchAll(/^  (\w+): \{$/gm)].map((m) => m[1]);

const keysOf = (lang) => {
  const body = src.split(new RegExp(`^  ${lang}: \\{$`, 'm'))[1].split(/^  \},/m)[0];
  return new Set([...body.matchAll(/^\s+'([^']+)':/gm)].map((m) => m[1]));
};

const base = keysOf('en');
let fail = 0;
console.log(`言語: ${langs.join(', ')} / キー数: ${base.size}`);

for (const lang of langs) {
  if (lang === 'en') continue;
  const k = keysOf(lang);
  const missing = [...base].filter((x) => !k.has(x));
  const extra = [...k].filter((x) => !base.has(x));
  const ok = !missing.length && !extra.length;
  if (!ok) fail++;
  console.log(`${ok ? '✓' : '✗'} ${lang}${missing.length ? ` 不足: ${missing.join(', ')}` : ''}${extra.length ? ` 余分: ${extra.join(', ')}` : ''}`);
}

// {name} などのプレースホルダが訳で失われていないか
const placeholdersOf = (lang) => {
  const body = src.split(new RegExp(`^  ${lang}: \\{$`, 'm'))[1].split(/^  \},/m)[0];
  const out = new Map();
  for (const m of body.matchAll(/^\s+'([^']+)': ("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'),?$/gm)) {
    out.set(m[1], new Set([...m[2].matchAll(/\{(\w+)\}/g)].map((x) => x[1])));
  }
  return out;
};
const basePh = placeholdersOf('en');
for (const lang of langs) {
  if (lang === 'en') continue;
  const ph = placeholdersOf(lang);
  const bad = [];
  for (const [key, set] of basePh) {
    const other = ph.get(key);
    if (!other) continue;
    for (const p of set) if (!other.has(p)) bad.push(`${key}:{${p}}`);
  }
  if (bad.length) { fail++; console.log(`✗ ${lang} プレースホルダ欠落: ${bad.join(', ')}`); }
}
if (!fail) console.log('✓ 全言語でキーとプレースホルダが一致');
process.exitCode = fail ? 1 : 0;
