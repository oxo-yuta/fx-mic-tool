# TE 公式パックの分析

teenage engineering が公開している EP–2350 用パックを実際にダウンロードして分析したもの。
**自分でプリセットを設計するときの最良の教材**なので、新しいプリセットを作る前に必ず目を通すこと。

## 取得方法

配布元: https://teenage.engineering/downloads/ep-2350/sound-packs

```bash
mkdir -p vendor/te-packs && cd vendor/te-packs
for id in 6932f5aee678a840cb2a2510 6932f5dbb498744324998672 6932f608854b3640cbcd556c \
          6937f50bc346df0c4b814e12 6943f589e995526130462c15; do
  curl -sLO "https://teenage.engineering/_img/${id}_original.zip"
  unzip -oq "${id}_original.zip"
done
```

| zip id | 中身 |
| --- | --- |
| `6932f5aee678a840cb2a2510` | FX パック **broken radio** |
| `6932f5dbb498744324998672` | FX パック **mysterious** |
| `6932f608854b3640cbcd556c` | FX パック **dub** |
| `6937f50bc346df0c4b814e12` | サンプルパック **new shouts**（config.json + wav 4本） |
| `6943f589e995526130462c15` | サンプルパック **december pack**（wav 14本・素材集） |

> **⚠️ これらは teenage engineering の著作物**。ライセンス上、素材の再配布・再販は禁止されている。`vendor/` は `.gitignore` 済み。**コミットしないこと。**

## 全パックに共通するパターン

3 つの FX パックを比べると、TE の書き方には明確な型がある。

1. **`samples` セクションを持たない。** FX パックは `presets` だけ。工場出荷サンプルがそのまま使われる
2. **`pos` を 0〜3 まで必ず明示**して 4 スロットを埋める
3. **`name` と `comment` を必ず書く**（`comment` は「何が起きるか」を一文で）
4. **`list` の最後は必ず `{ "effect": "SAMPLE" }`**、そして `"trigger": { "row": <最後のindex> }`
   → サンプルはドライで出し、マイク入力だけにエフェクトをかける設計
5. **チェーンは 3 段構成が基本**（エフェクト 2 つ + `SAMPLE`）。4 段は 1 例のみ
6. **`handle` は全プリセットに必ずある。** `shake` / `lfo` はどちらか一方を足すのが基本で、両方使うのは 1 例のみ
7. **`handle` の `depth` は「効果が最大まで振り切る」値**を入れている（例: cutoff 0.0 に depth 1.0、pitch 0.5 に depth 1.5）

## broken radio pack

`vendor/te-packs/ep-2350_preset_pack-broken_radio/`
「壊れかけの無線・ラジオ」というテーマを 4 つの角度から表現している。

| pos | 名前 | チェーン | handle | shake / lfo |
| --- | --- | --- | --- | --- |
| 0 | WALKIE TALKIE | HIGHPASS(0.1) → LOWPASS(0.4) → DIST(15.0, mix0.5) → SAMPLE | row1 `cutoff` +0.5（チューニングダイヤル） | shake: row2 `mix` +0.5（ノイズ増） |
| 1 | AM TUNER | SSB(-500Hz) → DIST(5.0, mix0.2) → SAMPLE | row0 `frequency` +1000（局探し） | shake: row0 `frequency` +200（微揺れ） |
| 2 | CRYPTIC | RING(100Hz, mix0.8) → REVERB(time0.5, wet0.4) → SAMPLE | row0 `frequency` +2000 | lfo: row0 `frequency` depth50 / **random** / speed8（背後で常時ゆらぐ） |
| 3 | LOSING SIGNAL | BALANCE(0.5) → REVERB(time1.0, wet0.0, dry1.0) → SAMPLE | row1 `wet-level` +1.0（遠ざかる） | lfo: row0 `balance` depth1.0 / **square** / speed10（途切れ）<br>shake: row1 `dry-level` **-1.0**（原音を完全に切る） |

**学べる手筋:**
- **HIGHPASS + LOWPASS の 2 段でバンドパスを作る**（fx-mic に BANDPASS はないので、この組み合わせが定石）
- **`SSB` の周波数シフトが「ラジオの選局」の音**になる。`depth` を大きく（1000.0）取って派手に動かす
- **`BALANCE` + square LFO で「音が途切れる」表現**。信号ロスト系はこれ
- **負の `depth`（-1.0）で「消す」方向の変調**。`dry-level` を -1.0 すると原音が消えてエフェクト音だけになる
- `REVERB` の `wet-level` を 0.0 スタートにして handle で上げると「遠ざかる」

## mysterious pack

`vendor/te-packs/ep-2350_preset_pack-mysterious/`
4 つ全てが `HARMONY`（ピッチシフト）を row0 に置いたピッチ系パック。

| pos | 名前 | チェーン | handle | shake / lfo |
| --- | --- | --- | --- | --- |
| 0 | MANUAL PITCHER | HARMONY(0.5, dry0.0) → REVERB(0.2, wet0.3) → SAMPLE | row0 `pitch` **+1.5**（0.5→2.0 のフルレンジ = ピッチホイール） | shake: row1 `wet-level` +0.5 |
| 1 | DEEP TRAP | HARMONY(1.0, dry0.6) → DIST(0.0, mix0.0) → SAMPLE | row0 `pitch` **-0.5**（押すと 1oct 下） | shake: row1 `mix` +1.0（歪みを足す） |
| 2 | HYPER POP | HARMONY(1.0, dry0.0) → DELAY(0.3, echo0.4) → SAMPLE | row0 `pitch` +1.0（押すと高く） | lfo: row0 `pitch` depth0.1 / sine / speed6（ビブラート） |
| 3 | ALIEN TUNE | HARMONY(0.8, dry0.2) → RING(400Hz, mix0.4) → SAMPLE | row0 `pitch` +0.8 | shake: row1 `frequency` +1000 |

**学べる手筋:**
- **`HARMONY` の初期値 + `depth` でハンドルの「操作範囲」を設計する。** 0.5 + 1.5 = 0.5〜2.0 でフルレンジ、1.0 + (-0.5) = 1.0〜0.5 で「押すと 1 オクターブ下がる」
- **エフェクトを 0 で置いておき、shake でだけ効かせる**（DEEP TRAP の `DIST(amount 0.0, mix 0.0)` → shake で mix +1.0）。「普段は無効、振ったときだけ」を作るテクニック
- **浅い sine LFO（depth 0.1）でビブラート**。ピッチに対する LFO は depth を小さく

## dub pack

`vendor/te-packs/ep-2350_preset_pack-dub/`

| pos | 名前 | チェーン | handle | shake / lfo |
| --- | --- | --- | --- | --- |
| 0 | SPACE ECHO | DELAY(time0.9, echo0.6, wet0.5, hp0.1) → REVERB(0.5, dry1.0) → SAMPLE | row0 `echo` **+0.69**（自己発振まで持っていく） | shake: row1 `wet-level` +0.5 |
| 1 | KING TUBBY HPF | HIGHPASS(0.0) → DELAY(0.5, echo0.6, wet0.6) → SAMPLE | row0 `cutoff` +1.0（フルスイープ） | lfo: row1 `time` depth0.05 / sine / **speed0.2**（遅い揺らぎ） |
| 2 | SPRING TANK | REVERB(time0.8, spring-mix0.8, wet0.5, dry0.8) → DIST(2.0, mix0.2) → SAMPLE | row0 `time` +0.1 | shake: row0 `spring-mix` +0.2（バネを蹴る音） |
| 3 | RIDDIM WARP | HARMONY(0.7, dry0.4) → DELAY(0.5, echo0.5, cross-feed0.1) → SAMPLE | row1 `time` +0.5（ディレイタイムをワープ） | shake: row0 `pitch` -0.2 |

**学べる手筋:**
- **`echo` を handle で上げて自己発振させる**のが dub 的な使い方。**音量が暴走するので注意**（TE の readme にも "warning: can get loud!" と書かれている）
- **`speed: 0.2` の超低速 LFO で `DELAY` の `time` をわずかに揺らす**とテープの揺れ感が出る
- **`spring-mix` を shake に割り当てると、リバーブタンクを叩いた「ボイン」が出る**（物理的な操作と音が直結する好例）
- **`cross-feed`** でステレオのエコーを絡ませる

## サンプルパック（new shouts）

`vendor/te-packs/ep-2350_sample_pack_new_shouts/config.json` は驚くほど短い:

```json
{
  "samples": [
    { "file": "toy.wav","playmode": "oneshot" },
    { "file": "funfair.wav","playmode": "oneshot" },
    { "file": "ork.wav","playmode": "oneshot" },
    { "file": "villhem.wav","playmode": "oneshot" }
  ]
}
```

- `name` も `presets` も無い。**サンプルだけ差し替えるならこれで十分**
- `pos` も書かず配列順に割り当てている
- ファイル名は `1.wav`〜`4.wav` である必要はない（`config.json` で指定するなら任意名）
- 4 本合計 879 KB。**ファイルごとにサンプルレートを変えて 1 MB に収めている**（`docs/samples.md` §3）
