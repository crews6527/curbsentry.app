"""Restore only after preserving the current data directory."""
from contextlib import closing
import json
from pathlib import Path
import re
import shutil
import sqlite3
import tempfile
import tkinter as tk
from tkinter import filedialog,messagebox
from datetime import datetime
import zipfile
from main import DataLock,default_root

def restore(source,root):
    root=Path(root)
    lock=DataLock(root)
    try:
        with tempfile.TemporaryDirectory(dir=root.parent,prefix="curb-restore-") as temp:
            staged=Path(temp)
            with zipfile.ZipFile(source) as archive:
                if sum(i.file_size for i in archive.infolist())>20*1024**3:raise ValueError("Backup exceeds the 20 GiB restore limit.")
                names=archive.namelist()
                if "curbsentry.sqlite3" not in names:raise ValueError("This is not a CurbSentry backup.")
                for item in archive.infolist():
                    if item.filename!="curbsentry.sqlite3" and not re.fullmatch(r"media/[a-f0-9]{32}/(?:original\.(?:mp4|mov|m4v|webm|avi)|frame-\d{3}\.jpg|result\.json|scan-request\.json)",item.filename):
                        raise ValueError("Backup contains an unexpected path.")
                archive.extractall(staged)
            with closing(sqlite3.connect(staged/"curbsentry.sqlite3")) as con:
                if con.execute("PRAGMA integrity_check").fetchone()[0]!="ok":raise ValueError("Backup database failed its integrity check.")
                required={"settings","clips","vehicles","sightings","alerts"}
                tables={r[0] for r in con.execute("SELECT name FROM sqlite_master WHERE type='table'")}
                if not required<=tables:raise ValueError("Backup database has an incompatible schema.")
            preserved=root.parent/(root.name+"-before-restore-"+datetime.now().strftime("%Y%m%d-%H%M%S-%f"))
            # Copy first while the service lock prevents CurbSentry writes.
            shutil.copytree(root,preserved,ignore=shutil.ignore_patterns("service.lock"))
            current_media=root/"media"
            replacement=staged/"media";replacement.mkdir(exist_ok=True)
            # Everything is validated before replacing the current database.
            old_media=root/"media.previous"
            if old_media.exists():raise ValueError("A previous restore needs review: media.previous exists.")
            if current_media.exists():current_media.replace(old_media)
            try:
                replacement.replace(current_media)
                (staged/"curbsentry.sqlite3").replace(root/"curbsentry.sqlite3")
            except BaseException:
                if current_media.exists():shutil.rmtree(current_media)
                if old_media.exists():old_media.replace(current_media)
                raise
            if old_media.exists():shutil.rmtree(old_media)
            return preserved
    finally:lock.close()

def main():
    app=tk.Tk();app.withdraw()
    try:
        source=filedialog.askopenfilename(title="Choose a CurbSentry backup",filetypes=[("ZIP backups","*.zip")])
        if not source:return
        if not messagebox.askyesno("Restore CurbSentry","Replace the current CurbSentry records with this backup? A complete copy of the current data is preserved first. Close CurbSentry before continuing."):return
        preserved=restore(source,default_root())
        messagebox.showinfo("Restore complete","Previous data preserved at:\n"+str(preserved))
    except Exception as exc:messagebox.showerror("Restore needs attention",str(exc))
    finally:app.destroy()

if __name__=="__main__":main()
