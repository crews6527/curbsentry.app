@echo off
pushd "%~dp0"
py -3.12 -c "import sys; assert sys.version_info[:2] == (3,12)"
if errorlevel 1 (
  echo Install Python 3.12 64-bit with the Windows py launcher, then try again.
  pause
  popd
  exit /b 1
)
if not exist ".venv\Scripts\python.exe" py -3.12 -m venv .venv
if errorlevel 1 (
  pause
  popd
  exit /b 1
)
".venv\Scripts\python.exe" -m unittest discover -s tests -v
if errorlevel 1 (
  echo Verification failed. Keep your current installation.
  pause
  popd
  exit /b 1
)
echo CurbSentry is installed. Run Configure-Video-Tools.cmd to select FFmpeg and Tesseract.
echo Run Check-Video-Tools.cmd to verify the actual English OCR engine.
echo Then run Launch-CurbSentry.cmd. No old MARK files were modified.
pause
popd
