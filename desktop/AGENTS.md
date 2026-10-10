# CurbSentry private development

Python 3.12 standard-library service for user-uploaded saved clips. Keep it separate from Strident and the old MARK tree. Do not introduce startup inference, audio, Ring credentials or live camera streams.

All model/OCR output is unconfirmed until explicit user review. Never infer vehicle identity from appearance alone. Rules use capture timestamps, not upload time. Identical clips and repeated frames must not inflate counts. Known vehicles are excluded from alerts while observations remain available for audit.

Bind to loopback, retain separate owner and read-only keys, validate Host and Origin, and keep arbitrary paths and shell commands out of the API. Retain original clips on cancellation or failure. Video work must run in a separate process tree with deadlines. Keep SQLite changes transactional and retain backups.

After changing workflow behavior run `python -m unittest discover -s tests -v`. FFmpeg/Tesseract tests may be skipped only when those external tools are absent. Changes to Windows process termination, launchers and private phone access need actual Windows validation before being described as Windows-tested.
