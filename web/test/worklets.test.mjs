// AudioWorklet の DSP をブラウザ外で数値検証する。
// 正弦波を通して出力の基本周波数を測り、意図どおりシフト／ピッチ変化しているか確認する。
import { readFileSync } from 'node:fs';

const SR = 48000;
const load = (file, name) => {
  let Proc = null;
  new Function('AudioWorkletProcessor', 'registerProcessor', 'sampleRate',
    readFileSync(new URL(file, import.meta.url), 'utf8'))(
    class { constructor() {} }, (n, c) => { if (n === name) Proc = c; }, SR);
  return Proc;
};

// Goertzel で指定周波数のパワーを測る
const power = (buf, f) => {
  const w = (2 * Math.PI * f) / SR;
  const coeff = 2 * Math.cos(w);
  let s1 = 0, s2 = 0;
  for (const x of buf) { const s0 = x + coeff * s1 - s2; s2 = s1; s1 = s0; }
  return Math.sqrt(s1 * s1 + s2 * s2 - coeff * s1 * s2) / buf.length;
};

const peak = (buf, lo, hi, step = 5) => {
  let best = lo, bestP = -1;
  for (let f = lo; f <= hi; f += step) { const p = power(buf, f); if (p > bestP) { bestP = p; best = f; } }
  return best;
};

function run(Proc, paramName, value, inputFreq, blocks = 200) {
  const proc = new Proc();
  const out = [];
  let phase = 0;
  const dphi = (2 * Math.PI * inputFreq) / SR;
  for (let b = 0; b < blocks; b++) {
    const inp = new Float32Array(128);
    for (let i = 0; i < 128; i++) { inp[i] = Math.sin(phase); phase += dphi; }
    const o = new Float32Array(128);
    proc.process([[inp]], [[o]], { [paramName]: [value] });
    if (b > 60) out.push(...o);   // 過渡応答を捨てる
  }
  return out;
}

let fail = 0;
const check = (label, got, want, tol) => {
  const ok = Math.abs(got - want) <= tol;
  if (!ok) fail++;
  console.log(`${ok ? '✓' : '✗'} ${label}: ${got} Hz (期待 ${want} ± ${tol})`);
};

console.log('--- SSB 周波数シフト（1000 Hz を入力）---');
const FS = load('../worklets/freq-shift.js', 'freq-shift');
check('frequency = +500 → 上へ平行移動', peak(run(FS, 'frequency', 500, 1000), 200, 2500), 1500, 20);
check('frequency = -300 → 下へ平行移動', peak(run(FS, 'frequency', -300, 1000), 200, 2500), 700, 20);
check('frequency = 0 → 素通り', peak(run(FS, 'frequency', 0, 1000), 200, 2500), 1000, 20);

console.log('\n--- HARMONY ピッチシフト（440 Hz を入力）---');
const PS = load('../worklets/pitch-shift.js', 'pitch-shift');
check('pitch = 2.0 → 1 オクターブ上', peak(run(PS, 'pitch', 2.0, 440, 400), 200, 1500, 2), 880, 15);
check('pitch = 0.5 → 1 オクターブ下', peak(run(PS, 'pitch', 0.5, 440, 400), 100, 1500, 2), 220, 15);
check('pitch = 1.0 → 素通り', peak(run(PS, 'pitch', 1.0, 440, 400), 200, 1500, 2), 440, 15);

process.exit(fail ? 1 : 0);
