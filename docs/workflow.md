# カスタマイズのワークフロー

## 0. 前提

- **OS を 1.1.1 以上にしておく**（1.0.7 で JSON パースの不具合が複数修正されている → `docs/device.md` §5）
- `ffmpeg` と `python3` が使えること（`ffmpeg` は Homebrew: `brew install ffmpeg`）

## 1. リポジトリの構成

```
.
├── CLAUDE.md                  このリポジトリで作業するときの指示
├── docs/                      仕様・リファレンス
├── factory/                   出荷時ディスクの中身（変更禁止・gitignore）
├── packs/                     ★作業対象。1 パック = fx-mic disk に転送する 1 セット
│   ├── _template/             新規パックの雛形
│   └── <pack-name>/
│       ├── config.json
│       ├── 1.wav 〜 4.wav     （サンプルを差し替える場合）
│       └── README.md          そのパックの設計メモ
├── tools/                     検証・変換・転送スクリプト
├── reference/                 公式ドキュメントのローカルキャッシュ
└── vendor/                    TE 公式パック（gitignore・再配布禁止）
```

**`packs/<name>/` の中身がそのまま `fx-mic disk` のルートにコピーされる**（`README.md` を除く）。この 1:1 対応を崩さないこと。

## 1.5 Web エディタを使う場合

GUI で組みたい・音を聴きながら詰めたい場合は `web/` のエディタが使える。

```bash
python3 -m http.server 8765 --directory web   # → http://127.0.0.1:8765/
```

マイクを通したリアルタイムプレビュー、検証、1 MB 予算表示、ディスクへの直接書き出しまで
ブラウザで完結する（Chrome / Edge）。ただし**プレビューは近似**で内蔵プリセットは再現できないため、
最終確認は実機で行うこと。詳細は `web/README.md`。

以下の手順はファイルを直接編集する場合のもの。どちらで作っても `packs/<name>/config.json` の形は同じ。

## 2. 新しいパックを作る

```bash
cp -R packs/_template packs/my-pack
$EDITOR packs/my-pack/config.json
```

設計の順番（この順で考えるとハマらない）:

1. **どのスロットを触るか決める。** 4 スロット全部を埋める必要はない
   — `presets` に書かなかったスロットは工場出荷プリセットのまま残る（`docs/config-json.md`）
2. 各スロットの**エフェクトチェーン**を組む。`{ "effect": "SAMPLE" }` は原則いちばん最後
3. `trigger` を `SAMPLE` の row に合わせる
4. **`handle` に何を割り当てるか**を決める。ここが fx-mic の肝で、「押すと何が起きるか」が体験そのもの
5. 必要なら `shake` / `lfo` を足す
6. サンプルを使う場合は 1 MB 予算内に収める（`docs/samples.md`）

## 3. 検証（転送前に必ず）

```bash
python3 tools/validate.py packs/my-pack
```

チェック内容:

- JSON 構文（壊れていると本体が起動しなくなる）
- 未知のキー / エフェクト名 / パラメータ名
- パラメータの範囲
- `row` / `trigger` の参照先の妥当性
- `DELAY` / `HARMONY` / `REVERB` / `SSB` の 1 チェーン 1 回制限
- `SAMPLE` エフェクトの有無と位置
- wav のフォーマット（レート・ビット深度・チャンネル）
- **合計サイズが 1 MB 予算内か**

エラーが 1 つでもあれば転送しないこと。

## 4. wav の準備

```bash
tools/prep-sample.sh -o packs/my-pack/1.wav source/shout.wav        # 標準（モノ 22.05k 16bit）
tools/prep-sample.sh -r 44100 -c 2 -o packs/my-pack/2.wav hit.wav   # 音質優先
tools/prep-sample.sh -t 2.5 -o packs/my-pack/3.wav long.wav          # 2.5 秒でカット
```

## 5. 実機へ転送

```bash
tools/deploy.sh packs/my-pack
```

やっていること:

1. `tools/validate.py` を実行（失敗したら中断）
2. `fx-mic disk` のマウントを探す
3. **転送前のディスク内容を `build/backup-<日時>/` に退避**
4. ディスク上の既存 `*.wav` / `config.json` を削除してパックの中身をコピー
5. アンマウント（eject）→ fx-mic が再起動して読み込む

### 手動でやる場合

1. 下蓋を外して USB-C 接続 → **ハンドルを押して電源 ON**
2. ディスクがマウントされる。**ボリューム名は `fx-mic disk` とは限らない**（実機では `NO NAME` だった）。
   `diskutil info <マウント先> | grep -i 'device / media name'` が `EP-2350 DRIVE` を返すか確認する
3. 既存の `config.json` と `*.wav` を消して、パックの中身をコピー
4. **eject する**（OS 1.0.5 以降は eject でリロードされる）

## 6. 実機での確認

チェックリスト:

- [ ] 起動する（起動しない＝ JSON が読めていない → §7）
- [ ] オレンジボタンで 4 プリセットが切り替わる
- [ ] 各プリセットでハンドルの押し込みに応じて音が変わる
- [ ] シェイクの反応
- [ ] 白ボタンでサンプルスロットが切り替わり、グレーボタンで鳴る
- [ ] サンプルにエフェクトがかかる/かからないが意図どおり（= `SAMPLE` の row 位置）
- [ ] 音量が過大になっていない（特に `DELAY` の `echo` を上げるプリセット）

確認結果は `packs/<name>/README.md` に書き残す。**実機でしか分からないこと（BUS の挙動、`EQUALISER` の綴り、`duck` / `mpy` / `Q` の有無）が多いので、検証できたら `docs/config-json.md` の「未検証」注記を更新すること。**

## 7. トラブルシュート

| 症状 | 対処 |
| --- | --- |
| **起動しない / フリーズする** | `config.json` の構文エラー。**白 + グレーボタンを押しながら起動**して USB 接続し、ファイルを修正する |
| サンプルが鳴らない | プリセットの `list` に `{ "effect": "SAMPLE" }` があるか、`trigger` の `row` が合っているか |
| サンプルが差し替わらない | eject したか（OS 1.0.5 未満は電源 OFF/ON が必要）／ファイル名は `1.wav`〜`4.wav` か、`config.json` の `file` と一致しているか |
| 「空き容量がない」と出る | ディスクを **FAT で再フォーマット**（ラベルが消えて `NO NAME` になるが問題ない） |
| `tools/deploy.sh` がディスクを見つけられない | ハンドルを押して電源が入っているか確認。`ls /Volumes` で候補を探し、`diskutil info` で `EP-2350 DRIVE` を確認して `-d <マウント先>` で明示指定 |
| 音が出ない | ハンドルを押していないとマイクは有効にならない。下蓋内のポテンショメータの位置も確認 |
| 音が歪む・爆音 | 出力は 2 VRMS。ヘッドホン直挿し禁止。`DELAY` の `echo` は自己発振するので注意 |
| JSON は正しいのに読まれない | OS が古い可能性（1.0.5 に JSON ローディングの退行あり、1.0.7 で修正）→ OS を 1.1.1 に更新 |

## 8. 元に戻す

```bash
tools/deploy.sh --factory     # ディスクを空にして工場出荷状態のプリセット／サンプルに戻す
```

`config.json` と `*.wav` がディスクに無ければ、fx-mic は内蔵のプリセットとサンプルで動作する。`factory/4_.wav` は出荷時ディスクに入っていたファイルなので、完全に出荷状態に戻したい場合はこれも書き戻す。
