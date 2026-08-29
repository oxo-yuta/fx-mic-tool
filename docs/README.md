# docs/

| ドキュメント | 内容 |
| --- | --- |
| [`device.md`](device.md) | EP–2350 fx-mic のハードウェア仕様、操作系、電源、USB ディスク、ファームウェア、リカバリ |
| [`config-json.md`](config-json.md) | **config.json の完全リファレンス**。エフェクト一覧とパラメータ範囲、変調、BUS、signal flow |
| [`samples.md`](samples.md) | サンプル wav の要件、1 MB 予算の配分、ffmpeg 変換レシピ |
| [`workflow.md`](workflow.md) | 設計 → 検証 → 転送 → 実機確認の手順、トラブルシュート |
| [`reference-packs.md`](reference-packs.md) | **TE 公式パック（broken radio / mysterious / dub）の分析**。設計の教材 |

## 一次資料

- [公式ユーザーガイド ver 1.1.1](https://teenage.engineering/guides/ep-2350) — キャッシュ: `reference/ep-2350-user-guide-v1.1.1.txt`
- 同梱 readme（PDF 原本） — `factory/readme.pdf`
- [ファームウェアダウンロード](https://teenage.engineering/downloads/ep-2350)
- [サウンドパック / FX パック](https://teenage.engineering/downloads/ep-2350/sound-packs)

同梱 readme.pdf は公式ガイドより古い版だが、**公式ガイドに載っていない記述**（`duck` / `mpy` / `Q` / サブフォルダパス / `BUS` の例）を含むため併読する価値がある。両者で食い違う箇所は `docs/config-json.md` に注記してある。
