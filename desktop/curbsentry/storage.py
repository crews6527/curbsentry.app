from __future__ import annotations
from contextlib import closing, contextmanager
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re
import sqlite3
import time
import uuid
from .ocr import scan_options

DEFAULTS = dict(repeat_count=3, window_hours=2, bus_enabled=False,
                bus_count=2, bus_start="14:30", bus_end="16:00", bus_days=[0, 1, 2, 3, 4])
SCHEMA = """
CREATE TABLE IF NOT EXISTS settings (id INTEGER PRIMARY KEY CHECK(id=1), data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS clips (
 id TEXT PRIMARY KEY, digest TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
 capture_iso TEXT NOT NULL, camera TEXT NOT NULL, status TEXT NOT NULL,
 frames TEXT NOT NULL DEFAULT '[]', candidates TEXT NOT NULL DEFAULT '[]',
 error TEXT NOT NULL DEFAULT '', created REAL NOT NULL);
CREATE TABLE IF NOT EXISTS vehicles (
 id TEXT PRIMARY KEY, plate TEXT UNIQUE, description TEXT NOT NULL,
 known INTEGER NOT NULL DEFAULT 0, label TEXT NOT NULL DEFAULT '');
CREATE TABLE IF NOT EXISTS sightings (
 id TEXT PRIMARY KEY, vehicle_id TEXT NOT NULL REFERENCES vehicles(id),
 clip_id TEXT REFERENCES clips(id), capture_iso TEXT NOT NULL, captured REAL NOT NULL,
 offset_seconds REAL NOT NULL DEFAULT 0, camera TEXT NOT NULL, note TEXT NOT NULL,
 frame TEXT NOT NULL DEFAULT '', included INTEGER NOT NULL DEFAULT 1,
 UNIQUE(clip_id,vehicle_id));
CREATE INDEX IF NOT EXISTS sighting_time ON sightings(vehicle_id,captured);
CREATE TABLE IF NOT EXISTS alerts (
 id TEXT PRIMARY KEY, vehicle_id TEXT NOT NULL, anchor_id TEXT NOT NULL,
 payload TEXT NOT NULL, active INTEGER NOT NULL, acknowledged INTEGER NOT NULL DEFAULT 0,
 created REAL NOT NULL);
"""

def text(value, limit=300):
    if not isinstance(value, str) or len(value) > limit:
        raise ValueError(f"Use text of at most {limit} characters.")
    return value.strip()

def plate(value):
    value = text(value, 30).upper().replace(" ", "").replace("-", "")
    if value and not re.fullmatch(r"[A-Z0-9]{4,8}", value):
        raise ValueError("Enter a plate with 4 to 8 letters/digits, or leave it blank.")
    return value or None

def capture(value):
    dt = datetime.fromisoformat(text(value, 60).replace("Z", "+00:00"))
    if dt.tzinfo is None or dt.utcoffset() is None:
        raise ValueError("Capture time must include its UTC offset.")
    if dt.timestamp() > time.time() + 300 or dt.year < 2000:
        raise ValueError("Capture time must be between 2000 and now (five-minute clock tolerance).")
    return dt

def validate_settings(data):
    if not isinstance(data, dict) or set(data) != set(DEFAULTS):
        raise ValueError("Invalid repeat settings.")
    for key, lo, hi in (("repeat_count",2,20),("bus_count",2,20),("window_hours",1,168)):
        if type(data[key]) is not int or not lo <= data[key] <= hi:
            raise ValueError(f"{key} must be an integer from {lo} to {hi}.")
    if type(data["bus_enabled"]) is not bool:
        raise ValueError("Invalid school-window setting.")
    for key in ("bus_start", "bus_end"):
        if not isinstance(data[key], str) or not re.fullmatch(r"(?:[01]\d|2[0-3]):[0-5]\d", data[key]):
            raise ValueError("School-window times must use HH:MM.")
    if data["bus_start"] >= data["bus_end"]:
        raise ValueError("School-window end must follow start on the same day.")
    days = data["bus_days"]
    if not isinstance(days, list) or not days or any(type(d) is not int or d not in range(7) for d in days):
        raise ValueError("Choose at least one valid weekday.")
    return data

class Store:
    def __init__(self, root):
        self.root = Path(root)
        self.root.mkdir(parents=True, exist_ok=True)
        (self.root / "media").mkdir(exist_ok=True)
        self.path = self.root / "curbsentry.sqlite3"
        with self.db() as con:
            con.executescript(SCHEMA)
            columns = {r[1] for r in con.execute("PRAGMA table_info(clips)")}
            if "scan_options" not in columns:
                con.execute("ALTER TABLE clips ADD COLUMN scan_options TEXT NOT NULL DEFAULT '" + json.dumps(scan_options()) + "'")
            con.execute("INSERT OR IGNORE INTO settings VALUES(1,?)", (json.dumps(DEFAULTS),))
            con.execute("UPDATE clips SET status='interrupted',error='Processing was interrupted. Retry this clip.' WHERE status IN ('queued','processing')")
        self.backup_database()

    @contextmanager
    def db(self):
        con = sqlite3.connect(self.path, timeout=10)
        con.row_factory = sqlite3.Row
        con.execute("PRAGMA foreign_keys=ON")
        try:
            yield con
            con.commit()
        except BaseException:
            con.rollback()
            raise
        finally:
            con.close()

    def backup_database(self):
        folder = self.root / "backups"
        folder.mkdir(exist_ok=True)
        target = folder / (datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%f") + ".sqlite3")
        with self.db() as source, closing(sqlite3.connect(target)) as dest, dest:
            source.backup(dest)
        for old in sorted(folder.glob("*.sqlite3"))[:-10]:
            old.unlink()
        return target

    def snapshot(self):
        with self.db() as con:
            vehicles = [dict(r) for r in con.execute("SELECT * FROM vehicles ORDER BY known DESC,plate,label")]
            clips = [dict(r) for r in con.execute("SELECT * FROM clips ORDER BY created DESC")]
            events = [dict(r) for r in con.execute("SELECT * FROM sightings ORDER BY captured DESC")]
            settings = json.loads(con.execute("SELECT data FROM settings WHERE id=1").fetchone()[0])
        for v in vehicles: v["description"] = json.loads(v["description"])
        for c in clips:
            c["frames"] = json.loads(c["frames"]); c["candidates"] = json.loads(c["candidates"])
            c["scan_options"] = json.loads(c["scan_options"])
        return dict(vehicles=vehicles, clips=clips, sightings=events, settings=settings, alerts=self.alerts())

    def add_clip(self, source, name, capture_iso, camera):
        dt = capture(capture_iso)
        name = Path(text(name, 200)).name
        if Path(name).suffix.lower() not in {".mp4", ".mov", ".m4v", ".webm", ".avi"}:
            raise ValueError("Choose an MP4, MOV, M4V, WebM or AVI recording.")
        camera = text(camera, 100)
        if not camera: raise ValueError("Enter the camera name.")
        with Path(source).open("rb") as source_file:
            digest = hashlib.file_digest(source_file, "sha256").hexdigest()
        clip_id = uuid.uuid4().hex
        with self.db() as con:
            con.execute("BEGIN IMMEDIATE")
            previous = con.execute("SELECT id FROM clips WHERE digest=?", (digest,)).fetchone()
            if previous: return dict(id=previous[0], duplicate=True)
            directory = self.root / "media" / clip_id
            directory.mkdir()
            Path(source).replace(directory / ("original" + Path(name).suffix.lower()))
            con.execute("INSERT INTO clips(id,digest,name,capture_iso,camera,status,created) VALUES(?,?,?,?,?,'queued',?)",
                        (clip_id,digest,name,dt.isoformat(),camera,time.time()))
        return dict(id=clip_id, duplicate=False)

    def clip(self, clip_id):
        with self.db() as con:
            row = con.execute("SELECT * FROM clips WHERE id=?", (clip_id,)).fetchone()
        if not row: raise ValueError("Unknown recording.")
        return dict(row)

    def add_known(self,data):
        p=plate(data.get("plate",""))
        desc={k:text(data.get(k,""),100) for k in ("make","model","year","color")}
        label=text(data.get("label",""),150)
        if not p and not label and not any(desc.values()): raise ValueError("Enter a plate or vehicle description.")
        self.backup_database()
        with self.db() as con:
            con.execute("BEGIN IMMEDIATE")
            row=con.execute("SELECT id FROM vehicles WHERE plate=?",(p,)).fetchone() if p else None
            vid=row[0] if row else uuid.uuid4().hex
            if row: con.execute("UPDATE vehicles SET known=1,label=? WHERE id=?",(label,vid))
            else: con.execute("INSERT INTO vehicles VALUES(?,?,?,1,?)",(vid,p,json.dumps(desc),label))
            self._recalculate(con)
        return dict(vehicle_id=vid)

    def clip_status(self, clip_id, status, *, frames=None, candidates=None, error=""):
        with self.db() as con:
            con.execute("UPDATE clips SET status=?,error=? WHERE id=?", (status,error[:1000],clip_id))
            if frames is not None:
                previous = json.loads(con.execute("SELECT candidates FROM clips WHERE id=?", (clip_id,)).fetchone()[0])
                merged = {c["plate"]: c for c in previous}
                for c in candidates or []:
                    old = merged.get(c["plate"])
                    if old and old.get("confidence", 0) > c.get("confidence", 0):
                        c = old | dict(frame_count=max(old.get("frame_count", 1), c.get("frame_count", 1)))
                    merged[c["plate"]] = c
                con.execute("UPDATE clips SET frames=?,candidates=? WHERE id=?", (json.dumps(frames),json.dumps(list(merged.values())[:100]),clip_id))

    def set_scan_options(self, clip_id, value):
        value = scan_options(value)
        with self.db() as con:
            if not con.execute("UPDATE clips SET scan_options=? WHERE id=?", (json.dumps(value), clip_id)).rowcount:
                raise ValueError("Unknown recording.")

    def save_sighting(self, data):
        if not isinstance(data, dict): raise ValueError("Invalid observation.")
        p = plate(data.get("plate", ""))
        desc = {k: text(data.get(k,""),100) for k in ("make","model","year","color")}
        label = text(data.get("label",""),150)
        note = text(data.get("note",""),1000)
        if not p and not any(desc.values()) and not label and not data.get("vehicle_id"):
            raise ValueError("Enter a plate, vehicle description or an existing vehicle.")
        clip_id = data.get("clip_id") or None
        offset = data.get("offset_seconds",0)
        if type(offset) not in {float,int} or not 0 <= offset <= 600:
            raise ValueError("Video offset must be between 0 and 600 seconds.")
        frame = text(data.get("frame",""),80)
        if frame and not re.fullmatch(r"frame-\d{3}\.jpg",frame): raise ValueError("Invalid evidence frame.")
        if clip_id:
            c = self.clip(clip_id)
            result_file=self.root/"media"/clip_id/"result.json"
            if result_file.exists() and offset > json.loads(result_file.read_text())["duration_seconds"]:
                raise ValueError("The observation offset is beyond the recording's end.")
            from datetime import timedelta
            dt = capture((capture(c["capture_iso"]) + timedelta(seconds=offset)).isoformat())
            camera = c["camera"]
            if frame and frame not in [f["name"] for f in json.loads(c["frames"])]:
                raise ValueError("Evidence frame does not belong to this recording.")
        else:
            if frame: raise ValueError("Evidence frames require a recording.")
            dt = capture(data.get("capture_iso",""))
            camera = text(data.get("camera",""),100)
            if not camera: raise ValueError("Enter the camera name.")
        included = data.get("included",True)
        if type(included) is not bool: raise ValueError("Invalid count setting.")
        event_id = data.get("id") or uuid.uuid4().hex
        self.backup_database()
        with self.db() as con:
            con.execute("BEGIN IMMEDIATE")
            previous = con.execute("SELECT * FROM sightings WHERE id=?", (event_id,)).fetchone()
            if data.get("id") and not previous: raise ValueError("Unknown observation.")
            vid = data.get("vehicle_id") or (previous["vehicle_id"] if previous else None)
            v = con.execute("SELECT * FROM vehicles WHERE id=?", (vid,)).fetchone() if vid else None
            if vid and not v: raise ValueError("Unknown vehicle.")
            match = con.execute("SELECT * FROM vehicles WHERE plate=?",(p,)).fetchone() if p else None
            if match:
                if v and v["id"] != match["id"]:
                    # A newly confirmed plate merges an explicitly linked unknown vehicle.
                    if v["plate"]: raise ValueError("This vehicle already has a different plate. Select the correct vehicle.")
                    duplicates = con.execute("SELECT 1 FROM sightings a JOIN sightings b ON a.clip_id=b.clip_id WHERE a.vehicle_id=? AND b.vehicle_id=?",(v["id"],match["id"])).fetchone()
                    if duplicates: raise ValueError("These vehicles already occur in the same clip. Review them before merging.")
                    con.execute("UPDATE sightings SET vehicle_id=? WHERE vehicle_id=?",(match["id"],v["id"]))
                    con.execute("UPDATE alerts SET active=0 WHERE vehicle_id=?",(v["id"],))
                    if v["known"]: con.execute("UPDATE vehicles SET known=1 WHERE id=?",(match["id"],))
                    con.execute("DELETE FROM vehicles WHERE id=?",(v["id"],))
                v = con.execute("SELECT * FROM vehicles WHERE id=?",(match["id"],)).fetchone()
            if v:
                vid = v["id"]
                previous_desc = json.loads(v["description"])
                desc = {k: val or previous_desc.get(k,"") for k,val in desc.items()}
                con.execute("UPDATE vehicles SET plate=?,description=?,label=? WHERE id=?", (p or v["plate"],json.dumps(desc),label or v["label"],vid))
            else:
                vid = uuid.uuid4().hex
                con.execute("INSERT INTO vehicles(id,plate,description,label) VALUES(?,?,?,?)",(vid,p,json.dumps(desc),label))
            duplicate = con.execute("SELECT id FROM sightings WHERE clip_id=? AND vehicle_id=? AND id<>?",(clip_id,vid,event_id)).fetchone() if clip_id else None
            if duplicate: raise ValueError("This vehicle is already saved for this clip. Edit the existing observation.")
            con.execute("INSERT INTO sightings VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET vehicle_id=excluded.vehicle_id,clip_id=excluded.clip_id,capture_iso=excluded.capture_iso,captured=excluded.captured,offset_seconds=excluded.offset_seconds,camera=excluded.camera,note=excluded.note,frame=excluded.frame,included=excluded.included",
                        (event_id,vid,clip_id,dt.isoformat(),dt.timestamp(),offset,camera,note,frame,int(included)))
            self._recalculate(con)
            known = bool(con.execute("SELECT known FROM vehicles WHERE id=?",(vid,)).fetchone()[0])
        return dict(id=event_id,vehicle_id=vid,ignored=known)

    def set_known(self, vehicle_id, known, label):
        if type(known) is not bool: raise ValueError("Invalid ignore setting.")
        self.backup_database()
        with self.db() as con:
            con.execute("BEGIN IMMEDIATE")
            if not con.execute("UPDATE vehicles SET known=?,label=? WHERE id=?",(int(known),text(label,150),vehicle_id)).rowcount:
                raise ValueError("Unknown vehicle.")
            self._recalculate(con)

    def settings(self, data):
        validate_settings(data)
        self.backup_database()
        with self.db() as con:
            con.execute("BEGIN IMMEDIATE")
            con.execute("UPDATE settings SET data=? WHERE id=1", (json.dumps(data),))
            self._recalculate(con)

    def _recalculate(self, con):
        settings = json.loads(con.execute("SELECT data FROM settings WHERE id=1").fetchone()[0])
        con.execute("UPDATE alerts SET active=0")
        for vehicle in con.execute("SELECT * FROM vehicles WHERE known=0").fetchall():
            rows = con.execute("SELECT * FROM sightings WHERE vehicle_id=? AND included=1 ORDER BY captured,id",(vehicle["id"],)).fetchall()
            recent = []
            in_alert = False
            for r in rows:
                recent = [x for x in recent if x["captured"] >= r["captured"]-settings["window_hours"]*3600]
                recent.append(r)
                dt = datetime.fromisoformat(r["capture_iso"])
                school = settings["bus_enabled"] and dt.weekday() in settings["bus_days"] and settings["bus_start"] <= dt.strftime("%H:%M") <= settings["bus_end"]
                threshold = min(settings["repeat_count"],settings["bus_count"]) if school else settings["repeat_count"]
                qualified = len(recent) >= threshold
                if qualified and not in_alert:
                    aid = hashlib.sha256((vehicle["id"]+":"+r["id"]).encode()).hexdigest()[:32]
                    payload = dict(id=aid,vehicle_id=vehicle["id"],plate=vehicle["plate"],description=json.loads(vehicle["description"]),label=vehicle["label"],capture_iso=r["capture_iso"],count=len(recent),window_hours=settings["window_hours"],school_window=school,cameras=sorted({x["camera"] for x in recent}),sighting_ids=[x["id"] for x in recent],clip_ids=sorted({x["clip_id"] for x in recent if x["clip_id"]}),reason="Confirmed repeat sightings")
                    con.execute("INSERT INTO alerts(id,vehicle_id,anchor_id,payload,active,created) VALUES(?,?,?,?,1,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,active=1",(aid,vehicle["id"],r["id"],json.dumps(payload),time.time()))
                in_alert = qualified

    def alerts(self):
        with self.db() as con:
            rows = con.execute("SELECT payload,acknowledged,created FROM alerts WHERE active=1 ORDER BY created DESC").fetchall()
        return [json.loads(r["payload"]) | dict(acknowledged=bool(r["acknowledged"]),created=r["created"]) for r in rows]

    def acknowledge(self, alert_id):
        with self.db() as con:
            if not con.execute("UPDATE alerts SET acknowledged=1 WHERE id=? AND active=1",(alert_id,)).rowcount:
                raise ValueError("Unknown or withdrawn alert.")
