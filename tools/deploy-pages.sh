#!/usr/bin/env bash
# web/ の中身を gh-pages ブランチのルートに展開して push する。
#
#   tools/deploy-pages.sh            # 現在のブランチの web/ をデプロイ
#   tools/deploy-pages.sh -n         # ドライラン（push しない）
#
# GitHub Pages のブランチ公開はルートか /docs しか選べず web/ を直接指定できないため、
# web/ の中身をルートに持つ専用ブランチを作っている。
# 作業ツリーには一切触らない（一時 index と plumbing だけで完結する）。
set -euo pipefail
cd "$(dirname "$0")/.."

dry=0
while getopts "nh" opt; do
  case "$opt" in
    n) dry=1 ;;
    h) sed -n '2,10p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) exit 2 ;;
  esac
done

[ -z "$(git status --porcelain)" ] || {
  echo "✗ 未コミットの変更がある。デプロイするのは HEAD の内容なので、先にコミットすること。" >&2
  git status --short >&2
  exit 1
}

git rev-parse --verify -q "HEAD:web" >/dev/null || { echo "✗ HEAD に web/ が無い" >&2; exit 1; }

tmpidx=$(mktemp -t fxmicgh)
rm -f "$tmpidx"
trap 'rm -f "$tmpidx"' EXIT

GIT_INDEX_FILE="$tmpidx" git read-tree "HEAD:web"
# Jekyll を無効化（_ 始まりのファイルが無視されるのを防ぐ + ビルドが速い）
blob=$(printf '' | git hash-object -w --stdin)
GIT_INDEX_FILE="$tmpidx" git update-index --add --cacheinfo 100644,"$blob",.nojekyll
tree=$(GIT_INDEX_FILE="$tmpidx" git write-tree)

src=$(git rev-parse --short HEAD)
commit=$(git commit-tree "$tree" -m "Deploy fx-mic editor to GitHub Pages

web/ の中身をルートに展開したもの。ソース: $src")

git branch -f gh-pages "$commit"
echo "▸ gh-pages = $(git rev-parse --short "$commit")（ソース ${src}）"
git ls-tree -r gh-pages --name-only | sed 's/^/    /'

if [ "$dry" = 1 ]; then echo "（ドライラン。push していない）"; exit 0; fi

git push -f origin gh-pages
echo "▸ https://oxo-yuta.github.io/fx-mic-tool/  （反映まで 1 分ほどかかる）"
