# packs/

1 ディレクトリ = fx-mic disk に転送する 1 セット。

- `<pack>/config.json` と `<pack>/*.wav` が**そのままディスクのルートにコピーされる**
- `<pack>/README.md` はコピーされない（設計メモ用）
- 新規作成: `cp -R packs/_template packs/<名前>`
- 検証: `python3 tools/validate.py packs/<名前>`
- 転送: `tools/deploy.sh packs/<名前>`
