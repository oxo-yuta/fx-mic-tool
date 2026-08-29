# fx-mic editor（Web ツール）

EP–2350 fx-mic の `config.json` を GUI で設計し、**マイクを通してリアルタイムに音を確認しながら**
値を詰めて、そのままディスクに書き出すためのツール。

`tools/validate.py` と同じ検証ルール、`docs/config-json.md` と同じ仕様表を JS に移植して共有している。

## 動かす

**ビルド不要の静的ファイルだけ**で構成されている。npm もバンドラも使わない。

```bash
python3 -m http.server 8765 --directory web
# → http://127.0.0.1:8765/
```

> `file://` で直接開くと動かない（ES modules と AudioWorklet と File System Access API がいずれも
> secure context を要求するため）。**localhost か https で開くこと。**

## ホスティング

パスはすべて相対なので、**`web/` の中身をディレクトリごと置くだけ**でサブパス配下でも動く。

| 置き先 | 手順 |
| --- | --- |
| GitHub Pages | `web/` を Pages の公開ディレクトリに置く（`/<repo>/` 配下でもそのまま動く） |
| 既存 LP のサブディレクトリ | `web/` を `/fx-mic/` などにコピーするだけ |

依存している外部リソースは Google Fonts（Space Grotesk / Space Mono）のみ。
オフラインで使いたい場合は `index.html` の `<link>` を外せばフォールバックのシステムフォントで動く。

## できること

- **4 つの FX スロットを編集**。エフェクトの追加・並べ替え・削除、パラメータをスライダーで調整
- **スロット単位で「工場出荷のまま」を選べる**。`presets` に書かないスロットは実機の内蔵プリセット
  （ECHO / SPRING / PIXIE / ROBOT）が残る（実機で確認済み。`docs/config-json.md`）
- **handle / shake / lfo の変調**を設定し、**実効値がリアルタイムに表示される**
  （つまみはベース値のまま、右の数字が変調込みの値を示す）
- **マイクを通したプレビュー**。ハンドルを動かすと音が変わる
- **検証**（`tools/validate.py` と同じルール）と **1 MB 予算の表示**
- **ディスクに直接書き出す**（Chrome / Edge）。非対応ブラウザでは `.json` をダウンロード
- 既存の `config.json` を読み込んで編集、上書き前にバックアップをダウンロード

## ⚠️ プレビューは近似であって実機のエミュレータではない

**最終確認は必ず実機で行うこと。** 目的は「転送する前に当たりを付けて往復回数を減らす」こと。
分かっている相違は以下のとおり。

| 項目 | 状況 |
| --- | --- |
| **内蔵プリセット（ECHO / SPRING / PIXIE / ROBOT）** | **再現できない。** 中身が公開されていないため、工場出荷のままのスロットは素通しになる |
| `HARMONY` | ディレイライン式ピッチシフタで近似。実機のアルゴリズムは不明。倍音の多い音では粗さが出る |
| `SSB` | ヒルベルト変換（201 タップ FIR）による周波数シフト。原理は同じだが実機の帯域特性とは異なる |
| `REVERB` | 手続き的に生成したインパルス応答による畳み込み。`spring-mix` は「時間とともに下がるチャープ」で粗く模したもので、実機のバネの質感とは別物 |
| `DIST` | ソフトクリップのカーブ。実機の歪みの性格とは異なる |
| `BUS` | **未実装**（実機側の挙動自体が未検証のため）。指定しても直列として扱う |
| `DELAY` の `balance` | 未実装 |
| 変調の更新レート | 約 60 Hz（requestAnimationFrame）。`speed` が 10 前後の速い LFO では実機よりカクつく |
| サンプル | プレビュー用にローカルの wav を 1 本読み込めるだけ。**4 スロットのサンプル管理と wav の書き出しは未対応**（`tools/prep-sample.sh` と `tools/deploy.sh` を使う） |
| 音量 | 実機の出力段（2 VRMS）とは無関係。`DELAY` の `echo` は破綻を避けるため 0.95 で頭打ちにしている |

## 構成

```
web/
├── index.html    画面の骨格と fx-mic の SVG
├── styles.css    デザインシステム
├── app.js        状態と UI
├── spec.js       エフェクト定義（tools/validate.py の表と同じ内容）
├── validate.js   検証（tools/validate.py の移植）
├── audio.js      Web Audio によるチェーン構築と変調
├── disk.js       File System Access API
├── worklets/
│   ├── freq-shift.js   SSB（ヒルベルト変換）
│   └── pitch-shift.js  HARMONY（ディレイライン式）
└── test/         Node で走る検証テスト
```

## テスト

ブラウザなしで DSP と検証ロジックを確認できる。

```bash
node web/test/validate.test.mjs   # tools/validate.py と同じ結果になるか
node web/test/worklets.test.mjs   # SSB / HARMONY が意図どおり周波数を動かすか
```

## デザインについて

teenage engineering の [ep sample tool](https://teenage.engineering/apps/ep-sample-tool) の意匠を参考にしている
（方眼紙の背景、機材のフラットイラストを操作面にする、オレンジのタイトルバー、角丸なしの硬いエッジ、
小さな大文字のチップラベル、パネル四隅のネジ）。

fx-mic の図は公式ガイドの技術イラストを見て**描き起こしたもの**で、TE の SVG は使っていない。
書体も TE の TechnoType34 / UniversTE20T は独自書体のため、Google Fonts の Space Grotesk /
Space Mono で代替している。
