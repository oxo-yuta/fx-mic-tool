// fx-mic editor — 画面と状態。
// 4 つの FX スロットはそれぞれ「工場出荷のまま」か「自分で定義」かのどちらか。
// presets に書かなかったスロットは工場出荷プリセットが残ることを実機で確認済みなので、
// この 2 状態をそのまま UI のモデルにしている（docs/config-json.md 参照）。

import {
  EFFECTS, FACTORY_PRESETS, FACTORY_SAMPLES, MAX_SLOTS, LFO_SHAPES,
  DISK_BUDGET, defaultParams, buttonPosition, paramRange,
} from './spec.js';
import { validate, readWavFormat } from './validate.js';
import { FxEngine } from './audio.js';
import { Disk, supported as diskSupported, download } from './disk.js';

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
  slots: [null, null, null, null],   // null = 工場出荷のまま
  selected: 0,                        // 編集中のスロット（0〜3）
  activeSlot: 0,                      // 実機のオレンジボタン相当（-1 = クリーン）
  sampleSlot: 0,
  sampleBuffer: null,
  sampleMeta: null,
};

const engine = new FxEngine();
const disk = new Disk();

const currentPreset = () => state.slots[state.selected];

/** config.json を組み立てる。工場出荷のままのスロットは presets に含めない。 */
function buildConfig() {
  const cfg = { name: state.name };
  const presets = [];
  state.slots.forEach((p, pos) => {
    if (p) presets.push({ pos, ...p });
  });
  if (presets.length) cfg.presets = presets;
  return cfg;
}

const configText = () => JSON.stringify(buildConfig(), null, 2);

// ─────────────────────── デバイス図（SVG） ───────────────────────

function initDevice() {
  // グリルのドットマトリクス
  const grille = $('grille');
  for (let r = 0; r < 11; r++) {
    for (let c = 0; c < 13; c++) {
      const x = 55 + c * 13.2, y = 30 + r * 13.2;
      if (x > 185 && y < 170) continue;      // LED 列のスペースを空ける
      const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      dot.setAttribute('cx', x); dot.setAttribute('cy', y); dot.setAttribute('r', 4.4);
      grille.appendChild(dot);
    }
  }
  // LED 列（FX は clean + 4、sample は 4）
  const led = (parent, n, x, y0, gap) => {
    for (let i = 0; i < n; i++) {
      const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      c.setAttribute('cx', x); c.setAttribute('cy', y0 + i * gap); c.setAttribute('r', 4);
      c.setAttribute('stroke', '#000005'); c.setAttribute('stroke-width', '1');
      parent.appendChild(c);
    }
  };
  led($('ledFx'), 5, 200.5, 50, 13);
  led($('ledSample'), 4, 200.5, 132, 13);

  $('btnFx').addEventListener('click', () => {
    state.activeSlot = state.activeSlot >= MAX_SLOTS - 1 ? -1 : state.activeSlot + 1;
    if (state.activeSlot >= 0) state.selected = state.activeSlot;
    syncAudio(); render();
  });
  $('btnSampleSel').addEventListener('click', () => {
    state.sampleSlot = (state.sampleSlot + 1) % MAX_SLOTS;
    render();
  });
  $('btnTrig').addEventListener('click', () => engine.playSample());

  // ハンドルはドラッグでも動かせる
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

/** LED やハンドル角度など、図の状態表示だけを更新する */
function paintDevice() {
  const h = Number($('handleSlider').value) / 100;
  $('handleVal').textContent = `${Math.round(h * 100)}%`;
  $('handle').parentElement.setAttribute(
    'transform', `rotate(${(-15 * (1 - h)).toFixed(2)} 33 78)`);
  $('powerLed').setAttribute('fill', h > 0.02 ? '#e05526' : '#6b6b6b');

  [...$('ledFx').children].forEach((c, i) => {
    // LED 1 個目がクリーン、2 個目以降が pos 0〜3
    const on = state.activeSlot === i - 1;
    c.setAttribute('fill', on ? '#e05526' : '#3a3a3a');
  });
  [...$('ledSample').children].forEach((c, i) => {
    c.setAttribute('fill', state.sampleSlot === i ? '#e5e6e6' : '#3a3a3a');
  });
  $('deviceState').textContent = state.activeSlot < 0
    ? 'clean'
    : (state.slots[state.activeSlot]?.name || `工場出荷 ${FACTORY_PRESETS[state.activeSlot]}`);
}

// ─────────────────────────── スロット一覧 ───────────────────────────

function renderSlots() {
  const box = $('slots');
  box.replaceChildren();

  const clean = el('div', 'slot' + (state.activeSlot < 0 ? ' is-active' : '') + ' is-factory');
  clean.append(el('span', 'slot__pos', '1'), el('span', 'slot__name', 'clean（エフェクトなし）'));
  clean.onclick = () => { state.activeSlot = -1; syncAudio(); render(); };
  box.appendChild(clean);

  for (let pos = 0; pos < MAX_SLOTS; pos++) {
    const p = state.slots[pos];
    const row = el('div', 'slot'
      + (state.selected === pos ? ' is-active' : '')
      + (p ? '' : ' is-factory'));
    row.append(el('span', 'slot__pos', String(buttonPosition(pos))));
    row.append(el('span', 'slot__name', p ? (p.name || `PRESET ${pos}`) : `工場出荷 ${FACTORY_PRESETS[pos]}`));
    row.append(el('span', 'slot__meta', p ? `${p.list.length} fx · pos ${pos}` : `pos ${pos} 未定義`));
    row.onclick = () => { state.selected = pos; state.activeSlot = pos; syncAudio(); render(); };
    box.appendChild(row);
  }
}

// ─────────────────────────── エディタ ───────────────────────────

function newPreset(pos) {
  return {
    name: `PRESET ${pos}`,
    comment: '',
    list: [{ effect: 'LOWPASS', ...defaultParams('LOWPASS') }, { effect: 'SAMPLE' }],
    handle: { row: 0, param: 'cutoff', depth: 0.7 },
    trigger: { row: 1 },
  };
}

function renderEditor() {
  const body = $('editorBody');
  body.replaceChildren();
  liveValues = [];
  const pos = state.selected;
  const p = state.slots[pos];
  $('editorPos').textContent = `pos ${pos} · オレンジボタン ${buttonPosition(pos)} 番目`;

  if (!p) {
    $('editorTitle').textContent = `工場出荷 ${FACTORY_PRESETS[pos]}`;
    const hint = el('p', 'hint');
    hint.innerHTML = `このスロットは <b>config.json に書かない</b>ので、実機の工場出荷プリセット
      <b>${FACTORY_PRESETS[pos]}</b> がそのまま残ります。<br>
      プレビューでは内蔵プリセットの中身が公開されていないため再現できません。`;
    const btn = el('button', 'is-primary', 'このスロットを自分のプリセットにする');
    btn.onclick = () => { state.slots[pos] = newPreset(pos); syncAudio(); render(); };
    body.append(hint, btn);
    return;
  }

  $('editorTitle').textContent = p.name || 'effect chain';

  // 名前とコメント
  const meta = el('div', 'stack');
  const nameIn = el('input'); nameIn.type = 'text'; nameIn.value = p.name || '';
  nameIn.placeholder = 'PRESET NAME';
  nameIn.oninput = () => { p.name = nameIn.value.toUpperCase(); renderSlots(); renderOutput(); paintDevice(); };
  const commentIn = el('input'); commentIn.type = 'text'; commentIn.value = p.comment || '';
  commentIn.placeholder = 'comment — どう動くかのメモ';
  commentIn.oninput = () => { p.comment = commentIn.value; renderOutput(); };
  meta.append(labelled('name', nameIn), labelled('comment', commentIn));
  body.append(meta);

  // エフェクトチェーン
  const chain = el('div', 'chain');
  p.list.forEach((eff, i) => chain.appendChild(renderRow(p, eff, i)));
  body.append(chain);

  // 追加
  const addBar = el('div', 'rowflex');
  const sel = el('select');
  for (const name of Object.keys(EFFECTS)) sel.append(new Option(name, name));
  const addBtn = el('button', 'is-small', '＋ エフェクト追加');
  addBtn.onclick = () => {
    const name = sel.value;
    const insertAt = p.list.findIndex((e) => e.effect === 'SAMPLE');
    const item = { effect: name, ...defaultParams(name) };
    if (name === 'SAMPLE') p.list.push({ effect: 'SAMPLE' });
    else if (insertAt >= 0) p.list.splice(insertAt, 0, item);   // SAMPLE の前に入れる
    else p.list.push(item);
    fixTrigger(p); syncAudio(); render();
  };
  addBar.append(sel, addBtn);

  const del = el('button', 'is-small', '工場出荷に戻す');
  del.onclick = () => {
    if (!confirm(`pos ${pos} を工場出荷 ${FACTORY_PRESETS[pos]} に戻します。この内容は失われます。`)) return;
    state.slots[pos] = null; syncAudio(); render();
  };
  addBar.append(del);
  body.append(addBar);

  // 変調
  body.append(renderModulation(p));
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
  head.append(el('span', 'row__idx', String(i)), el('span', 'row__name', name));
  if (spec?.once) head.append(el('span', 'chip is-grey', '1 回のみ'));

  const up = el('button', 'is-small', '↑');
  up.disabled = i === 0;
  up.onclick = () => { move(preset, i, -1); };
  const down = el('button', 'is-small', '↓');
  down.disabled = i === preset.list.length - 1;
  down.onclick = () => { move(preset, i, 1); };
  const rm = el('button', 'is-small', '×');
  rm.onclick = () => {
    preset.list.splice(i, 1);
    dropModsFor(preset, i);
    fixTrigger(preset); syncAudio(); render();
  };
  head.append(up, down, rm);
  row.append(head);

  const bodyEl = el('div', 'row__body');
  if (!spec) {
    bodyEl.append(el('p', 'hint', `未知のエフェクト "${eff.effect}"`));
  } else if (name === 'SAMPLE') {
    const note = el('p', 'hint');
    note.innerHTML = i === preset.list.length - 1
      ? 'チェーンの最後にあるので、サンプルはドライで出ます（TE 公式パックと同じ）。'
      : `row ${i} にあるので、これより後ろのエフェクトがサンプルにもかかります。`;
    bodyEl.append(note);
  }
  if (spec) {
    for (const [param, range] of Object.entries(spec.params)) {
      if (eff[param] === undefined) continue;
      bodyEl.append(renderParam(preset, eff, i, param, range));
    }
    // 未設定のパラメータを足せるように
    const missing = Object.keys(spec.params).filter((k) => eff[k] === undefined);
    if (missing.length) {
      const bar = el('div', 'rowflex');
      const s = el('select');
      for (const m of missing) s.append(new Option(m, m));
      const b = el('button', 'is-small', '＋ param');
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
  slider.type = 'range';
  slider.min = min; slider.max = max; slider.step = step;
  slider.value = eff[param];
  const val = el('span', 'param__val', fmt(eff[param]));
  if (modulated) {
    slider.title = 'つまみはベース値。右の数字は変調を含めた実効値（ハンドルを動かすと変化する）';
  }
  slider.oninput = () => {
    eff[param] = Number(slider.value);
    val.textContent = fmt(eff[param]);
    engine.setBaseParam(rowIndex, param, eff[param]);
    renderOutput();
  };
  wrap.append(el('span', 'param__name', param), slider, val);
  // 変調中のパラメータは「実効値」を毎フレーム表示する（ハンドルを動かすと数字が動く）
  if (modulated) liveValues.push({ rowIndex, param, node: val, slider });
  return wrap;
}

// 変調されたパラメータのライブ表示。renderEditor のたびに作り直される。
let liveValues = [];

function tickLiveValues() {
  for (const { rowIndex, param, node, slider } of liveValues) {
    const v = engine.rows?.[rowIndex]?.applied?.[param];
    if (v === undefined) continue;
    const base = Number(slider.value);
    node.textContent = fmt(v);
    // 変調でベース値からずれている間はオレンジで示す
    node.style.color = Math.abs(v - base) > 1e-6 ? 'var(--orange)' : '';
  }
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

/** trigger は必ず SAMPLE の row を指すようにする */
function fixTrigger(preset) {
  const i = preset.list.findIndex((e) => String(e.effect).toUpperCase() === 'SAMPLE');
  if (i < 0) delete preset.trigger;
  else preset.trigger = { row: i };
}

function renderModulation(preset) {
  const box = el('div', 'stack');
  box.append(el('div', 'chip is-light', 'modulation'));

  for (const kind of ['handle', 'shake', 'lfo']) {
    const on = !!preset[kind];
    const card = el('div', 'row');
    const head = el('div', 'row__head');
    head.append(el('span', 'row__name', kind));
    const toggle = el('button', 'is-small' + (on ? ' is-on' : ''), on ? 'ON' : 'OFF');
    toggle.onclick = () => {
      if (on) delete preset[kind];
      else {
        const row = preset.list.findIndex((e) => EFFECTS[String(e.effect).toUpperCase()]
          && String(e.effect).toUpperCase() !== 'SAMPLE');
        const r = row < 0 ? 0 : row;
        const param = Object.keys(EFFECTS[String(preset.list[r].effect).toUpperCase()].params)[0];
        preset[kind] = kind === 'lfo'
          ? { row: r, param, depth: 0.5, shape: 'sine', speed: 2 }
          : { row: r, param, depth: 0.5 };
      }
      syncAudio(); render();
    };
    head.append(el('span', '', ''), toggle);
    head.children[1].style.flex = '1';
    card.append(head);

    if (on) {
      const m = preset[kind];
      const b = el('div', 'row__body');

      const rowSel = el('select');
      preset.list.forEach((e, i) => {
        const n = String(e.effect).toUpperCase();
        if (!EFFECTS[n]) return;
        rowSel.append(new Option(`row ${i} — ${n}`, String(i)));
      });
      rowSel.value = String(m.row ?? 0);
      rowSel.onchange = () => {
        m.row = Number(rowSel.value);
        const n = String(preset.list[m.row].effect).toUpperCase();
        if (!EFFECTS[n].params[m.param]) m.param = Object.keys(EFFECTS[n].params)[0];
        syncAudio(); render();
      };
      b.append(labelled('target', rowSel));

      const eName = String(preset.list[m.row]?.effect ?? '').toUpperCase();
      const paramSel = el('select');
      for (const k of Object.keys(EFFECTS[eName]?.params ?? {})) paramSel.append(new Option(k, k));
      paramSel.value = m.param;
      paramSel.onchange = () => { m.param = paramSel.value; syncAudio(); render(); };
      b.append(labelled('param', paramSel));

      const depth = el('input'); depth.type = 'number';
      const r = paramRange(eName, m.param);
      depth.step = r && r[1] - r[0] > 100 ? 10 : 0.05;
      depth.value = m.depth ?? 0;
      depth.oninput = () => { m.depth = Number(depth.value); syncAudio(); renderOutput(); };
      b.append(labelled('depth', depth));

      if (kind === 'lfo') {
        const shape = el('select');
        for (const s of LFO_SHAPES) shape.append(new Option(s, s));
        shape.value = m.shape ?? 'sine';
        shape.onchange = () => { m.shape = shape.value; renderOutput(); };
        b.append(labelled('shape', shape));

        const speed = el('input'); speed.type = 'number'; speed.step = 0.1; speed.min = 0;
        speed.value = m.speed ?? 2;
        speed.oninput = () => { m.speed = Number(speed.value); renderOutput(); };
        b.append(labelled('speed', speed));
      }

      const help = el('p', 'hint');
      help.textContent = kind === 'handle'
        ? 'ハンドルの押し込み 0〜100% を depth 倍して加算します。負の値で逆向き。'
        : kind === 'shake'
          ? '本体を振ったとき（shake ボタン）に一時的に加算されます。'
          : 'LFO は -1〜+1 で往復し、depth 倍して加算します。';
      b.append(help);
      card.append(b);
    }
    box.append(card);
  }
  return box;
}

// ─────────────────────── 検証・出力・ディスク ───────────────────────

let diskFiles = new Map();

function renderOutput() {
  const text = configText();
  $('jsonOut').textContent = text;

  const files = new Map(diskFiles);
  files.set('config.json', { size: new Blob([text]).size });
  const rep = validate(text, { files });

  const diag = $('diag');
  diag.replaceChildren();
  const push = (items, cls) => items.forEach((d) => {
    const n = el('div', `diag__item is-${cls}`);
    if (d.where) n.append(el('span', 'diag__where', d.where));
    n.append(el('span', '', d.msg));
    diag.appendChild(n);
  });
  push(rep.errors, 'error'); push(rep.warnings, 'warn'); push(rep.notes, 'note');
  if (!rep.errors.length && !rep.warnings.length) {
    diag.appendChild(el('div', 'diag__item is-note', '問題なし。書き出せます。'));
  }
  $('validSummary').textContent = rep.errors.length
    ? `✗ エラー ${rep.errors.length}` : `✓ OK / 警告 ${rep.warnings.length}`;

  let total = 0;
  for (const f of files.values()) total += f.size;
  const pct = Math.min(100, (total / DISK_BUDGET) * 100);
  $('budgetFill').style.width = `${pct}%`;
  $('budgetFill').classList.toggle('is-over', total > DISK_BUDGET);
  $('budgetLabel').textContent = `${total.toLocaleString()} / 1,000,000 bytes`;

  $('btnWrite').disabled = !disk.connected || !rep.ok;
  return rep;
}

function renderDiskFiles() {
  const box = $('diskFiles');
  box.replaceChildren();
  if (!disk.connected) {
    box.appendChild(el('div', 'diag__item is-note', 'ディスク未接続'));
    return;
  }
  if (!diskFiles.size) {
    box.appendChild(el('div', 'diag__item is-note', '（空 — 工場出荷の音で動作）'));
    return;
  }
  for (const [name, f] of diskFiles) {
    const n = el('div', 'diag__item is-note');
    n.append(el('span', '', name), el('span', 'diag__where', `${f.size.toLocaleString()} B`));
    n.children[0].style.flex = '1';
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
    await reloadDisk();
  } catch (e) {
    if (e.name !== 'AbortError') alert(`ディスクを開けなかった: ${e.message}`);
  }
}

async function reloadDisk() {
  diskFiles = await disk.list();
  diskFiles.delete('config.json');   // 書き出す config.json は別勘定
  renderDiskFiles();

  const text = await disk.readConfig();
  if (text) {
    const ok = confirm('ディスクの config.json を読み込んでエディタに反映しますか？\n（今の編集内容は失われます）');
    if (ok) loadConfig(text);
  }
  renderOutput();
}

function loadConfig(text) {
  let cfg;
  try { cfg = JSON.parse(text); } catch (e) { alert(`config.json を解釈できなかった: ${e.message}`); return; }
  state.name = cfg.name ?? 'MY PACK';
  state.slots = [null, null, null, null];
  (cfg.presets ?? []).forEach((p, i) => {
    const { pos = i, ...rest } = p;
    if (pos >= 0 && pos < MAX_SLOTS) state.slots[pos] = rest;
  });
  syncAudio(); render();
}

async function writeDisk() {
  const rep = renderOutput();
  if (!rep.ok) { alert('検証エラーがあるので書き出しません。'); return; }

  const existing = await disk.readConfig();
  const msg = existing
    ? 'ディスクの config.json を上書きします。\n先に現在の内容をバックアップとして保存しますか？\n\nOK = 保存してから上書き / キャンセル = そのまま上書き'
    : 'ディスクに config.json を書き出します。';
  if (existing) {
    if (confirm(msg)) {
      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      download(`config.backup-${stamp}.json`, existing);
    }
  } else if (!confirm(msg)) return;

  try {
    await disk.writeFile('config.json', configText());
    await reloadDisk();
    alert('書き出しました。\n\nFinder / エクスプローラでディスクを取り出す（eject）と、fx-mic が再起動して読み込みます。\n起動しなくなった場合は白 + グレーボタンを押しながら起動してください。');
  } catch (e) {
    alert(`書き出しに失敗した: ${e.message}`);
  }
}

// ─────────────────────────── オーディオ ───────────────────────────

function syncAudio() {
  if (!engine.ready) return;
  const p = state.activeSlot < 0 ? null : state.slots[state.activeSlot];
  // クリーン、または工場出荷のままのスロットは素通し（内蔵プリセットは再現できない）
  engine.setPreset(p ?? { list: [{ effect: 'SAMPLE' }], trigger: { row: 0 } });
}

async function toggleMic() {
  try {
    if (engine.micActive) {
      engine.stopMic();
      $('btnMic').textContent = '▶ マイク ON';
      $('btnMic').classList.add('is-primary');
      $('micChip').textContent = 'MIC: OFF';
      $('micChip').className = 'chip is-grey';
      return;
    }
    await engine.enableMic();
    syncAudio();
    setHandle(Number($('handleSlider').value) / 100);
    $('btnMic').textContent = '■ マイク OFF';
    $('btnMic').classList.remove('is-primary');
    $('micChip').textContent = 'MIC: ON';
    $('micChip').className = 'chip is-orange';
  } catch (e) {
    alert(`マイクを使えなかった: ${e.message}\n（https か localhost で開いているか確認してください）`);
  }
}

async function loadSampleFile(file) {
  const buf = await file.arrayBuffer();
  const info = readWavFormat(buf.slice(0));
  await engine.init();
  try {
    const audio = await engine.ctx.decodeAudioData(buf.slice(0));
    engine.setSampleBuffer(audio);
    state.sampleMeta = { name: file.name, size: file.size, info };
    $('sampleName').textContent = file.name;
    const parts = [`${file.size.toLocaleString()} B`];
    if (!info.error) {
      parts.push(`${info.bits}-bit${info.isFloat ? 'f' : ''}`, `${info.rate} Hz`,
        info.channels === 1 ? 'mono' : 'stereo', `${info.duration?.toFixed(2)}s`);
      if (!info.supported) parts.push('⚠️ fx-mic 非対応フォーマット');
      if (!info.rateOk) parts.push('⚠️ 96 kHz 超');
      if (!info.channelsOk) parts.push('⚠️ チャンネル数が非対応');
    }
    $('sampleInfo').textContent = parts.join(' · ');
  } catch (e) {
    $('sampleInfo').textContent = `デコードできなかった: ${e.message}`;
  }
}

// ─────────────────────────── 波形表示 ───────────────────────────

function initScope() {
  const cv = $('scope');
  const ctx = cv.getContext('2d');
  const data = new Uint8Array(2048);
  const draw = () => {
    ctx.fillStyle = '#000005';
    ctx.fillRect(0, 0, cv.width, cv.height);
    if (engine.getWaveform(data)) {
      ctx.strokeStyle = '#e05526';
      ctx.lineWidth = 2;
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
  // 左カラムは幅が狭いので、ふきだしは右側にだけ出す
  // （ハンドルは下のスライダーにラベルがあるので対象にしない）
  const marks = [
    ['#btnFx', 'FX MODE', 'to-left'],
    ['#btnSampleSel', 'SAMPLE SEL.', 'to-left'],
    ['#btnTrig', 'SAMPLE TRIG', 'to-left'],
  ];
  $('btnHelp').onclick = () => {
    on = !on;
    $('btnHelp').classList.toggle('is-on', on);
    document.querySelectorAll('.callout').forEach((n) => n.remove());
    if (!on) return;
    const host = $('device').parentElement;
    host.style.position = 'relative';
    for (const [sel, text, dir] of marks) {
      const t = document.querySelector(sel).getBoundingClientRect();
      const h = host.getBoundingClientRect();
      const c = el('div', `callout ${dir}`, text);
      c.style.top = `${t.top - h.top + t.height / 2 - 10}px`;
      if (dir === 'to-left') c.style.left = `${t.right - h.left + 16}px`;
      else c.style.right = `${h.right - t.left + 16}px`;
      host.appendChild(c);
    }
  };
}

// ─────────────────────────── 起動 ───────────────────────────

function render() {
  renderSlots();
  renderEditor();
  renderOutput();
  paintDevice();
}

function init() {
  initDevice();
  initScope();
  initHelp();
  tickLiveValues();

  $('handleSlider').oninput = () => setHandle(Number($('handleSlider').value) / 100);
  $('btnMic').onclick = toggleMic;
  $('btnShake').onclick = () => { engine.triggerShake(); };
  $('btnPlay').onclick = () => engine.playSample();
  $('btnConnect').onclick = connectDisk;
  $('btnReload').onclick = reloadDisk;
  $('btnWrite').onclick = writeDisk;
  $('btnDownload').onclick = () => download('config.json', configText());
  $('btnCopy').onclick = () => navigator.clipboard.writeText(configText());
  $('btnLoadSample').onclick = () => $('fileSample').click();
  $('fileSample').onchange = (e) => { if (e.target.files[0]) loadSampleFile(e.target.files[0]); };
  $('btnClearSample').onclick = () => {
    engine.setSampleBuffer(null);
    $('sampleName').textContent = '工場出荷';
    $('sampleInfo').textContent = `未読み込み。実機では工場出荷サンプル（${FACTORY_SAMPLES.join(' / ')}）が鳴ります。`;
  };

  if (!diskSupported()) {
    $('btnConnect').disabled = true;
    $('diskHint').innerHTML = 'このブラウザはディスクへの直接書き込みに対応していません（<b>Chrome / Edge</b> が必要）。'
      + '「.json を保存」でダウンロードして、手動でディスクにコピーしてください。';
  } else {
    $('diskHint').innerHTML = '下蓋を外して USB-C 接続 → <b>ハンドルを押して電源 ON</b> → 出てきたディスクを選んでください。'
      + 'ボリューム名は <code>NO NAME</code> のことがあります。';
  }

  // 初期状態: TE 公式 broken radio 由来の 2 プリセット（packs/radio-fx と同じ）
  state.slots[1] = {
    name: 'AM TUNER',
    comment: 'ssb frequency shift. handle searches for station.',
    list: [
      { effect: 'SSB', frequency: -500 },
      { effect: 'DIST', amount: 5, mix: 0.2 },
      { effect: 'SAMPLE' },
    ],
    handle: { row: 0, param: 'frequency', depth: 1000 },
    shake: { row: 0, param: 'frequency', depth: 200 },
    trigger: { row: 2 },
  };
  state.slots[2] = {
    name: 'WALKIE TALKIE',
    comment: 'bandpass filter + dist. handle tunes frequency.',
    list: [
      { effect: 'HIGHPASS', cutoff: 0.1 },
      { effect: 'LOWPASS', cutoff: 0.4 },
      { effect: 'DIST', amount: 15, mix: 0.5 },
      { effect: 'SAMPLE' },
    ],
    handle: { row: 1, param: 'cutoff', depth: 0.5 },
    shake: { row: 2, param: 'mix', depth: 0.5 },
    trigger: { row: 3 },
  };
  state.name = 'RADIO FX';
  state.selected = 1;
  state.activeSlot = 1;

  render();

  // 動作確認用（コンソールから engine / state を触れるようにする）
  window.__fxmic = { engine, state, buildConfig, validate };
}

init();
