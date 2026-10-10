from __future__ import annotations
import argparse
import json
import os
from pathlib import Path
import re
import secrets
import threading
import webbrowser
from curbsentry.server import Server
from curbsentry.storage import Store
from curbsentry.worker import Jobs
from curbsentry import BUILD_ID

class DataLock:
    def __init__(self,root):
        root.mkdir(parents=True,exist_ok=True)
        self.file=(root/"service.lock").open("a+b")
        if self.file.tell()==0:self.file.write(b"0");self.file.flush()
        self.file.seek(0)
        try:
            if os.name=="nt":
                import msvcrt
                msvcrt.locking(self.file.fileno(),msvcrt.LK_NBLCK,1)
            else:
                import fcntl
                fcntl.flock(self.file.fileno(),fcntl.LOCK_EX|fcntl.LOCK_NB)
        except OSError:
            self.file.close()
            raise RuntimeError("CurbSentry is already using this data folder. Close that instance first.")
    def close(self):self.file.close()

def default_root():
    return Path(os.environ.get("LOCALAPPDATA",str(Path.home()/".local/share")))/"CurbSentryPrivate"

def load_config(root,port):
    root.mkdir(parents=True,exist_ok=True)
    path=root/"config.json"
    if path.exists(): config=json.loads(path.read_text(encoding="utf-8"))
    else:
        config=dict(owner_token=secrets.token_hex(32),read_token=secrets.token_hex(32),ffmpeg="",tesseract="",private_hostname="")
        path.write_text(json.dumps(config,indent=2)+"\n",encoding="utf-8")
        if os.name!="nt": path.chmod(0o600)
    for key in ("owner_token","read_token"):
        if not re.fullmatch(r"[a-f0-9]{64}",config.get(key,"")): raise ValueError("Invalid private access key.")
    if config["owner_token"]==config["read_token"]: raise ValueError("Owner and alert-reader keys must differ.")
    private=config.get("private_hostname","")
    if private and not re.fullmatch(r"[a-z0-9][a-z0-9.-]*\.ts\.net",private):
        raise ValueError("private_hostname must be your Tailscale device's .ts.net hostname.")
    bridge=root/"strident-bridge.json"
    bridge.write_text(json.dumps(dict(schema_version=1,url=f"http://127.0.0.1:{port}",token=config["read_token"]),indent=2)+"\n")
    if os.name!="nt": bridge.chmod(0o600)
    return config

def main():
    parser=argparse.ArgumentParser(description="Private saved Ring recording review.")
    parser.add_argument("--data",type=Path,default=default_root())
    parser.add_argument("--port",type=int,default=8766)
    parser.add_argument("--no-browser",action="store_true")
    args=parser.parse_args()
    if not 1024 <= args.port <= 65535: parser.error("Use a port from 1024 to 65535.")
    root=args.data.resolve()
    try:data_lock=DataLock(root)
    except RuntimeError as exc:raise SystemExit(str(exc))
    config=load_config(root,args.port)
    store=Store(root)
    jobs=Jobs(store,config)
    try: server=Server(("127.0.0.1",args.port),store,jobs,config)
    except OSError:
        jobs.close()
        data_lock.close()
        raise SystemExit("CurbSentry's port is occupied. Close the other instance or select --port. No existing service was stopped.")
    if not args.no_browser:
        webbrowser.open(f"http://127.0.0.1:{args.port}/#key="+config["owner_token"])
    print(f"CurbSentry {BUILD_ID} is ready at http://127.0.0.1:{args.port}/")
    print("Close this window with Ctrl+C to stop the service. Data is retained.")
    try: server.serve_forever(poll_interval=0.3)
    except KeyboardInterrupt: pass
    finally:
        server.server_close()
        jobs.close()
        data_lock.close()

if __name__=="__main__": main()
