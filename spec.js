// EP-2350 fx-mic の仕様定義。tools/validate.py の表と同じ内容を単一ソースとして持つ。
// 出典: 公式ガイド ver 1.1.1 第7章 / factory/readme.pdf / TE 公式パック実物
// 詳細は docs/config-json.md を参照。

export const DISK_BUDGET = 1_000_000;
export const BUDGET_WARN = 900_000;
export const MAX_SLOTS = 4;
export const WAV_MAX_RATE = 96_000;

// param: [min, max, default, 表示用の刻み]
export const EFFECTS = {
  BALANCE: {
    label: 'balance',
    params: { balance: [0, 1, 0.5, 0.01] },
  },
  DELAY: {
    label: 'delay',
    once: true,
    params: {
      time: [0, 1.1, 0.5, 0.01],
      'lowpass-cutoff': [0, 1, 1, 0.01],
      'highpass-cutoff': [0, 1, 0, 0.01],
      'wet-level': [0, 1, 0.5, 0.01],
      'dry-level': [0, 1, 1, 0.01],
      echo: [0, 1, 0.4, 0.01],
      'cross-feed': [0, 1, 0, 0.01],
      balance: [0, 1, 0.5, 0.01],
    },
  },
  DIST: {
    label: 'dist',
    params: {
      amount: [0, 40, 10, 0.1],
      'lowpass-cutoff': [0, 1, 1, 0.01],
      'highpass-cutoff': [0, 1, 0, 0.01],
      mix: [0, 1, 0.5, 0.01],
    },
  },
  EQUALISER: {
    label: 'equaliser',
    params: {
      cutoff: [0, 1, 0.5, 0.01],
      Q: [0, 1, 0.5, 0.01],
      gain: [-1, 1, 0, 0.01],
    },
  },
  HARMONY: {
    label: 'harmony',
    once: true,
    params: {
      'dry-level': [0, 1, 0.5, 0.01],
      pitch: [0.5, 2, 1, 0.01],
    },
  },
  LOWPASS: {
    label: 'lowpass',
    params: { cutoff: [0, 1, 0.5, 0.01], Q: [0, 1, 0, 0.01] },
  },
  HIGHPASS: {
    label: 'highpass',
    params: { cutoff: [0, 1, 0.5, 0.01], Q: [0, 1, 0, 0.01] },
  },
  SAMPLE: {
    label: 'sample',
    params: {
      speed: [0, 4, 1, 0.01],
      pitch: [-24, 24, 0, 0.5],
      level: [0, 1, 1, 0.01],
      balance: [0, 1, 0.5, 0.01],
    },
  },
  REVERB: {
    label: 'reverb',
    once: true,
    params: {
      'dry-level': [0, 1, 1, 0.01],
      'wet-level': [0, 1, 0.4, 0.01],
      time: [0, 1, 0.5, 0.01],
      'spring-mix': [0, 1, 0, 0.01],
      'highpass-cutoff': [0, 1, 0, 0.01],
    },
  },
  RING: {
    label: 'ring',
    params: { frequency: [0, 20000, 400, 1], mix: [0, 1, 0.5, 0.01] },
  },
  SSB: {
    label: 'ssb',
    once: true,
    params: { frequency: [-20000, 20000, 0, 1] },
  },
};

// Q は factory/readme.pdf にのみ記載（公式ガイド 1.1.1 の表では省略）。未検証。
export const UNVERIFIED_PARAMS = { LOWPASS: ['Q'], HIGHPASS: ['Q'] };

export const ONCE_PER_CHAIN = Object.keys(EFFECTS).filter((k) => EFFECTS[k].once);
export const LFO_SHAPES = ['sine', 'square', 'sawtooth', 'random'];
export const PLAYMODES = ['oneshot', 'hold', 'startstop'];
export const MOD_KINDS = ['handle', 'shake', 'lfo'];

// 同梱 readme.pdf は米国綴り。公式ガイド 1.1.1 は EQUALISER。どちらが実機で通るかは未検証。
export const ALIASES = { EQUALIZER: 'EQUALISER' };

// オレンジボタンは 1 番目がクリーンなので pos と押す回数は 1 ずれる。
export const FACTORY_PRESETS = ['ECHO', 'SPRING', 'PIXIE', 'ROBOT'];
export const FACTORY_SAMPLES = ['horn', 'applause', 'ringside bell', 'censor beep'];

export const buttonPosition = (pos) => pos + 2; // pos 0 → オレンジボタン 2 番目

export const defaultParams = (effect) => {
  const spec = EFFECTS[effect];
  if (!spec) return {};
  const out = {};
  for (const [k, v] of Object.entries(spec.params)) out[k] = v[2];
  return out;
};

export const paramRange = (effect, param) => EFFECTS[effect]?.params[param] ?? null;
