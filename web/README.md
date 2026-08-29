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
| GitHub Pages（公開中） | `tools/deploy-pages.sh`。`web/` の中身をルートに持つ `gh-pages` ブランチを作って push する<br>→ **https://oxo-yuta.github.io/fx-mic-tool/** |
| 既存 LP のサブディレクトリ | `web/` を `/fx-mic/` などにコピーするだけ |

> Pages のブランチ公開はルートか `/docs` しか選べないため、`web/` を直接指定することはできない。
> そのため専用の `gh-pages` ブランチを用意している。

依存している外部リソースは Google Fonts（Space Grotesk / Space Mono）のみ。
オフラインで使いたい場合は `index.html` の `<link>` を外せばフォールバックのシステムフォントで動く。

## できること

上部のタブで **エフェクト編集モード** と **サンプル編集モード** を切り替える。

### エフェクトモード

- **4 つの FX スロットを編集**。エフェクトの追加・並べ替え・削除、パラメータをスライダーで調整
- **スロット単位で「工場出荷のまま」を選べる**。`presets` に書かないスロットは実機の内蔵プリセット
  （ECHO / SPRING / PIXIE / ROBOT）が残る（実機で確認済み。`docs/config-json.md`）
  - オレンジボタンには clean（ランプ全消灯）の位置もあるが、編集できないので一覧には出していない
- **handle / shake / lfo の変調**を設定し、**実効値がリアルタイムに表示される**
  （つまみはベース値のまま、右の数字が変調込みの値を示す）
- **エフェクト名・パラメータ名にホバーすると説明が出る**
- 公式ガイドに記載がなく実機で未確認のパラメータ（`LOWPASS` / `HIGHPASS` の `Q`）は
  **既定では入れず、「未検証」と明示して任意追加**にしてある。config.json の不備は本体を
  起動不能にするため、裏付けのないキーを既定で書き込まない方針（`docs/config-json.md`）

### サンプルモード

- 4 スロットそれぞれに wav を割り当て、`playmode` を選ぶ
- 未割り当てのスロットは工場出荷サンプル（horn / applause / ringside bell / censor beep）のまま
- wav のフォーマットを検証し、1 MB 予算に対する消費を表示
- 書き出し時に wav も `config.json` と一緒にディスクへ書く

> サンプルの**部分差し替え**（一部スロットだけ指定）が実機で成立するかは**未検証**。
> プリセットでは成立することを確認済みだが、サンプルも同じとは限らないため UI 上で警告を出している。

### 共通

- **マイクを通したプレビュー**。ハンドルを動かすと音が変わり、シェイク中は本体の図が揺れる
- **スターターテンプレート**（RADIO / VOICE / SPACE / EMPTY）。テンプレートを開くと
  4 つのプリセットが個別に並び、**1 つずつ選んで今のスロットに入れられる**
  （まとめて 4 つ入れたい場合は「4 つ全部」）。読み込んだ TE 公式パックも同じ扱いになる
- **検証**（`tools/validate.py` と同じルール）。エラーが出たときだけ画面に現れる
- **1 MB 予算の表示**
- **ディスクに直接書き出す**（Chrome / Edge）。非対応ブラウザでは `.json` をダウンロード
- 既存の `config.json` を読み込んで編集、上書き前にバックアップをダウンロード
- **多言語対応**（英語 / 日本語 / 中文 / 한국어 / Español / Français / Deutsch）。
  初期値はブラウザの言語、一致しなければ英語

## テンプレートと TE 公式パック

`web/templates.js` に入っている RADIO / VOICE / SPACE は**このリポジトリで書き起こしたオリジナル**で、
TE 公式パックの値をそのまま持ってきたものではない（設計の下敷きにした手筋は `docs/reference-packs.md`）。

**TE 公式パック（broken radio / mysterious / dub）は同梱していない。** teenage engineering の著作物で
再配布が禁止されているため。CORS ヘッダが無いのでブラウザから直接取得することもできない。
代わりに、TE の配布ページを開くリンクと、**ダウンロードした `.zip` または `config.json` をそのまま
読み込むボタン**を用意してある（zip はブラウザ内で展開する）。

## 免責

このツールは **teenage engineering の非公式ツール**で、同社とは無関係、同社の製品でも
承認を受けたものでもない。画面のフッターにも明記してある。

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
| ホバー説明の言語 | `web/descriptions.js` は**英語と日本語のみ**。他の言語では英語が表示される（UI ラベル自体は 7 言語すべて用意してある） |

## 構成

```
web/
├── index.html    画面の骨格と fx-mic の SVG
├── styles.css    デザインシステム
├── app.js        状態と UI
├── i18n.js       UI ラベルの翻訳（7 言語）
├── descriptions.js  エフェクト／パラメータのホバー説明（en / ja）
├── templates.js  スターターテンプレート（オリジナル）
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
node web/test/validate.test.mjs   # tools/validate.py と同じ結果になるか / テンプレートと説明の網羅
node web/test/worklets.test.mjs   # SSB / HARMONY が意図どおり周波数を動かすか
node web/test/i18n.test.mjs       # 全言語でキーとプレースホルダが揃っているか
```

## デザインについて

teenage engineering の [ep sample tool](https://teenage.engineering/apps/ep-sample-tool) の意匠を参考にしている
（方眼紙の背景、機材のフラットイラストを操作面にする、オレンジのタイトルバー、角丸なしの硬いエッジ、
小さな大文字のチップラベル、パネル四隅のネジ）。

fx-mic の図は公式ガイドの技術イラストを見て**描き起こしたもの**で、TE の SVG は使っていない。
書体も TE の TechnoType34 / UniversTE20T は独自書体のため、Google Fonts の Space Grotesk /
Space Mono で代替している。
