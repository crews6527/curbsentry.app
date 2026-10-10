@echo off
pushd "%~dp0"
if not exist ".venv\Scripts\python.exe" (
  echo Run Install-CurbSentry.cmd first.
  pause
  popd
  exit /b 1
)
".venv\Scripts\python.exe" configure_tools.py
if errorlevel 1 pause
popd
