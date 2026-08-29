# config.json 完全リファレンス

出典: [公式ユーザーガイド 1.1.1 第7章](https://teenage.engineering/guides/ep-2350) / `factory/readme.pdf` / TE 公式プリセットパック実物（`vendor/te-packs/`）

`config.json` を `fx-mic disk` のルートに置くと、サンプルとエフェクトプリセットを完全に置き換えられる。

## 0. 鉄則（golden rules）

1. **JSON が壊れると本体が起動しない。** 転送前に `tools/validate.py` を通す。壊したら白+グレー押しながら起動して復旧。
2. 文字列は必ずダブルクォート。
3. カンマは各要素の末尾に必要、**最後の要素にはつけない**（エラー原因の第1位）。
4. **エフェクト名は必ず大文字。**
5. パラメータを省略した場合はデフォルト値が使われる。

## 1. ファイル構造

```json
{
  "name": "MY PACK NAME",
  "samples": [ ... ],
  "presets": [ ... ]
}
```

| キー | 必須 | 説明 |
| --- | --- | --- |
| `name` | 任意 | パック名 |
| `samples` | 任意 | サンプル定義（最大 4）。**省略すると工場出荷サンプルが使われる** |
| `presets` | 任意 | エフェクトプリセット定義（最大 4）。省略すると工場出荷プリセット |

> `samples` だけのファイル（= サンプルパック）、`presets` だけのファイル（= FX パック）のどちらも有効。TE 公式パックが実際にそうなっている。

### 部分差し替えができる（実機検証済み・2026-08-29）

**`presets` に一部のスロットだけを書くと、書かなかったスロットは工場出荷プリセットのまま残る。**

公式ドキュメントに記載がなかったため実機で検証した（`packs/radio-fx`）。`pos: 1` と `pos: 2` の
2 つだけを定義した config.json を読み込ませたところ、`pos: 0` は ECHO、`pos: 3` は ROBOT が
そのまま鳴った。

つまり **「内蔵プリセットを残したまま、特定のスロットだけ自分のものに置き換える」ことができる**。
4 スロット全部を埋める必要はない。

> `samples` について同じことが成り立つか（一部スロットだけ差し替えて残りは工場出荷サンプル）は**未検証**。

## 2. samples

```json
"samples": [
  { "file": "A.wav", "playmode": "oneshot" },
  { "pos": 3, "file": "D.wav", "playmode": "oneshot" }
]
```

| キー | 説明 |
| --- | --- |
| `file` | ディスク上の wav ファイル名。`config.json` で明示すれば `1.wav`〜`4.wav` 以外の名前も使える |
| `playmode` | `"oneshot"`（全体を1回再生） / `"hold"`（ボタンを押している間だけ） / `"startstop"`（押すとループ開始、もう一度押すと停止） |
| `pos` | 任意。スロット番号 0〜3。省略時は配列の並び順に詰められる |
| `duck` | 任意（`factory/readme.pdf` の例のみに登場、公式ガイド未記載・**未検証**）。値 `1.0` = サンプル再生中にマイク入力を下げる、と推測される |

### wav の要件

| 項目 | 制約 |
| --- | --- |
| フォーマット | **wav のみ** |
| チャンネル | モノ or ステレオ |
| ビット深度 | 8 / 16 / 24-bit または 32-bit float |
| サンプルレート | 最大 96 kHz |
| 合計サイズ | **約 1 MB**（4 ファイル合計 + config.json） |

`config.json` を使わない場合は、ファイル名を `1.wav` / `2.wav` / `3.wav` / `4.wav` にしてルートに置くだけでよい。

> `factory/readme.pdf` の例には `"file": "samples/whistle1.wav"` や `"live1/loop.wav"` のような**サブフォルダ付きパス**が出てくる。公式ガイドには記載がなく **未検証**。まずはルート直下で運用すること。

### 工場出荷サンプルを使いたいとき

1. `"samples": [ ... ]` ブロックを**丸ごと削除**する
2. ただしプリセットの `list` には `{ "effect": "SAMPLE" }` を**必ず残す**（無いとサンプル音が出ない）

## 3. presets

オレンジボタンで選ぶ 4 スロットを定義する。

```json
{
  "pos": 0,
  "name": "WALKIE TALKIE",
  "comment": "bandpass filter + dist. handle tunes frequency.",
  "list": [ ...エフェクトチェーン... ],
  "handle":  { "row": 1, "param": "cutoff", "depth": 0.5 },
  "shake":   { "row": 2, "param": "mix",    "depth": 0.5 },
  "lfo":     { "row": 0, "param": "frequency", "depth": 50.0, "shape": "random", "speed": 8.0 },
  "trigger": { "row": 3 }
}
```

| キー | 説明 |
| --- | --- |
| `pos` | 任意。プリセットスロット番号 0〜3（**オレンジボタンの押す回数とは 1 ずれる**。下表参照） |
| `name` | 任意。人間が読む名前（推奨） |
| `comment` | 任意。動作メモ（推奨） |
| `list` | エフェクトチェーン。**配列の順に直列処理される** |
| `handle` / `shake` / `lfo` | 変調定義（後述）。`list` の後に置く |
| `trigger` | サンプル再生に使う行。`{ "row": N }` で `list` の `SAMPLE` エフェクトの行番号を指す |

### `pos` とオレンジボタンの対応（1 つずれるので注意）

オレンジボタンは「エフェクトなし（クリーン）と 4 つの FX スロット」を選ぶ。
**1 番目がクリーンなので、`pos: N` は N+2 番目のポジション**になる。

| オレンジボタン | `pos` | 工場出荷時の中身 |
| --- | --- | --- |
| 1 番目 | — | クリーン（エフェクトなし） |
| 2 番目 | `0` | ECHO |
| 3 番目 | `1` | SPRING |
| 4 番目 | `2` | PIXIE |
| 5 番目 | `3` | ROBOT |

数え方が 2 通りあるので取り違えやすい:

- **FX スロットの序数**で数えると「3 つめの FX」= `pos: 2`（ボタンでは 4 番目のポジション）
- **ボタンを押す回数**で数えると「3 番目」= `pos: 1`（クリーンを 1 番目に含めるため）

会話で「N つめ」と言われたら、**どちらの数え方かを必ず確認する**こと。

### signal flow（重要）

`list` の並び順がそのまま信号の流れ。`SAMPLE` ブロックの**位置で、サンプルにエフェクトがかかるかが決まる**。

- **サンプルにも FX をかけたい** → `SAMPLE` をエフェクトより**前**に置く
- **サンプルはドライで出したい** → `SAMPLE` を `list` の**最後**に置く（TE 公式パックは全てこれ）

### row の数え方

`row` は `list` 内のインデックスで **0 始まり**。

```
"list": [
  { "effect": "HIGHPASS", ... },   ← row 0
  { "effect": "LOWPASS",  ... },   ← row 1
  { "effect": "DIST",     ... },   ← row 2
  { "effect": "SAMPLE" }           ← row 3  → "trigger": { "row": 3 }
]
```

### BUS ルーティング

デフォルトは直列。`"BUS": 1` / `"BUS": 2` をエフェクト行に追加すると並列パスになる（例: ドライを保ったままコピーを歪ませる）。

```json
{ "effect": "DELAY", "time": 0.5, "dry-level": 0.0, "echo": 0.5, "BUS": 1 }
```

> 公式ガイドの BUS の説明はこれ以上詳しくない。バス数・合流方法は**要実機検証**。

## 4. エフェクト一覧とパラメータ範囲

`*` = **1 チェーンにつき 1 回だけ使用すること**

| エフェクト | パラメータ | min | max |
| --- | --- | --- | --- |
| `BALANCE` | `balance` | 0.0 | 1.0 |
| `DELAY` * | `time`（ディレイタイム） | 0.0 | 1.1 |
| | `lowpass-cutoff` | 0.0 | 1.0 |
| | `highpass-cutoff` | 0.0 | 1.0 |
| | `wet-level` | 0.0 | 1.0 |
| | `dry-level` | 0.0 | 1.0 |
| | `echo`（フィードバック） | 0.0 | 1.0 |
| | `cross-feed`（L/R のエコーを混ぜる） | 0.0 | 1.0 |
| | `balance` | 0.0 | 1.0 |
| `DIST` | `amount` | 0.0 | 40.0 |
| | `lowpass-cutoff` | 0.0 | 1.0 |
| | `highpass-cutoff` | 0.0 | 1.0 |
| | `mix` | 0.0 | 1.0 |
| `EQUALISER` | `cutoff` | 0.0 | 1.0 |
| | `Q` | 0.0 | 1.0 |
| | `gain` | -1.0 | 1.0 |
| `HARMONY` * | `dry-level` | 0.0 | 1.0 |
| | `pitch`（1.0 = 原音、0.5 = 1oct下、2.0 = 1oct上） | 0.5 | 2.0 |
| `LOWPASS` | `cutoff` | 0.0 | 1.0 |
| | `Q` †  | 0.0 | 1.0 |
| `HIGHPASS` | `cutoff` | 0.0 | 1.0 |
| | `Q` † | 0.0 | 1.0 |
| `SAMPLE` | `speed` | 0.0 | 4.0 |
| | `pitch`（半音） | -24.0 | 24.0 |
| | `level` | 0.0 | 1.0 |
| | `balance` | 0.0 | 1.0 |
| `REVERB` * | `dry-level` | 0.0 | 1.0 |
| | `wet-level` | 0.0 | 1.0 |
| | `time` | 0.0 | 1.0 |
| | `spring-mix`（金属的な「ボイン」を足す） | 0.0 | 1.0 |
| | `highpass-cutoff` | 0.0 | 1.0 |
| `RING` | `frequency` (Hz) | 0.0 | 20000.0 |
| | `mix` | 0.0 | 1.0 |
| `SSB` * | `frequency` (Hz、周波数シフト) | -20000.0 | 20000.0 |

† `LOWPASS` / `HIGHPASS` の `Q` は `factory/readme.pdf` にのみ記載（公式ガイド 1.1.1 の表では省略されている）。**未検証**。

> **⚠️ 表記ゆれの注意**
> - イコライザ: 公式ガイド 1.1.1 は `EQUALISER`（英国綴り）、同梱 readme.pdf は `EQUALIZER`（米国綴り）。**どちらが実機で通るか未検証**。`tools/validate.py` は両方受け付けつつ警告を出す。実機で確認したら本ドキュメントを更新すること。
> - リバーブ: パラメータ表は `spring-mix`、readme.pdf の JSON 例だけ `spring` になっている。TE 公式パック（`vendor/te-packs/ep-2350_preset_pack-dub`）は **`spring-mix` を使用**しているので `spring-mix` が正しい。

## 5. 変調（modulation）

`handle` / `shake` / `lfo` は `list` の**後**に置く。ターゲットは `row` + `param` で指定する。

| キー | 説明 |
| --- | --- |
| `row` | 対象エフェクトの `list` 内インデックス（0 始まり） |
| `param` | 対象パラメータ名（`"time"`, `"cutoff"` など） |
| `depth` | 変化量。**正 = ハンドルを押すと増える / 負 = 押すと減る（インバース）** |

### handle

ハンドルの押し込み位置（0%〜100%）でパラメータを変える。

```json
"handle": { "row": 0, "param": "cutoff", "depth": 0.8 }
```

### shake

本体を振ったときに一時的に変化させる。グリッチやリバーブスプラッシュ向き。

```json
"shake": { "row": 1, "param": "mix", "depth": 1.0 }
```

### lfo

パラメータを自動で周期変化させる。

```json
"lfo": {
  "row": 0,
  "param": "pitch",
  "depth": 0.1,
  "shape": "sine",
  "speed": 4.0,
  "phase": 0
}
```

| キー | 説明 |
| --- | --- |
| `shape` | `"sine"`（滑らか） / `"square"`（オンオフ） / `"sawtooth"`（ランプ） / `"random"`（カオス） |
| `speed` | 周期の速さ |
| `phase` | 位相（任意） |
| `mpy` | `factory/readme.pdf` の例のみに登場。乗数と推測されるが**未検証** |

### 応用: ハンドルで LFO 自体を操る

`"row"` の代わりに `"target": "lfo"` を使うと、エフェクトではなく LFO のパラメータを変調できる。

```json
"lfo":    { "row": 0, "param": "balance", "shape": "square", "speed": 2.0 },
"handle": { "target": "lfo", "param": "speed", "depth": 15.0 }
```

→ 音が左右にチョップされ、ハンドルを押すとチョップが速くなる。

## 6. 実例（TE 公式 "BROKEN RADIO PACK" より）

```json
{
  "pos": 0,
  "name": "WALKIE TALKIE",
  "comment": "bandpass filter + dist. handle tunes frequency.",
  "list": [
    { "effect": "HIGHPASS", "cutoff": 0.1 },
    { "effect": "LOWPASS",  "cutoff": 0.4 },
    { "effect": "DIST", "amount": 15.0, "mix": 0.5 },
    { "effect": "SAMPLE" }
  ],
  "handle":  { "row": 1, "param": "cutoff", "depth": 0.5 },
  "shake":   { "row": 2, "param": "mix",    "depth": 0.5 },
  "trigger": { "row": 3 }
}
```

- HIGHPASS(row0) → LOWPASS(row1) → DIST(row2) → SAMPLE(row3) の直列
- ハイパス+ローパスで無線機のようなバンドパスを作り、DIST で歪ませる
- ハンドルでローパスの cutoff を開く = 「チューニングつまみ」
- シェイクで歪みの mix が増える = ノイズが乗る

さらに 3 パック分の実例分析は `docs/reference-packs.md` を参照。
