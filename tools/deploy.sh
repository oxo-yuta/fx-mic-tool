#!/usr/bin/env bash
# パックを fx-mic disk に転送する。
#
#   tools/deploy.sh <pack-dir>     パックを検証してから転送
#   tools/deploy.sh --factory      ディスクを空にして工場出荷の音に戻す
#
# options:
#   -y            確認プロンプトをスキップ
#   -d <path>     fx-mic disk のマウント先を明示指定（自動検出に失敗する場合）
#   -n            ドライラン（何もコピーしない）
#   -E            転送後に eject しない
#
# 事前に: 下蓋を外して USB-C 接続 → ハンドルを押して電源 ON。
# 転送後は eject で fx-mic が再起動して読み込む（OS 1.0.5 以降）。
set -euo pipefail

cd "$(dirname "$0")/.."
REPO="$PWD"

assume_yes=0; disk=""; dry=0; do_eject=1; factory=0
args=()
for a in "$@"; do
  if [ "$a" = "--factory" ]; then factory=1; else args+=("$a"); fi
done
set -- ${args[@]+"${args[@]}"}

while getopts "yd:nEh" opt; do
  case "$opt" in
    y) assume_yes=1 ;;
    d) disk="$OPTARG" ;;
    n) dry=1 ;;
    E) do_eject=0 ;;
    h) sed -n '2,17p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) exit 2 ;;
  esac
done
shift $((OPTIND - 1))

if [ "$factory" = 1 ]; then
  [ $# -eq 0 ] || { echo "✗ --factory とパック指定は同時に使えない" >&2; exit 2; }
  target="--factory"
else
  [ $# -eq 1 ] || { echo "使い方: $0 [options] <pack-dir>|--factory   (-h でヘルプ)" >&2; exit 2; }
  target="$1"
fi

# ---- fx-mic disk を探す --------------------------------------------------
# ボリューム名は 'fx-mic disk' とは限らない（再フォーマットすると 'NO NAME' になる）。
# 確実なのは diskutil が返す Device / Media Name が "EP-2350" であること。
is_ep2350() {
  command -v diskutil >/dev/null || return 1
  diskutil info "$1" 2>/dev/null | grep -qi 'Device / Media Name:.*EP-2350'
}

if [ -z "$disk" ]; then
  for candidate in /Volumes/*; do
    [ -d "$candidate" ] || continue
    if is_ep2350 "$candidate"; then disk="$candidate"; break; fi
    case "$(basename "$candidate")" in
      [Ff][Xx]-[Mm][Ii][Cc]*|[Ff][Xx]\ [Mm][Ii][Cc]*) disk="$candidate"; break ;;
    esac
  done
fi
if [ -z "$disk" ] || [ ! -d "$disk" ]; then
  echo "✗ fx-mic disk が見つからない。" >&2
  echo "  1. 下蓋を外して USB-C で接続" >&2
  echo "  2. ハンドルを押して電源を入れる（電源 OFF だとディスクが出てこない）" >&2
  echo "  3. それでも駄目なら -d <マウント先> で明示指定" >&2
  echo "  現在マウント中: $(ls /Volumes 2>/dev/null | tr '\n' ' ')" >&2
  exit 2
fi
case "$(basename "$disk")" in
  *[Bb][Oo][Oo][Tt]*)
    echo "✗ '$disk' はファームウェア更新用の BOOT ドライブ。" >&2
    echo "  一度電源を入れ直して通常の fx-mic disk をマウントすること。" >&2
    exit 2 ;;
esac

# 無関係な USB メモリ（同じく 'NO NAME' になりがち）に書き込む事故を防ぐ
if is_ep2350 "$disk"; then
  verified="EP-2350 DRIVE として確認済み"
else
  verified="⚠️ EP-2350 として確認できなかった"
  echo "⚠️  '$disk' が EP-2350 かどうか diskutil で確認できなかった。" >&2
  echo "   このディスクの中身は削除される。行き先が正しいか確認すること。" >&2
  if [ "$assume_yes" = 1 ]; then
    echo "✗ 未確認のディスクに -y での自動実行はしない。手動で確認して実行すること。" >&2
    exit 2
  fi
fi

# ---- 転送するファイルを決める --------------------------------------------
files=()
if [ "$target" = "--factory" ]; then
  label="工場出荷状態（ディスクを空にする）"
else
  [ -d "$target" ] || { echo "✗ パックが見つからない: $target" >&2; exit 2; }
  echo "▸ 検証: $target"
  python3 "$REPO/tools/validate.py" "$target" || {
    echo "✗ 検証に失敗した。修正するまで転送しない（壊れた config.json は本体を起動不能にする）" >&2
    exit 1
  }
  while IFS= read -r f; do files+=("$f"); done < <(
    find "$target" -maxdepth 1 -type f \
      \( -iname '*.wav' -o -name 'config.json' \) ! -name '._*' | sort
  )
  [ ${#files[@]} -gt 0 ] || { echo "✗ 転送するファイルが無い: $target" >&2; exit 2; }
  label="${target}（${#files[@]} ファイル）"
fi

# ---- 削除対象 ------------------------------------------------------------
stale=()
while IFS= read -r f; do stale+=("$f"); done < <(
  find "$disk" -maxdepth 1 -type f \
    \( -iname '*.wav' -o -iname 'config.json' \) ! -name '._*' | sort
)

echo
echo "  転送元 : $label"
echo "  転送先 : ${disk}（${verified}）"
for f in ${stale[@]+"${stale[@]}"}; do echo "  削除   : $(basename "$f")"; done
for f in ${files[@]+"${files[@]}"}; do echo "  コピー : $(basename "$f")"; done
echo

if [ "$dry" = 1 ]; then echo "（ドライラン。何もしていない）"; exit 0; fi

if [ "$assume_yes" != 1 ]; then
  printf '実行する？ [y/N] '
  read -r ans
  case "$ans" in [Yy]*) ;; *) echo "中止した"; exit 0 ;; esac
fi

# ---- 現状をバックアップ --------------------------------------------------
backup="$REPO/build/backup-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$backup"
found=0
for f in "$disk"/*; do
  [ -f "$f" ] || continue
  cp -p "$f" "$backup/" 2>/dev/null && found=1
done
if [ "$found" = 1 ]; then
  echo "▸ 転送前のディスク内容を $backup に退避した"
else
  rmdir "$backup" 2>/dev/null || true
fi

# ---- 転送 ----------------------------------------------------------------
for f in ${stale[@]+"${stale[@]}"}; do rm -f "$f"; done
for f in ${files[@]+"${files[@]}"}; do cp "$f" "$disk/"; done
sync
echo "▸ 転送完了"

# ---- eject ---------------------------------------------------------------
if [ "$do_eject" = 1 ]; then
  if command -v diskutil >/dev/null; then
    diskutil eject "$disk" >/dev/null && echo "▸ eject 完了。fx-mic が再起動して読み込む"
  else
    echo "⚠️  手動で eject すること（eject しないと読み込まれない）"
  fi
else
  echo "⚠️  eject していない。手動で取り出すまで反映されない"
fi

cat <<'TIP'

次: 実機で確認する（docs/workflow.md §6 のチェックリスト）
  起動しない場合 → 白 + グレーボタンを押しながら起動して config.json を修正
TIP
