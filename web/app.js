// fx-mic editor — 画面と状態。
//
// 4 つの FX スロットはそれぞれ「工場出荷のまま」か「自分で定義」かのどちらか。
// presets に書かなかったスロットは工場出荷プリセットが残ることを実機で確認済みなので、
// この 2 状態をそのまま UI のモデルにしている（docs/config-json.md 参照）。
// オレンジボタンには clean（ランプ全消灯）の位置もあるが、編集できないので一覧には出さない。

import {
  EFFECTS, FACTORY_PRESETS, FACTORY_SAMPLES, MAX_SLOTS, LFO_SHAPES, PLAYMODES,
  DISK_BUDGET, defaultParams, buttonPosition, paramRange,
} from './spec.js';
import { validate, readWavFormat } from './validate.js';
import { FxEngine } from './audio.js';
import { Disk, supported as diskSupported, download } from './disk.js';
import { TEMPLATES } from './templates.js';
import { t, setLang, getLang, LANGS } from './i18n.js';
import { effectDesc, paramDesc } from './descriptions.js';

const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

// ─────────────────────────────── 状態 ───────────────────────────────

const state = {
  name: 'MY PACK',
  slots: [null, null, null, null],          // null = 工場出荷のまま
  samples: [null, null, null, null],        // null = 工場出荷のまま
  selected: 0,
  activeSlot: 0,                             // -1 = clean（ランプ全消灯）
  sampleSlot: 0,
  mode: 'fx',
};

const engine = new FxEngine();
const disk = new Disk();
let diskFiles = new Map();      // ディスク上の wav（config.json は別勘定）
let liveValues = [];

/** config.json を組み立てる。工場出荷のままのスロットは書かない。 */
function buildConfig() {
  const cfg = { name: state.name };

  const samples = [];
  state.samples.forEach((s, pos) => {
    if (s) samples.push({ pos, file: s.file, playmode: s.playmode });
  });
  if (samples.length) cfg.samples = samples;

  const presets = [];
  state.slots.forEach((p, pos) => { if (p) presets.push({ pos, ...p }); });
  if (presets.length) cfg.presets = presets;

  return cfg;
}

const configText = () => JSON.stringify(buildConfig(), null, 2);

/** ディスクに置かれることになるファイル一覧（検証と容量計算に使う） */
function plannedFiles() {
  const files = new Map();
  for (const [name, f] of diskFiles) files.set(name, f);   // 既にディスクにある wav
  for (const s of state.samples) if (s) files.set(s.file, { size: s.size });
  files.set('config.json', { size: new Blob([configText()]).size });
  return files;
}

// ─────────────────────── ツールチップ ───────────────────────

// data-tip / data-tip-title を持つ要素にホバーすると説明を出す。
// 要素は動的に作り直されるので、document 単位のイベント委譲で拾う。
let tipEl = null;

function initTooltips() {
  tipEl = el('div', 'tooltip');
  document.body.appendChild(tipEl);

  const show = (target) => {
    const body = target.dataset.tip;
    if (!body) return;
    tipEl.replaceChildren();
    if (target.dataset.tipTitle) tipEl.append(el('b', null, target.dataset.tipTitle));
    tipEl.append(document.createTextNode(body));
    tipEl.classList.add('is-on');

    // まず表示してから実サイズを測り、画面外にはみ出さない位置に置く
    const r = target.getBoundingClientRect();
    const tr = tipEl.getBoundingClientRect();
    let left = r.left;
    let top = r.bottom + 6;
    if (left + tr.width > window.innerWidth - 8) left = window.innerWidth - tr.width - 8;
    if (top + tr.height > window.innerHeight - 8) top = r.top - tr.height - 6;
    tipEl.style.left = `${Math.max(8, left)}px`;
    tipEl.style.top = `${Math.max(8, top)}px`;
  };
  const hide = () => tipEl.classList.remove('is-on');

  document.addEventListener('pointerover', (e) => {
    const target = e.target.closest?.('[data-tip]');
    if (target) show(target); else hide();
  });
  document.addEventListener('pointerdown', hide);
  window.addEventListener('scroll', hide, true);
}

/** ホバー説明を要素に付ける */
function tip(node, title, body) {
  if (!body) return node;
  node.dataset.tip = body;
  if (title) node.dataset.tipTitle = title;
  return node;
}

// ─────────────────────── デバイス図（SVG） ───────────────────────

function initDevice() {
  const grille = $('grille');
  for (let r = 0; r < 11; r++) {
    for (let c = 0; c < 13; c++) {
      const x = 55 + c * 13.2, y = 30 + r * 13.2;
      if (x > 185 && y < 176) continue;
      const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      dot.setAttribute('cx', x); dot.setAttribute('cy', y); dot.setAttribute('r', 4.4);
      grille.appendChild(dot);
    }
  }
  // 実機と同じく LED は FX 4 個 / サンプル 4 個。clean は「どれも点かない」状態。
  const led = (parent, x, y0) => {
    for (let i = 0; i < MAX_SLOTS; i++) {
      const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      c.setAttribute('cx', x); c.setAttribute('cy', y0 + i * 13.5); c.setAttribute('r', 4);
      c.setAttribute('stroke', '#000005'); c.setAttribute('stroke-width', '1');
      parent.appendChild(c);
    }
  };
  led($('ledFx'), 200.5, 54);
  led($('ledSample'), 200.5, 128);

  // オレンジボタンは clean → 0 → 1 → 2 → 3 → clean と巡回する（実機と同じ）
  $('btnFx').addEventListener('click', () => {
    state.activeSlot = state.activeSlot >= MAX_SLOTS - 1 ? -1 : state.activeSlot + 1;
    if (state.activeSlot >= 0) state.selected = state.activeSlot;
    syncAudio(); render();
  });
  $('btnSampleSel').addEventListener('click', () => {
    state.sampleSlot = (state.sampleSlot + 1) % MAX_SLOTS;
    engine.setSampleSlot(state.sampleSlot);
    render();
  });
  $('btnTrig').addEventListener('click', () => engine.playSample());

  const svg = $('device');
  let dragging = false;
  const fromEvent = (e) => {
    const r = svg.getBoundingClientRect();
    const y = ((e.touches?.[0]?.clientY ?? e.clientY) - r.top) / r.height;
    return Math.max(0, Math.min(1, (y - 0.12) / 0.5));
  };
  $('handleGroup').addEventListener('pointerdown', (e) => {
    dragging = true; svg.setPointerCapture?.(e.pointerId); setHandle(fromEvent(e));
  });
  window.addEventListener('pointermove', (e) => { if (dragging) setHandle(fromEvent(e)); });
  window.addEventListener('pointerup', () => { dragging = false; });
}

function setHandle(v) {
  const clamped = Math.max(0, Math.min(1, v));
  $('handleSlider').value = Math.round(clamped * 100);
  engine.setHandle(clamped);
  paintDevice();
}

function paintDevice() {
  const h = Number($('handleSlider').value) / 100;
  $('handleVal').textContent = `${Math.round(h * 100)}%`;
  // 回転軸は本体側（46,46）。ハンドルは本体より背面に描いてあるので、はみ出しても自然に見える。
  $('handleGroup').setAttribute('transform', `rotate(${(-14 * (1 - h)).toFixed(2)} 46 46)`);

  // マイクが有効な間は赤ランプが点灯する
  const live = engine.micActive && h > 0.02;
  $('powerLed').setAttribute('fill', live ? '#ff2d1a' : engine.micActive ? '#5a1a14' : '#6b6b6b');
  $('micLampGlow').setAttribute('opacity', live ? '0.32' : '0');

  [...$('ledFx').children].forEach((c, i) => {
    c.setAttribute('fill', state.activeSlot === i ? '#e05526' : '#3a3a3a');
  });
  [...$('ledSample').children].forEach((c, i) => {
    c.setAttribute('fill', state.sampleSlot === i ? '#e5e6e6' : '#3a3a3a');
  });

  $('deviceState').textContent = state.activeSlot < 0
    ? t('device.clean')
    : (state.slots[state.activeSlot]?.name
       || t('device.factory', { name: FACTORY_PRESETS[state.activeSlot] }));
}

// ─────────────────────────── FX モード ───────────────────────────

function renderSlots() {
  const box = $('slots');
  box.replaceChildren();
  for (let pos = 0; pos < MAX_SLOTS; pos++) {
    const p = state.slots[pos];
    const row = el('div', 'slot'
      + (state.selected === pos ? ' is-active' : '')
      + (p ? '' : ' is-factory'));
    row.append(el('span', 'slot__pos', String(buttonPosition(pos))));
    row.append(el('span', 'slot__name',
      p ? (p.name || `PRESET ${pos}`) : t('slot.factory', { name: FACTORY_PRESETS[pos] })));
    row.append(el('span', 'slot__meta',
      p ? t('slot.meta', { n: p.list.length, pos }) : t('slot.undefined', { pos })));
    row.onclick = () => { state.selected = pos; state.activeSlot = pos; syncAudio(); render(); };
    box.appendChild(row);
  }
}

const newPreset = (pos) => ({
  name: `PRESET ${pos}`,
  comment: '',
  list: [{ effect: 'LOWPASS', ...defaultParams('LOWPASS') }, { effect: 'SAMPLE' }],
  handle: { row: 0, param: 'cutoff', depth: 0.7 },
  trigger: { row: 1 },
});

function renderEditor() {
  const body = $('editorBody');
  body.replaceChildren();
  liveValues = [];
  const pos = state.selected;
  const p = state.slots[pos];
  $('editorPos').textContent = t('editor.pos', { pos, btn: buttonPosition(pos) });

  if (!p) {
    $('editorTitle').textContent = t('device.factory', { name: FACTORY_PRESETS[pos] });
    const hint = el('p', 'hint');
    hint.innerHTML = t('editor.factory_hint', { name: FACTORY_PRESETS[pos] });
    const btn = el('button', 'is-primary', t('editor.make_mine'));
    btn.onclick = () => { state.slots[pos] = newPreset(pos); syncAudio(); render(); };
    body.append(hint, btn);
    return;
  }

  $('editorTitle').textContent = p.name || t('panel.chain');

  const nameIn = el('input'); nameIn.type = 'text'; nameIn.value = p.name || '';
  nameIn.oninput = () => { p.name = nameIn.value.toUpperCase(); renderSlots(); renderOutput(); paintDevice(); };
  const commentIn = el('input'); commentIn.type = 'text'; commentIn.value = p.comment || '';
  commentIn.placeholder = t('editor.comment_ph');
  commentIn.oninput = () => { p.comment = commentIn.value; renderOutput(); };
  body.append(labelled(t('editor.name'), nameIn), labelled(t('editor.comment'), commentIn));

  const chain = el('div', 'chain');
  p.list.forEach((eff, i) => chain.appendChild(renderRow(p, eff, i)));
  body.append(chain);

  // 追加系はまとめて左に
  const addBar = el('div', 'rowflex');
  const sel = el('select');
  for (const name of Object.keys(EFFECTS)) {
    const o = new Option(name, name);
    o.title = effectDesc(name, getLang()) ?? '';    // ネイティブの title は select の中でも効く
    sel.append(o);
  }
  const syncSelTip = () => tip(sel, sel.value, effectDesc(sel.value, getLang()));
  sel.onchange = syncSelTip;
  syncSelTip();
  const addBtn = el('button', 'is-small', t('editor.add_effect'));
  addBtn.onclick = () => {
    const name = sel.value;
    const insertAt = p.list.findIndex((e) => e.effect === 'SAMPLE');
    const item = { effect: name, ...defaultParams(name) };
    if (name === 'SAMPLE') p.list.push({ effect: 'SAMPLE' });
    else if (insertAt >= 0) p.list.splice(insertAt, 0, item);
    else p.list.push(item);
    fixTrigger(p); syncAudio(); render();
  };
  addBar.append(sel, addBtn);
  body.append(addBar);

  body.append(renderModulation(p));

  // 「工場出荷に戻す」は破棄操作なので、他の編集操作から離して右下に置く
  const dangerBar = el('div', 'danger-bar');
  const del = el('button', 'is-small is-danger', t('editor.reset_factory'));
  del.onclick = () => {
    if (!confirm(t('editor.reset_confirm', { pos, name: FACTORY_PRESETS[pos] }))) return;
    state.slots[pos] = null; syncAudio(); render();
  };
  dangerBar.append(del);
  body.append(dangerBar);
}

function labelled(label, input) {
  const wrap = el('div', 'param');
  wrap.style.gridTemplateColumns = '96px 1fr';
  wrap.append(el('span', 'param__name', label), input);
  input.style.width = '100%';
  return wrap;
}

function renderRow(preset, eff, i) {
  const name = String(eff.effect).toUpperCase();
  const spec = EFFECTS[name];
  const row = el('div', 'row' + (name === 'SAMPLE' ? ' is-sample' : ''));

  const head = el('div', 'row__head');
  head.append(el('span', 'row__idx', String(i)));
  head.append(tip(el('span', 'row__name', name), name, effectDesc(name, getLang())));
  if (spec?.once) head.append(el('span', 'chip is-grey', t('row.once')));

  const up = el('button', 'is-small', '↑'); up.disabled = i === 0;
  up.onclick = () => move(preset, i, -1);
  const down = el('button', 'is-small', '↓'); down.disabled = i === preset.list.length - 1;
  down.onclick = () => move(preset, i, 1);
  const rm = el('button', 'is-small', '×');
  rm.onclick = () => {
    preset.list.splice(i, 1); dropModsFor(preset, i); fixTrigger(preset); syncAudio(); render();
  };
  head.append(up, down, rm);
  row.append(head);

  const bodyEl = el('div', 'row__body');
  if (name === 'SAMPLE') {
    bodyEl.append(el('p', 'hint', i === preset.list.length - 1
      ? t('row.sample_last') : t('row.sample_mid', { row: i })));
  }
  if (spec) {
    for (const [param, range] of Object.entries(spec.params)) {
      if (eff[param] === undefined) continue;
      bodyEl.append(renderParam(preset, eff, i, param, range));
    }
    const missing = Object.keys(spec.params).filter((k) => eff[k] === undefined);
    if (missing.length) {
      const bar = el('div', 'rowflex');
      const s = el('select');
      for (const m of missing) s.append(new Option(m, m));
      const b = el('button', 'is-small', t('param.add'));
      b.onclick = () => { eff[s.value] = spec.params[s.value][2]; syncAudio(); render(); };
      bar.append(s, b);
      bodyEl.append(bar);
    }
  }
  row.append(bodyEl);
  return row;
}

function renderParam(preset, eff, rowIndex, param, range) {
  const [min, max, , step] = range;
  const wrap = el('div', 'param');
  const modulated = ['handle', 'shake', 'lfo'].some(
    (k) => preset[k]?.row === rowIndex && preset[k]?.param === param);
  if (modulated) wrap.classList.add('is-modulated');

  const slider = el('input');
  slider.type = 'range'; slider.min = min; slider.max = max; slider.step = step;
  slider.value = eff[param];
  const val = el('span', 'param__val', fmt(eff[param]));
  slider.oninput = () => {
    eff[param] = Number(slider.value);
    val.textContent = fmt(eff[param]);
    engine.setBaseParam(rowIndex, param, eff[param]);
    renderOutput();
  };
  const effName = String(eff.effect).toUpperCase();
  wrap.append(
    tip(el('span', 'param__name', param), `${effName} · ${param}`, paramDesc(effName, param, getLang())),
    slider, val);
  if (modulated) liveValues.push({ rowIndex, param, node: val, slider });
  return wrap;
}

/** 変調されたパラメータの実効値を毎フレーム表示する（つまみはベース値のまま） */
function tickLiveValues() {
  for (const { rowIndex, param, node, slider } of liveValues) {
    const v = engine.rows?.[rowIndex]?.applied?.[param];
    if (v === undefined) continue;
    node.textContent = fmt(v);
    node.style.color = Math.abs(v - Number(slider.value)) > 1e-6 ? 'var(--orange)' : '';
  }
  // シェイク中は本体をゆっくり小さく揺らす
  $('deviceWrap').classList.toggle('is-shaking', engine.shake > 0.02);
  requestAnimationFrame(tickLiveValues);
}

const fmt = (v) => (Number.isInteger(v) ? String(v) : Number(v).toFixed(2).replace(/0$/, ''));

function move(preset, i, dir) {
  const j = i + dir;
  if (j < 0 || j >= preset.list.length) return;
  [preset.list[i], preset.list[j]] = [preset.list[j], preset.list[i]];
  for (const k of ['handle', 'shake', 'lfo']) {
    const m = preset[k];
    if (!m || !Number.isInteger(m.row)) continue;
    if (m.row === i) m.row = j; else if (m.row === j) m.row = i;
  }
  fixTrigger(preset); syncAudio(); render();
}

function dropModsFor(preset, removed) {
  for (const k of ['handle', 'shake', 'lfo']) {
    const m = preset[k];
    if (!m || !Number.isInteger(m.row)) continue;
    if (m.row === removed) delete preset[k];
    else if (m.row > removed) m.row -= 1;
  }
}

function fixTrigger(preset) {
  const i = preset.list.findIndex((e) => String(e.effect).toUpperCase() === 'SAMPLE');
  if (i < 0) delete preset.trigger; else preset.trigger = { row: i };
}

function renderModulation(preset) {
  const box = el('div', 'stack');
  box.append(el('div', 'chip is-light', t('mod.title')));

  for (const kind of ['handle', 'shake', 'lfo']) {
    const on = !!preset[kind];
    const card = el('div', 'row');
    const head = el('div', 'row__head');
    head.append(el('span', 'row__name', t(`mod.${kind}`) === `mod.${kind}` ? kind : kind));
    const spacer = el('span'); spacer.style.flex = '1';
    const toggle = el('button', 'is-small' + (on ? ' is-on' : ''), on ? t('mod.on') : t('mod.off'));
    toggle.onclick = () => {
      if (on) delete preset[kind];
      else {
        const r = Math.max(0, preset.list.findIndex((e) => {
          const n = String(e.effect).toUpperCase();
          return EFFECTS[n] && n !== 'SAMPLE';
        }));
        const param = Object.keys(EFFECTS[String(preset.list[r].effect).toUpperCase()].params)[0];
        preset[kind] = kind === 'lfo'
          ? { row: r, param, depth: 0.5, shape: 'sine', speed: 2 }
          : { row: r, param, depth: 0.5 };
      }
      syncAudio(); render();
    };
    head.append(spacer, toggle);
    card.append(head);

    if (on) {
      const m = preset[kind];
      const b = el('div', 'row__body');

      const rowSel = el('select');
      preset.list.forEach((e, i) => {
        const n = String(e.effect).toUpperCase();
        if (EFFECTS[n]) rowSel.append(new Option(`row ${i} — ${n}`, String(i)));
      });
      rowSel.value = String(m.row ?? 0);
      rowSel.onchange = () => {
        m.row = Number(rowSel.value);
        const n = String(preset.list[m.row].effect).toUpperCase();
        if (!EFFECTS[n].params[m.param]) m.param = Object.keys(EFFECTS[n].params)[0];
        syncAudio(); render();
      };
      b.append(labelled(t('mod.target'), rowSel));

      const eName = String(preset.list[m.row]?.effect ?? '').toUpperCase();
      const paramSel = el('select');
      for (const k of Object.keys(EFFECTS[eName]?.params ?? {})) paramSel.append(new Option(k, k));
      paramSel.value = m.param;
      paramSel.onchange = () => { m.param = paramSel.value; syncAudio(); render(); };
      tip(paramSel, `${eName} · ${m.param}`, paramDesc(eName, m.param, getLang()));
      b.append(labelled(t('mod.param'), paramSel));

      const depth = el('input'); depth.type = 'number';
      const r = paramRange(eName, m.param);
      depth.step = r && r[1] - r[0] > 100 ? 10 : 0.05;
      depth.value = m.depth ?? 0;
      depth.oninput = () => { m.depth = Number(depth.value); syncAudio(); renderOutput(); };
      b.append(labelled(t('mod.depth'), depth));

      if (kind === 'lfo') {
        const shape = el('select');
        for (const sh of LFO_SHAPES) shape.append(new Option(sh, sh));
        shape.value = m.shape ?? 'sine';
        shape.onchange = () => { m.shape = shape.value; renderOutput(); };
        b.append(labelled(t('mod.shape'), shape));

        const speed = el('input'); speed.type = 'number'; speed.step = 0.1; speed.min = 0;
        speed.value = m.speed ?? 2;
        speed.oninput = () => { m.speed = Number(speed.value); renderOutput(); };
        b.append(labelled(t('mod.speed'), speed));
      }
      b.append(el('p', 'hint', t(`mod.help.${kind}`)));
      card.append(b);
    }
    box.append(card);
  }
  return box;
}

// ─────────────────────────── SAMPLE モード ───────────────────────────

function renderSamples() {
  const box = $('sampleSlots');
  box.replaceChildren();

  for (let i = 0; i < MAX_SLOTS; i++) {
    const s = state.samples[i];
    const card = el('div', 'smp' + (state.sampleSlot === i ? ' is-active' : '') + (s ? '' : ' is-empty'));

    const head = el('div', 'smp__head');
    head.append(el('span', 'smp__n', String(i + 1)));
    head.append(el('span', 'smp__name',
      s ? s.file : t('samples.factory', { name: FACTORY_SAMPLES[i] })));
    const pick = el('button', 'is-small', t('samples.choose'));
    pick.onclick = () => chooseSample(i);
    head.append(pick);
    if (s) {
      const clr = el('button', 'is-small is-danger', t('samples.clear'));
      clr.onclick = () => {
        state.samples[i] = null; engine.setSampleBuffer(i, null); render();
      };
      head.append(clr);
    }
    card.append(head);

    const b = el('div', 'smp__body');
    if (s) {
      const meta = [`${s.size.toLocaleString()} B`];
      if (s.info && !s.info.error) {
        meta.push(`${s.info.bits}-bit${s.info.isFloat ? 'f' : ''}`, `${s.info.rate} Hz`,
          s.info.channels === 1 ? 'mono' : 'stereo',
          s.info.duration ? `${s.info.duration.toFixed(2)}s` : '');
      }
      b.append(el('div', 'smp__meta', meta.filter(Boolean).join(' · ')));
      if (s.info && !s.info.error && !(s.info.supported && s.info.rateOk && s.info.channelsOk)) {
        b.append(el('div', 'diag__item is-error', t('samples.unsupported')));
      }

      const modeSel = el('select');
      for (const pm of PLAYMODES) modeSel.append(new Option(t(`samples.playmode.${pm}`), pm));
      modeSel.value = s.playmode;
      modeSel.onchange = () => { s.playmode = modeSel.value; renderOutput(); };
      b.append(labelled(t('samples.playmode'), modeSel));

      const bar = el('div', 'rowflex');
      const play = el('button', 'is-small', t('samples.preview'));
      play.onclick = () => { state.sampleSlot = i; engine.setSampleSlot(i); engine.playSample(i); render(); };
      bar.append(play);
      b.append(bar);
    } else {
      // 見出しに工場出荷名が出ているので、ここでは何が起きるかだけ書く
      b.append(el('div', 'smp__meta', t('samples.empty_hint')));
    }
    card.append(b);
    card.onclick = (e) => {
      if (e.target.tagName === 'BUTTON' || e.target.tagName === 'SELECT') return;
      state.sampleSlot = i; engine.setSampleSlot(i); render();
    };
    box.appendChild(card);
  }

  // 一部だけ差し替えたときの注意（samples の部分差し替えは実機未検証）
  const warn = $('sampleWarn');
  warn.replaceChildren();
  const n = state.samples.filter(Boolean).length;
  if (n > 0 && n < MAX_SLOTS) {
    const w = el('div', 'diag__item is-warn');
    w.textContent = getLang() === 'ja'
      ? 'サンプルの部分差し替え（一部スロットだけ指定して残りは工場出荷）は実機で未検証です。プリセットでは成立することを確認済みですが、サンプルでも同じとは限りません。'
      : 'Overriding only some sample slots is unverified on the hardware. It works for presets, but samples may behave differently.';
    warn.appendChild(w);
  }
  const total = [...plannedFiles().values()].reduce((a, f) => a + f.size, 0);
  $('sampleBudget').textContent = t('budget', { used: total.toLocaleString() });
}

let pendingSampleSlot = 0;
function chooseSample(i) { pendingSampleSlot = i; $('fileSample').click(); }

async function loadSampleFile(slot, file) {
  const bytes = await file.arrayBuffer();
  const info = readWavFormat(bytes.slice(0));
  await engine.init();
  let buffer = null;
  try {
    buffer = await engine.ctx.decodeAudioData(bytes.slice(0));
  } catch (e) {
    alert(t('samples.decode_failed', { msg: e.message }));
    return;
  }
  state.samples[slot] = {
    file: file.name, playmode: 'oneshot', bytes, size: file.size, info,
  };
  engine.setSampleBuffer(slot, buffer);
  state.sampleSlot = slot;
  engine.setSampleSlot(slot);
  render();
}

// ─────────────────────── テンプレート ───────────────────────

function renderTemplates() {
  const box = $('templates');
  box.replaceChildren();
  for (const tpl of TEMPLATES) {
    const b = el('button', 'tpl');
    b.append(el('b', null, tpl.name));
    b.append(el('span', null, tpl.desc[getLang()] ?? tpl.desc.en));
    b.onclick = () => {
      if (state.slots.some(Boolean) && !confirm(t('disk.load_confirm'))) return;
      loadConfigObject(structuredClone(tpl.config));
    };
    box.appendChild(b);
  }

  // TE 公式パックは再配布できないので、ダウンロードしたファイルを読み込む導線にする
  const te = $('tePacks');
  te.replaceChildren();
  const open = el('button', 'tpl');
  open.append(el('b', null, 'open pack'));
  open.append(el('span', null, getLang() === 'ja'
    ? 'ダウンロードした .zip か config.json を読み込む'
    : 'load a downloaded .zip or config.json'));
  open.onclick = () => $('filePack').click();
  const link = el('a');
  link.href = 'https://teenage.engineering/downloads/ep-2350/sound-packs';
  link.target = '_blank'; link.rel = 'noopener';
  link.className = 'tpl';
  link.append(el('b', null, 'download ↗'));
  link.append(el('span', null, getLang() === 'ja'
    ? 'TE の配布ページを開く（broken radio / mysterious / dub）'
    : "open TE's download page (broken radio / mysterious / dub)"));
  te.append(open, link);

  $('teHint').textContent = getLang() === 'ja'
    ? 'TE 公式パックは teenage engineering の著作物で再配布が禁止されているため同梱していません。上のリンクから落として読み込んでください。'
    : "The official TE packs are teenage engineering's material and cannot be redistributed, so they are not bundled. Download them above and load the file.";
}

/** TE が配布している zip（config.json 1 個入り）をブラウザ内で展開する */
async function readPackFile(file) {
  if (file.name.toLowerCase().endsWith('.json')) return await file.text();

  const buf = new Uint8Array(await file.arrayBuffer());
  const dv = new DataView(buf.buffer);
  // ローカルファイルヘッダを順に見て config.json を探す
  for (let i = 0; i + 30 < buf.length; i++) {
    if (dv.getUint32(i, true) !== 0x04034b50) continue;
    const method = dv.getUint16(i + 8, true);
    const compSize = dv.getUint32(i + 18, true);
    const nameLen = dv.getUint16(i + 26, true);
    const extraLen = dv.getUint16(i + 28, true);
    const nameStart = i + 30;
    const name = new TextDecoder().decode(buf.subarray(nameStart, nameStart + nameLen));
    if (!name.toLowerCase().endsWith('config.json')) continue;
    const dataStart = nameStart + nameLen + extraLen;
    const data = buf.subarray(dataStart, dataStart + compSize);
    if (method === 0) return new TextDecoder().decode(data);
    if (method === 8) {
      const ds = new DecompressionStream('deflate-raw');
      const out = new Response(new Blob([data]).stream().pipeThrough(ds));
      return await out.text();
    }
    throw new Error(`unsupported zip compression method ${method}`);
  }
  throw new Error('config.json not found in the archive');
}

// ─────────────────────── 出力・検証・ディスク ───────────────────────

function renderOutput() {
  const text = configText();
  $('jsonOut').textContent = text;

  const files = plannedFiles();
  const rep = validate(text, { files });

  // 検証結果は通常は隠しておき、エラーが出たときだけ前に出す
  const hasErrors = rep.errors.length > 0;
  $('errorPanel').classList.toggle('hidden', !hasErrors);
  if (hasErrors) {
    const diag = $('diag');
    diag.replaceChildren();
    for (const d of rep.errors) {
      const n = el('div', 'diag__item is-error');
      if (d.where) n.append(el('span', 'diag__where', d.where));
      n.append(el('span', null, d.msg));
      diag.appendChild(n);
    }
  }

  const total = [...files.values()].reduce((a, f) => a + f.size, 0);
  $('budgetFill').style.width = `${Math.min(100, (total / DISK_BUDGET) * 100)}%`;
  $('budgetFill').classList.toggle('is-over', total > DISK_BUDGET);
  $('budgetLabel').textContent = t('budget', { used: total.toLocaleString() });

  $('btnWrite').disabled = !disk.connected || hasErrors;
  return rep;
}

function renderDiskFiles() {
  const box = $('diskFiles');
  box.replaceChildren();
  if (!disk.connected) {
    box.appendChild(el('div', 'diag__item is-note', t('disk.not_connected')));
    return;
  }
  const planned = plannedFiles();
  if (!planned.size) {
    box.appendChild(el('div', 'diag__item is-note', t('disk.empty')));
    return;
  }
  for (const [name, f] of planned) {
    const n = el('div', 'diag__item is-note');
    const label = el('span', null, name);
    label.style.flex = '1';
    n.append(label, el('span', 'diag__where', `${f.size.toLocaleString()} B`));
    box.appendChild(n);
  }
}

async function connectDisk() {
  try {
    const name = await disk.pick();
    $('diskName').textContent = name;
    $('diskChip').textContent = `DISK: ${name}`;
    $('diskChip').className = 'chip is-orange';
    $('btnReload').disabled = false;
    $('btnConnect').textContent = t('disk.change');
    $('btnConnect').classList.remove('is-primary');
    $('diskHint').classList.add('hidden');    // 接続後は手順の説明はもう不要
    await reloadDisk();
  } catch (e) {
    if (e.name !== 'AbortError') alert(t('disk.open_failed', { msg: e.message }));
  }
}

async function reloadDisk() {
  diskFiles = await disk.list();
  diskFiles.delete('config.json');
  // エディタ側で持っている wav はディスク上の同名ファイルより優先する
  for (const s of state.samples) if (s) diskFiles.delete(s.file);

  const text = await disk.readConfig();
  if (text && confirm(t('disk.load_confirm'))) {
    try { loadConfigObject(JSON.parse(text)); } catch { /* 壊れていれば無視して現状維持 */ }
  }
  render();
}

function loadConfigObject(cfg) {
  state.name = cfg.name ?? 'MY PACK';
  state.slots = [null, null, null, null];
  (cfg.presets ?? []).forEach((p, i) => {
    const { pos = i, ...rest } = p;
    if (pos >= 0 && pos < MAX_SLOTS) state.slots[pos] = rest;
  });
  // samples はファイル名しか分からないので、実体を持っていないものは工場出荷扱いにする
  state.selected = state.slots.findIndex(Boolean);
  if (state.selected < 0) state.selected = 0;
  state.activeSlot = state.selected;
  syncAudio(); render();
}

async function writeDisk() {
  if (!renderOutput().ok) return;

  const existing = await disk.readConfig();
  if (existing) {
    if (confirm(t('disk.backup_confirm'))) {
      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      download(`config.backup-${stamp}.json`, existing);
    }
  } else if (!confirm(t('disk.write_confirm'))) return;

  try {
    for (const s of state.samples) if (s) await disk.writeFile(s.file, s.bytes);
    await disk.writeFile('config.json', configText());
    diskFiles = await disk.list();
    diskFiles.delete('config.json');
    for (const s of state.samples) if (s) diskFiles.delete(s.file);
    render();
    alert(t('disk.done'));
  } catch (e) {
    alert(t('disk.write_failed', { msg: e.message }));
  }
}

// ─────────────────────────── オーディオ ───────────────────────────

function syncAudio() {
  if (!engine.ready) return;
  const p = state.activeSlot < 0 ? null : state.slots[state.activeSlot];
  engine.setPreset(p ?? { list: [{ effect: 'SAMPLE' }], trigger: { row: 0 } });
}

async function toggleMic() {
  try {
    if (engine.micActive) {
      engine.stopMic();
    } else {
      await engine.enableMic();
      syncAudio();
      setHandle(Number($('handleSlider').value) / 100);
    }
    paintMicState();
  } catch (e) {
    alert(t('mic.failed', { msg: e.message }));
  }
}

function paintMicState() {
  const on = engine.micActive;
  $('btnMic').textContent = on ? t('btn.mic_off') : t('btn.mic_on');
  $('btnMic').classList.toggle('is-primary', !on);
  $('micChip').textContent = on ? t('chip.mic.on') : t('chip.mic.off');
  $('micChip').className = on ? 'chip is-orange' : 'chip is-grey';
  paintDevice();
}

// ─────────────────────────── 波形 ───────────────────────────

function initScope() {
  const cv = $('scope');
  const ctx = cv.getContext('2d');
  const data = new Uint8Array(2048);
  const draw = () => {
    ctx.fillStyle = '#000005';
    ctx.fillRect(0, 0, cv.width, cv.height);
    if (engine.getWaveform(data)) {
      ctx.strokeStyle = '#e05526'; ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i < data.length; i++) {
        const x = (i / data.length) * cv.width;
        const y = (data[i] / 255) * cv.height;
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.stroke();
    } else {
      ctx.strokeStyle = '#3a3a3a';
      ctx.beginPath(); ctx.moveTo(0, cv.height / 2); ctx.lineTo(cv.width, cv.height / 2); ctx.stroke();
    }
    requestAnimationFrame(draw);
  };
  draw();
}

// ─────────────────────────── ヘルプ ───────────────────────────

function initHelp() {
  let on = false;
  const marks = [['#btnFx', 'FX MODE'], ['#btnSampleSel', 'SAMPLE SEL.'], ['#btnTrig', 'SAMPLE TRIG']];
  $('btnHelp').onclick = () => {
    on = !on;
    $('btnHelp').classList.toggle('is-on', on);
    document.querySelectorAll('.callout').forEach((n) => n.remove());
    if (!on) return;
    const host = $('device').closest('.panel__body');
    host.style.position = 'relative';
    for (const [sel, text] of marks) {
      const tr = document.querySelector(sel).getBoundingClientRect();
      const h = host.getBoundingClientRect();
      const c = el('div', 'callout to-left', text);
      c.style.top = `${tr.top - h.top + tr.height / 2 - 10}px`;
      c.style.left = `${tr.right - h.left + 16}px`;
      host.appendChild(c);
    }
  };
}

// ─────────────────────────── モードと言語 ───────────────────────────

function setMode(mode) {
  state.mode = mode;
  $('fxMode').classList.toggle('hidden', mode !== 'fx');
  $('sampleMode').classList.toggle('hidden', mode !== 'sample');
  for (const b of $('modes').children) b.classList.toggle('is-on', b.dataset.mode === mode);
  render();   // モードごとに描画対象が違うので、切り替えたら必ず描き直す
}

/** 言語切り替え時に静的なラベルを貼り直す */
function applyStaticText() {
  $('subtitle').textContent = t('app.subtitle');
  $('modeFx').textContent = t('mode.fx');
  $('modeSample').textContent = t('mode.sample');
  $('panelDevice').textContent = t('panel.device');
  $('panelPresets').textContent = t('panel.presets');
  $('presetsHint').textContent = t('presets.hint');
  $('panelSamples').textContent = t('samples.title');
  $('samplesHint').textContent = t('samples.hint');
  $('panelDisk').textContent = t('panel.disk');
  $('panelJson').textContent = t('panel.json');
  $('errorTitle').textContent = t('error.title');
  $('handleLabel').textContent = t('handle');
  $('btnShake').textContent = t('btn.shake');
  $('btnPlay').textContent = t('btn.play');
  $('deviceHint').textContent = t('hint.device');
  $('btnReload').textContent = t('disk.reload');
  $('btnWrite').textContent = t('disk.write');
  $('btnDownload').textContent = t('disk.save_json');
  $('btnCopy').textContent = t('json.copy');
  $('btnToggleJson').textContent = $('jsonBody').classList.contains('hidden')
    ? t('json.expand') : t('json.collapse');
  $('btnConnect').textContent = disk.connected ? t('disk.change') : t('disk.connect');
  $('diskName').textContent = disk.name ?? '';
  if (!disk.connected) $('diskChip').textContent = t('chip.disk.none');
  $('diskHint').innerHTML = diskSupported() ? t('disk.hint') : t('disk.hint_unsupported');
  $('diskHint').classList.toggle('hidden', disk.connected);
  paintMicState();
}

// ─────────────────────────── 起動 ───────────────────────────

function render() {
  if (state.mode === 'fx') { renderSlots(); renderEditor(); }
  else renderSamples();
  renderTemplates();
  renderDiskFiles();
  renderOutput();
  paintDevice();
}

function init() {
  initTooltips();
  initDevice();
  initScope();
  initHelp();
  tickLiveValues();

  const langSel = $('langSelect');
  for (const [code, label] of LANGS) langSel.append(new Option(label, code));
  langSel.value = getLang();
  langSel.onchange = () => { setLang(langSel.value); applyStaticText(); render(); };

  for (const b of $('modes').children) b.onclick = () => setMode(b.dataset.mode);

  $('handleSlider').oninput = () => setHandle(Number($('handleSlider').value) / 100);
  $('btnMic').onclick = toggleMic;
  $('btnShake').onclick = () => engine.triggerShake();
  $('btnPlay').onclick = () => engine.playSample();
  $('btnConnect').onclick = connectDisk;
  $('btnReload').onclick = reloadDisk;
  $('btnWrite').onclick = writeDisk;
  $('btnDownload').onclick = () => download('config.json', configText());

  $('btnCopy').onclick = async () => {
    await navigator.clipboard.writeText(configText());
    $('btnCopy').textContent = t('json.copied');
    $('btnCopy').classList.add('is-done');
    setTimeout(() => {
      $('btnCopy').textContent = t('json.copy');
      $('btnCopy').classList.remove('is-done');
    }, 1400);
  };
  $('btnToggleJson').onclick = () => {
    const hidden = $('jsonBody').classList.toggle('hidden');
    $('btnToggleJson').textContent = hidden ? t('json.expand') : t('json.collapse');
  };

  $('fileSample').onchange = (e) => {
    if (e.target.files[0]) loadSampleFile(pendingSampleSlot, e.target.files[0]);
    e.target.value = '';
  };
  $('filePack').onchange = async (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    try {
      loadConfigObject(JSON.parse(await readPackFile(f)));
      setMode('fx');
    } catch (err) {
      alert(`${f.name}: ${err.message}`);
    }
  };

  if (!diskSupported()) $('btnConnect').disabled = true;

  // 初期状態は RADIO テンプレート
  applyStaticText();
  loadConfigObject(structuredClone(TEMPLATES[0].config));
  setMode('fx');

  window.__fxmic = { engine, state, buildConfig, validate, setMode, loadConfigObject };
}

// サンプル選択用の隠し input（HTML 側には samples モードのぶんだけ置いてある）
const hidden = document.createElement('input');
hidden.type = 'file'; hidden.accept = '.wav,audio/wav'; hidden.id = 'fileSample';
hidden.className = 'hidden';
document.body.appendChild(hidden);

init();
