@echo off
pushd "%~dp0"
py -3.12 check_video_tools.py --output ocr-diagnostics.json
set "curb_check_result=%ERRORLEVEL%"
echo.
echo Report saved as ocr-diagnostics.json in this folder. No keys or video contents are included.
pause
popd
exit /b %curb_check_result%
