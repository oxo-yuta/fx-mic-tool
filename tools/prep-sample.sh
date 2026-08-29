#!/usr/bin/env bash
# EP-2350 fx-mic 用に wav を変換する（ffmpeg ラッパー）。
#
#   tools/prep-sample.sh [options] <input> 
#
# options:
#   -o <path>   出力先（デフォルト: <input のbasename>.fxmic.wav）
#   -r <rate>   サンプルレート（デフォルト: 22050、上限 96000）
#   -c <1|2>    チャンネル数（デフォルト: 1 = モノ）
#   -b <8|16|24|32f>  ビット深度（デフォルト: 16）
#   -t <sec>    先頭から指定秒数で切る
#   -T          無音トリムを無効化（デフォルトは前後の無音を削る）
#   -N          ノーマライズを無効化（デフォルトは loudnorm I=-14）
#
# 1 MB の容量予算とレート／秒数の早見表は docs/samples.md を参照。
set -euo pipefail

out=""; rate=22050; ch=1; bits=16; trim_sec=""; do_trim=1; do_norm=1
while getopts "o:r:c:b:t:TNh" opt; do
  case "$opt" in
    o) out="$OPTARG" ;;
    r) rate="$OPTARG" ;;
    c) ch="$OPTARG" ;;
    b) bits="$OPTARG" ;;
    t) trim_sec="$OPTARG" ;;
    T) do_trim=0 ;;
    N) do_norm=0 ;;
    h) sed -n '2,17p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) exit 2 ;;
  esac
done
shift $((OPTIND - 1))

[ $# -eq 1 ] || { echo "使い方: $0 [options] <input>   (-h でヘルプ)" >&2; exit 2; }
src="$1"
[ -f "$src" ] || { echo "✗ 入力が見つからない: $src" >&2; exit 2; }
command -v ffmpeg >/dev/null || { echo "✗ ffmpeg が必要（brew install ffmpeg）" >&2; exit 2; }

case "$bits" in
  8)   codec="pcm_u8" ;;
  16)  codec="pcm_s16le" ;;
  24)  codec="pcm_s24le" ;;
  32f) codec="pcm_f32le" ;;
  *)   echo "✗ -b は 8 / 16 / 24 / 32f のいずれか（実際: ${bits}）" >&2; exit 2 ;;
esac
[ "$rate" -le 96000 ] || { echo "✗ サンプルレートの上限は 96000 Hz" >&2; exit 2; }
[ "$ch" = 1 ] || [ "$ch" = 2 ] || { echo "✗ -c は 1 か 2" >&2; exit 2; }

[ -n "$out" ] || out="$(basename "${src%.*}").fxmic.wav"

filters=()
if [ "$do_trim" = 1 ]; then
  sr="silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.02"
  filters+=("$sr" "areverse" "$sr" "areverse")
fi
[ "$do_norm" = 1 ] && filters+=("loudnorm=I=-14:TP=-1.0")

args=(-y -hide_banner -loglevel error -i "$src")
[ -n "$trim_sec" ] && args+=(-t "$trim_sec")
if [ ${#filters[@]} -gt 0 ]; then
  IFS=,; args+=(-af "${filters[*]}"); unset IFS
fi
# 余計な BWF/iXML メタデータを落として数 KB 節約する
args+=(-ac "$ch" -ar "$rate" -c:a "$codec" -map_metadata -1 -write_bext 0 "$out")

ffmpeg "${args[@]}"

size=$(stat -f%z "$out" 2>/dev/null || stat -c%s "$out")
dur=$(ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$out")
printf '✓ %s\n  %s-bit / %s Hz / %sch / %.2fs / %s bytes (1 MB 予算の %d%%)\n' \
  "$out" "$bits" "$rate" "$ch" "$dur" "$(printf "%'d" "$size")" "$((size * 100 / 1000000))"
