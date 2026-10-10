"""Local OCR preparation, dependency checks and plate candidate parsing."""
from __future__ import annotations
import csv
import gzip
import hashlib
import io
import math
from pathlib import Path
import re
import tempfile

MODEL_SHA256 = "7d4322bd2a7749724879683fc3912cb542f19906c83bcc1a52132556427170b2"
MODEL = Path(__file__).resolve().parents[2] / "public/ocr/eng.traineddata.gz"
DEFAULT_SCAN = dict(x=0, y=0, width=100, height=100, plate_only=False)


def scan_options(value=None):
    value = DEFAULT_SCAN.copy() if value is None else value
    if not isinstance(value, dict) or set(value) != set(DEFAULT_SCAN):
        raise ValueError("Invalid scan area. Use left, top, width and height percentages.")
    for key in ("x", "y", "width", "height"):
        if type(value[key]) not in (int, float) or not math.isfinite(value[key]):
            raise ValueError("Scan area values must be finite numbers.")
    if (value["x"] < 0 or value["y"] < 0 or value["width"] < 1 or value["height"] < 1
            or value["x"] + value["width"] > 100 or value["y"] + value["height"] > 100):
        raise ValueError("The scan area must fit inside the picture (0 to 100 percent).")
    if type(value["plate_only"]) is not bool:
        raise ValueError("Invalid plate-only setting.")
    if value["plate_only"] and value["width"] * value["height"] > 2500:
        raise ValueError("For plate-only reading, select a close area around the plate, under one quarter of the picture.")
    return dict(value)


def model_directory(root):
    """Reuse the repository's English model; never download at startup."""
    folder = Path(root) / "ocr"
    target = folder / "eng.traineddata"
    if target.is_file() and hashlib.sha256(target.read_bytes()).hexdigest() == MODEL_SHA256:
        return folder
    if not MODEL.is_file():
        raise RuntimeError("The English OCR model is missing. Extract the complete CurbSentry package, including public/ocr.")
    with gzip.open(MODEL, "rb") as source:
        data = source.read(16 * 1024 * 1024 + 1)
    if hashlib.sha256(data).hexdigest() != MODEL_SHA256:
        raise RuntimeError("The bundled English OCR model failed its checksum. Extract a fresh backup.")
    folder.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(dir=folder, suffix=".tmp", delete=False) as output:
        temporary = Path(output.name)
        output.write(data)
    try:
        temporary.replace(target)
    finally:
        temporary.unlink(missing_ok=True)
    return folder


def parse_candidates(output, frame, plate_only=False):
    lines = output.strip().splitlines()
    fields = "level page_num block_num par_num line_num word_num left top width height conf text".split()
    if lines and lines[0].startswith("level\t"):
        lines = lines[1:]
    groups = {}
    for row in csv.DictReader(io.StringIO("\n".join(lines)), fieldnames=fields, delimiter="\t"):
        raw = row.get("text") or ""
        if row.get("level") != "5" or not re.fullmatch(r"[A-Za-z0-9 -]+", raw):
            continue
        try:
            confidence = float(row["conf"])
            left, width, height = (float(row[k]) for k in ("left", "width", "height"))
        except (ValueError, TypeError):
            continue
        if not all(math.isfinite(n) for n in (confidence, left, width, height)) or confidence < 65:
            continue
        token = re.sub(r"[^A-Z0-9]", "", raw.upper())
        if not token:
            continue
        group = tuple(row[k] for k in ("page_num", "block_num", "par_num", "line_num"))
        groups.setdefault(group, []).append((left, width, height, token, confidence))
    found = {}
    for words in groups.values():
        words.sort()
        for i in range(len(words)):
            token, confidence = "", 100
            for j in range(i, min(i + 3, len(words))):
                if j > i and words[j][0] - words[j-1][0] - words[j-1][1] > max(words[j][2], words[j-1][2]) * 1.5:
                    break
                token += words[j][3]
                confidence = min(confidence, words[j][4])
                if len(token) > 8:
                    break
                if not re.fullmatch(r"[A-Z0-9]{4,8}", token):
                    continue
                if not plate_only and not (re.search(r"[A-Z]", token) and re.search(r"\d", token)):
                    continue
                previous = found.get(token)
                if previous is None or confidence > previous["confidence"]:
                    found[token] = dict(plate=token, confidence=round(confidence, 1),
                                        frame=frame["name"], offset_seconds=frame["offset_seconds"],
                                        status="unconfirmed", frame_count=1)
    return list(found.values())[:100]


def diagnostics(config, root):
    from .worker import executable, run
    checks = {}
    resolved = {}
    for name, argument in (("ffmpeg", "-version"), ("ffprobe", "-version"), ("tesseract", "--version")):
        configured = config.get(name, "")
        if name == "ffprobe" and config.get("ffmpeg"):
            configured = str(Path(config["ffmpeg"]).with_name("ffprobe.exe" if __import__("os").name == "nt" else "ffprobe"))
        path = executable(name, configured)
        resolved[name] = path
        try:
            if not path:
                raise RuntimeError(f"{name} was not found. Run Configure-Video-Tools.cmd.")
            version = run([path, argument], 3).splitlines()[0][:180]
            checks[name] = dict(ok=True, version=version)
        except Exception as exc:
            checks[name] = dict(ok=False, message=f"{name} could not run. Configure its executable and check the installation.", detail=type(exc).__name__)
    try:
        folder = model_directory(root)
        checks["english_model"] = dict(ok=True, sha256=MODEL_SHA256)
        if resolved["tesseract"] and checks["tesseract"]["ok"]:
            # --list-langs does not prove the model can initialize. Decode a small
            # blank image with the actual bundled LSTM model instead.
            with tempfile.NamedTemporaryFile(dir=folder,suffix=".pgm",delete=False) as output:
                image = Path(output.name)
                output.write(b"P5\n64 32\n255\n" + b"\xff" * (64 * 32))
            try:
                run([resolved["tesseract"], str(image), "stdout", "--tessdata-dir", str(folder),
                     "--oem", "1", "--psm", "7", "-l", "eng"], 5)
                checks["ocr_engine"] = dict(ok=True)
            finally:
                image.unlink(missing_ok=True)
        else:
            checks["ocr_engine"] = dict(ok=False, message="Install and configure Tesseract to enable automatic plate reads.")
    except Exception as exc:
        checks["english_model"] = dict(ok=False, message=str(exc)[:240])
        checks["ocr_engine"] = dict(ok=False, message="The local English OCR engine could not initialize.")
    return dict(schema_version=1, ready=all(v["ok"] for v in checks.values()), checks=checks)
