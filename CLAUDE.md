# CLAUDE.md — fx-mic custom

teenage engineering **EP–2350 fx-mic** のカスタマイズ用リポジトリ。
`config.json` とサンプル wav を設計して実機（USB マスストレージ）に転送する。**コードをビルドするリポジトリではない。**

## 最初に読むもの

| 目的 | ドキュメント |
| --- | --- |
| デバイス仕様・操作・FW・リカバリ | `docs/device.md` |
| **config.json の全リファレンス** | `docs/config-json.md` |
| サンプル wav の作り方と 1 MB 予算 | `docs/samples.md` |
| 作業手順（設計 → 検証 → 転送 → 確認） | `docs/workflow.md` |
| **TE 公式パックの分析（設計の教材）** | `docs/reference-packs.md` |

一次資料: `factory/readme.pdf`（同梱 readme）、`reference/ep-2350-user-guide-v1.1.1.txt`（公式ガイドのキャッシュ）。

## 絶対に守ること

1. **`config.json` の構文が壊れると fx-mic は起動しなくなる。**
   転送前に必ず `python3 tools/validate.py packs/<名前>` を通し、**エラーが 0 件でなければ転送しない**。
   （復旧は白 + グレーボタンを押しながら起動）
2. **`factory/` は変更しない。** 出荷時ディスクの中身のバックアップ。
3. **`vendor/` をコミットしない。** teenage engineering の著作物で再配布禁止（`.gitignore` 済み）。
   TE のサンプル wav を `packs/` にコピーして配布する形にもしないこと。
4. **合計 1 MB の制約を常に意識する。** wav 4 本 + config.json でこの予算。設計は秒数の配分から始める。
5. **憶測でパラメータを足さない。** 対応エフェクトとパラメータは `docs/config-json.md` の表が全て。
   未知のキーを書いてもエラーにならず黙って無視されるか、起動しなくなるかのどちらか。

## ディレクトリ

```
CLAUDE.md
docs/           仕様・リファレンス
factory/        出荷時ディスクの中身（変更禁止）
packs/          ★作業対象。1 ディレクトリ = 転送 1 セット
  _template/    新規パックの雛形
tools/          validate.py / prep-sample.sh / deploy.sh
reference/      公式ドキュメントのローカルキャッシュ
vendor/         TE 公式パック（gitignore）
build/          転送前バックアップの退避先（gitignore）
```

**`packs/<name>/` の中身 = ディスクのルート**。この 1:1 対応を崩さない。
実機に転送されるのは **`config.json` と `*.wav` のみ**（`README.md` 等は除外される）。

## Web エディタ（web/）

GUI で `config.json` を設計し、マイクを通してリアルタイムに音を確認できるツール。
ビルド不要の静的ファイルのみ（相対パス）なので、GitHub Pages でも LP のサブディレクトリでも
`web/` を置くだけで動く。詳細と既知の制約は `web/README.md`。

```bash
python3 -m http.server 8765 --directory web   # → http://127.0.0.1:8765/
node web/test/validate.test.mjs               # 検証ロジックが Python 版と一致するか
node web/test/worklets.test.mjs               # SSB / HARMONY の DSP 検証
node web/test/i18n.test.mjs                   # 全言語でキーが揃っているか
```

UI 文言を足すときは `web/i18n.js` の**全 7 言語**に同じキーを足し、`i18n.test.mjs` で確認すること。
エフェクト／パラメータのホバー説明（`web/descriptions.js`）は en / ja のみで、他言語は英語に落ちる。

**TE 公式パックはツールに同梱しない。** 再配布禁止で、CORS も無いのでブラウザから取得もできない。
`web/templates.js` のテンプレートは自前で書き起こしたオリジナルであること。

**仕様は二重管理になっている。** エフェクトやパラメータの表を直すときは
`tools/validate.py` と `web/spec.js` の**両方**を更新し、`node web/test/validate.test.mjs` で
一致を確認すること。

**プレビューは近似であって実機のエミュレータではない。** 内蔵プリセットは再現できず、
HARMONY / SSB / REVERB / DIST は近似、BUS は未実装。**最終確認は必ず実機で行う。**

## よく使うコマンド

```bash
cp -R packs/_template packs/my-pack        # 新規パック
python3 tools/validate.py packs/my-pack    # 検証（転送前に必須）
tools/prep-sample.sh -o packs/my-pack/1.wav src.wav   # wav 変換（モノ/22.05k/16bit）
tools/deploy.sh -n packs/my-pack           # ドライラン
tools/deploy.sh packs/my-pack              # 検証 → バックアップ → 転送 → eject
tools/deploy.sh --factory                  # ディスクを空にして工場出荷の音に戻す
```

## プリセットを設計するときの型

TE 公式パック 3 種を分析した結果、以下が定石（詳細と実例は `docs/reference-packs.md`）。

- **`list` の最後は `{ "effect": "SAMPLE" }`**、`"trigger": { "row": <その index> }`
  → サンプルはドライで出し、マイク入力にだけエフェクトをかける
- **チェーンは 3 段（エフェクト 2 つ + SAMPLE）が基本**
- **`pos` を 0〜3 まで明示し、`name` と `comment` を必ず書く**
- **`handle` は全プリセットに必ず割り当てる**。fx-mic の体験そのものなので、ここを最初に設計する
- **`depth` は「効果が振り切る」値**を入れる（例: `cutoff` 0.0 に `depth` 1.0、`pitch` 0.5 に `depth` 1.5）
- `shake` / `lfo` はどちらか一方を足す程度に留める
- 「普段は無効、振ったときだけ効く」を作りたいときは、**エフェクトを `mix: 0.0` で置いて `shake` で上げる**

## 未検証の事項（実機で確認したら docs を更新する）

`docs/config-json.md` に「未検証」と注記があるもの。確認できたら**その注記を消して事実に置き換える**こと。

- `EQUALISER`（公式ガイド 1.1.1）と `EQUALIZER`（同梱 readme.pdf）のどちらが通るか
- `samples` の部分差し替え（一部スロットだけ定義したとき、残りが工場出荷サンプルのまま残るか）
  — `presets` については**成立することを実機で確認済み**（下記）
- `LOWPASS` / `HIGHPASS` の `Q` パラメータの有無
- samples の `duck`、lfo の `mpy`（readme.pdf の例にのみ登場）
- `"file"` にサブフォルダ付きパス（`"samples/x.wav"`）が使えるか
- `BUS` の詳細な挙動（バス数・合流方法）
- `factory/4_.wav` の内容（`4.wav` にリネームするとスロット 4 に入るのか）

## 実機で確認済みの事項

- **`presets` の部分差し替えができる**（2026-08-29 / `packs/radio-fx`）。
  一部のスロットだけ `pos` を指定して書けば、書かなかったスロットは工場出荷プリセット
  （ECHO / SPRING / PIXIE / ROBOT）のまま残る。4 スロット全部を埋める必要はない。
- **USB ディスクのボリューム名は `fx-mic disk` とは限らない**（実機は `NO NAME` だった）。
  判別は `diskutil info <マウント先>` の **Device / Media Name = `EP-2350 DRIVE`** で行う。
  `NO NAME` は普通の USB メモリにも付く名前で、転送時に既存ファイルを消すので取り違えは実害がある。

## スロット番号の数え方に注意

**`pos` とオレンジボタンの押す回数は 1 ずれる**（1 番目がクリーンのため）。

| オレンジボタン | 1番目 | 2番目 | 3番目 | 4番目 | 5番目 |
| --- | --- | --- | --- | --- | --- |
| `pos` | クリーン | `0` | `1` | `2` | `3` |
| 工場出荷 | — | ECHO | SPRING | PIXIE | ROBOT |

ユーザーが「N つめ」と言ったとき、**FX スロットの序数**（3 つめ = `pos: 2`）なのか
**ボタンを押す回数**（3 番目 = `pos: 1`）なのかで結果が変わる。**曖昧なら確認する。**

## シェルスクリプトを書くときの注意

`tools/*.sh` はメッセージが日本語。**bash は `$var` の直後の多バイト文字を変数名の一部として解釈する**ため、
`"$disk（...）"` と書くと `disk（` という変数を探して `unbound variable` で落ちる（`set -u` 下）。
**変数の直後に日本語が続く場合は必ず `${var}` と波括弧で囲むこと。** 実際にこの罠を 3 回踏んでいる。

検出用:

```bash
python3 - <<'EOF'
import re, pathlib
for f in pathlib.Path('tools').glob('*.sh'):
    for i, l in enumerate(f.read_text().splitlines(), 1):
        for m in re.finditer(r'\$[A-Za-z_][A-Za-z0-9_]*', l):
            nxt = l[m.end():m.end()+1]
            if nxt and ord(nxt) > 127:
                print(f"{f}:{i}: {l.strip()}")
EOF
```

また、macOS の `getopts` は `--factory` のような長いオプションを扱えないため、
`tools/deploy.sh` は getopts の前に自前で拾っている。同様の引数を足すときは同じ場所に足すこと。

## 作業スタイル

- 実機での確認結果は必ず `packs/<name>/README.md` に書き残す。**このデバイスは実機で鳴らさないと正解が分からない**
- 仕様に関する記述は必ず一次資料（公式ガイド / readme.pdf / TE 公式パック実物）に紐づける。推測は「推測」と明記する
