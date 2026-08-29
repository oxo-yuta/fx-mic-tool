// HARMONY = ピッチシフト。
// 遅延線を 2 本の読み出しポインタで舐め、Hann 窓でクロスフェードする
// 古典的なディレイライン式ピッチシフタ。位相ボコーダより粗いが軽く、
// 声には十分実用的（fx-mic 実機の HARMONY もフォルマント補正はしていない）。
//
// 2 つの窓の Hann エンベロープは env(f) + env(f+0.5) = 1 に厳密になるため、
// クロスフェードで音量が揺れない。

const L = 3072;   // 遅延線長（約 64ms @48k）。長いほど低域に強く、遅延も増える

class PitchShiftProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [{ name: 'pitch', defaultValue: 1, minValue: 0.25, maxValue: 4, automationRate: 'k-rate' }];
  }

  constructor() {
    super();
    this.buf = [];
    this.write = [];
    this.frac = 0;
  }

  ensure(ch) {
    while (this.buf.length < ch) {
      this.buf.push(new Float32Array(L));
      this.write.push(0);
    }
  }

  read(buf, wp, delay) {
    let p = wp - delay;
    while (p < 0) p += L;
    const i = Math.floor(p);
    const f = p - i;
    return buf[i] * (1 - f) + buf[(i + 1) % L] * f;   // 線形補間
  }

  process(inputs, outputs, params) {
    const input = inputs[0];
    const output = outputs[0];
    if (!input || input.length === 0) return true;
    this.ensure(input.length);

    const ratio = params.pitch[0];
    const step = (1 - ratio) / L;   // ratio>1 で遅延が縮む = ピッチが上がる

    for (let c = 0; c < output.length; c++) {
      const x = input[Math.min(c, input.length - 1)];
      const y = output[c];
      const buf = this.buf[c];
      let wp = this.write[c];
      let frac = this.frac;

      for (let i = 0; i < y.length; i++) {
        buf[wp] = x ? x[i] : 0;
        wp = (wp + 1) % L;

        const f2 = frac + 0.5 >= 1 ? frac - 0.5 : frac + 0.5;
        const e1 = 0.5 * (1 - Math.cos(2 * Math.PI * frac));
        const e2 = 0.5 * (1 - Math.cos(2 * Math.PI * f2));

        y[i] = this.read(buf, wp, frac * (L - 2) + 1) * e1
             + this.read(buf, wp, f2 * (L - 2) + 1) * e2;

        frac += step;
        if (frac >= 1) frac -= 1;
        else if (frac < 0) frac += 1;
      }
      this.write[c] = wp;
      if (c === output.length - 1) this.frac = frac;
    }
    return true;
  }
}

registerProcessor('pitch-shift', PitchShiftProcessor);
