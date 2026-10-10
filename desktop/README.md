# CurbSentry desktop

Build 2026.10.10.1 is the local Windows service used by Strident's CurbSentry
monitor. It keeps the existing `%LOCALAPPDATA%\CurbSentryPrivate` database,
recordings, private keys and read-only bridge. Keep this `desktop/` folder beside
the repository's `public/` folder, which holds the bundled English OCR model.

## Install on Windows

1. Stop the old CurbSentry service. In its Settings, download a personal data
   backup before switching versions. Keep the old installation folder.
2. Extract this complete package to a new folder. Open `desktop/` and run
   `Install-CurbSentry.cmd` with Python 3.12 installed.
3. Install FFmpeg with ffprobe from the links at https://ffmpeg.org/download.html
   and Tesseract from the Windows link at
   https://tesseract-ocr.github.io/tessdoc/Installation.html, if absent.
   These executable programs are separate prerequisites. The package already
   includes the English language model and does not download it at launch.
4. Run `Configure-Video-Tools.cmd` and select `ffmpeg.exe` and `tesseract.exe`.
   Keep `ffprobe.exe` beside `ffmpeg.exe`. Existing configured paths are retained
   when starting the service; reconfigure only when they need attention.
5. Run `Check-Video-Tools.cmd` while CurbSentry is stopped. All five checks should
   pass, including a real English OCR initialization. It saves
   `ocr-diagnostics.json` without keys or video contents.
6. Run `Launch-CurbSentry.cmd`. Keep the service console open while using the app.

Python's standard library is sufficient. FFmpeg and Tesseract run only for an
uploaded recording or an explicit diagnostic check. No Ollama calls, camera
account login, microphone use or background recording are added.

## Automatic reads and retries

Upload a saved video with its recording start time and camera name. It processes
automatically, saving possible plate numbers and their frame offsets to the
local database. Read text with spaces, such as `ABC 1234`, can be combined.
Samples are up to twice per second for short clips, capped at sixty frames.
Whole-frame candidates require mixed letters/digits and OCR word scores of 65
or higher. Camera overlays and signs can still produce false matches.

If OCR is unavailable or fails, the recording says `needs_ocr` or `error` and
explains the problem. It does not claim a completed OCR scan. Check the reader
in Settings. Fix the tools and retry the existing recording without uploading
it again. Partial reads and the original file survive cancellation or failure.

For a missed read, expand **Rescan plate area** on the saved recording. Enter a
crop in picture percentages. For a tight crop around a single plate, enable
**Plate-only reading**, which uses a single-line OCR mode and permits all-letter
or all-digit plates. The crop must cover no more than a quarter of the picture.
Rescans reuse the original review frames and offsets, preserving evidence and
confirmed sightings. Enlarging a crop does not restore missing detail.

Select a saved read, inspect its frame, correct the number if needed, and check
the review confirmation before saving a sighting. One vehicle counts once per
clip. Identical recordings are recognized even after renaming. Automatic reads
stay unconfirmed until review and do not trigger repeat alerts by themselves.

## Strident and backups

In Strident, choose CurbSentry, Connect, then select
`%LOCALAPPDATA%\CurbSentryPrivate\strident-bridge.json`. Start monitoring explicitly.
The reader key can retrieve unreviewed confirmed repeat alerts, without access to
videos, the database or editing routes. Keep both apps running. Mark alerts
reviewed in CurbSentry. A code backup contains no personal log or footage.

Download your full personal data backup from Settings and store it separately on
your flash drive. `Restore-Backup.cmd` validates that backup and preserves the
current data before replacement. Database migration adds scan options without
discarding existing recordings or sightings. Browser-app localStorage is a
separate log and is not imported automatically.

## Verification

Run `python -m unittest discover -s tests -v` from this folder. From the repository
root, `npm run test:desktop:browser` exercises the actual native OCR service,
review, crop/rescan, persistence and Strident's read-only queue. The browser test
needs Node dependencies, Playwright Chromium and FFmpeg/Tesseract.

Automated verification uses Linux and clearly labeled synthetic recordings.
Your failed Ring clip and native Windows execution still require checking before
calling this ready for daily use. This release does not add live camera capture,
automatic Ring downloads or a trained license-plate detection model.
