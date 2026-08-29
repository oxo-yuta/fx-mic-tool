// SSB（単側波帯）= 周波数シフト。
// ヒルベルト変換で解析信号を作り、複素指数を掛けて実部を取る:
//   y(t) = x(t)·cos(2πft) − x̂(t)·sin(2πft)
// x̂ は FIR ヒルベルト変換器（奇数長・反対称）で近似する。
//
// ピッチシフトと違い全ての倍音を「平行移動」するため、倍音関係が崩れて
// 金属的・非調和的になる。これがラジオの選局らしさの正体。

const N = 201;                 // FIR タップ数（奇数）
const MID = (N - 1) / 2;

// ヒルベルト変換器のインパルス応答（Blackman 窓）
const H = new Float32Array(N);
for (let i = 0; i < N; i++) {
  const n = i - MID;
  if (n % 2 === 0) { H[i] = 0; continue; }
  const w = 0.42 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1))
          + 0.08 * Math.cos((4 * Math.PI * i) / (N - 1));
  H[i] = ((2 / (Math.PI * n)) * w);
}

class FreqShiftProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [{ name: 'frequency', defaultValue: 0, minValue: -20000, maxValue: 20000, automationRate: 'k-rate' }];
  }

  constructor() {
    super();
    this.buf = [];      // チャンネルごとの遅延線
    this.pos = [];
    this.phase = 0;
  }

  ensure(ch) {
    while (this.buf.length < ch) {
      this.buf.push(new Float32Array(N));
      this.pos.push(0);
    }
  }

  process(inputs, outputs, params) {
    const input = inputs[0];
    const output = outputs[0];
    if (!input || input.length === 0) return true;
    this.ensure(input.length);

    const freq = params.frequency[0];
    const w = (2 * Math.PI * freq) / sampleRate;

    for (let c = 0; c < output.length; c++) {
      const x = input[Math.min(c, input.length - 1)];
      const y = output[c];
      const buf = this.buf[c];
      let pos = this.pos[c];
      let phase = this.phase;

      for (let i = 0; i < y.length; i++) {
        buf[pos] = x ? x[i] : 0;
        pos = (pos + 1) % N;

        // buf[(pos + MID + k) % N] は「新しい側へ k サンプル」に対応する。
        // H は反対称（H[MID-k] = -H[MID+k]）なので、半分だけ回して差を取れば済む。
        let hilbert = 0;
        for (let k = 1; k < MID; k += 2) {
          const newer = buf[(pos + MID + k) % N];
          const older = buf[(pos + MID - k + N) % N];
          hilbert += H[MID - k] * (newer - older);
        }
        const direct = buf[(pos + MID) % N];   // 群遅延を合わせた原信号

        y[i] = direct * Math.cos(phase) - hilbert * Math.sin(phase);
        phase += w;
        if (phase > Math.PI) phase -= 2 * Math.PI;
        else if (phase < -Math.PI) phase += 2 * Math.PI;
      }
      this.pos[c] = pos;
      if (c === output.length - 1) this.phase = phase;
    }
    return true;
  }
}

registerProcessor('freq-shift', FreqShiftProcessor);
