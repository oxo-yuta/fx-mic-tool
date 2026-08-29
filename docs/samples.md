# サンプル（wav）の作り方と 1 MB 予算

## 1. 制約のおさらい

| 項目 | 制約 |
| --- | --- |
| フォーマット | wav（PCM / IEEE float）のみ |
| チャンネル | モノ or ステレオ |
| ビット深度 | 8 / 16 / 24-bit / 32-bit float |
| サンプルレート | 最大 96 kHz |
| スロット数 | 4 |
| **合計サイズ** | **約 1 MB**（wav 4 本 + config.json の合計） |

1 MB は本当にすぐ埋まる。**ここが実質いちばん厳しい制約**なので、設計は「秒数の予算配分」から始める。

## 2. 秒数 × フォーマットのサイズ早見表

`サイズ(bytes) ≒ サンプルレート × チャンネル数 × (ビット深度 ÷ 8) × 秒数`

1 秒あたりのバイト数:

| レート | ch | bit | 1 秒あたり | 1 MB で入る長さ |
| --- | --- | --- | --- | --- |
| 44100 | 2 | 16 | 176 KB | 約 5.7 秒 |
| 44100 | 1 | 16 | 88 KB | 約 11.4 秒 |
| 32000 | 1 | 16 | 64 KB | 約 15.6 秒 |
| 22050 | 1 | 16 | 44 KB | 約 22.7 秒 |
| 22050 | 1 | 8 | 22 KB | 約 45.4 秒 |
| 16000 | 1 | 16 | 32 KB | 約 31.3 秒 |

**4 スロット合計での目安**: ステレオ 44.1k/16bit なら 1 本あたり 1.4 秒程度しか取れない。モノ 22.05k/16bit なら 1 本 5 秒強まで伸ばせる。

### 削減の優先順位

1. **モノ化**（サイズ半分）— マイクの FX チェーンを通る用途ではステレオの必要性は低い
2. **不要な無音のトリム**（先頭・末尾）
3. **サンプルレートを落とす**（44.1k → 32k / 22.05k）。fx-mic はハイファイを狙う機材ではないので 22.05k でも実用的
4. **16-bit を維持**（8-bit はノイズが目立つ。狙って使う場合を除く）

## 3. TE 公式サンプルパックの実測値（参考）

`vendor/te-packs/ep-2350_sample_pack_new_shouts/`（合計 879 KB / 4 本）

| ファイル | 形式 | 長さ | サイズ |
| --- | --- | --- | --- |
| `toy.wav` | 16-bit / 44100 Hz / stereo | 0.55 s | 96 KB |
| `ork.wav` | 16-bit / 32000 Hz / stereo | 1.59 s | 204 KB |
| `funfair.wav` | 16-bit / 22050 Hz / stereo | 3.45 s | 304 KB |
| `villhem.wav` | 16-bit / 44100 Hz / stereo | 1.55 s | 274 KB |

→ TE 自身も **ファイルごとにサンプルレートを変えて 1 MB に収めている**。長いものほどレートを落とす、という配分が実践的。

`vendor/te-packs/`（december pack）の素材は 24-bit / 44.1k / stereo で 1 本 140 KB〜1 MB。**そのままでは 4 本入らない**ので必ず変換する。

## 4. 変換レシピ（ffmpeg）

`tools/prep-sample.sh` がラッパー。中身は以下と等価。

```bash
# 標準レシピ: モノ / 22.05 kHz / 16-bit、無音トリム + ノーマライズ
ffmpeg -y -i in.wav \
  -af "silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.02,areverse,silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.02,areverse,loudnorm=I=-14:TP=-1.0" \
  -ac 1 -ar 22050 -c:a pcm_s16le out.wav

# 音質優先（短いサンプル向け）: ステレオ / 44.1 kHz / 16-bit
ffmpeg -y -i in.wav -ac 2 -ar 44100 -c:a pcm_s16le out.wav

# 長さを 3 秒で切る
ffmpeg -y -i in.wav -t 3 -ac 1 -ar 22050 -c:a pcm_s16le out.wav
```

> **メタデータに注意**: Logic Pro などが書く BWF チャンクや iXML でファイルが数 KB 膨らむ。上記 ffmpeg コマンドは基本的に不要チャンクを落とすが、気になる場合は `-map_metadata -1 -write_bext 0` を足す。

### 使ってはいけない設定

- mp3 / aac / flac / ogg → **wav 以外は読まれない**
- 96 kHz 超
- 3ch 以上
- 32-bit **整数**（対応しているのは 32-bit **float**）

## 5. サイズ検証

```bash
python3 tools/validate.py packs/<pack-name>
```

wav のヘッダを解析してフォーマット違反を検出し、ディスクに置かれる全ファイルの合計サイズが 1 MB 予算に収まるかを判定する。
