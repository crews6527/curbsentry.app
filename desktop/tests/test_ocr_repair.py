from datetime import datetime, timedelta, timezone
import hashlib
import json
from pathlib import Path
import shutil
import sqlite3
import subprocess
import tempfile
import time
import unittest
from unittest.mock import patch
from curbsentry.ocr import MODEL_SHA256, diagnostics, model_directory, parse_candidates, scan_options
from curbsentry.storage import Store
from curbsentry.worker import Jobs, process

FRAME = dict(name="frame-001.jpg", offset_seconds=0.25)
BASE = (datetime.now(timezone.utc) - timedelta(days=2)).isoformat()

def tsv(words):
    header = "level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext\n"
    return header + "\n".join(f"5\t1\t1\t1\t1\t{i}\t{left}\t10\t{width}\t30\t{conf}\t{text}"
                                 for i,(text,left,width,conf) in enumerate(words,1))

class ParsingTests(unittest.TestCase):
    def test_split_plate_joins_on_same_line(self):
        reads=parse_candidates(tsv([("ABC",0,60,91),("1234",75,80,89)]),FRAME)
        self.assertEqual([r["plate"] for r in reads],["ABC1234"])
        self.assertEqual(reads[0]["confidence"],89)
        self.assertEqual(reads[0]["status"],"unconfirmed")

    def test_overlay_punctuation_low_confidence_and_large_gap_rejected(self):
        for words in [[("9CDT",0,60,40)],[("12:30PM",0,60,95)],[("ABC",0,60,90),("1234",300,80,90)]]:
            self.assertEqual(parse_candidates(tsv(words),FRAME),[])

    def test_headerless_output_and_plate_only_numeric(self):
        data=tsv([("123456",0,180,92)])
        self.assertEqual(parse_candidates(data,FRAME),[])
        self.assertEqual(parse_candidates(data.split('\n',1)[1],FRAME,True)[0]["plate"],"123456")

    def test_plate_only_requires_close_crop_and_finite_input(self):
        with self.assertRaises(ValueError):scan_options(scan_options()|dict(plate_only=True))
        for change in (dict(x=float('nan')),dict(width=101),dict(y=-1),dict(plate_only=1)):
            with self.assertRaises(ValueError):scan_options(scan_options()|change)

class StorageMigrationTests(unittest.TestCase):
    def test_existing_database_migrates_without_losing_data(self):
        with tempfile.TemporaryDirectory() as temp:
            store=Store(temp)
            event=store.save_sighting(dict(plate="TEST428",capture_iso=BASE,camera="Test"))
            with sqlite3.connect(store.path) as con:
                con.execute("ALTER TABLE clips DROP COLUMN scan_options")
            reopened=Store(temp)
            self.assertEqual(reopened.snapshot()["sightings"][0]["id"],event["id"])
            with reopened.db() as con:
                self.assertIn("scan_options",{r[1] for r in con.execute("PRAGMA table_info(clips)")})

    def test_partial_reads_survive_rescan_failure_without_repeat_counts(self):
        with tempfile.TemporaryDirectory() as temp:
            store=Store(temp);source=Path(temp)/"upload";source.write_bytes(b"synthetic")
            clip=store.add_clip(source,"test.mp4",BASE,"Test")["id"]
            candidate=dict(plate="TEST428",confidence=90,frame=FRAME["name"],offset_seconds=.25,status="unconfirmed",frame_count=2)
            store.clip_status(clip,"processing",frames=[FRAME],candidates=[candidate])
            store.clip_status(clip,"needs_ocr",frames=[FRAME],candidates=[],error="OCR tool failed")
            self.assertEqual(json.loads(store.clip(clip)["candidates"]),[candidate])
            self.assertEqual(store.snapshot()["sightings"],[])
            self.assertEqual(store.alerts(),[])

    def test_ready_recording_can_rescan_without_another_upload(self):
        with tempfile.TemporaryDirectory() as temp:
            store=Store(temp);source=Path(temp)/"upload";source.write_bytes(b"synthetic")
            clip=store.add_clip(source,"test.mp4",BASE,"Test")["id"]
            store.clip_status(clip,"ready")
            jobs=Jobs(store,{})
            try:
                with self.assertRaises(ValueError):jobs.enqueue(clip)
                jobs.enqueue(clip,scan_options()|dict(width=20,height=20,plate_only=True),rescan=True)
            finally:jobs.close()
            self.assertEqual(len(store.snapshot()["clips"]),1)
            self.assertTrue(json.loads(store.clip(clip)["scan_options"])["plate_only"])

@unittest.skipUnless(shutil.which("ffmpeg") and shutil.which("tesseract"),"FFmpeg/Tesseract absent")
class RealOcrTests(unittest.TestCase):
    def video(self,root):
        subprocess.run([shutil.which("ffmpeg"),"-v","error","-f","lavfi","-i","color=c=white:s=1280x720:d=2",
                        "-vf","drawtext=text='ABC 1234':fontsize=72:fontcolor=black:x=300:y=300",
                        "-c:v","libx264","-pix_fmt","yuv420p",str(root/"original.mp4")],
                       check=True,capture_output=True,timeout=15)

    def test_bundled_english_model_and_real_engine_health(self):
        with tempfile.TemporaryDirectory() as temp:
            folder=model_directory(temp)
            self.assertEqual(hashlib.sha256((folder/"eng.traineddata").read_bytes()).hexdigest(),MODEL_SHA256)
            self.assertTrue(diagnostics({},temp)["ready"])
            failed=diagnostics(dict(tesseract="/missing/tesseract"),temp)
            self.assertFalse(failed["ready"])
            self.assertFalse(failed["checks"]["ocr_engine"]["ok"])

    def test_real_split_plate_rescan_preserves_evidence_frames(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);self.video(root)
            model=model_directory(root)
            full=process(root,shutil.which("ffmpeg"),shutil.which("tesseract"),tessdata=model)
            self.assertTrue(full["ocr_complete"],full["warning"])
            self.assertIn("ABC1234",[c["plate"] for c in full["candidates"]])
            hashes={f["name"]:hashlib.sha256((root/f["name"]).read_bytes()).hexdigest() for f in full["frames"]}
            focused=scan_options()|dict(x=20,y=38,width=40,height=14,plate_only=True)
            rescan=process(root,shutil.which("ffmpeg"),shutil.which("tesseract"),focused,full["frames"],model)
            self.assertTrue(rescan["ocr_complete"],rescan["warning"])
            self.assertIn("ABC1234",[c["plate"] for c in rescan["candidates"]])
            self.assertEqual(rescan["frames"],full["frames"])
            for name,digest in hashes.items():
                self.assertEqual(hashlib.sha256((root/name).read_bytes()).hexdigest(),digest)

    def test_missing_tesseract_is_not_a_successful_ocr_scan(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);self.video(root)
            result=process(root,shutil.which("ffmpeg"))
            self.assertFalse(result["ocr_complete"])
            self.assertIn("did not run",result["warning"])
            self.assertTrue(result["frames"])
            self.assertTrue((root/"original.mp4").is_file())

    def test_cancel_after_read_retains_automatically_saved_candidates(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);store=Store(root/"data");self.video(root)
            clip=store.add_clip(root/"original.mp4","clip.mp4",BASE,"Test")["id"]
            real_popen=subprocess.Popen
            def worker(*args,**kwargs):
                import sys
                directory=store.root/"media"/clip
                payload=dict(frames=[FRAME],candidates=[dict(plate="TEST428",confidence=90,frame=FRAME["name"],offset_seconds=.25,status="unconfirmed",frame_count=1)],duration_seconds=2,warning="",ocr_complete=False,processed_frames=1)
                script="from pathlib import Path; import time; p=Path("+repr(str(directory))+ "); (p/'result.json').write_text("+repr(json.dumps(payload))+"); time.sleep(20)"
                return real_popen([sys.executable,"-c",script],**kwargs)
            jobs=Jobs(store,{})
            try:
                with patch("curbsentry.worker.subprocess.Popen",side_effect=worker):
                    jobs.enqueue(clip)
                    deadline=time.monotonic()+5
                    while not json.loads(store.clip(clip)["candidates"]) and time.monotonic()<deadline:time.sleep(.05)
                    self.assertTrue(json.loads(store.clip(clip)["candidates"]))
                    jobs.cancel(clip)
                    while store.clip(clip)["status"]!="cancelled" and time.monotonic()<deadline:time.sleep(.05)
                self.assertEqual(store.clip(clip)["status"],"cancelled")
                self.assertEqual(json.loads(store.clip(clip)["candidates"])[0]["plate"],"TEST428")
                self.assertTrue((store.root/"media"/clip/"original.mp4").is_file())
            finally:jobs.close()

if __name__ == "__main__":unittest.main()
