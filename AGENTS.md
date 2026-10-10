# CurbSentry development

This portable React application processes user-selected video files locally in
the browser. Keep OCR assets on the same origin. Do not send recordings, plate
records, or browser storage to a remote service.

OCR reads are saved automatically as unconfirmed. Only reviewed reads contribute
to repeat alerts. Keep capture timestamps, clip content hashes, and one sighting
per plate per clip. Known vehicles remain excluded from alerts. Do not introduce
startup scanning, microphone capture, camera account credentials, or model calls.

Run `npm test`, `npm run typecheck`, `npm run build`, and
`npm run test:browser` after changing the scan workflow. Browser verification
must use the actual local OCR worker and a video fixture, including cancellation,
duplicate uploads, persistence, corrections, and a mobile render check.

The desktop service in `desktop/` is the separate local database and read-only
Strident bridge. Follow `desktop/AGENTS.md` and its native tests for changes there.
It shares the English data in `public/ocr/` and needs separate FFmpeg/Tesseract
executables. Do not merge desktop and browser logs implicitly.

Keep generated builds, dependency directories, personal data, and captured clips
out of Git. Preserve the original upload separately when trimming the source.
