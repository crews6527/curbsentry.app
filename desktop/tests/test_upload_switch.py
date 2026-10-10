"""Verify consecutive uploads and the exact media returned by each clip URL."""
from datetime import datetime, timedelta, timezone
import hashlib
import http.client
import json
from pathlib import Path
import secrets
import shutil
import subprocess
import tempfile
import threading
import time
import unittest
from urllib.parse import urlencode

from curbsentry import BUILD_ID
from curbsentry.server import Server
from curbsentry.storage import Store
from curbsentry.worker import Jobs


class ConsecutiveUploadTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.store = Store(self.root / "data")
        self.config = dict(owner_token=secrets.token_hex(32), read_token=secrets.token_hex(32),
                           ffmpeg=shutil.which("ffmpeg") or "", tesseract="", private_hostname="")
        self.jobs = Jobs(self.store, self.config)
        self.server = Server(("127.0.0.1", 0), self.store, self.jobs, self.config)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.jobs.close()
        self.thread.join()
        self.temp.cleanup()

    def request(self, path, body=None):
        connection = http.client.HTTPConnection("127.0.0.1", self.server.server_address[1], timeout=10)
        try:
            connection.request("GET" if body is None else "POST", path, body,
                               {"Authorization": "Bearer " + self.config["owner_token"]})
            response = connection.getresponse()
            return response.status, response.read()
        finally:
            connection.close()

    def upload(self, data, **changes):
        metadata = dict(name="recording.mp4", camera="Synthetic test camera",
                        capture_iso=(datetime.now(timezone.utc)-timedelta(days=2)).isoformat())
        metadata.update(changes)
        status, raw = self.request("/api/upload?" + urlencode(metadata), data)
        return status, json.loads(raw)

    def test_two_distinct_videos_with_the_same_filename_return_their_own_media(self):
        if not self.config["ffmpeg"]:
            self.skipTest("FFmpeg is not installed")
        samples = []
        for index, color in enumerate(("red", "blue")):
            path = self.root / f"source-{index}.mp4"
            subprocess.run([self.config["ffmpeg"], "-hide_banner", "-loglevel", "error",
                            "-f", "lavfi", "-i", f"color=c={color}:s=320x180:d=1",
                            "-c:v", "libx264", "-pix_fmt", "yuv420p", str(path)],
                           check=True, capture_output=True, timeout=15)
            samples.append(path.read_bytes())
        self.assertNotEqual(samples[0], samples[1])
        uploads = [self.upload(data) for data in samples]
        for status, value in uploads:
            self.assertEqual(status, 200)
            self.assertFalse(value["duplicate"])
        ids = [value["id"] for _, value in uploads]
        self.assertNotEqual(*ids)
        for clip_id, original in zip(ids, samples):
            status, actual = self.request(f"/media/{clip_id}/original.mp4")
            self.assertEqual(status, 200)
            self.assertEqual(hashlib.sha256(actual).digest(), hashlib.sha256(original).digest())
        deadline = time.monotonic() + 25
        while time.monotonic() < deadline:
            if all(self.store.clip(clip_id)["status"] in {"ready", "error"} for clip_id in ids):
                break
            time.sleep(0.05)
        frame_colors = []
        for clip_id in ids:
            clip = self.store.clip(clip_id)
            self.assertEqual(clip["status"], "ready", clip["error"])
            frames = json.loads(clip["frames"])
            self.assertTrue(frames)
            jpeg = self.store.root / "media" / clip_id / frames[0]["name"]
            rgb = subprocess.run([self.config["ffmpeg"], "-v", "error", "-i", str(jpeg),
                                  "-vf", "scale=1:1", "-frames:v", "1", "-f", "rawvideo",
                                  "-pix_fmt", "rgb24", "-"], check=True, capture_output=True, timeout=10).stdout
            frame_colors.append(rgb)
        self.assertGreater(frame_colors[0][0], 200)
        self.assertLess(frame_colors[0][2], 50)
        self.assertGreater(frame_colors[1][2], 200)
        self.assertLess(frame_colors[1][0], 50)
        status, raw = self.request("/api/state")
        self.assertEqual(status, 200)
        self.assertEqual({c["id"] for c in json.loads(raw)["clips"]}, set(ids))
        status, duplicate = self.upload(samples[1], name="renamed.mp4")
        self.assertEqual(status, 200)
        self.assertTrue(duplicate["duplicate"])
        self.assertEqual(duplicate["id"], ids[1])
        self.assertEqual(len(self.store.snapshot()["clips"]), 2)

    def test_rejected_new_upload_does_not_replace_an_existing_recording(self):
        source = self.root / "original.mp4"
        source.write_bytes(b"original synthetic fixture")
        original = self.store.add_clip(source, "original.mp4",
                                       (datetime.now(timezone.utc)-timedelta(days=2)).isoformat(), "Test")
        status, error = self.upload(b"different fixture", camera="")
        self.assertEqual(status, 400)
        self.assertIn("camera", error["error"])
        self.assertEqual([c["id"] for c in self.store.snapshot()["clips"]], [original["id"]])

    def test_service_reports_the_build_displayed_by_the_client(self):
        status, raw = self.request("/api/state")
        self.assertEqual(status, 200)
        self.assertEqual(json.loads(raw)["build"], BUILD_ID)


if __name__ == "__main__":
    unittest.main()
