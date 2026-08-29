// エフェクトとパラメータの短い説明。ホバーで出すツールチップに使う。
//
// パラメータは `EFFECT.param` で引き、無ければ素の `param` にフォールバックする
// （同じ名前でもエフェクトによって意味が違うものがあるため。例: DELAY の time と REVERB の time）。
//
// ⚠️ 日本語と英語のみ用意している。他の言語では英語が出る（web/README.md の既知の制約を参照）。

const EFFECTS = {
  en: {
    BALANCE: 'Places the signal in the stereo field. 0 = hard left, 1 = hard right.',
    DELAY: 'Repeating echoes. The workhorse for dub and “space”. Use once per chain.',
    DIST: 'Overdrive and clipping. Adds grit and makes a voice sound driven through a small speaker.',
    EQUALISER: 'A single peaking bell. Boost or cut one band to shape the tone.',
    HARMONY: 'Pitch shifter. Moves the whole voice up or down without changing its speed. Use once per chain.',
    LOWPASS: 'Cuts everything above the cutoff. Makes the sound darker and more distant.',
    HIGHPASS: 'Cuts everything below the cutoff. Thins the sound out — pair with LOWPASS for a radio band.',
    SAMPLE: 'Not an effect: this is where the sample joins the signal path. Effects after it also process the sample.',
    REVERB: 'Room and spring reverb. Puts the voice in a space. Use once per chain.',
    RING: 'Ring modulation. Multiplies the voice with a tone, giving a metallic, inharmonic character.',
    SSB: 'Single-sideband frequency shift. Moves every partial by the same number of Hz, so harmonics break apart — the classic radio-tuning sound. Use once per chain.',
  },
  ja: {
    BALANCE: '信号の左右の定位。0 = 左いっぱい、1 = 右いっぱい。',
    DELAY: 'やまびこ状に繰り返すエコー。dub や空間系の主役。1 チェーンに 1 回だけ。',
    DIST: 'オーバードライブと歪み。ザラつきが出て、小さいスピーカーを通したような声になる。',
    EQUALISER: 'ピーキング 1 バンド。特定の帯域だけを持ち上げ／削って音色を作る。',
    HARMONY: 'ピッチシフト。速さを変えずに声の高さだけを上下させる。1 チェーンに 1 回だけ。',
    LOWPASS: 'カットオフより上を削る。暗く、遠くなる。',
    HIGHPASS: 'カットオフより下を削る。細くなる。LOWPASS と組めば無線機のバンドパスになる。',
    SAMPLE: 'エフェクトではなく「サンプルが信号に合流する地点」。これより後ろのエフェクトはサンプルにもかかる。',
    REVERB: '部屋鳴りとバネの残響。声を空間に置く。1 チェーンに 1 回だけ。',
    RING: 'リングモジュレーション。声に音を掛け合わせ、金属的で非調和な響きにする。',
    SSB: '単側波帯による周波数シフト。全ての倍音を同じ Hz だけ平行移動するので倍音関係が崩れる。ラジオの選局らしさの正体。1 チェーンに 1 回だけ。',
  },
};

const PARAMS = {
  en: {
    // 汎用
    'cutoff': 'Where the filter starts working. Low = dark, high = open.',
    'Q': 'How sharp the filter is at the cutoff. Higher values ring more.',
    'gain': 'How much to boost (+) or cut (−) the band.',
    'mix': 'Blend between the untouched signal and the processed one.',
    'balance': 'Left/right position. 0.5 is centre.',
    'dry-level': 'How much of the original, unprocessed signal is let through.',
    'wet-level': 'How much of the processed signal is added.',
    'lowpass-cutoff': 'Rolls off the highs inside this effect.',
    'highpass-cutoff': 'Rolls off the lows inside this effect.',
    'frequency': 'The frequency this effect works at, in Hz.',
    'time': 'Length of the effect.',
    'pitch': 'How far the pitch is moved.',
    'amount': 'How hard the signal is driven.',
    'speed': 'Playback rate.',
    'level': 'Output volume.',
    'echo': 'Feedback — how much of the output is fed back in. High values self-oscillate and get loud.',
    'cross-feed': 'Feeds each channel’s echoes into the other, widening the repeats.',
    'spring-mix': 'Blends in the metallic “boing” of a spring tank.',
    // エフェクト固有
    'DELAY.time': 'Gap between repeats. Short = slapback, long = dub echo.',
    'REVERB.time': 'Decay length of the space. Long values become a wash.',
    'HARMONY.pitch': '1.0 = unchanged, 0.5 = one octave down, 2.0 = one octave up.',
    'SAMPLE.pitch': 'Transposes the sample in semitones (−24 to +24).',
    'SAMPLE.speed': 'Playback rate of the sample. 2.0 plays it twice as fast and an octave up.',
    'RING.frequency': 'Carrier tone. Low values buzz, high values turn the voice metallic.',
    'SSB.frequency': 'How many Hz to shift everything by. Negative moves down.',
    'DIST.amount': 'Drive. Small values thicken, large values fully clip.',
  },
  ja: {
    'cutoff': 'フィルタが効き始める位置。低いほど暗く、高いほど開く。',
    'Q': 'カットオフ付近の鋭さ。上げるほどクセが出る。',
    'gain': 'その帯域を持ち上げる（+）か削る（−）か。',
    'mix': '原音と加工音の混ぜ具合。',
    'balance': '左右の定位。0.5 が中央。',
    'dry-level': '加工していない原音をどれだけ通すか。',
    'wet-level': '加工後の音をどれだけ足すか。',
    'lowpass-cutoff': 'このエフェクトの中で高域を削る。',
    'highpass-cutoff': 'このエフェクトの中で低域を削る。',
    'frequency': 'このエフェクトが働く周波数（Hz）。',
    'time': 'エフェクトの長さ。',
    'pitch': '音程をどれだけ動かすか。',
    'amount': 'どれだけ強く突っ込むか。',
    'speed': '再生の速さ。',
    'level': '出力音量。',
    'echo': 'フィードバック量。出力を入力に戻す割合で、上げすぎると自己発振して爆音になる。',
    'cross-feed': '左右のエコーを互いに送り合い、繰り返しを広げる。',
    'spring-mix': 'バネの「ボイン」という金属的な響きを混ぜる。',
    'DELAY.time': '繰り返しの間隔。短ければスラップバック、長ければ dub のエコー。',
    'REVERB.time': '残響の長さ。長くすると余韻が溶ける。',
    'HARMONY.pitch': '1.0 = 原音、0.5 = 1 オクターブ下、2.0 = 1 オクターブ上。',
    'SAMPLE.pitch': 'サンプルを半音単位で移調する（−24〜+24）。',
    'SAMPLE.speed': 'サンプルの再生速度。2.0 で倍速かつ 1 オクターブ上になる。',
    'RING.frequency': '掛け合わせる音の高さ。低いとブザー的、高いと金属的になる。',
    'SSB.frequency': '何 Hz ずらすか。負の値で下に動く。',
    'DIST.amount': '歪みの量。少しで太く、大きくすると完全に潰れる。',
  },
};

/** 説明が無い言語では英語を返す */
const pick = (table, lang) => table[lang] ?? table.en;

export const effectDesc = (effect, lang) => pick(EFFECTS, lang)[effect] ?? EFFECTS.en[effect] ?? null;

export const paramDesc = (effect, param, lang) => {
  const table = pick(PARAMS, lang);
  return table[`${effect}.${param}`] ?? table[param]
      ?? PARAMS.en[`${effect}.${param}`] ?? PARAMS.en[param] ?? null;
};
