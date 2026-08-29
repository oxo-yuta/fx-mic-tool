// fx-mic のエフェクトチェーンを Web Audio で再現するプレビューエンジン。
//
// ⚠️ これは近似であって実機のエミュレータではない。目的は「実機に転送する前に
//    パラメータの当たりを付ける」こと。既知の相違は web/README.md に一覧してある。

import { EFFECTS, paramRange } from './spec.js';

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

// cutoff [0,1] を 20Hz〜20kHz に指数マッピングする（耳の感覚に合わせる）
const cutoffHz = (c) => 20 * Math.pow(1000, clamp(c, 0, 1));
const qValue = (q) => 0.7 + clamp(q, 0, 1) * 11.3;

/** DIST 用のカーブ。amount 0〜40 を緩やかな飽和からハードクリップまで動かす */
function distCurve(amount) {
  const n = 1024;
  const curve = new Float32Array(n);
  const k = Math.max(amount, 0.0001) * 2;
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = ((1 + k) * x) / (1 + k * Math.abs(x));
  }
  return curve;
}

/** リバーブ用インパルス応答を手続き的に生成する（外部ファイル不要） */
function makeIR(ctx, seconds, { spring = 0 } = {}) {
  const len = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const ir = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      const t = i / len;
      const decay = Math.pow(1 - t, 2.2);
      let v = (Math.random() * 2 - 1) * decay;
      if (spring > 0) {
        // バネの分散性を「時間とともに下がるチャープ」で粗く模す
        const f = 2400 * Math.pow(0.35, t);
        v = v * (1 - spring) + Math.sin((2 * Math.PI * f * i) / ctx.sampleRate) * decay * spring * 0.6;
      }
      d[i] = v;
    }
  }
  return ir;
}

/**
 * 1 エフェクト分のノード群。
 * { input, output, set(param, value) } のインタフェースに統一しておき、
 * チェーン側は中身を知らずに直列に繋ぐ。
 */
function buildEffect(ctx, effect, params, shared) {
  const g = (v = 1) => { const n = ctx.createGain(); n.gain.value = v; return n; };
  const input = g();
  const output = g();
  const setters = {};
  // applied には「変調を含めて最後に適用された値」が入る。UI のライブ表示に使う。
  const applied = {};
  const apply = (p, v) => {
    if (!setters[p]) return;
    setters[p](v);
    applied[p] = v;
  };

  switch (effect) {
    case 'BALANCE': {
      const pan = ctx.createStereoPanner();
      input.connect(pan).connect(output);
      setters.balance = (v) => { pan.pan.value = clamp(v, 0, 1) * 2 - 1; };
      break;
    }

    case 'LOWPASS':
    case 'HIGHPASS': {
      const f = ctx.createBiquadFilter();
      f.type = effect === 'LOWPASS' ? 'lowpass' : 'highpass';
      input.connect(f).connect(output);
      setters.cutoff = (v) => { f.frequency.value = cutoffHz(v); };
      setters.Q = (v) => { f.Q.value = qValue(v); };
      break;
    }

    case 'EQUALISER': {
      const f = ctx.createBiquadFilter();
      f.type = 'peaking';
      input.connect(f).connect(output);
      setters.cutoff = (v) => { f.frequency.value = cutoffHz(v); };
      setters.Q = (v) => { f.Q.value = qValue(v); };
      setters.gain = (v) => { f.gain.value = clamp(v, -1, 1) * 24; };
      break;
    }

    case 'DIST': {
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass';
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass';
      const shaper = ctx.createWaveShaper();
      shaper.oversample = '4x';
      const wet = g(0), dry = g(1);
      input.connect(hp).connect(lp).connect(shaper).connect(wet).connect(output);
      input.connect(dry).connect(output);
      setters.amount = (v) => { shaper.curve = distCurve(v); };
      setters['highpass-cutoff'] = (v) => { hp.frequency.value = cutoffHz(v); };
      setters['lowpass-cutoff'] = (v) => { lp.frequency.value = cutoffHz(v); };
      setters.mix = (v) => { const m = clamp(v, 0, 1); wet.gain.value = m; dry.gain.value = 1 - m; };
      break;
    }

    case 'RING': {
      const osc = ctx.createOscillator();
      const ring = g(0);
      const wet = g(0), dry = g(1);
      osc.connect(ring.gain);          // 入力を発振器で振幅変調する
      input.connect(ring).connect(wet).connect(output);
      input.connect(dry).connect(output);
      osc.start();
      shared.stoppables.push(osc);
      setters.frequency = (v) => { osc.frequency.value = clamp(v, 0, 20000); };
      setters.mix = (v) => { const m = clamp(v, 0, 1); wet.gain.value = m; dry.gain.value = 1 - m; };
      break;
    }

    case 'SSB': {
      const node = new AudioWorkletNode(ctx, 'freq-shift', { outputChannelCount: [2] });
      input.connect(node).connect(output);
      setters.frequency = (v) => { node.parameters.get('frequency').value = clamp(v, -20000, 20000); };
      break;
    }

    case 'HARMONY': {
      const node = new AudioWorkletNode(ctx, 'pitch-shift', { outputChannelCount: [2] });
      const dry = g(0);
      input.connect(node).connect(output);
      input.connect(dry).connect(output);
      setters.pitch = (v) => { node.parameters.get('pitch').value = clamp(v, 0.5, 2); };
      setters['dry-level'] = (v) => { dry.gain.value = clamp(v, 0, 1); };
      break;
    }

    case 'DELAY': {
      // L/R 独立のディレイライン。cross-feed で互いのフィードバックを混ぜる。
      const split = ctx.createChannelSplitter(2);
      const merge = ctx.createChannelMerger(2);
      const dL = ctx.createDelay(1.2), dR = ctx.createDelay(1.2);
      const fbLL = g(0), fbRR = g(0), fbLR = g(0), fbRL = g(0);
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass';
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass';
      const wet = g(0.5), dry = g(1);

      input.connect(split);
      split.connect(dL, 0);
      split.connect(dR, 1);
      dL.connect(fbLL).connect(dL);
      dR.connect(fbRR).connect(dR);
      dL.connect(fbLR).connect(dR);
      dR.connect(fbRL).connect(dL);
      dL.connect(merge, 0, 0);
      dR.connect(merge, 0, 1);
      merge.connect(hp).connect(lp).connect(wet).connect(output);
      input.connect(dry).connect(output);

      let echo = 0.4, cross = 0;
      const updateFb = () => {
        const e = clamp(echo, 0, 0.95);      // 1.0 は発振して破綻するので抑える
        const c = clamp(cross, 0, 1);
        fbLL.gain.value = e * (1 - c);
        fbRR.gain.value = e * (1 - c);
        fbLR.gain.value = e * c;
        fbRL.gain.value = e * c;
      };
      updateFb();
      setters.time = (v) => {
        const t = clamp(v, 0, 1.1);
        dL.delayTime.value = t; dR.delayTime.value = t * 1.02;   // わずかにずらしてステレオ感を出す
      };
      setters.echo = (v) => { echo = v; updateFb(); };
      setters['cross-feed'] = (v) => { cross = v; updateFb(); };
      setters['highpass-cutoff'] = (v) => { hp.frequency.value = cutoffHz(v); };
      setters['lowpass-cutoff'] = (v) => { lp.frequency.value = cutoffHz(v); };
      setters['wet-level'] = (v) => { wet.gain.value = clamp(v, 0, 1); };
      setters['dry-level'] = (v) => { dry.gain.value = clamp(v, 0, 1); };
      setters.balance = () => {};
      break;
    }

    case 'REVERB': {
      const conv = ctx.createConvolver();
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass';
      const wet = g(0.4), dry = g(1);
      input.connect(hp).connect(conv).connect(wet).connect(output);
      input.connect(dry).connect(output);

      let time = 0.5, spring = 0, irTimer = null;
      const rebuildIR = () => {
        clearTimeout(irTimer);
        // IR 生成は重いのでスライダー操作中は間引く
        irTimer = setTimeout(() => {
          conv.buffer = makeIR(ctx, 0.15 + clamp(time, 0, 1) * 3.5, { spring: clamp(spring, 0, 1) });
        }, 60);
      };
      conv.buffer = makeIR(ctx, 1.9);
      setters.time = (v) => { time = v; rebuildIR(); };
      setters['spring-mix'] = (v) => { spring = v; rebuildIR(); };
      setters['highpass-cutoff'] = (v) => { hp.frequency.value = cutoffHz(v); };
      setters['wet-level'] = (v) => { wet.gain.value = clamp(v, 0, 1); };
      setters['dry-level'] = (v) => { dry.gain.value = clamp(v, 0, 1); };
      shared.stoppables.push({ stop: () => clearTimeout(irTimer) });
      break;
    }

    case 'SAMPLE': {
      // エフェクトではなく「サンプルが信号に合流する地点」。
      // ここより後ろのエフェクトはサンプルにもかかる。
      const level = g(1);
      const pan = ctx.createStereoPanner();
      input.connect(output);
      shared.sampleOut = level;
      level.connect(pan).connect(output);
      setters.level = (v) => { level.gain.value = clamp(v, 0, 1); };
      setters.balance = (v) => { pan.pan.value = clamp(v, 0, 1) * 2 - 1; };
      setters.speed = (v) => { shared.sampleRate_ = clamp(v, 0.01, 4); shared.onSampleRateChange?.(); };
      setters.pitch = (v) => { shared.samplePitch = clamp(v, -24, 24); shared.onSampleRateChange?.(); };
      break;
    }

    default:
      input.connect(output);
  }

  for (const [p, v] of Object.entries(params)) apply(p, v);
  return { effect, input, output, set: apply, applied, params: { ...params } };
}

export class FxEngine {
  constructor() {
    this.ctx = null;
    this.ready = false;
    this.preset = null;
    this.rows = [];
    this.handle = 0;
    this.shake = 0;
    this.lfoPhase = 0;
    this.lfoRandom = 0;
    this.micStream = null;
    this.sampleBuffers = [null, null, null, null];   // 白ボタンで選ぶ 4 スロット
    this.sampleSlot = 0;
    this.shared = { stoppables: [], sampleOut: null, sampleRate_: 1, samplePitch: 0 };
    this._raf = null;
    this._lastT = 0;
  }

  async init() {
    if (this.ready) return;
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    await this.ctx.audioWorklet.addModule(new URL('./worklets/freq-shift.js', import.meta.url));
    await this.ctx.audioWorklet.addModule(new URL('./worklets/pitch-shift.js', import.meta.url));

    this.master = this.ctx.createGain();
    this.master.gain.value = 0.8;
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.master.connect(this.analyser).connect(this.ctx.destination);

    this.chainIn = this.ctx.createGain();
    this.micGain = this.ctx.createGain();
    this.micGain.gain.value = 0;      // ハンドルを押していない間はマイク無効（実機と同じ）
    this.micGain.connect(this.chainIn);

    this.ready = true;
    this._loop();
  }

  async enableMic() {
    await this.init();
    if (this.micStream) return true;
    if (this.ctx.state === 'suspended') await this.ctx.resume();
    this.micStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
    this.ctx.createMediaStreamSource(this.micStream).connect(this.micGain);
    return true;
  }

  stopMic() {
    this.micStream?.getTracks().forEach((t) => t.stop());
    this.micStream = null;
  }

  get micActive() { return !!this.micStream; }

  setSampleBuffer(slot, buf) { this.sampleBuffers[slot] = buf; }
  setSampleSlot(slot) { this.sampleSlot = slot; }

  /** プリセット（config.json の preset オブジェクト）からチェーンを組み直す */
  setPreset(preset) {
    if (!this.ready) return;
    this._teardown();
    this.preset = preset;
    this.shared = { stoppables: [], sampleOut: null, sampleRate_: 1, samplePitch: 0 };

    const list = preset?.list ?? [];
    this.rows = list.map((eff) => {
      const { effect, BUS, ...params } = eff;
      const name = String(effect ?? '').toUpperCase();
      if (!EFFECTS[name]) return null;
      return buildEffect(this.ctx, name, params, this.shared);
    });

    let node = this.chainIn;
    for (const row of this.rows) {
      if (!row) continue;
      node.connect(row.input);
      node = row.output;
    }
    node.connect(this.master);
    this.tail = node;
    this._applyModulation();
  }

  _teardown() {
    for (const s of this.shared.stoppables ?? []) { try { s.stop(); } catch {} }
    for (const row of this.rows) {
      if (!row) continue;
      try { row.input.disconnect(); row.output.disconnect(); } catch {}
    }
    try { this.chainIn.disconnect(); } catch {}
    this.rows = [];
  }

  /** スライダー操作でベース値を書き換える（チェーンは組み直さない） */
  setBaseParam(rowIndex, param, value) {
    const row = this.rows[rowIndex];
    if (!row) return;
    row.params[param] = value;
    row.set(param, value);
    this._applyModulation();
  }

  setHandle(v) {
    this.handle = clamp(v, 0, 1);
    // 実機と同じく、ハンドルを押している間だけマイクが有効になる
    if (this.micGain) this.micGain.gain.value = this.handle > 0.02 ? 1 : 0;
  }

  triggerShake() { this.shake = 1; }

  /** slot 省略時は現在選択中のスロットを鳴らす */
  playSample(slot = this.sampleSlot) {
    const buf = this.sampleBuffers[slot];
    if (!buf || !this.shared.sampleOut) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const speed = this.shared.sampleRate_ ?? 1;
    const semis = this.shared.samplePitch ?? 0;
    src.playbackRate.value = clamp(speed * Math.pow(2, semis / 12), 0.05, 8);
    src.connect(this.shared.sampleOut);
    src.start();
    return src;
  }

  /**
   * handle / shake / lfo の現在値をパラメータに反映する。
   * ベース値は setPreset 時に適用済みなので、ここでは変調対象だけを毎フレーム上書きする
   * （全パラメータを毎回書き戻すと REVERB の IR 再生成が走り続けて重くなる）。
   */
  _applyModulation() {
    const p = this.preset;
    if (!p) return;

    // ベース値に戻してから加算する（複数の変調が同じパラメータを狙う場合に備える）
    const target = new Map();
    const add = (row, param, delta) => {
      const key = `${row}:${param}`;
      target.set(key, (target.get(key) ?? 0) + delta);
    };

    if (p.handle && Number.isInteger(p.handle.row)) {
      add(p.handle.row, p.handle.param, (p.handle.depth ?? 0) * this.handle);
    }
    if (p.shake && Number.isInteger(p.shake.row)) {
      add(p.shake.row, p.shake.param, (p.shake.depth ?? 0) * this.shake);
    }
    if (p.lfo && Number.isInteger(p.lfo.row)) {
      add(p.lfo.row, p.lfo.param, (p.lfo.depth ?? 0) * this._lfoValue());
    }

    for (const [key, delta] of target) {
      const [rowStr, param] = key.split(/:(.+)/);
      const row = this.rows[Number(rowStr)];
      if (!row) continue;
      const base = row.params[param];
      if (base === undefined) continue;
      const range = paramRange(row.effect, param);
      const v = range ? clamp(base + delta, range[0], range[1]) : base + delta;
      row.set(param, v);
    }
  }

  _lfoValue() {
    const p = this.preset?.lfo;
    if (!p) return 0;
    const ph = this.lfoPhase + (p.phase ?? 0);
    switch (p.shape) {
      case 'square': return Math.sin(2 * Math.PI * ph) >= 0 ? 1 : -1;
      case 'sawtooth': return 2 * (ph - Math.floor(ph)) - 1;
      case 'random': return this.lfoRandom;
      default: return Math.sin(2 * Math.PI * ph);
    }
  }

  _loop = () => {
    const now = performance.now();
    const dt = this._lastT ? Math.min((now - this._lastT) / 1000, 0.1) : 0;
    this._lastT = now;

    const speed = this.preset?.lfo?.speed ?? 0;
    const prev = Math.floor(this.lfoPhase);
    this.lfoPhase += speed * dt;
    if (Math.floor(this.lfoPhase) !== prev) this.lfoRandom = Math.random() * 2 - 1;
    if (this.lfoPhase > 1e6) this.lfoPhase = 0;

    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 1.6);   // 約 0.6 秒で減衰

    this._applyModulation();
    this._raf = requestAnimationFrame(this._loop);
  };

  /** 波形表示用 */
  getWaveform(out) {
    if (!this.analyser) return false;
    this.analyser.getByteTimeDomainData(out);
    return true;
  }

  dispose() {
    cancelAnimationFrame(this._raf);
    this._teardown();
    this.stopMic();
    this.ctx?.close();
    this.ready = false;
  }
}
