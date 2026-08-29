// スターターテンプレート。
//
// ここに入っているプリセットは **このリポジトリで書き起こしたオリジナル** で、
// teenage engineering 公式パックの値をそのまま持ってきたものではない。
// 公式パックは TE の著作物で再配布が禁止されているため、このツールには同梱せず、
// 「TE のページからダウンロードしたファイルを読み込む」導線を用意している
// （web/README.md および docs/reference-packs.md を参照）。
//
// 設計の下敷きにしている手筋は docs/reference-packs.md にまとめてある:
//   HIGHPASS + LOWPASS でバンドパスを作る / SSB の周波数シフトで選局感を出す /
//   BALANCE + square LFO で音を途切れさせる / 効果を 0 で置いて shake でだけ効かせる など。

export const TEMPLATES = [
  {
    id: 'radio',
    name: 'RADIO',
    desc: { en: 'Broken transmission: bandpass, tuning sweeps, dropouts.',
            ja: '壊れかけの無線。バンドパス、選局、受信ロスト。' },
    config: {
      name: 'RADIO',
      presets: [
        {
          pos: 0, name: 'SHORTWAVE', comment: 'narrow band + ring hiss. handle opens the band.',
          list: [
            { effect: 'HIGHPASS', cutoff: 0.26 },
            { effect: 'LOWPASS', cutoff: 0.34 },
            { effect: 'RING', frequency: 70, mix: 0.22 },
            { effect: 'SAMPLE' },
          ],
          handle: { row: 1, param: 'cutoff', depth: 0.46 },
          shake: { row: 2, param: 'mix', depth: 0.45 },
          trigger: { row: 3 },
        },
        {
          pos: 1, name: 'TUNING', comment: 'handle sweeps across the band. lfo drifts.',
          list: [
            { effect: 'SSB', frequency: -800 },
            { effect: 'LOWPASS', cutoff: 0.55 },
            { effect: 'SAMPLE' },
          ],
          handle: { row: 0, param: 'frequency', depth: 1600 },
          lfo: { row: 0, param: 'frequency', depth: 90, shape: 'random', speed: 6 },
          trigger: { row: 2 },
        },
        {
          pos: 2, name: 'CB', comment: 'overdriven handheld radio. handle pushes the drive.',
          list: [
            { effect: 'DIST', amount: 18, mix: 0.75 },
            { effect: 'HIGHPASS', cutoff: 0.22 },
            { effect: 'LOWPASS', cutoff: 0.46 },
            { effect: 'SAMPLE' },
          ],
          handle: { row: 0, param: 'amount', depth: 14 },
          shake: { row: 2, param: 'cutoff', depth: -0.2 },
          trigger: { row: 3 },
        },
        {
          pos: 3, name: 'DROPOUT', comment: 'signal cuts in and out. handle adds trailing echo.',
          list: [
            { effect: 'BALANCE', balance: 0.5 },
            { effect: 'DELAY', time: 0.16, echo: 0.3, 'wet-level': 0.35 },
            { effect: 'SAMPLE' },
          ],
          lfo: { row: 0, param: 'balance', depth: 1.0, shape: 'square', speed: 7 },
          handle: { row: 1, param: 'echo', depth: 0.5 },
          trigger: { row: 2 },
        },
      ],
    },
  },

  {
    id: 'voice',
    name: 'VOICE',
    desc: { en: 'Pitch character: deep, high, formant-shifted, ring-modulated.',
            ja: '声のキャラ変え。低く、高く、金属的に。' },
    config: {
      name: 'VOICE',
      presets: [
        {
          pos: 0, name: 'DEEP', comment: 'push the handle to drop an octave.',
          list: [
            { effect: 'HARMONY', pitch: 1.0, 'dry-level': 0.35 },
            { effect: 'LOWPASS', cutoff: 0.72 },
            { effect: 'SAMPLE' },
          ],
          handle: { row: 0, param: 'pitch', depth: -0.5 },
          shake: { row: 1, param: 'cutoff', depth: -0.3 },
          trigger: { row: 2 },
        },
        {
          pos: 1, name: 'HELIUM', comment: 'handle pitches up. gentle vibrato underneath.',
          list: [
            { effect: 'HARMONY', pitch: 1.15, 'dry-level': 0.0 },
            { effect: 'REVERB', time: 0.25, 'wet-level': 0.22, 'dry-level': 1.0 },
            { effect: 'SAMPLE' },
          ],
          handle: { row: 0, param: 'pitch', depth: 0.85 },
          lfo: { row: 0, param: 'pitch', depth: 0.06, shape: 'sine', speed: 5.5 },
          trigger: { row: 2 },
        },
        {
          pos: 2, name: 'ANDROID', comment: 'ring mod voice. handle tunes the carrier.',
          list: [
            { effect: 'RING', frequency: 180, mix: 0.62 },
            { effect: 'EQUALISER', cutoff: 0.45, Q: 0.55, gain: 0.35 },
            { effect: 'SAMPLE' },
          ],
          handle: { row: 0, param: 'frequency', depth: 1400 },
          shake: { row: 0, param: 'mix', depth: 0.35 },
          trigger: { row: 2 },
        },
        {
          pos: 3, name: 'DOUBLE', comment: 'a shifted copy under the voice. handle detunes it.',
          list: [
            { effect: 'HARMONY', pitch: 0.75, 'dry-level': 0.7 },
            { effect: 'DELAY', time: 0.05, echo: 0.12, 'wet-level': 0.4 },
            { effect: 'SAMPLE' },
          ],
          handle: { row: 0, param: 'pitch', depth: 0.5 },
          trigger: { row: 2 },
        },
      ],
    },
  },

  {
    id: 'space',
    name: 'SPACE',
    desc: { en: 'Delay and reverb: room, tape wobble, spring, wash.',
            ja: 'ディレイとリバーブ。部屋鳴り、テープの揺れ、バネ、余韻。' },
    config: {
      name: 'SPACE',
      presets: [
        {
          pos: 0, name: 'SLAPBACK', comment: 'short echo. handle stretches it out.',
          list: [
            { effect: 'DELAY', time: 0.12, echo: 0.25, 'wet-level': 0.5, 'highpass-cutoff': 0.12 },
            { effect: 'SAMPLE' },
          ],
          handle: { row: 0, param: 'time', depth: 0.55 },
          shake: { row: 0, param: 'echo', depth: 0.4 },
          trigger: { row: 1 },
        },
        {
          pos: 1, name: 'TAPE', comment: 'slow wobble on the delay time.',
          list: [
            { effect: 'DELAY', time: 0.45, echo: 0.5, 'wet-level': 0.55, 'lowpass-cutoff': 0.6 },
            { effect: 'SAMPLE' },
          ],
          lfo: { row: 0, param: 'time', depth: 0.04, shape: 'sine', speed: 0.25 },
          handle: { row: 0, param: 'echo', depth: 0.42 },
          trigger: { row: 1 },
        },
        {
          pos: 2, name: 'SPRING', comment: 'shake to kick the tank.',
          list: [
            { effect: 'REVERB', time: 0.6, 'spring-mix': 0.65, 'wet-level': 0.45, 'dry-level': 0.9 },
            { effect: 'SAMPLE' },
          ],
          handle: { row: 0, param: 'time', depth: 0.35 },
          shake: { row: 0, param: 'spring-mix', depth: 0.3 },
          trigger: { row: 1 },
        },
        {
          pos: 3, name: 'FAR AWAY', comment: 'handle pushes the voice into the distance.',
          list: [
            { effect: 'REVERB', time: 0.85, 'wet-level': 0.0, 'dry-level': 1.0, 'highpass-cutoff': 0.18 },
            { effect: 'SAMPLE' },
          ],
          handle: { row: 0, param: 'wet-level', depth: 1.0 },
          shake: { row: 0, param: 'dry-level', depth: -0.8 },
          trigger: { row: 1 },
        },
      ],
    },
  },

  {
    id: 'empty',
    name: 'EMPTY',
    desc: { en: 'All four slots left at factory. Start from nothing.',
            ja: '4 スロットすべて工場出荷のまま。ゼロから始める。' },
    config: { name: 'MY PACK' },
  },
];
