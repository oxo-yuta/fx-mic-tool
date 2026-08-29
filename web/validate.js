// config.json の検証。tools/validate.py と同じ規則をブラウザ側に移植したもの。
// 壊れた config.json は fx-mic を起動不能にするため、書き出し前に必ず通す。

import {
  EFFECTS, ALIASES, ONCE_PER_CHAIN, LFO_SHAPES, PLAYMODES,
  MAX_SLOTS, DISK_BUDGET, BUDGET_WARN, WAV_MAX_RATE, UNVERIFIED_PARAMS,
} from './spec.js';

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

class Report {
  constructor() { this.errors = []; this.warnings = []; this.notes = []; }
  error(msg, where) { this.errors.push({ msg, where }); }
  warn(msg, where) { this.warnings.push({ msg, where }); }
  note(msg, where) { this.notes.push({ msg, where }); }
  get ok() { return this.errors.length === 0; }
}

function checkEffect(eff, where, rep) {
  if (!eff || typeof eff !== 'object') {
    rep.error('エフェクトはオブジェクトである必要がある', where);
    return null;
  }
  const raw = eff.effect;
  if (typeof raw !== 'string') { rep.error('"effect" キーがない', where); return null; }
  if (raw !== raw.toUpperCase()) {
    rep.error(`エフェクト名は大文字で書く（"${raw}" → "${raw.toUpperCase()}"）`, where);
  }
  let key = raw.toUpperCase();
  if (ALIASES[key]) {
    rep.warn(`"${key}" は同梱 readme.pdf の綴り。公式ガイド 1.1.1 は "${ALIASES[key]}"。どちらが実機で通るかは未検証`, where);
    key = ALIASES[key];
  }
  const spec = EFFECTS[key];
  if (!spec) {
    rep.error(`未知のエフェクト "${raw}"（有効: ${Object.keys(EFFECTS).join(', ')}）`, where);
    return null;
  }
  for (const [k, v] of Object.entries(eff)) {
    if (k === 'effect') continue;
    if (k === 'BUS') {
      if (v !== 1 && v !== 2) rep.error(`BUS は 1 または 2（実際: ${JSON.stringify(v)}）`, where);
      continue;
    }
    const range = spec.params[k];
    if (!range) {
      rep.error(`${key} に "${k}" というパラメータはない（有効: ${Object.keys(spec.params).join(', ')}）`, where);
      continue;
    }
    if (!isNum(v)) { rep.error(`${k} は数値である必要がある（実際: ${JSON.stringify(v)}）`, where); continue; }
    const [lo, hi] = range;
    if (v < lo || v > hi) rep.error(`${k} = ${v} が範囲外（${lo} 〜 ${hi}）`, where);
    if (UNVERIFIED_PARAMS[key]?.includes(k)) {
      rep.warn(`${key} の "${k}" は readme.pdf にのみ記載の未検証パラメータ`, where);
    }
  }
  return key;
}

function checkModulation(mod, kind, chain, where, rep) {
  const w = `${where}.${kind}`;
  if (!mod || typeof mod !== 'object') { rep.error('オブジェクトである必要がある', w); return; }
  const targetLfo = mod.target === 'lfo';
  if ('target' in mod && !targetLfo) rep.error('"target" に使えるのは "lfo" のみ', w);

  if (targetLfo) {
    if ('row' in mod) rep.warn('"target": "lfo" のときは "row" は不要', w);
    if (!['speed', 'depth', 'phase'].includes(mod.param)) {
      rep.warn(`LFO への変調で "${mod.param}" はドキュメント化されていない（想定: speed / depth / phase）`, w);
    }
  } else {
    const row = mod.row;
    if (!Number.isInteger(row)) { rep.error('"row" が無いか整数でない', w); return; }
    if (row < 0 || row >= chain.length) {
      rep.error(`row ${row} は list の範囲外（0 〜 ${chain.length - 1}）`, w);
      return;
    }
    const effName = chain[row];
    if (effName && !EFFECTS[effName].params[mod.param]) {
      rep.error(`row ${row} の ${effName} に "${mod.param}" というパラメータはない（有効: ${Object.keys(EFFECTS[effName].params).join(', ')}）`, w);
    }
  }
  if ('depth' in mod && !isNum(mod.depth)) rep.error('"depth" は数値である必要がある', w);

  if (kind === 'lfo') {
    if (mod.shape !== undefined && !LFO_SHAPES.includes(mod.shape)) {
      rep.error(`未知の shape "${mod.shape}"（有効: ${LFO_SHAPES.join(', ')}）`, w);
    }
    if ('mpy' in mod) rep.warn('"mpy" は readme.pdf の例にのみ登場する未検証キー', w);
  }
}

function checkPreset(preset, idx, rep) {
  let where = `presets[${idx}]`;
  if (!preset || typeof preset !== 'object') { rep.error('オブジェクトである必要がある', where); return; }
  if (preset.name) where = `presets[${idx}] "${preset.name}"`;

  for (const k of Object.keys(preset)) {
    if (!['pos', 'name', 'comment', 'list', 'handle', 'shake', 'lfo', 'trigger'].includes(k)) {
      rep.warn(`未知のキー "${k}"`, where);
    }
  }
  if ('pos' in preset && !(Number.isInteger(preset.pos) && preset.pos >= 0 && preset.pos < MAX_SLOTS)) {
    rep.error(`pos は 0〜${MAX_SLOTS - 1}（実際: ${JSON.stringify(preset.pos)}）`, where);
  }

  const rawChain = preset.list;
  if (!Array.isArray(rawChain) || rawChain.length === 0) {
    rep.error('"list" が無いか空', where);
    return;
  }
  const chain = rawChain.map((e, i) => checkEffect(e, `${where}.list[${i}]`, rep));

  for (const name of ONCE_PER_CHAIN) {
    const n = chain.filter((c) => c === name).length;
    if (n > 1) rep.error(`${name} が ${n} 回使われている（1 チェーンにつき 1 回まで）`, where);
  }

  const sampleIdx = chain.indexOf('SAMPLE');
  if (sampleIdx === -1) {
    rep.warn('チェーンに {"effect": "SAMPLE"} が無いためサンプル音が出ない（意図的なら無視してよい）', where);
  } else if (sampleIdx !== chain.length - 1) {
    rep.note(`SAMPLE が row ${sampleIdx} にあるため、後続のエフェクトがサンプルにもかかる（ドライにしたいなら最後に置く）`, where);
  }

  const trig = preset.trigger;
  if (trig === undefined) {
    if (sampleIdx !== -1) rep.warn('"trigger" が無い（TE 公式パックは SAMPLE の row を必ず指定している）', where);
  } else if (!trig || !Number.isInteger(trig.row)) {
    rep.error('{"row": <整数>} である必要がある', `${where}.trigger`);
  } else if (trig.row < 0 || trig.row >= chain.length) {
    rep.error(`row ${trig.row} は list の範囲外（0 〜 ${chain.length - 1}）`, `${where}.trigger`);
  } else if (chain[trig.row] !== 'SAMPLE') {
    rep.error(`row ${trig.row} は ${chain[trig.row]} であって SAMPLE ではない${sampleIdx !== -1 ? `（SAMPLE は row ${sampleIdx}）` : ''}`, `${where}.trigger`);
  }

  for (const kind of ['handle', 'shake', 'lfo']) {
    if (kind in preset) checkModulation(preset[kind], kind, chain, where, rep);
  }
}

function checkSamples(samples, files, rep) {
  if (!Array.isArray(samples)) { rep.error('"samples" は配列である必要がある'); return; }
  if (samples.length > MAX_SLOTS) rep.error(`samples は最大 ${MAX_SLOTS} 件（実際: ${samples.length} 件）`);

  const used = new Map();
  samples.forEach((s, i) => {
    const where = `samples[${i}]`;
    if (!s || typeof s !== 'object') { rep.error('オブジェクトである必要がある', where); return; }
    for (const k of Object.keys(s)) {
      if (k === 'duck') rep.warn('"duck" は readme.pdf の例にのみ登場する未検証キー', where);
      else if (!['pos', 'file', 'playmode'].includes(k)) rep.warn(`未知のキー "${k}"`, where);
    }
    const pos = s.pos ?? i;
    if (!(Number.isInteger(pos) && pos >= 0 && pos < MAX_SLOTS)) {
      rep.error(`pos は 0〜${MAX_SLOTS - 1}（実際: ${JSON.stringify(pos)}）`, where);
    } else if (used.has(pos)) {
      rep.error(`スロット ${pos} が samples[${used.get(pos)}] と重複`, where);
    } else used.set(pos, i);

    if (s.playmode === undefined) rep.warn('"playmode" 未指定', where);
    else if (!PLAYMODES.includes(s.playmode)) {
      rep.error(`未知の playmode "${s.playmode}"（有効: ${PLAYMODES.join(', ')}）`, where);
    }

    if (typeof s.file !== 'string' || !s.file) { rep.error('"file" が無い', where); return; }
    if (s.file.includes('/') || s.file.includes('\\')) {
      rep.warn(`サブフォルダ付きパス "${s.file}" は公式ガイド未記載・未検証。まずはルート直下で運用すること`, where);
    }
    if (files && !files.has(s.file)) rep.error(`ファイルが見つからない: ${s.file}`, where);
  });
}

/**
 * @param {object|string} config  パース済みオブジェクト、または生の JSON 文字列
 * @param {{files?: Map<string, {size:number}>}} opts  ディスクに置くファイル一覧
 */
export function validate(config, opts = {}) {
  const rep = new Report();
  const files = opts.files ?? null;

  let cfg = config;
  if (typeof config === 'string') {
    try {
      cfg = JSON.parse(config);
    } catch (e) {
      const m = /position (\d+)/.exec(e.message);
      let at = '';
      if (m) {
        const pos = Number(m[1]);
        const before = config.slice(0, pos);
        at = `（${before.split('\n').length} 行 ${pos - before.lastIndexOf('\n')} 文字目）`;
      }
      rep.error(`JSON 構文エラー: ${e.message}${at}`);
      rep.error('このまま書き出すと fx-mic は起動しなくなる');
      return rep;
    }
  }

  if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) {
    rep.error('config.json のトップレベルはオブジェクト {} である必要がある');
    return rep;
  }

  for (const k of Object.keys(cfg)) {
    if (!['name', 'samples', 'presets'].includes(k)) rep.warn(`トップレベルに未知のキー "${k}"`);
  }

  if ('samples' in cfg) checkSamples(cfg.samples, files, rep);
  else rep.note('"samples" が無いので工場出荷サンプルが使われる');

  if (!('presets' in cfg)) {
    rep.note('"presets" が無いので工場出荷プリセットが使われる');
  } else if (!Array.isArray(cfg.presets)) {
    rep.error('"presets" は配列である必要がある');
  } else {
    if (cfg.presets.length > MAX_SLOTS) {
      rep.error(`presets は最大 ${MAX_SLOTS} 件（実際: ${cfg.presets.length} 件）`);
    }
    const used = new Map();
    cfg.presets.forEach((p, i) => {
      checkPreset(p, i, rep);
      if (p && Number.isInteger(p.pos)) {
        if (used.has(p.pos)) rep.error(`pos ${p.pos} が presets[${used.get(p.pos)}] と重複`, `presets[${i}]`);
        used.set(p.pos, i);
      }
    });
  }

  if (files) {
    let total = 0;
    for (const f of files.values()) total += f.size;
    rep.note(`ディスクに転送されるファイル: ${files.size} 件 / 合計 ${total.toLocaleString()} bytes（1 MB 予算の ${Math.round((total / DISK_BUDGET) * 100)}%）`);
    if (total > DISK_BUDGET) rep.error(`合計 ${total.toLocaleString()} bytes が 1 MB 予算（${DISK_BUDGET.toLocaleString()}）を超えている`);
    else if (total > BUDGET_WARN) rep.warn(`合計 ${total.toLocaleString()} bytes は 1 MB 予算のほぼ上限。余裕を持たせることを推奨`);
  }
  return rep;
}

/** wav の RIFF ヘッダを解析してフォーマットを返す。tools/validate.py の read_wav_format と同等。 */
export function readWavFormat(arrayBuffer) {
  const dv = new DataView(arrayBuffer);
  const tag4 = (o) => String.fromCharCode(dv.getUint8(o), dv.getUint8(o + 1), dv.getUint8(o + 2), dv.getUint8(o + 3));
  if (dv.byteLength < 12 || tag4(0) !== 'RIFF' || tag4(8) !== 'WAVE') return { error: 'RIFF/WAVE ヘッダではない' };

  let off = 12, fmt = null, dataBytes = null;
  while (off + 8 <= dv.byteLength) {
    const id = tag4(off);
    const size = dv.getUint32(off + 4, true);
    if (id === 'fmt ') fmt = { off: off + 8, size };
    else if (id === 'data') dataBytes = size;
    off += 8 + size + (size % 2);
    if (fmt && dataBytes !== null) break;
  }
  if (!fmt || fmt.size < 16) return { error: 'fmt チャンクが見つからない' };

  let format = dv.getUint16(fmt.off, true);
  const channels = dv.getUint16(fmt.off + 2, true);
  const rate = dv.getUint32(fmt.off + 4, true);
  const bits = dv.getUint16(fmt.off + 14, true);
  if (format === 0xfffe && fmt.size >= 40) format = dv.getUint16(fmt.off + 24, true); // EXTENSIBLE

  const isFloat = format === 3;
  const okInt = format === 1 && [8, 16, 24].includes(bits);
  const okFloat = isFloat && bits === 32;
  const duration = dataBytes && rate && channels && bits
    ? dataBytes / ((rate * channels * bits) / 8) : null;

  return {
    format, channels, rate, bits, isFloat, duration,
    supported: okInt || okFloat,
    rateOk: rate <= WAV_MAX_RATE,
    channelsOk: channels === 1 || channels === 2,
  };
}
