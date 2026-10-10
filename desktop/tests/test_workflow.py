from datetime import datetime,timedelta,timezone
import hashlib
import http.client
import json
from pathlib import Path
import shutil
import subprocess
import tempfile
import threading
import time
import unittest
from unittest.mock import patch
from curbsentry.storage import Store,DEFAULTS
from curbsentry.server import Server
from curbsentry.worker import Jobs,process,kill_tree

BASE=datetime.now(timezone.utc)-timedelta(days=2)

class StoreTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.root=Path(self.temp.name);self.store=Store(self.root)
    def tearDown(self):self.temp.cleanup()
    def log(self,minutes=0,**extra):
        return self.store.save_sighting(dict(plate="TEST428",capture_iso=(BASE+timedelta(minutes=minutes)).isoformat(),camera="Front door",**extra))
    def test_capture_time_not_upload_time(self):
        for minutes in (0,30,240):self.log(minutes)
        self.assertEqual(self.store.alerts(),[])
    def test_repeat_alert_at_historical_capture_time(self):
        for minutes in (0,10,20):self.log(minutes)
        a=self.store.alerts()[0]
        self.assertEqual(a["count"],3);self.assertEqual(a["capture_iso"],(BASE+timedelta(minutes=20)).isoformat())
    def test_future_time_rejected(self):
        with self.assertRaises(ValueError):self.store.save_sighting(dict(plate="TEST428",capture_iso=(datetime.now(timezone.utc)+timedelta(hours=1)).isoformat(),camera="Front door"))
    def test_naive_time_rejected(self):
        with self.assertRaises(ValueError):self.store.save_sighting(dict(plate="TEST428",capture_iso="2026-09-11T12:00:00",camera="Front door"))
    def test_out_of_order_recordings_recalculate(self):
        for minutes in (30,0,15):self.log(minutes)
        self.assertEqual(len(self.store.alerts()),1)
    def test_ignore_withdraws_alert_and_keeps_evidence(self):
        ids=[self.log(x) for x in (0,10,20)]
        self.store.set_known(ids[0]["vehicle_id"],True,"Household")
        self.assertEqual(self.store.alerts(),[]);self.assertEqual(len(self.store.snapshot()["sightings"]),3)
        self.assertTrue(self.log(30)["ignored"])
    def test_known_list_before_first_observation(self):
        vid=self.store.add_known(dict(plate="TEST428",label="Neighbor"))["vehicle_id"]
        for m in (0,10,20):self.assertTrue(self.log(m)["ignored"])
        self.assertEqual(self.store.alerts(),[]);self.assertEqual(self.store.snapshot()["vehicles"][0]["id"],vid)
    def test_unknown_vehicle_link_and_later_plate(self):
        first=self.store.save_sighting(dict(color="Blue",model="Sedan",capture_iso=BASE.isoformat(),camera="Front door"))
        for m in (10,20):self.store.save_sighting(dict(vehicle_id=first["vehicle_id"],capture_iso=(BASE+timedelta(minutes=m)).isoformat(),camera="Front door"))
        self.assertIsNone(self.store.alerts()[0]["plate"])
        self.store.save_sighting(dict(id=first["id"],vehicle_id=first["vehicle_id"],plate="TEST428",capture_iso=BASE.isoformat(),camera="Front door"))
        self.assertEqual(self.store.alerts()[0]["plate"],"TEST428")
    def test_appearance_alone_does_not_merge(self):
        for m in (0,10,20):self.store.save_sighting(dict(color="Blue",capture_iso=(BASE+timedelta(minutes=m)).isoformat(),camera="Front door"))
        self.assertEqual(len(self.store.snapshot()["vehicles"]),3);self.assertEqual(self.store.alerts(),[])
    def test_duplicate_video_uses_content_digest(self):
        for n in range(2):
            source=self.root/f"upload{n}";source.write_bytes(b"identical-video-bytes")
            result=self.store.add_clip(source,f"renamed{n}.mp4",BASE.isoformat(),"Front door")
            self.assertEqual(result["duplicate"],bool(n))
        self.assertEqual(len(self.store.snapshot()["clips"]),1)
    def test_one_vehicle_per_clip_count(self):
        source=self.root/"upload";source.write_bytes(b"video")
        clip=self.store.add_clip(source,"clip.mp4",BASE.isoformat(),"Front door")["id"]
        first=self.store.save_sighting(dict(plate="TEST428",clip_id=clip,offset_seconds=1))
        with self.assertRaises(ValueError):self.store.save_sighting(dict(plate="TEST428",clip_id=clip,offset_seconds=2))
        self.store.save_sighting(dict(id=first["id"],plate="TEST428",clip_id=clip,offset_seconds=2))
        self.assertEqual(len(self.store.snapshot()["sightings"]),1)
    def test_excluding_overlap_withdraws_alert(self):
        ids=[self.log(m) for m in (0,10,20)]
        self.log(20,id=ids[-1]["id"],included=False)
        self.assertEqual(self.store.alerts(),[])
    def test_school_threshold_uses_captured_local_offset(self):
        self.store.settings(DEFAULTS|dict(bus_enabled=True,bus_days=list(range(7))))
        t=(BASE-timedelta(days=1)).replace(hour=14,minute=40,tzinfo=timezone(timedelta(hours=-5)))
        for m in (0,10):self.store.save_sighting(dict(plate="TEST428",capture_iso=(t+timedelta(minutes=m)).isoformat(),camera="Front door"))
        self.assertEqual(self.store.alerts()[0]["count"],2);self.assertTrue(self.store.alerts()[0]["school_window"])
    def test_acknowledgement_survives_rule_recalculation(self):
        for m in (0,10,20):self.log(m)
        self.store.acknowledge(self.store.alerts()[0]["id"]);self.store.settings(DEFAULTS)
        self.assertTrue(self.store.alerts()[0]["acknowledged"])
    def test_data_survives_restart(self):
        self.log();self.assertEqual(len(Store(self.root).snapshot()["sightings"]),1)
        self.assertTrue(list((self.root/"backups").glob("*.sqlite3")))
    def test_empty_description_rejected(self):
        with self.assertRaises(ValueError):self.store.save_sighting(dict(capture_iso=BASE.isoformat(),camera="Front door"))
    def test_plate_length_consistent(self):
        for p in ("AB","123456789","AB@123"):
            with self.assertRaises(ValueError):self.store.add_known(dict(plate=p))
    def test_data_lock_prevents_second_instance(self):
        from main import DataLock
        lock=DataLock(self.root)
        try:
            with self.assertRaises(RuntimeError):DataLock(self.root)
        finally:lock.close()
        DataLock(self.root).close()
    def test_restore_preserves_current_data_and_rejects_traversal(self):
        from restore_backup import restore
        import zipfile
        self.log()
        backup_db=self.store.backup_database()
        source=self.root.parent/(self.root.name+".zip")
        with zipfile.ZipFile(source,"w") as z:z.write(backup_db,"curbsentry.sqlite3")
        self.log(10)
        try:
            preserved=restore(source,self.root)
            self.assertEqual(len(Store(self.root).snapshot()["sightings"]),1)
            self.assertEqual(len(Store(preserved).snapshot()["sightings"]),2)
            with zipfile.ZipFile(source,"w") as z:
                z.write(backup_db,"curbsentry.sqlite3");z.writestr("../unsafe.txt","unsafe")
            with self.assertRaises(ValueError):restore(source,self.root)
        finally:
            source.unlink(missing_ok=True)
            if 'preserved' in locals():shutil.rmtree(preserved)

class ApiTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.store=Store(self.temp.name)
        self.config=dict(owner_token="a"*64,read_token="b"*64)
        self.jobs=unittest.mock.Mock()
        self.server=Server(("127.0.0.1",0),self.store,self.jobs,self.config)
        self.thread=threading.Thread(target=self.server.serve_forever,daemon=True);self.thread.start()
    def tearDown(self):
        self.server.shutdown();self.server.server_close();self.thread.join();self.temp.cleanup()
    def call(self,path="/api/state",token="a"*64,method="GET",data=None,**headers):
        con=http.client.HTTPConnection("127.0.0.1",self.server.server_address[1],timeout=5)
        allheaders=dict(Authorization="Bearer "+token)|headers
        con.request(method,path,json.dumps(data) if data else None,allheaders)
        response=con.getresponse();body=response.read();status=response.status;con.close();return status,body
    def test_owner_can_read_database(self):self.assertEqual(self.call()[0],200)
    def test_reader_can_read_alerts_only(self):
        self.assertEqual(self.call("/api/alerts",token="b"*64)[0],200)
        self.assertEqual(self.call(token="b"*64)[0],403)
        self.assertEqual(self.call("/api/settings",token="b"*64,method="POST",data=DEFAULTS)[0],403)
    def test_missing_token_denied(self):self.assertEqual(self.call(token="")[0],403)
    def test_cross_origin_denied(self):self.assertEqual(self.call(Origin="https://example.com")[0],403)
    def test_rebinding_host_denied(self):self.assertEqual(self.call(Host="attacker.test")[0],403)
    def test_media_traversal_denied(self):self.assertEqual(self.call("/media/../config.json")[0],400)
    def test_backup_has_evidence_without_access_keys(self):
        import io,zipfile
        status,body=self.call("/api/backup")
        self.assertEqual(status,200)
        with zipfile.ZipFile(io.BytesIO(body)) as z:
            self.assertIn("curbsentry.sqlite3",z.namelist());self.assertNotIn("config.json",z.namelist())
    def test_sighting_endpoint(self):
        status,body=self.call("/api/sighting",method="POST",data=dict(plate="TEST428",capture_iso=BASE.isoformat(),camera="Front door"))
        self.assertEqual(status,200);self.assertIn("id",json.loads(body))
    def test_acknowledged_alert_is_removed_from_reader_queue(self):
        for m in (0,10,20):self.store.save_sighting(dict(plate="TEST428",capture_iso=(BASE+timedelta(minutes=m)).isoformat(),camera="Front door"))
        aid=self.store.alerts()[0]["id"]
        self.assertEqual(len(json.loads(self.call("/api/alerts",token="b"*64)[1])["alerts"]),1)
        self.store.acknowledge(aid)
        self.assertEqual(json.loads(self.call("/api/alerts",token="b"*64)[1])["alerts"],[])

@unittest.skipUnless(shutil.which("ffmpeg") and shutil.which("tesseract"),"FFmpeg/Tesseract are not installed")
class VideoTests(unittest.TestCase):
    def test_real_frame_extraction_and_ocr(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder)
            subprocess.run(["ffmpeg","-hide_banner","-loglevel","error","-f","lavfi","-i","color=c=white:s=1920x1080:d=3","-vf","drawtext=text='TEST428':fontsize=96:fontcolor=black:x=100:y=140","-c:v","libx264","-pix_fmt","yuv420p",str(root/"original.mp4")],check=True,capture_output=True)
            result=process(root,shutil.which("ffmpeg"),shutil.which("tesseract"))
            self.assertGreater(len(result["frames"]),0);self.assertIn("TEST428",[c["plate"] for c in result["candidates"]])
            dimensions=json.loads(subprocess.check_output(["ffprobe","-v","error","-show_entries","stream=width,height","-of","json",str(root/result["frames"][0]["name"])]))["streams"][0]
            self.assertEqual((dimensions["width"],dimensions["height"]),(1920,1080))
    def test_deadline_kills_worker_and_preserves_original(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);store=Store(root)
            source=root/"upload";source.write_bytes(b"retained")
            clip=store.add_clip(source,"clip.mp4",BASE.isoformat(),"Front door")["id"]
            real_popen=subprocess.Popen
            def sleeper(*args,**kwargs):
                import sys
                return real_popen([sys.executable,"-c","import time; time.sleep(20)"],**kwargs)
            jobs=Jobs(store,dict(ffmpeg=shutil.which("ffmpeg")),deadline=0.3)
            with patch("curbsentry.worker.subprocess.Popen",side_effect=sleeper):
                jobs.enqueue(clip)
                deadline=time.monotonic()+5
                while time.monotonic()<deadline and store.clip(clip)["status"] not in {"error","ready"}:time.sleep(0.05)
            jobs.close();self.assertEqual(store.clip(clip)["status"],"error")
            self.assertEqual((root/"media"/clip/"original.mp4").read_bytes(),b"retained")
    def test_explicit_cancellation_stops_worker(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);store=Store(root)
            source=root/"upload";source.write_bytes(b"retained")
            clip=store.add_clip(source,"clip.mp4",BASE.isoformat(),"Front door")["id"]
            real_popen=subprocess.Popen;processes=[]
            def sleeper(*args,**kwargs):
                import sys
                p=real_popen([sys.executable,"-c","import time; time.sleep(20)"],**kwargs);processes.append(p);return p
            jobs=Jobs(store,dict(ffmpeg=shutil.which("ffmpeg")))
            with patch("curbsentry.worker.subprocess.Popen",side_effect=sleeper):
                jobs.enqueue(clip)
                deadline=time.monotonic()+5
                while not processes and time.monotonic()<deadline:time.sleep(0.02)
                jobs.cancel(clip)
                while store.clip(clip)["status"] not in {"cancelled","error"} and time.monotonic()<deadline:time.sleep(0.02)
            jobs.close();self.assertEqual(store.clip(clip)["status"],"cancelled")
            self.assertIsNotNone(processes[0].poll())

if __name__=="__main__":unittest.main()
