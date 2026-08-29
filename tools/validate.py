#!/usr/bin/env python3
"""EP-2350 fx-mic のパック（config.json + wav）を実機に転送する前に検証する。

使い方:
    python3 tools/validate.py packs/my-pack
    python3 tools/validate.py packs/my-pack/config.json

JSON が壊れていると fx-mic は起動しなくなる（復旧は白+グレー押しながら起動）。
転送前に必ずこれを通すこと。
"""
from __future__ import annotations

import json
import struct
import sys
from pathlib import Path

# ---------------------------------------------------------------- 仕様定数
# 出典: 公式ガイド 1.1.1 第7章 / factory/readme.pdf
# 詳細と「未検証」の注記は docs/config-json.md を参照。

DISK_BUDGET = 1_000_000  # 約 1 MB。ディスクに置く全ファイルの合計
BUDGET_WARN = 900_000

EFFECTS: dict[str, dict[str, tuple[float, float]]] = {
    "BALANCE":   {"balance": (0.0, 1.0)},
    "DELAY":     {"time": (0.0, 1.1), "lowpass-cutoff": (0.0, 1.0),
                  "highpass-cutoff": (0.0, 1.0), "wet-level": (0.0, 1.0),
                  "dry-level": (0.0, 1.0), "echo": (0.0, 1.0),
                  "cross-feed": (0.0, 1.0), "balance": (0.0, 1.0)},
    "DIST":      {"amount": (0.0, 40.0), "lowpass-cutoff": (0.0, 1.0),
                  "highpass-cutoff": (0.0, 1.0), "mix": (0.0, 1.0)},
    "EQUALISER": {"cutoff": (0.0, 1.0), "Q": (0.0, 1.0), "gain": (-1.0, 1.0)},
    "HARMONY":   {"dry-level": (0.0, 1.0), "pitch": (0.5, 2.0)},
    "LOWPASS":   {"cutoff": (0.0, 1.0), "Q": (0.0, 1.0)},
    "HIGHPASS":  {"cutoff": (0.0, 1.0), "Q": (0.0, 1.0)},
    "SAMPLE":    {"speed": (0.0, 4.0), "pitch": (-24.0, 24.0),
                  "level": (0.0, 1.0), "balance": (0.0, 1.0)},
    "REVERB":    {"dry-level": (0.0, 1.0), "wet-level": (0.0, 1.0),
                  "time": (0.0, 1.0), "spring-mix": (0.0, 1.0),
                  "highpass-cutoff": (0.0, 1.0)},
    "RING":      {"frequency": (0.0, 20000.0), "mix": (0.0, 1.0)},
    "SSB":       {"frequency": (-20000.0, 20000.0)},
}

# 1 エフェクトチェーンにつき 1 回だけ使うべきエフェクト
ONCE_PER_CHAIN = {"DELAY", "HARMONY", "REVERB", "SSB"}

LFO_SHAPES = {"sine", "square", "sawtooth", "random"}
PLAYMODES = {"oneshot", "hold", "startstop"}

MAX_SLOTS = 4
WAV_MAX_RATE = 96_000

# 綴り・キーの揺れ。値が None のものは「公式ガイド未記載・未検証」の意味。
ALIASES = {"EQUALIZER": "EQUALISER"}  # readme.pdf は米国綴り
UNVERIFIED_SAMPLE_KEYS = {"duck"}     # readme.pdf の例にのみ登場
UNVERIFIED_LFO_KEYS = {"mpy"}


class Report:
    def __init__(self) -> None:
        self.errors: list[str] = []
        self.warnings: list[str] = []
        self.notes: list[str] = []

    def error(self, msg: str) -> None:
        self.errors.append(msg)

    def warn(self, msg: str) -> None:
        self.warnings.append(msg)

    def note(self, msg: str) -> None:
        self.notes.append(msg)


# ---------------------------------------------------------------- wav 解析
def read_wav_format(path: Path) -> dict:
    """RIFF の fmt チャンクを読んでフォーマット情報を返す。壊れていれば error を含む dict。"""
    with path.open("rb") as f:
        head = f.read(12)
        if len(head) < 12 or head[0:4] != b"RIFF" or head[8:12] != b"WAVE":
            return {"error": "RIFF/WAVE ヘッダではない"}
        fmt = None
        data_bytes = None
        while True:
            hdr = f.read(8)
            if len(hdr) < 8:
                break
            cid, csize = struct.unpack("<4sI", hdr)
            body = f.read(csize)
            if cid == b"fmt ":
                fmt = body
            elif cid == b"data":
                data_bytes = csize
            if csize % 2:  # RIFF チャンクは偶数境界にパディングされる
                f.read(1)
            if fmt is not None and data_bytes is not None:
                break
        if fmt is None or len(fmt) < 16:
            return {"error": "fmt チャンクが見つからない"}

    tag, channels, rate, _brate, _align, bits = struct.unpack("<HHIIHH", fmt[:16])
    if tag == 0xFFFE and len(fmt) >= 40:  # WAVE_FORMAT_EXTENSIBLE
        tag = struct.unpack("<H", fmt[24:26])[0]
    return {
        "tag": tag, "channels": channels, "rate": rate, "bits": bits,
        "float": tag == 3,
        "duration": (data_bytes / (rate * channels * max(bits, 1) / 8))
        if data_bytes and rate and channels and bits else None,
    }


def check_wav(path: Path, rep: Report) -> None:
    if path.suffix.lower() != ".wav":
        rep.error(f"{path.name}: wav 以外は読み込まれない")
        return
    info = read_wav_format(path)
    if "error" in info:
        rep.error(f"{path.name}: {info['error']}")
        return

    tag, bits, rate, ch = info["tag"], info["bits"], info["rate"], info["channels"]
    ok_int = tag == 1 and bits in (8, 16, 24)
    ok_float = info["float"] and bits == 32
    if not (ok_int or ok_float):
        kind = "IEEE float" if info["float"] else f"format tag {tag}"
        rep.error(f"{path.name}: 非対応フォーマット（{bits}-bit / {kind}）"
                  f" — 対応は 8/16/24-bit PCM または 32-bit float")
    if rate > WAV_MAX_RATE:
        rep.error(f"{path.name}: サンプルレート {rate} Hz は上限 {WAV_MAX_RATE} Hz 超")
    if ch not in (1, 2):
        rep.error(f"{path.name}: {ch}ch は非対応（モノまたはステレオのみ）")

    dur = info["duration"]
    rep.note(f"{path.name}: {bits}-bit{'f' if info['float'] else ''} / {rate} Hz / "
             f"{'mono' if ch == 1 else 'stereo'} / "
             f"{dur:.2f}s / {path.stat().st_size:,} bytes"
             if dur else f"{path.name}: {bits}-bit / {rate} Hz / {ch}ch")


# ---------------------------------------------------------------- config 検証
def check_number(value, name: str, rng: tuple[float, float], where: str, rep: Report) -> None:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        rep.error(f"{where}: {name} は数値である必要がある（実際: {value!r}）")
        return
    lo, hi = rng
    if not (lo <= value <= hi):
        rep.error(f"{where}: {name} = {value} が範囲外（{lo} 〜 {hi}）")


def check_effect(eff: dict, where: str, rep: Report) -> str | None:
    """エフェクト 1 行を検証し、正規化したエフェクト名を返す。"""
    if not isinstance(eff, dict):
        rep.error(f"{where}: エフェクトはオブジェクトである必要がある")
        return None
    name = eff.get("effect")
    if name is None:
        rep.error(f"{where}: \"effect\" キーがない")
        return None
    if not isinstance(name, str):
        rep.error(f"{where}: \"effect\" は文字列である必要がある")
        return None
    if name != name.upper():
        rep.error(f"{where}: エフェクト名は大文字で書く（\"{name}\" → \"{name.upper()}\"）")
    key = name.upper()
    if key in ALIASES:
        rep.warn(f"{where}: \"{key}\" は同梱 readme.pdf の綴り。"
                 f"公式ガイド 1.1.1 は \"{ALIASES[key]}\"。どちらが実機で通るかは未検証")
        key = ALIASES[key]
    if key not in EFFECTS:
        rep.error(f"{where}: 未知のエフェクト \"{name}\"（有効: {', '.join(sorted(EFFECTS))}）")
        return None

    params = EFFECTS[key]
    for k, v in eff.items():
        if k in ("effect", "BUS"):
            continue
        if k not in params:
            rep.error(f"{where}: {key} に \"{k}\" というパラメータはない"
                      f"（有効: {', '.join(sorted(params)) or 'なし'}）")
            continue
        check_number(v, k, params[k], where, rep)

    if "BUS" in eff and eff["BUS"] not in (1, 2):
        rep.error(f"{where}: BUS は 1 または 2（実際: {eff['BUS']!r}）")
    return key


def check_modulation(mod: dict, kind: str, chain: list[str | None],
                     where: str, rep: Report) -> None:
    if not isinstance(mod, dict):
        rep.error(f"{where}.{kind}: オブジェクトである必要がある")
        return

    param = mod.get("param")
    target_lfo = mod.get("target") == "lfo"

    if "target" in mod and not target_lfo:
        rep.error(f"{where}.{kind}: \"target\" に使えるのは \"lfo\" のみ")

    if target_lfo:
        # LFO 自体を変調する（公式ガイド 7.9）。row は使わない。
        if "row" in mod:
            rep.warn(f"{where}.{kind}: \"target\": \"lfo\" のときは \"row\" は不要")
        if param not in ("speed", "depth", "phase"):
            rep.warn(f"{where}.{kind}: LFO への変調で \"{param}\" は"
                     f"ドキュメント化されていない（想定: speed / depth / phase）")
    else:
        row = mod.get("row")
        if not isinstance(row, int) or isinstance(row, bool):
            rep.error(f"{where}.{kind}: \"row\" が無いか整数でない")
            return
        if not (0 <= row < len(chain)):
            rep.error(f"{where}.{kind}: row {row} は list の範囲外"
                      f"（0 〜 {len(chain) - 1}）")
            return
        eff_name = chain[row]
        if eff_name and param not in EFFECTS[eff_name]:
            rep.error(f"{where}.{kind}: row {row} の {eff_name} に "
                      f"\"{param}\" というパラメータはない"
                      f"（有効: {', '.join(sorted(EFFECTS[eff_name]))}）")

    if "depth" in mod and (isinstance(mod["depth"], bool)
                           or not isinstance(mod["depth"], (int, float))):
        rep.error(f"{where}.{kind}: \"depth\" は数値である必要がある")

    if kind == "lfo":
        shape = mod.get("shape")
        if shape is not None and shape not in LFO_SHAPES:
            rep.error(f"{where}.lfo: 未知の shape \"{shape}\""
                      f"（有効: {', '.join(sorted(LFO_SHAPES))}）")
        for k in mod:
            if k in UNVERIFIED_LFO_KEYS:
                rep.warn(f"{where}.lfo: \"{k}\" は readme.pdf の例にのみ登場する未検証キー")


def check_preset(preset: dict, idx: int, rep: Report) -> None:
    where = f"presets[{idx}]"
    if not isinstance(preset, dict):
        rep.error(f"{where}: オブジェクトである必要がある")
        return
    if "name" in preset:
        where = f"presets[{idx}] \"{preset['name']}\""

    for k in preset:
        if k not in ("pos", "name", "comment", "list", "handle", "shake", "lfo", "trigger"):
            rep.warn(f"{where}: 未知のキー \"{k}\"")

    if "pos" in preset and preset["pos"] not in range(MAX_SLOTS):
        rep.error(f"{where}: pos は 0〜{MAX_SLOTS - 1}（実際: {preset['pos']!r}）")

    chain_raw = preset.get("list")
    if not isinstance(chain_raw, list) or not chain_raw:
        rep.error(f"{where}: \"list\" が無いか空")
        return

    chain = [check_effect(eff, f"{where}.list[{i}]", rep)
             for i, eff in enumerate(chain_raw)]

    for name in ONCE_PER_CHAIN:
        n = chain.count(name)
        if n > 1:
            rep.error(f"{where}: {name} が {n} 回使われている"
                      f"（1 チェーンにつき 1 回まで）")

    if "SAMPLE" not in chain:
        rep.warn(f"{where}: チェーンに {{\"effect\": \"SAMPLE\"}} が無いため"
                 f"サンプル音が出ない（意図的なら無視してよい）")
    elif chain.index("SAMPLE") != len(chain) - 1:
        rep.note(f"{where}: SAMPLE が row {chain.index('SAMPLE')} にあるため、"
                 f"後続のエフェクトがサンプルにもかかる（ドライにしたいなら最後に置く）")

    trig = preset.get("trigger")
    if trig is None:
        if "SAMPLE" in chain:
            rep.warn(f"{where}: \"trigger\" が無い"
                     f"（TE 公式パックは SAMPLE の row を必ず指定している）")
    elif not isinstance(trig, dict) or not isinstance(trig.get("row"), int):
        rep.error(f"{where}.trigger: {{\"row\": <整数>}} である必要がある")
    else:
        row = trig["row"]
        if not (0 <= row < len(chain)):
            rep.error(f"{where}.trigger: row {row} は list の範囲外（0 〜 {len(chain) - 1}）")
        elif chain[row] != "SAMPLE":
            rep.error(f"{where}.trigger: row {row} は {chain[row]} であって SAMPLE ではない"
                      f"（SAMPLE は row {chain.index('SAMPLE')}）"
                      if "SAMPLE" in chain else
                      f"{where}.trigger: row {row} は SAMPLE ではない")

    for kind in ("handle", "shake", "lfo"):
        if kind in preset:
            check_modulation(preset[kind], kind, chain, where, rep)


def check_samples(samples, pack_dir: Path, rep: Report) -> list[Path]:
    referenced: list[Path] = []
    if not isinstance(samples, list):
        rep.error("\"samples\" は配列である必要がある")
        return referenced
    if len(samples) > MAX_SLOTS:
        rep.error(f"samples は最大 {MAX_SLOTS} 件（実際: {len(samples)} 件）")

    used_pos: dict[int, int] = {}
    for i, s in enumerate(samples):
        where = f"samples[{i}]"
        if not isinstance(s, dict):
            rep.error(f"{where}: オブジェクトである必要がある")
            continue
        for k in s:
            if k in UNVERIFIED_SAMPLE_KEYS:
                rep.warn(f"{where}: \"{k}\" は readme.pdf の例にのみ登場する未検証キー")
            elif k not in ("pos", "file", "playmode"):
                rep.warn(f"{where}: 未知のキー \"{k}\"")

        pos = s.get("pos", i)
        if pos not in range(MAX_SLOTS):
            rep.error(f"{where}: pos は 0〜{MAX_SLOTS - 1}（実際: {pos!r}）")
        elif pos in used_pos:
            rep.error(f"{where}: スロット {pos} が samples[{used_pos[pos]}] と重複")
        else:
            used_pos[pos] = i

        pm = s.get("playmode")
        if pm is None:
            rep.warn(f"{where}: \"playmode\" 未指定")
        elif pm not in PLAYMODES:
            rep.error(f"{where}: 未知の playmode \"{pm}\""
                      f"（有効: {', '.join(sorted(PLAYMODES))}）")

        fname = s.get("file")
        if not isinstance(fname, str) or not fname:
            rep.error(f"{where}: \"file\" が無い")
            continue
        if "/" in fname or "\\" in fname:
            rep.warn(f"{where}: サブフォルダ付きパス \"{fname}\" は公式ガイド未記載・未検証。"
                     f"まずはルート直下で運用すること")
        target = pack_dir / fname
        if not target.exists():
            rep.error(f"{where}: ファイルが見つからない: {fname}")
        else:
            referenced.append(target)
    return referenced


# ---------------------------------------------------------------- 実行
def validate(target: Path, rep: Report) -> None:
    if target.is_dir():
        pack_dir, config_path = target, target / "config.json"
    else:
        pack_dir, config_path = target.parent, target

    # 実機に転送されるのは config.json と *.wav のみ（tools/deploy.sh と同じ規則）
    disk_files = sorted(
        p for p in pack_dir.iterdir()
        if p.is_file() and not p.name.startswith("._")
        and (p.suffix.lower() == ".wav" or p.name == "config.json")
    )
    ignored = sorted(
        p.name for p in pack_dir.iterdir()
        if p.is_file() and p not in disk_files and not p.name.startswith(".")
    )
    if ignored:
        rep.note(f"実機に転送されないファイル（config.json と *.wav 以外）: {', '.join(ignored)}")

    if not config_path.exists():
        rep.warn(f"{config_path} が無い。wav だけを 1.wav〜4.wav の名前で置く運用とみなす")
        cfg = None
    else:
        raw = config_path.read_text(encoding="utf-8")
        try:
            cfg = json.loads(raw)
        except json.JSONDecodeError as e:
            rep.error(f"config.json の JSON 構文エラー: {e.msg}（{e.lineno} 行 {e.colno} 文字目）")
            line = raw.splitlines()[e.lineno - 1] if e.lineno <= len(raw.splitlines()) else ""
            if line:
                rep.error(f"    {line.rstrip()}")
                rep.error(f"    {' ' * (e.colno - 1)}^")
            rep.error("    → このまま転送すると fx-mic は起動しなくなる")
            cfg = None

    referenced: list[Path] = []
    if isinstance(cfg, dict):
        for k in cfg:
            if k not in ("name", "samples", "presets"):
                rep.warn(f"トップレベルに未知のキー \"{k}\"")
        if "samples" in cfg:
            referenced = check_samples(cfg["samples"], pack_dir, rep)
        else:
            rep.note("\"samples\" が無いので工場出荷サンプルが使われる")

        presets = cfg.get("presets")
        if presets is None:
            rep.note("\"presets\" が無いので工場出荷プリセットが使われる")
        elif not isinstance(presets, list):
            rep.error("\"presets\" は配列である必要がある")
        else:
            if len(presets) > MAX_SLOTS:
                rep.error(f"presets は最大 {MAX_SLOTS} 件（実際: {len(presets)} 件）")
            used: dict[int, int] = {}
            for i, p in enumerate(presets):
                check_preset(p, i, rep)
                if isinstance(p, dict) and isinstance(p.get("pos"), int):
                    if p["pos"] in used:
                        rep.error(f"presets[{i}]: pos {p['pos']} が presets[{used[p['pos']]}] と重複")
                    used[p["pos"]] = i
    elif cfg is not None:
        rep.error("config.json のトップレベルはオブジェクト {} である必要がある")

    # wav のフォーマット検証
    wavs = [p for p in disk_files if p.suffix.lower() == ".wav"]
    for w in wavs:
        check_wav(w, rep)

    # config.json が samples を持たない場合の命名規約
    if isinstance(cfg, dict) and "samples" not in cfg:
        for w in wavs:
            if w.stem not in ("1", "2", "3", "4"):
                rep.warn(f"{w.name}: config.json に \"samples\" が無いので、"
                         f"1.wav〜4.wav 以外は読み込まれない")
    unreferenced = [w for w in wavs if referenced and w not in referenced]
    for w in unreferenced:
        if w.stem not in ("1", "2", "3", "4"):
            rep.warn(f"{w.name}: config.json から参照されていない（容量だけ消費する）")

    # 容量
    total = sum(p.stat().st_size for p in disk_files)
    rep.note(f"ディスクに転送されるファイル: {len(disk_files)} 件 / 合計 {total:,} bytes "
             f"({total / DISK_BUDGET * 100:.0f}% of 1 MB)")
    if total > DISK_BUDGET:
        rep.error(f"合計 {total:,} bytes が 1 MB 予算（{DISK_BUDGET:,}）を超えている")
    elif total > BUDGET_WARN:
        rep.warn(f"合計 {total:,} bytes は 1 MB 予算のほぼ上限。余裕を持たせることを推奨")


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print(__doc__)
        return 2
    target = Path(argv[1])
    if not target.exists():
        print(f"✗ 見つからない: {target}", file=sys.stderr)
        return 2

    rep = Report()
    validate(target, rep)

    for n in rep.notes:
        print(f"  · {n}")
    for w in rep.warnings:
        print(f"⚠️  {w}")
    for e in rep.errors:
        print(f"✗  {e}")

    print()
    if rep.errors:
        print(f"✗ {target}: エラー {len(rep.errors)} 件 / 警告 {len(rep.warnings)} 件"
              f" — 修正するまで転送しないこと")
        return 1
    print(f"✓ {target}: OK（警告 {len(rep.warnings)} 件）")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
