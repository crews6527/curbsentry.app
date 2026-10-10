"""Executed only for a queued clip, in an isolated, cancellable process tree."""
from __future__ import annotations
import argparse
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import threading
import time
import tempfile
from .ocr import model_directory, parse_candidates, scan_options

def executable(name, configured=""):
    if configured:
        p = Path(configured)
        return str(p) if p.is_absolute() and p.is_file() else None
    found = shutil.which(name)
    if found: return found
    if os.name == "nt" and name == "tesseract":
        p = Path(os.environ.get("ProgramFiles", "C:/Program Files")) / "Tesseract-OCR/tesseract.exe"
        if p.is_file(): return str(p)
    return None

def run(args, timeout=30):
    env = os.environ.copy()
    env["OMP_THREAD_LIMIT"] = "2"
    result = subprocess.run(args, stdin=subprocess.DEVNULL, capture_output=True,
                            timeout=timeout, env=env, shell=False)
    if result.returncode:
        raise RuntimeError(result.stderr.decode("utf-8",errors="replace")[-1000:] or "Video command failed.")
    return result.stdout.decode("utf-8",errors="replace")

def write_result(directory, result):
    temporary = directory / "result.tmp"
    temporary.write_text(json.dumps(result), encoding="utf-8")
    temporary.replace(directory / "result.json")

def process(directory, ffmpeg, tesseract=None, options=None, reuse_frames=None, tessdata=None):
    directory = Path(directory)
    options = scan_options(options)
    original = next(directory.glob("original.*"))
    probe = Path(ffmpeg).with_name("ffprobe.exe" if os.name == "nt" else "ffprobe")
    if not probe.is_file():
        found = shutil.which("ffprobe")
        if not found: raise RuntimeError("Install ffprobe together with FFmpeg.")
        probe = Path(found)
    meta = json.loads(run([str(probe),"-v","error","-protocol_whitelist","file,pipe","-show_entries","format=duration:stream=codec_type","-of","json",str(original)],15))
    duration = float(meta["format"]["duration"])
    if not 0 < duration <= 600 or not any(s.get("codec_type")=="video" for s in meta.get("streams",[])):
        raise ValueError("Use a video recording of at most ten minutes. Split longer recordings first.")
    interval = max(0.5, duration/60)
    if reuse_frames:
        # Keep the original evidence and offsets for previously saved sightings.
        frames = reuse_frames
        if len(frames)>60 or any(not re.fullmatch(r"frame-\d{3}\.jpg",f["name"]) or not (directory/f["name"]).is_file()
                                   or not 0 <= float(f["offset_seconds"]) <= duration for f in frames):
            raise ValueError("Saved review frames need attention. Original recording retained.")
    else:
        for stale in directory.glob("frame-*.jpg"):
            stale.unlink()
        run([ffmpeg,"-hide_banner","-loglevel","error","-nostdin","-y","-threads","2",
             "-protocol_whitelist","file,pipe","-i",str(original),"-an","-sn","-dn","-filter_threads","1",
             "-vf",f"fps=1/{interval}",
             "-frames:v","60","-q:v","2",str(directory/"frame-%03d.jpg")],90)
        frames = [dict(name=p.name,offset_seconds=round(min(duration, (i+0.5)*interval),3))
                  for i,p in enumerate(sorted(directory.glob("frame-*.jpg")))]
    # fps samples near each interval midpoint; these are approximate review offsets.
    if not frames: raise RuntimeError("No review frames could be extracted from this recording.")
    result = dict(frames=frames, candidates=[], duration_seconds=duration, warning="",
                  ocr_complete=False, processed_frames=0, scan_options=options)
    write_result(directory, result)
    if not tesseract:
        result["warning"] = "Automatic plate recognition did not run: Tesseract was not found. Run Configure-Video-Tools.cmd, then Rescan plate area. Original video and review frames retained."
        write_result(directory, result)
        return result
    candidates = {}
    with tempfile.TemporaryDirectory(prefix="curb-ocr-") as temporary:
        for frame in frames:
            try:
                image = directory / frame["name"]
                if options != scan_options():
                    # Crop/upscale a temporary OCR image without altering evidence.
                    target = Path(temporary) / "plate.png"
                    filters = f"crop=iw*{options['width']/100}:ih*{options['height']/100}:iw*{options['x']/100}:ih*{options['y']/100},scale=w='min(1920,iw*2)':h='min(1920,ih*2)':force_original_aspect_ratio=decrease,format=gray,pad=iw+40:ih+40:20:20:white"
                    run([ffmpeg,"-v","error","-nostdin","-y","-threads","2","-filter_threads","1","-i",str(image),
                         "-vf",filters,"-frames:v","1",str(target)],8)
                    image = target
                args = [tesseract,str(image),"stdout","--oem","1","--psm","7" if options["plate_only"] else "11","-l","eng","--dpi","300"]
                if tessdata:
                    args.extend(["--tessdata-dir", str(tessdata)])
                # Keep native word scores: a strict character whitelist can join
                # spaced characters into a zero-confidence word in Tesseract 5.
                # The parser already accepts only plate-shaped letters/digits.
                # The bundled data intentionally omits Tesseract config files.
                args.extend(["-c","tessedit_create_tsv=1"])
                output = run(args,8)
                for candidate in parse_candidates(output, frame, options["plate_only"]):
                    old = candidates.get(candidate["plate"])
                    if old:
                        candidate["frame_count"] = old["frame_count"] + 1
                        if old["confidence"] > candidate["confidence"]:
                            candidate = old | dict(frame_count=candidate["frame_count"])
                    if old or len(candidates)<100:
                        candidates[candidate["plate"]] = candidate
                result["candidates"] = list(candidates.values())
                result["processed_frames"] += 1
                write_result(directory, result)
            except Exception as exc:
                result["warning"] = "Automatic OCR incomplete: " + str(exc)[:400]
                write_result(directory, result)
                return result
    result["ocr_complete"] = True
    write_result(directory, result)
    return result

def kill_tree(process):
    if process.poll() is not None: return
    if os.name == "nt":
        subprocess.run(["taskkill","/PID",str(process.pid),"/T","/F"],capture_output=True,timeout=10,shell=False)
    else:
        import signal
        try: os.killpg(process.pid,signal.SIGKILL)
        except ProcessLookupError: pass
    process.wait(timeout=10)

class Jobs:
    def __init__(self, store, config, deadline=180):
        self.store, self.config, self.deadline = store, config, deadline
        self.condition = threading.Condition()
        self.queue, self.cancelled = [], set()
        self.stopping = False
        self.active = None
        self.thread = threading.Thread(target=self._loop,name="CurbSentry jobs",daemon=True)
        self.thread.start()

    def enqueue(self, clip_id, options=None, rescan=False):
        with self.condition:
            c = self.store.clip(clip_id)
            if clip_id in self.queue or (self.active and self.active[0]==clip_id): return
            if c["status"]=="ready" and not rescan: raise ValueError("This recording is already processed. Choose Rescan plate area to retry OCR.")
            self.store.set_scan_options(clip_id, options if options is not None else json.loads(c["scan_options"]))
            self.cancelled.discard(clip_id)
            self.store.clip_status(clip_id,"queued")
            self.queue.append(clip_id)
            self.condition.notify()

    def cancel(self, clip_id):
        with self.condition:
            self.store.clip(clip_id)
            self.cancelled.add(clip_id)
            if clip_id in self.queue:
                self.queue.remove(clip_id)
                self.store.clip_status(clip_id,"cancelled",error="Cancelled before processing.")

    def _loop(self):
        while True:
            with self.condition:
                self.condition.wait_for(lambda:self.queue or self.stopping)
                if self.stopping: return
                clip_id = self.queue.pop(0)
                self.active = (clip_id,None)
            directory = self.store.root/"media"/clip_id
            result_path = directory/"result.json"
            previous = self.store.clip(clip_id)
            options = json.loads(previous["scan_options"])
            request = dict(options=options, frames=json.loads(previous["frames"]))
            (directory/"scan-request.json").write_text(json.dumps(request),encoding="utf-8")
            result_path.unlink(missing_ok=True)
            last_progress = None
            def progress():
                nonlocal last_progress
                if not result_path.is_file(): return None
                result = json.loads(result_path.read_text(encoding="utf-8"))
                signature = (result.get("processed_frames"),result.get("warning"),result.get("ocr_complete"))
                if signature != last_progress:
                    self.store.clip_status(clip_id,"processing",frames=result["frames"],candidates=result["candidates"],error=result["warning"])
                    last_progress = signature
                return result
            try:
                ff = executable("ffmpeg",self.config.get("ffmpeg",""))
                if not ff: raise RuntimeError("FFmpeg was not found. Set its absolute path in config.json, then retry.")
                tess = executable("tesseract",self.config.get("tesseract",""))
                self.store.clip_status(clip_id,"processing")
                args=[sys.executable,"-m","curbsentry.worker","--directory",str(directory),"--ffmpeg",ff]
                if tess:
                    args.extend(["--tesseract",tess,"--tessdata",str(model_directory(self.store.root))])
                kwargs = dict(start_new_session=True) if os.name != "nt" else dict(creationflags=subprocess.CREATE_NEW_PROCESS_GROUP)
                with (directory/"worker.log").open("wb") as log:
                    p = subprocess.Popen(args,cwd=Path(__file__).resolve().parents[1],stdin=subprocess.DEVNULL,stdout=log,stderr=log,shell=False,**kwargs)
                    with self.condition: self.active=(clip_id,p)
                    started=time.monotonic()
                    while p.poll() is None:
                        progress()
                        with self.condition:
                            cancel = self.stopping or clip_id in self.cancelled
                        if cancel or time.monotonic()-started > self.deadline:
                            kill_tree(p)
                            progress()
                            if cancel:
                                self.store.clip_status(clip_id,"cancelled",error="Processing cancelled. Original video retained.")
                            else:
                                self.store.clip_status(clip_id,"error",error="Processing exceeded its deadline. Original video retained.")
                            break
                        time.sleep(0.1)
                    else:
                        if p.returncode:
                            raise RuntimeError((directory/"worker.log").read_text(errors="replace")[-1000:])
                        result=progress()
                        self.store.clip_status(clip_id,"ready" if result["ocr_complete"] else "needs_ocr",frames=result["frames"],candidates=result["candidates"],error=result["warning"])
            except Exception as exc:
                self.store.clip_status(clip_id,"error",error=str(exc))
            finally:
                with self.condition: self.active=None

    def close(self):
        with self.condition:
            self.stopping=True
            for clip_id in self.queue:
                self.store.clip_status(clip_id,"interrupted",error="Service closed. Retry this recording.")
            self.queue.clear()
            self.condition.notify_all()
        self.thread.join(timeout=15)

if __name__ == "__main__":
    parser=argparse.ArgumentParser()
    parser.add_argument("--directory",required=True)
    parser.add_argument("--ffmpeg",required=True)
    parser.add_argument("--tesseract")
    parser.add_argument("--tessdata")
    args=parser.parse_args()
    request = json.loads(Path(args.directory,"scan-request.json").read_text(encoding="utf-8"))
    process(args.directory,args.ffmpeg,args.tesseract,request["options"],request["frames"],args.tessdata)
