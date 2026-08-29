# fx-mic custom

teenage engineering **EP–2350 fx-mic** のカスタマイズ（`config.json` プリセット / サンプル wav）。

## クイックスタート

```bash
cp -R packs/_template packs/my-pack        # 新規パックを作る
$EDITOR packs/my-pack/config.json          # 設計する（docs/config-json.md）
python3 tools/validate.py packs/my-pack    # 検証（転送前に必須）
tools/deploy.sh packs/my-pack              # 実機へ転送
```

転送前に **下蓋を外して USB-C 接続 → ハンドルを押して電源 ON**。

> ⚠️ `config.json` の構文が壊れていると fx-mic は起動しなくなる。必ず `tools/validate.py` を通すこと。
> 壊してしまったら **白 + グレーボタンを押しながら起動**すれば復旧できる。

## ドキュメント

[`docs/`](docs/README.md) — デバイス仕様、config.json リファレンス、サンプル作成、作業手順、TE 公式パックの分析。
このリポジトリで作業するときの決まりごとは [`CLAUDE.md`](CLAUDE.md)。

## ディレクトリ

| | |
| --- | --- |
| `packs/` | 作業対象。1 ディレクトリ = 実機に転送する 1 セット |
| `docs/` | 仕様・リファレンス |
| `tools/` | `validate.py`（検証） / `prep-sample.sh`（wav 変換） / `deploy.sh`（転送） |
| `factory/` | 出荷時ディスクの中身のバックアップ（変更禁止） |
| `reference/` | 公式ドキュメントのローカルキャッシュ |
| `vendor/` | TE 公式パック（再配布禁止・gitignore） |
