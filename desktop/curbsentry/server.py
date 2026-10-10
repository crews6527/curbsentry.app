from __future__ import annotations
from contextlib import closing
import hmac
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import mimetypes
from pathlib import Path
import re
import shutil
import tempfile
from urllib.parse import parse_qs, urlsplit
import zipfile
from . import BUILD_ID

MAX_UPLOAD = 200*1024*1024
WEB = Path(__file__).resolve().parents[1]/"web"

class Server(ThreadingHTTPServer):
    daemon_threads=True
    def __init__(self, address, store, jobs, config):
        self.store,self.jobs,self.config=store,jobs,config
        self.backup_lock=__import__("threading").Lock()
        super().__init__(address,Handler)

class Handler(BaseHTTPRequestHandler):
    def log_message(self,*args): pass  # Never log authorization or upload metadata.
    def setup(self):
        super().setup()
        self.connection.settimeout(60)

    def send_response(self, code, message=None):
        self.response_started = True
        super().send_response(code, message)

    def send_bytes(self, data, status=200, mime="application/json"):
        self.send_response(status)
        self.send_header("Content-Type",mime)
        self.send_header("Content-Length",str(len(data)))
        self.security_headers()
        self.end_headers()
        self.wfile.write(data)

    def security_headers(self):
        self.send_header("Cache-Control","no-store")
        self.send_header("X-Content-Type-Options","nosniff")
        self.send_header("Referrer-Policy","no-referrer")
        self.send_header("Content-Security-Policy","default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' blob:; media-src 'self' blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'")

    def json_response(self,value,status=200):
        if getattr(self,"response_started",False): return
        self.send_bytes(json.dumps(value).encode(),status)

    def allowed_request(self):
        port=self.server.server_address[1]
        hosts={f"127.0.0.1:{port}",f"localhost:{port}"}
        private=self.server.config.get("private_hostname","")
        if private: hosts.add(private)
        host=self.headers.get("Host","")
        if host not in hosts: raise PermissionError("Host is not configured for private access.")
        origin=self.headers.get("Origin")
        allowed={f"http://127.0.0.1:{port}",f"http://localhost:{port}"}
        if private: allowed.add("https://"+private)
        if origin and origin not in allowed: raise PermissionError("Origin is not allowed.")
        if self.headers.get("Sec-Fetch-Site") == "cross-site": raise PermissionError("Cross-site access denied.")

    def role(self):
        auth=self.headers.get("Authorization","")
        if hmac.compare_digest(auth,"Bearer "+self.server.config["owner_token"]): return "owner"
        if hmac.compare_digest(auth,"Bearer "+self.server.config["read_token"]): return "reader"
        raise PermissionError("Unlock CurbSentry using the launch link or your private access key.")

    def body(self, limit=64000):
        if self.headers.get("Transfer-Encoding"): raise ValueError("Use a fixed-size request.")
        length=int(self.headers.get("Content-Length",0))
        if not 0 < length <= limit: raise ValueError("Request exceeds the size limit or is empty.")
        raw=self.rfile.read(length)
        if len(raw)!=length: raise ValueError("Incomplete request.")
        data=json.loads(raw)
        if not isinstance(data,dict): raise ValueError("Use a JSON object.")
        return data

    def do_GET(self): self.dispatch("GET")
    def do_POST(self): self.dispatch("POST")

    def dispatch(self,method):
        self.response_started = False
        try:
            self.dispatch_request(method)
        except (ConnectionError,TimeoutError):
            # A closed browser connection cannot receive a second error response.
            pass

    def dispatch_request(self,method):
        try:
            self.allowed_request()
            url=urlsplit(self.path); path=url.path
            if method=="GET" and path in {"/","/app.js","/style.css"}:
                name="index.html" if path=="/" else path[1:]
                self.send_bytes((WEB/name).read_bytes(),mime=mimetypes.guess_type(name)[0] or "text/plain")
                return
            role=self.role()
            store=self.server.store
            if method=="GET" and path=="/api/alerts":
                alerts=store.alerts()
                if role=="reader":alerts=[a for a in alerts if not a["acknowledged"]]
                self.json_response(dict(alerts=alerts,schema_version=1)); return
            if role!="owner": raise PermissionError("This key can only read the alert queue.")
            if method=="GET" and path=="/api/state":
                self.json_response(store.snapshot() | dict(tools=self.tools(),build=BUILD_ID)); return
            if method=="GET" and path=="/api/backup":
                self.backup(); return
            if method=="GET" and path=="/api/diagnostics":
                from .ocr import diagnostics
                with self.server.backup_lock:
                    self.json_response(diagnostics(self.server.config,store.root) | dict(build=BUILD_ID))
                return
            if method=="GET" and path.startswith("/media/"):
                parts=path.split("/")
                if len(parts)!=4 or not re.fullmatch(r"[a-f0-9]{32}",parts[2]) or not re.fullmatch(r"(?:frame-\d{3}\.jpg|original\.(?:mp4|mov|m4v|webm|avi))",parts[3]):
                    raise ValueError("Invalid media path.")
                target=store.root/"media"/parts[2]/parts[3]
                self.stream(target); return
            if method=="POST" and path=="/api/upload":
                self.upload(parse_qs(url.query)); return
            if method=="POST":
                data=self.body()
                if path=="/api/sighting": result=store.save_sighting(data)
                elif path=="/api/vehicle": result=store.add_known(data)
                elif path=="/api/known":
                    store.set_known(data.get("vehicle_id"),data.get("known"),data.get("label","")); result={"ok":True}
                elif path=="/api/settings": store.settings(data); result={"ok":True}
                elif path=="/api/ack": store.acknowledge(data.get("id")); result={"ok":True}
                elif path in {"/api/retry","/api/cancel"}:
                    if path.endswith("retry"):
                        self.server.jobs.enqueue(data.get("id"), options=data.get("scan_options"), rescan=True)
                    else: self.server.jobs.cancel(data.get("id"))
                    result={"ok":True}
                else: self.json_response({"error":"Unknown route."},404); return
                self.json_response(result); return
            self.json_response({"error":"Unknown route."},404)
        except PermissionError as exc: self.json_response({"error":str(exc)},403)
        except (ValueError,KeyError,TypeError) as exc: self.json_response({"error":str(exc)},400)
        except FileNotFoundError: self.json_response({"error":"File not found."},404)
        except (ConnectionError,TimeoutError): pass
        except Exception:
            self.json_response({"error":"The operation failed. Your saved records were retained."},500)

    def tools(self):
        from .worker import executable
        result={k:bool(executable(k,self.server.config.get(k,""))) for k in ("ffmpeg","tesseract")}
        if self.server.config.get("ffmpeg"):
            ffprobe=Path(self.server.config["ffmpeg"]).with_name("ffprobe.exe" if __import__("os").name=="nt" else "ffprobe")
            result["ffprobe"]=ffprobe.is_file()
        else: result["ffprobe"]=bool(executable("ffprobe"))
        return result

    def upload(self,query):
        if self.headers.get("Transfer-Encoding"): raise ValueError("Use a fixed-size upload.")
        length=int(self.headers.get("Content-Length",0))
        if not 0 < length <= MAX_UPLOAD: raise ValueError("Choose a video smaller than 200 MiB.")
        def value(k):
            if len(query.get(k,[]))!=1: raise ValueError("Missing upload metadata: "+k)
            return query[k][0]
        # Validate metadata before accepting a large payload.
        from .storage import capture,text
        name=value("name"); capture(value("capture_iso")); text(value("camera"),100)
        if len(name)>200: raise ValueError("File name is too long.")
        with tempfile.NamedTemporaryFile(dir=self.server.store.root,suffix=".upload",delete=False) as output:
            temp=Path(output.name)
            try:
                remaining=length
                while remaining:
                    chunk=self.rfile.read(min(1024*1024,remaining))
                    if not chunk: raise ValueError("Upload was interrupted.")
                    output.write(chunk); remaining-=len(chunk)
                output.close()
                result=self.server.store.add_clip(temp,name,value("capture_iso"),value("camera"))
                if not result["duplicate"]: self.server.jobs.enqueue(result["id"])
                self.json_response(result)
            finally: temp.unlink(missing_ok=True)

    def stream(self,target):
        size=target.stat().st_size
        self.send_response(200)
        self.send_header("Content-Type",mimetypes.guess_type(target.name)[0] or "application/octet-stream")
        self.send_header("Content-Length",str(size))
        self.security_headers(); self.end_headers()
        with target.open("rb") as source: shutil.copyfileobj(source,self.wfile)

    def backup(self):
        # No auth keys or bridge credentials are exported in backups.
        with self.server.backup_lock, tempfile.TemporaryDirectory(dir=self.server.store.root) as temp:
            db=Path(temp)/"curbsentry.sqlite3"
            import sqlite3
            with self.server.store.db() as source,closing(sqlite3.connect(db)) as dest,dest:
                source.backup(dest)
            output=Path(temp)/"CurbSentry_Backup.zip"
            with zipfile.ZipFile(output,"w",zipfile.ZIP_DEFLATED) as archive:
                archive.write(db,"curbsentry.sqlite3")
                for f in (self.server.store.root/"media").rglob("*"):
                    if f.is_file() and f.name not in {"worker.log","result.tmp"}: archive.write(f,str(f.relative_to(self.server.store.root)))
            self.stream(output)
