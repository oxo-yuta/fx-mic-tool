# <パック名>

新規パックの雛形。`cp -R packs/_template packs/<名前>` してから編集する。
（この README は実機には転送されない）

## コンセプト

<このパックで何を表現したいか。1〜2行>

## プリセット

| pos | 名前 | チェーン | handle | shake / lfo |
| --- | --- | --- | --- | --- |
| 0 | SLOT 1 | LOWPASS → SAMPLE | cutoff +0.7 | — |
| 1 | SLOT 2 | DELAY → SAMPLE | echo +0.5 | — |
| 2 | SLOT 3 | HARMONY → SAMPLE | pitch +1.0 | — |
| 3 | SLOT 4 | REVERB → SAMPLE | time +0.6 | shake: wet-level +0.7 |

## サンプル

工場出荷サンプルを使用（`config.json` に `samples` セクションなし）。
差し替える場合は wav をこのディレクトリに置き、`samples` を追加する。

## 実機での確認結果

<`docs/workflow.md` §6 のチェックリストの結果、意図と違った点、次に試すこと>

- [ ] 未検証
