"""User-selected local executables. Downloads and account credentials are not used."""
import json
from pathlib import Path
import subprocess
import tkinter as tk
from tkinter import filedialog,messagebox
from main import default_root,load_config,DataLock
from curbsentry.ocr import diagnostics

def main():
    root=tk.Tk();root.withdraw()
    lock=None
    try:
        lock=DataLock(default_root())
        config=load_config(default_root(),8766)
        ff=filedialog.askopenfilename(title="Select ffmpeg.exe (keep ffprobe.exe in the same folder)",filetypes=[("FFmpeg","ffmpeg.exe")])
        if not ff:return
        ff=Path(ff)
        if ff.name.lower()!="ffmpeg.exe" or not ff.with_name("ffprobe.exe").is_file():
            raise ValueError("Select ffmpeg.exe with ffprobe.exe beside it.")
        subprocess.run([str(ff),"-version"],check=True,capture_output=True,timeout=10,shell=False)
        config["ffmpeg"]=str(ff.resolve())
        tess=filedialog.askopenfilename(title="Select tesseract.exe (required for automatic plate reads)",filetypes=[("Tesseract","tesseract.exe")])
        if not tess:return
        if Path(tess).name.lower()!="tesseract.exe":
            raise ValueError("Select the installed tesseract.exe executable.")
        config["tesseract"]=str(Path(tess).resolve())
        report=diagnostics(config,default_root())
        if not report["ready"]:
            raise ValueError("\n".join(v.get("message","OCR could not initialize.") for v in report["checks"].values() if not v["ok"]))
        path=default_root()/"config.json"
        temporary=path.with_suffix(".tmp")
        temporary.write_text(json.dumps(config,indent=2)+"\n",encoding="utf-8");temporary.replace(path)
        messagebox.showinfo("CurbSentry","FFmpeg, ffprobe and the bundled English OCR engine passed. Run Launch-CurbSentry.cmd next.")
    except Exception as exc:messagebox.showerror("Setup needs attention",str(exc))
    finally:
        if lock:lock.close()
        root.destroy()

if __name__=="__main__":main()
