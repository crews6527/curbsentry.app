# CurbSentry 0.3.0 verification

Verified October 10, 2026 (UTC), using Node 24.19.0 on Linux and headless Chromium.

- All 16 unit/regression tests passed. They cover OCR TSV parsing, nearby split
  tokens, rejected timestamps and low scores, bounded video sampling, capture
  timestamps, crop bounds, frame deduplication, duplicate clips, corrected reads,
  known-car exclusion, manual clip reads, and backup validation.
- TypeScript checking and the production Vite build passed with the locked
  dependencies. `npm ls --depth=0` reported the expected installed versions.
- The actual browser OCR worker decoded a generated MP4 and read fictional
  `TEST428`, with about 90 percent word confidence. Three sampled frames produced
  one persistent unconfirmed entry. No OCR output was substituted or mocked.
- Both development and production browser flows passed video selection,
  automatic logging, correction to fictional `TEST429`, original capture-time
  retention, duplicate reuse after renaming, reload persistence, an empty clip,
  cancellation with retained partial reads, a visible malformed-video error,
  personal log download/restore, and mobile overflow checks.
- The ready-built backup passed the same actual OCR browser workflow when served
  by its standard-library Python launcher on Linux. No Python packages are needed.
- Browser checks reported zero page/console errors and zero external HTTP
  requests. OCR worker code, engine files, and language data came from the local
  site. Desktop and mobile screenshots were inspected for readable content and
  layout.

The supplied `curb-sentry.zip` was not modified. The source package contains no
recordings, personal plate records, deployment credentials, or sample vehicle
records. Its full backup includes the built site and third-party license notices.

English model SHA-256 before gzip compression:
`7d4322bd2a7749724879683fc3912cb542f19906c83bcc1a52132556427170b2`.

## Limits of this verification

Synthetic clear-text videos establish that upload, frame decoding, OCR, automatic
logging, review, and persistence are connected. They do not establish plate
recognition accuracy on road footage. The three earlier Ring clips were not
provided in this batch, so this repair was not tested against them. The earlier
footage report recovered no confirmed plate from those clips.

Real moving, distant, nighttime, or angled plates, mobile Safari performance,
Windows launch behavior, other codecs, actual hosting configuration, and browser
storage exhaustion have not been verified. A selectable crop can reduce
irrelevant background OCR; it does not repair missing plate detail. Manual review
and missed-plate entry remain available. Browser data is separate from the older
Python desktop database and its Strident bridge.

The supplied Codespace identifies `crews6527/curbsentry.app` as the destination
repository, with branch `prompt-copy-studio-main`. The source package and its
checksums are prepared for that branch. Verification above was performed locally;
uncommitted files in the separate Codespace were not inspected or changed.

## Desktop repair, build 2026.10.10.1

The user confirmed the recognition failure concerns the desktop application.
The first GitHub upload contained the browser application only; that version
could not supply the desktop service used by Strident's existing local bridge.
The required desktop source, launch/configuration/restore utilities and tests
are now included under `desktop/`. No personal database or credentials are copied.

- All 50 desktop tests passed on Linux with FFmpeg, ffprobe and Tesseract present.
  None were skipped. Tests include real full-resolution extraction/OCR, joining
  `ABC 1234`, focused single-line rescans, English-model initialization, migration
  of the old database, partial-read retention, cancellation/deadlines, duplicate
  uploads, known-vehicle exclusion, backups and owner/reader access separation.
- The actual desktop browser/service workflow passed nine checks: native engine
  health, uploaded video OCR, persistent unconfirmed reads, reviewed correction,
  capture offsets, focused rescan preserving evidence bytes and saved sightings,
  renamed duplicate, reload persistence, confirmed repeat-alert queue/review,
  mobile overflow and zero page errors/external requests. The synthetic `TEST428`
  recording produced a word score of about 92. Native OCR output was not mocked.
- A separate integration check used the existing Strident `AlertClient` and
  `load_bridge` directly against the repaired desktop server. It received a
  confirmed three-sighting alert and then an empty queue after acknowledgement.
- Both desktop and mobile renders were inspected. The updated package's 16 web
  unit tests and production build/TypeScript checking passed as well.

Completed recordings can now be rescanned explicitly. The English model is
shared with the web source and checksum-verified locally. Missing Tesseract or
an incomplete OCR pass is labeled `needs_ocr`, rather than successful OCR.
Reads are saved during processing and survive a failed or cancelled retry.
Existing sighting records and evidence frames are retained on a crop rescan.

These results establish the desktop upload/read/review/alert connection. They
do not establish recognition of the user's failing Ring clips or Windows-native
execution: neither the clips nor current Windows tool diagnostics were supplied.
Live capture and automatic Ring downloads are outside this saved-video workflow.
